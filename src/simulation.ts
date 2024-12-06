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
    // private simulationParamsBuffer: GPUBuffer;

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
        // this.simulationParamsBuffer = device.createBuffer({
        //     size: 64, // 12 parameters * 4 bytes each
        //     usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        // });
    }


    updateParameters(params: SimulationParams) {
        // Create a Float32Array from the parameters
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

        // Write the parameters to the GPU buffer
        this.device.queue.writeBuffer(this.parameterBuffer, 0, paramData);

    }

    private initializeBuffers() {
        // Create particle buffer
        const particleBufferSize = this.numParticles * 2 * 4 * 4; // 2 vec4s per particle * 4 components * 4 bytes
        this.particleBuffer = this.device.createBuffer({
            size: particleBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // Initialize particles with random positions
        const particleData = new Float32Array(this.numParticles * 8);
        for (let i = 0; i < this.numParticles; i++) {
            const baseIndex = i * 8;
            // Position (xyz) and density (w)
            particleData[baseIndex + 0] = Math.random() * 2 - 1; // x: [-1, 1]
            particleData[baseIndex + 1] = Math.random() * 2 - 1; // y: [-1, 1]
            particleData[baseIndex + 2] = Math.random() * 2 - 1; // z: [-1, 1]
            particleData[baseIndex + 3] = 0;                     // density
            // Velocity (xyz) and pressure (w)
            particleData[baseIndex + 4] = 0;
            particleData[baseIndex + 5] = 0;
            particleData[baseIndex + 6] = 0;
            particleData[baseIndex + 7] = 0;
        }
        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);

        // Create parameter buffer
        this.parameterBuffer = this.device.createBuffer({
            size: 96, // Size needs to match SimParams struct in shader
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    private createPipeline() {
        const bindGroupLayout = this.device.createBindGroupLayout({
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
        });

        this.computePipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            compute: {
                module: this.device.createShaderModule({
                    code: computeShader
                }),
                entryPoint: 'computeDensity'
            }
        });

        this.computeBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
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
        // passEncoder.setPipeline(this.computePipeline);
        // passEncoder.setBindGroup(0, this.computeBindGroup);
        // passEncoder.dispatchWorkgroups(Math.ceil(this.numParticles / this.workgroupSize));

        passEncoder.end();
        return commandEncoder.finish();
    }

    getParticleBuffer(): GPUBuffer {
        return this.particleBuffer;
    }
}