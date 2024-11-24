/// <reference types="@webgpu/types" />


class WebGPUApp {
    canvas: HTMLCanvasElement;
    adapter: GPUAdapter | null = null;
    device: GPUDevice | null = null;
    context: GPUCanvasContext | null = null;

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

        console.log('WebGPU initialized successfully');
    }
}

// Start the application
async function start() {
    const app = new WebGPUApp();
    await app.initialize();
}

start().catch(console.error);