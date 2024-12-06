import computeShader from './shaders/compute.wgsl';

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

interface Particle {
    position: Float32Array; // xyz = position, w = density
    velocity: Float32Array; // xyz = velocity, w = pressure
}

export class SPHSimulation {
    private device: GPUDevice;
    private particleBuffer!: GPUBuffer;
    private parameterBuffer!: GPUBuffer;
    private computePipeline!: GPUComputePipeline;
    private computeBindGroup!: GPUBindGroup;
    private workgroupSize = 64;
    private numParticles = 8 * 1024;

    constructor(device: GPUDevice) {
        this.device = device;
        this.initializeBuffers();
        this.createPipeline();
    }

    private initializeBuffers() {
        // Create particle buffer
        const particleBufferSize = this.numParticles * 2 * 4 * 4; // 2 vec4s per particle * 4 components * 4 bytes
        this.particleBuffer = this.device.createBuffer({
            size: particleBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // Initialize particles with random positions
        const particles: Particle[] = [];
        for (let i = 0; i < this.numParticles; i++) {
            particles.push({
                position: new Float32Array([
                    Math.random() * 2 - 1, // x: [-1, 1]
                    Math.random() * 2 - 1, // y: [-1, 1]
                    Math.random() * 2 - 1, // z: [-1, 1]
                    0                      // density
                ]),
                velocity: new Float32Array([0, 0, 0, 0]) // zero initial velocity, w = pressure
            });
        }

        // Upload particle data
        const particleData = new Float32Array(this.numParticles * 8); // 8 floats per particle
        let offset = 0;
        particles.forEach(particle => {
            particleData.set(particle.position, offset);
            particleData.set(particle.velocity, offset + 4);
            offset += 8;
        });
        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);

        // Create parameter buffer
        this.parameterBuffer = this.device.createBuffer({
            size: 64, // Size of SimParams struct
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    private createPipeline() {
        // Create compute pipeline
        this.computePipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.device.createBindGroupLayout({
                    entries: [
                        {
                            binding: 0,
                            visibility: GPUShaderStage.COMPUTE,
                            buffer: { type: 'uniform' }
                        },
                        {
                            binding: 1,
                            visibility: GPUShaderStage.COMPUTE,
                            buffer: { type: 'storage' }
                        }
                    ]
                })]
            }),
            compute: {
                module: this.device.createShaderModule({
                    code: computeShader
                }),
                entryPoint: 'computeDensity'
            }
        });

        // Create bind group
        this.computeBindGroup = this.device.createBindGroup({
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
    }

    updateSimulationParams(params: SimulationParams) {
        // Convert parameters to ArrayBuffer
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
            ...params.max_domain_bound
        ]);
        
        this.device.queue.writeBuffer(this.parameterBuffer, 0, paramData);
    }

    simulate(): GPUCommandBuffer {
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();

        // Compute density
        passEncoder.setPipeline(this.computePipeline);
        passEncoder.setBindGroup(0, this.computeBindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(this.numParticles / this.workgroupSize));

        // Compute forces
        passEncoder.setPipeline(this.computePipeline);
        passEncoder.setBindGroup(0, this.computeBindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(this.numParticles / this.workgroupSize));

        passEncoder.end();
        return commandEncoder.finish();
    }

    getParticleBuffer(): GPUBuffer {
        return this.particleBuffer;
    }
}