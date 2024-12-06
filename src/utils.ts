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
    }

    private setupResizeHandler() {
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;
                
                this.canvas.width = width * window.devicePixelRatio;
                this.canvas.height = height * window.devicePixelRatio;
                
                this.context.configure({
                    device: this.device,
                    format: this.format,
                    alphaMode: 'premultiplied',
                    usage: GPUTextureUsage.RENDER_ATTACHMENT,
                });

                this.resizeCallback();
            }
        });

        observer.observe(this.canvas);
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

        // Update FPS counter every second
        if (currentTime - this.lastFpsUpdate >= 1000) {
            const fps = Math.round(this.frameCount * 1000 / (currentTime - this.lastFpsUpdate));
            this.fpsElement.textContent = `FPS: ${fps}`;
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
        }

        return deltaTime;
    }
}