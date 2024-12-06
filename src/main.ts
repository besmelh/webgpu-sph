/// <reference types="@webgpu/types" />
import { SPHSimulation, SimulationParams } from './simulation';

class WebGPUApp {
    canvas: HTMLCanvasElement;
    adapter: GPUAdapter | null = null;
    device: GPUDevice | null = null;
    context: GPUCanvasContext | null = null;
    simulation: SPHSimulation | null = null;


    constructor() {
        this.canvas = document.querySelector('#gpuCanvas') as HTMLCanvasElement;
        if (!this.canvas) throw new Error('No canvas element found');
    }

    async initialize() {
        // Check for WebGPU support
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }

        // Get GPU adapter
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            throw new Error('No GPU adapter found');
        }

        // Get GPU device
        this.device = await this.adapter.requestDevice();
        if (!this.device) {
            throw new Error('No GPU device found');
        }
        
        // Setup canvas context
        this.context = this.canvas.getContext('webgpu');
        if (!this.context) {
            throw new Error('Could not get WebGPU context');
        }

        // Configure the swap chain
        const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: canvasFormat,
            alphaMode: 'premultiplied',
        });

        // Create simulation
        this.simulation = new SPHSimulation(this.device);

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
        console.log('WebGPU initialized successfully');
    }

    render() {
        if (!this.simulation || !this.device) {
            return;
        }
        
        // Get command buffer for simulation
        const commandBuffer = this.simulation.simulate();
        
        // Submit command buffer
        this.device.queue.submit([commandBuffer]);
    }
}

// Start the application
async function start() {
    const app = new WebGPUApp();
    await app.initialize();
}

start().catch(console.error);