// Import compute shader
import computeShaderCode from './shaders/compute.wgsl';

export interface SimulationParams {
    scalePressure: number;
    scaleViscosity: number;
    scaleGravity: number;
    gas_constant: number;
    rest_density: number;
    timeStep: number;
    smoothing_radius: number;
    viscosity: number;
    gravity: number;
    particle_mass: number;
    eps: number;
    bounce_damping: number;
    min_domain_bound: [number, number, number, number];
    max_domain_bound: [number, number, number, number];
}

export class SPHSimulation {
    private device: GPUDevice;
    private computePipeline!: GPUComputePipeline;
    private particleBuffer!: GPUBuffer;
    private parameterBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;
    private readonly workgroupSize = 64;
    private readonly particleCount = 8 * 1024; // Same as Vulkan version

    constructor(device: GPUDevice) {
        this.device = device;
        this.initialize().catch(console.error);
    }

    private async initialize(): Promise<void> {
        // Create compute pipeline
        const computeShaderModule = this.device.createShaderModule({
            label: "SPH compute shader",
            code: computeShaderCode
        });

        this.computePipeline = await this.device.createComputePipelineAsync({
            layout: 'auto',
            compute: {
                module: computeShaderModule,
                entryPoint: 'computeForces', // We'll switch between density and forces
            }
        });

        // Create particle buffer
        this.particleBuffer = this.device.createBuffer({
            size: this.particleCount * 32, // 2 vec4s per particle (pos/density + vel/pressure)
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // Create parameter buffer
        this.parameterBuffer = this.device.createBuffer({
            size: 80, // Size of SimParams struct
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create bind group
        this.bindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.parameterBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.particleBuffer }
                }
            ]
        });

        // Initialize particles
        this.initializeParticles();
    }

    private initializeParticles(): void {
        const particles = new Float32Array(this.particleCount * 8); // 8 floats per particle
        const domainSize = 2.0;
        
        for (let i = 0; i < this.particleCount; i++) {
            // Position (xyz) and density (w)
            particles[i * 8 + 0] = (Math.random() - 0.5) * domainSize; // x
            particles[i * 8 + 1] = (Math.random() - 0.5) * domainSize; // y
            particles[i * 8 + 2] = (Math.random() - 0.5) * domainSize; // z
            particles[i * 8 + 3] = 0; // density

            // Velocity (xyz) and pressure (w)
            particles[i * 8 + 4] = 0; // vx
            particles[i * 8 + 5] = 0; // vy
            particles[i * 8 + 6] = 0; // vz
            particles[i * 8 + 7] = 0; // pressure
        }

        this.device.queue.writeBuffer(this.particleBuffer, 0, particles);
    }

    public updateSimulationParams(params: SimulationParams): void {
        const paramData = new Float32Array([
            params.scalePressure,
            params.scaleViscosity,
            params.scaleGravity,
            params.gas_constant,
            params.rest_density,
            params.timeStep,
            params.smoothing_radius,
            params.viscosity,
            params.gravity,
            params.particle_mass,
            params.eps,
            params.bounce_damping,
            ...params.min_domain_bound,
            ...params.max_domain_bound,
        ]);

        this.device.queue.writeBuffer(this.parameterBuffer, 0, paramData);
    }

    public simulate(): GPUCommandBuffer {
        const commandEncoder = this.device.createCommandEncoder();

        // Density computation pass
        {
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(this.computePipeline);
            passEncoder.setBindGroup(0, this.bindGroup);
            passEncoder.dispatchWorkgroups(Math.ceil(this.particleCount / this.workgroupSize));
            passEncoder.end();
        }

        // Forces computation pass
        {
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(this.computePipeline);
            passEncoder.setBindGroup(0, this.bindGroup);
            passEncoder.dispatchWorkgroups(Math.ceil(this.particleCount / this.workgroupSize));
            passEncoder.end();
        }

        return commandEncoder.finish();
    }

    public getParticleBuffer(): GPUBuffer {
        return this.particleBuffer;
    }
}