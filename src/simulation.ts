import computeShader from './shaders/compute.wgsl';
import { SimulationParams, Particle } from './types/simulation';


export class SPHSimulation {
    private device: GPUDevice;
    // private simulationParamsBuffer!: GPUBuffer;
    
    private particleBuffer!: GPUBuffer;
    private parameterBuffer!: GPUBuffer;
    private computePipelineDensity!: GPUComputePipeline;
    private computePipelineForces!: GPUComputePipeline;
    private computeBindGroup!: GPUBindGroup;
    private workgroupSize = 64;
    private numParticles = 8 * 1024;

    constructor(device: GPUDevice) {
        this.device = device;
        // Increased size to match the full parameter struct
        const paramBufferSize = 80;
        
        this.parameterBuffer = device.createBuffer({
            size: paramBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        
        this.initializeBuffers();
        this.createPipelines();
        this.createBindGroups();
    }

    private createBindGroups() {
        this.computeBindGroup = this.device.createBindGroup({
            layout: this.computePipelineDensity.getBindGroupLayout(0),
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
        // Create particle buffer - 2 vec4s per particle (position+density, velocity+pressure)
        const particleBufferSize = this.numParticles * 2 * 4 * 4; // numParticles * 2 vec4s * 4 components * 4 bytes
        this.particleBuffer = this.device.createBuffer({
            size: particleBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    
         // Initialize particles data and upload
         const particleData = new Float32Array(this.numParticles * 8);
         const boxSize = 0.5;
         const particlesPerDim = Math.ceil(Math.pow(this.numParticles, 1/3));
         const spacing = boxSize * 2 / particlesPerDim;
         
         let offset = 0;
         for (let x = 0; x < particlesPerDim && (offset/8) < this.numParticles; x++) {
             for (let y = 0; y < particlesPerDim && (offset/8) < this.numParticles; y++) {
                 for (let z = 0; z < particlesPerDim && (offset/8) < this.numParticles; z++) {
                     // Position (xyz) + density (w)
                     particleData[offset] = -boxSize + x * spacing;
                     particleData[offset + 1] = 0.8 + y * spacing;  // Start higher up
                     particleData[offset + 2] = -boxSize + z * spacing;
                     particleData[offset + 3] = 0;  // density
                     
                     // Velocity (xyz) + pressure (w)
                     particleData[offset + 4] = 0;
                     particleData[offset + 5] = 0;
                     particleData[offset + 6] = 0;
                     particleData[offset + 7] = 0;
                     
                     offset += 8;
                 }
             }
         }
    
    
        // Upload particle data to GPU
        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);
    
        // // Create and initialize simulation parameters buffer
        // this.parameterBuffer = this.device.createBuffer({
        //     size: 64, // Size of SimParams struct
        //     usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        // });
    }

    // In simulation.ts class
    // private computePipelineDensity!: GPUComputePipeline;
    // private computePipelineForces!: GPUComputePipeline;

    private createPipelines() {
        const pipelineLayout = this.device.createPipelineLayout({
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
        });

        // Create density computation pipeline
        this.computePipelineDensity = this.device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: this.device.createShaderModule({
                    code: computeShader
                }),
                entryPoint: 'computeDensity'
            }
        });

        // Create forces computation pipeline
        this.computePipelineForces = this.device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: this.device.createShaderModule({
                    code: computeShader
                }),
                entryPoint: 'computeForces'
            }
        });
    }

    updateSimulationParams(params: SimulationParams) {
        // Create buffer with correct alignment
        const paramData = new Float32Array([
            params.scalePressure,
            params.scaleViscosity,
            params.scaleGravity,
            params.gas_constant, // Complete vec4 alignment
            
            params.rest_density,
            params.timeStep,
            params.smoothing_radius,
            params.viscosity, // Complete vec4 alignment
            
            params.gravity,
            params.particle_mass,
            params.eps,
            params.bounce_damping, // Complete vec4 alignment
            
            // Domain bounds are already vec4s
            ...params.min_domain_bound,
            ...params.max_domain_bound
        ]);
        
        this.device.queue.writeBuffer(this.parameterBuffer, 0, paramData);
    }

    simulate(): GPUCommandBuffer {
        const commandEncoder = this.device.createCommandEncoder();
        
        // Density pass
        const densityPass = commandEncoder.beginComputePass();
        densityPass.setPipeline(this.computePipelineDensity);
        densityPass.setBindGroup(0, this.computeBindGroup);
        densityPass.dispatchWorkgroups(Math.ceil(this.numParticles / this.workgroupSize));
        densityPass.end();

        // Forces pass
        const forcesPass = commandEncoder.beginComputePass();
        forcesPass.setPipeline(this.computePipelineForces);
        forcesPass.setBindGroup(0, this.computeBindGroup);
        forcesPass.dispatchWorkgroups(Math.ceil(this.numParticles / this.workgroupSize));
        forcesPass.end();

        return commandEncoder.finish();
    }

    getParticleBuffer(): GPUBuffer {
        return this.particleBuffer;
    }
}