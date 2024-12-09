import * as React from 'react';
import { SPHSimulation } from './simulation';
import { defaultSimulationParams } from './config/simulationDefaults';
import { SimulationParams } from './types/simulation';
import { Renderer } from './renderer';
import { createRoot } from 'react-dom/client';
import ParameterControls from './components/ParameterControls';

class WebGPUApp {
    private canvas: HTMLCanvasElement;
    private device!: GPUDevice;
    private context!: GPUCanvasContext;
    private simulation!: SPHSimulation;
    private renderer!: Renderer;
    private animationFrameId: number = 0;
    private currentParams!: SimulationParams;
    private isMouseDown: boolean = false;

    constructor() {
        this.canvas = document.querySelector('#gpuCanvas') as HTMLCanvasElement;
        this.setupMouseHandlers();
        if (!this.canvas) throw new Error('No canvas element found');
    }

    async initialize() {
        if (!navigator.gpu) throw new Error('WebGPU not supported');

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No GPU adapter found');

        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
        
        const format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: format,
            alphaMode: 'premultiplied',
        });

        // Initialize simulation
        this.simulation = new SPHSimulation(this.device);
        this.renderer = new Renderer(this.device, this.context, format);

        this.simulation.updateSimulationParams(defaultSimulationParams);
        
        // Initialize UI after simulation is created
        this.initUI();
    }

    private async initializeSimulation(params?: SimulationParams) {
        this.simulation = new SPHSimulation(this.device);
        const simulationParams = params || defaultSimulationParams;
        this.currentParams = simulationParams;
        this.simulation.updateSimulationParams(simulationParams);
    }

    private initUI() {
        const uiRoot = document.getElementById('ui-root');
        if (uiRoot) {
            const root = createRoot(uiRoot);
            root.render(
                <React.StrictMode>
                    <ParameterControls 
                        onParamChange={(params: SimulationParams) => {
                            // Make sure we're using the right method name consistently
                            this.simulation.updateSimulationParams(params);
                        }}
                        onReset={async () => {
                            // Stop the current animation
                            if (this.animationFrameId) {
                                cancelAnimationFrame(this.animationFrameId);
                            }
                            
                            // Wait for the device to finish current operations
                            await this.device.queue.onSubmittedWorkDone();
                            
                            // Reinitialize the simulation
                            await this.initializeSimulation();
                            
                            // Restart the render loop
                            this.render();
                        }}
                        onReinitialize={async () => {
                            if (this.animationFrameId) {
                                cancelAnimationFrame(this.animationFrameId);
                            }
                            await this.device.queue.onSubmittedWorkDone();
                            await this.initializeSimulation(this.currentParams);
                            this.render();
                        }}
                    />
                </React.StrictMode>
            );
        }
    }
    
    // }

    render = () => {
        // Run simulation step
        const commandBuffer = this.simulation.simulate();
        this.device.queue.submit([commandBuffer]);

        // Render particles
        this.renderer.render(this.simulation.getParticleBuffer());

        // Request next frame
        this.animationFrameId = requestAnimationFrame(this.render);
    }

    start() {
        this.render();
    }

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    private setupMouseHandlers() {
        this.canvas.addEventListener('mousedown', (e) => {
            console.log('Mouse down');
            this.isMouseDown = true;
            this.handleMouseMove(e);
        });

        this.canvas.addEventListener('mouseup', () => {
            console.log('Mouse up');
            this.isMouseDown = false;
            this.simulation.updateCursor(0, 0, false, this.canvas);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isMouseDown) {
                console.log('Mouse move');
                this.handleMouseMove(e);
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            console.log('Mouse leave');
            this.isMouseDown = false;
            this.simulation.updateCursor(0, 0, false, this.canvas);
        });

        // Add touch support
        this.canvas.addEventListener('touchstart', (e) => {
            console.log('touchstart');
            e.preventDefault();
            this.isMouseDown = true;
            this.handleTouchMove(e);
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => {
            console.log('touchend');
            this.isMouseDown = false;
            this.simulation.updateCursor(0, 0, false, this.canvas);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            console.log('touchmove');
            e.preventDefault();
            if (this.isMouseDown) {
                this.handleTouchMove(e);
            }
        }, { passive: false });
    }

    private handleMouseMove(e: MouseEvent) {
        this.simulation.updateCursor(e.clientX, e.clientY, true, this.canvas);
    }

    private handleTouchMove(e: TouchEvent) {
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            this.simulation.updateCursor(touch.clientX, touch.clientY, true, this.canvas);
        }
    }
}

// Start the application
async function main() {
    const app = new WebGPUApp();
    await app.initialize();
    app.start();
}

main().catch(console.error);