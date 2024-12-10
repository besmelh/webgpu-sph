export class CanvasResizeHandler {
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private device: GPUDevice;
    private format: GPUTextureFormat;
    private resizeCallback: () => void;

    constructor(canvas: HTMLCanvasElement, context: GPUCanvasContext, device: GPUDevice, format: GPUTextureFormat, callback: () => void) {
        this.canvas = canvas;
        this.context = context;
        this.device = device;
        this.format = format;
        this.resizeCallback = callback;
        this.setupResizeHandler();
        this.handleResize();
    }

    private handleResize = () => {
        const parentRect = this.canvas.parentElement?.getBoundingClientRect();
        if (!parentRect) return;

        // device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        
        // set canvas size in pixels
        this.canvas.width = parentRect.width * dpr;
        this.canvas.height = parentRect.height * dpr;
        
        // set canvas display size in CSS pixels
        this.canvas.style.width = `${parentRect.width}px`;
        this.canvas.style.height = `${parentRect.height}px`;

        // reconfigure the context
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.resizeCallback();
    }

    private setupResizeHandler() {
        // Use ResizeObserver for more efficient resize handling
        const observer = new ResizeObserver(this.handleResize);
        if (this.canvas.parentElement) {
            observer.observe(this.canvas.parentElement);
        }
    }        
  
}


class SimulationTimer {
    private lastTime: number = 0;
    private frameCount: number = 0;
    private lastFpsUpdate: number = 0;
    private fpsElement: HTMLElement;
    private particleCountElement: HTMLElement;

    constructor(particleCount: number) {
        this.fpsElement = document.getElementById('fps')!;
        this.particleCountElement = document.getElementById('particleCount')!;
        this.particleCountElement.textContent = `Particles: ${particleCount}`;
    }

    update() {
        const currentTime = performance.now();
        
        if (!this.lastTime) {
            this.lastTime = currentTime;
            return 0;
        }

        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        this.frameCount++;

        // update FPS counter every second
        if (currentTime - this.lastFpsUpdate >= 1000) {
            const fps = Math.round(this.frameCount * 1000 / (currentTime - this.lastFpsUpdate));
            this.fpsElement.textContent = `FPS: ${fps}`;
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
        }

        return deltaTime;
    }
}