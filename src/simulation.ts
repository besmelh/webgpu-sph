import computeShader from './shaders/compute.wgsl';
import { SimulationParams, Particle } from './types/simulation';


interface CursorState {
    position: [number, number, number];
    radius: number;
    strength: number;
}

export class SPHSimulation {
    private device: GPUDevice;
    // private simulationParamsBuffer!: GPUBuffer;
    
    private particleBuffer!: GPUBuffer;
    private parameterBuffer!: GPUBuffer;
    private computePipelineDensity!: GPUComputePipeline;
    private computePipelineForces!: GPUComputePipeline;
    private computeBindGroup!: GPUBindGroup;
    private workgroupSize = 64;
    private numParticles = 4 * 1024;

    private cursorState!: CursorState;

    constructor(device: GPUDevice) {
        this.device = device;
        // 5 vec4s for original params (80 bytes) + 2 vec4s for cursor data (32 bytes) = 112 bytes total
        const paramBufferSize = 112;  // Changed from 80 to 112
        
        this.parameterBuffer = device.createBuffer({
            size: paramBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        
        this.initializeBuffers();
        this.createPipelines();
        this.createBindGroups();

        this.cursorState = {
            position: [0, 0, 0],
            radius: 0.8,
            strength: 50.0        
        };
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

         const boxSize = 0.3; // Reduced from 0.5 to make a tighter clump
         const particlesPerDim = Math.ceil(Math.pow(this.numParticles, 1/3));
         const spacing = boxSize * 2 / particlesPerDim;
         
         let offset = 0;
         // Center the cube in x and z, place it high in y
        const centerX = 0;
        const startY = 0.8; // Start height
        const centerZ = 0;
        const initialDensity = 0;
        const initialPressure = 0;
        for (let x = 0; x < particlesPerDim && (offset/8) < this.numParticles; x++) {
            for (let y = 0; y < particlesPerDim && (offset/8) < this.numParticles; y++) {
                for (let z = 0; z < particlesPerDim && (offset/8) < this.numParticles; z++) {
                    // Position (xyz) + density (w)
                    particleData[offset] = centerX - boxSize + x * spacing;
                    particleData[offset + 1] = startY + y * spacing;  // Start higher up
                    particleData[offset + 2] = centerZ - boxSize + z * spacing;
                    particleData[offset + 3] = initialDensity;  // density
                    
                    // Velocity (xyz) + pressure (w)
                    particleData[offset + 4] = 0;
                    particleData[offset + 5] = 0;
                    particleData[offset + 6] = 0;
                    particleData[offset + 7] = initialPressure;
                    
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
            ...params.max_domain_bound,

            // Cursor data (32 bytes)
            ...params.cursor_data,
            ...params.cursor_force
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

    // Convert screen coordinates to world space
    private screenToWorld(screenX: number, screenY: number, canvas: HTMLCanvasElement): [number, number, number] {
        const rect = canvas.getBoundingClientRect();

        // Normalize to [-1, 1] and scale to match simulation domain
        const x = ((screenX - rect.left) / rect.width * 2 - 1) * 1.0;  
        const y = (1 - (screenY - rect.top) / rect.height * 2) * 1.0;  // Flip Y and scale
        
        // Get the camera's view parameters (these should match your renderer.ts values)
        const viewDistance = 5.0;  // Match the eye distance in renderer.ts
        const fov = Math.PI / 4;   // Match the perspective FOV in renderer.ts
        
        // Calculate world space position based on camera setup
        const aspectRatio = canvas.width / canvas.height;
        const tanHalfFov = Math.tan(fov / 2);
        
        // Calculate the world space coordinates
        const worldX = (x * aspectRatio * tanHalfFov * viewDistance);
        const worldY = (y * tanHalfFov * viewDistance);
        
        // Project onto a plane at z = 0
        const worldZ = 0;
        
        console.log('Screen coords:', screenX, screenY);
        console.log('World coords:', worldX, worldY, worldZ);
        
        return [worldX, worldY, worldZ];
    }

    public updateCursor(screenX: number, screenY: number, isActive: boolean, canvas: HTMLCanvasElement) {
        const worldPos = this.screenToWorld(screenX, screenY, canvas);
        this.cursorState.position = worldPos;
        console.log('Cursor Update:', { worldPos, isActive }); // Debug logging
    
        // Update the cursor data portion of the parameter buffer
        const cursorData = new Float32Array([
            ...worldPos,           // x, y, z position
            this.cursorState.radius  // radius
        ]);

        const cursorForce = new Float32Array([
            0, 0, 0,              // unused
            isActive ? this.cursorState.strength : 0  // strength/active flag
        ]);
    
        // Offset is now 80 (original params size) and size is 32 (two vec4s)
        this.device.queue.writeBuffer(this.parameterBuffer, 80, cursorData);
        this.device.queue.writeBuffer(this.parameterBuffer, 96, cursorForce);    }
}