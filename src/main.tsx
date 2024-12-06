import * as React from 'react';
import { SPHSimulation, SimulationParams } from './simulation';
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

    constructor() {
        this.canvas = document.querySelector('#gpuCanvas') as HTMLCanvasElement;
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

        // Set initial parameters
        const params: SimulationParams = {
            scalePressure: 1.0,
            scaleViscosity: 1.0,
            scaleGravity: 1.0,
            gas_constant: 1.0,
            rest_density: 150.0,
            timeStep: 0.01,
            smoothing_radius: 0.28,
            viscosity: 12.7,
            gravity: 9.4,
            particle_mass: 0.123,
            eps: 0.01,
            bounce_damping: 0.004,
            min_domain_bound: [-1.0, -1.0, -1.0, 0.0],
            max_domain_bound: [1.0, 1.0, 1.0, 0.0]
        };

        this.simulation.updateSimulationParams(params);
        
        // Initialize UI after simulation is created
        this.initUI();
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
}

// Start the application
async function main() {
    const app = new WebGPUApp();
    await app.initialize();
    app.start();
}

main().catch(console.error);