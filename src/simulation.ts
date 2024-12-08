import computeShader from './shaders/compute.wgsl';
import { SimulationParams, Particle } from './types/simulation';
import { vec3 } from 'gl-matrix';
import {defaultSimulationParams} from './config/simulationDefaults';

interface GridCell {
    corners: vec3[];
    values: number[];
}


async function calculateFieldValue(point: vec3, getParticlePositions: () => Promise<vec3[]>, h: number): Promise<number> {
    let fieldValue = 0;
    const particles = await getParticlePositions();

    for (const particle of particles) {
        const dist = vec3.distance(point as vec3, particle as vec3);
        if (dist < h) {
            fieldValue += (1 - (dist * dist) / (h * h)) * (1 - (dist * dist) / (h * h)) * (1 - (dist * dist) / (h * h));
        }
    }

    return fieldValue;
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

    // for surface mesh
    private simulationParams!: SimulationParams;
    private gridResolution = 32;
    private gridSize = 2.0; // Size of domain
    private surfaceBuffer!: GPUBuffer;

    constructor(device: GPUDevice) {
        this.device = device;
        this.simulationParams = defaultSimulationParams;
        // Increased size to match the full parameter struct
        const paramBufferSize = 80;
        
        this.parameterBuffer = device.createBuffer({
            size: paramBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // this.surfaceBuffer = device.createBuffer({
        //     size: this.gridResolution * this.gridResolution * this.gridResolution * 4 * 4, // Float32 * 4 components
        //     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 
        //     mappedAtCreation: true
        // });
        
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
        // this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);

            // Initialize surface buffer with a simple triangle for testing
    // Create and initialize surface buffer
    const initialSurfaceData = new Float32Array([
        3, 0, 0, 0,  // Vertex count (3 vertices)
        // Simple triangle for testing
        -0.5, -0.5, 0.0,  // vertex 1
        0.5, -0.5, 0.0,   // vertex 2
        0.0, 0.5, 0.0     // vertex 3
    ]);

    this.surfaceBuffer = this.device.createBuffer({
        size: initialSurfaceData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
    });


    // Write initial data and unmap
    new Float32Array(this.surfaceBuffer.getMappedRange()).set(initialSurfaceData);
    this.surfaceBuffer.unmap();
    
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

    async simulate(): Promise<GPUCommandBuffer> {
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

        // Generate and update surface mesh
        const surfaceData = await this.generateSurfaceMesh();
        this.device.queue.writeBuffer(this.surfaceBuffer, 0, surfaceData);

        return commandEncoder.finish();
    }

    getParticleBuffer(): GPUBuffer {
        return this.particleBuffer;
    }

    getSurfaceBuffer(): GPUBuffer {
        return this.surfaceBuffer;
    }

    async generateSurfaceMesh(): Promise<Float32Array> {
        const vertices: number[] = [];
        const cellSize = this.gridSize / this.gridResolution;
        
        // Add debug logging
        console.log('Generating surface mesh');
        console.log('Grid size:', this.gridSize);
        console.log('Cell size:', cellSize);

        // Create 3D grid
        // for (let x = 0; x < this.gridResolution - 1; x++) {
        //     for (let y = 0; y < this.gridResolution - 1; y++) {
        //         for (let z = 0; z < this.gridResolution - 1; z++) {
        //             const cell: GridCell = {
        //                 corners: [
        //                     vec3.fromValues(x * cellSize, y * cellSize, z * cellSize),
        //                     vec3.fromValues((x + 1) * cellSize, y * cellSize, z * cellSize),
        //                     vec3.fromValues((x + 1) * cellSize, y * cellSize, (z + 1) * cellSize),
        //                     vec3.fromValues(x * cellSize, y * cellSize, (z + 1) * cellSize),
        //                     vec3.fromValues(x * cellSize, (y + 1) * cellSize, z * cellSize),
        //                     vec3.fromValues((x + 1) * cellSize, (y + 1) * cellSize, z * cellSize),
        //                     vec3.fromValues((x + 1) * cellSize, (y + 1) * cellSize, (z + 1) * cellSize),
        //                     vec3.fromValues(x * cellSize, (y + 1) * cellSize, (z + 1) * cellSize),
        //                 ],
        //                 values: new Array(8).fill(0)
        //             };

        //             // Calculate field values at each corner
        //             for (let i = 0; i < 8; i++) {
        //                 cell.values[i] = await calculateFieldValue(cell.corners[i], this.getParticlePositions.bind(this), this.simulationParams.smoothing_radius);
        //             }

        //             // Generate triangles for this cell
        //             this.marchCell(cell, vertices);
        //         }
        //     }
        // }

        vertices.push(
            -0.5, -0.5, 0.0,  // vertex 1
            0.5, -0.5, 0.0,   // vertex 2
            0.0, 0.5, 0.0     // vertex 3
        );
    

        // const surfaceData = new Float32Array(4 + vertices.length);
        // surfaceData[0] = vertices.length / 3; // numVertices
        // surfaceData.set(vertices, 4);

            // Create surface data with vertex count header
    const surfaceData = new Float32Array(4 + vertices.length);
    surfaceData[0] = vertices.length / 3; // Number of vertices
    surfaceData[1] = 0; // Padding
    surfaceData[2] = 0; // Padding
    surfaceData[3] = 0; // Padding
    surfaceData.set(vertices, 4);

            // Add debug logging
    console.log('Generated vertices:', vertices.length / 3);
    console.log('First few vertices:', vertices.slice(0, 9));

        return surfaceData;
        // return new Float32Array(vertices);
    }

    // private calculateFieldValue(point: vec3): number {
    //     let fieldValue = 0;
    //     const particles = await this.getParticlePositions();
    //     const h = this.simulationParams.smoothing_radius;

    //     for (const particle of particles) {
    //         const dist = vec3.distance(point as vec3, particle as vec3);
    //         if (dist < h) {
    //             fieldValue += (1 - (dist * dist) / (h * h)) * (1 - (dist * dist) / (h * h)) * (1 - (dist * dist) / (h * h));
    //         }
    //     }

    //     return fieldValue;
    // }

    private marchCell(cell: GridCell, vertices: number[]) {
        const threshold = 1.0;
        let cubeIndex = 0;

        // Determine cube index based on field values
        for (let i = 0; i < 8; i++) {
            if (cell.values[i] > threshold) {
                cubeIndex |= 1 << i;
            }
        }

        // Generate vertices using marching cubes tables
        // This is a simplified version - you'll need to add the full tables
        if (cubeIndex !== 0 && cubeIndex !== 255) {
            // Add interpolated vertices based on the cube index
            // This is where you'd use the edge table and triangle table
            // For now, just add a simple triangle
            vertices.push(
                cell.corners[0][0], cell.corners[0][1], cell.corners[0][2],
                cell.corners[1][0], cell.corners[1][1], cell.corners[1][2],
                cell.corners[2][0], cell.corners[2][1], cell.corners[2][2]
            );
        }
    }

    private async getParticlePositions(): Promise<vec3[]> {
        const particleData = new Float32Array(this.numParticles * 8);
        
        // Create a staging buffer
        const stagingBuffer = this.device.createBuffer({
            size: particleData.byteLength,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // Update particleBuffer creation to include COPY_SRC
        const particleBufferSize = this.numParticles * 2 * 4 * 4; // numParticles * 2 vec4s * 4 components * 4 bytes
        this.particleBuffer = this.device.createBuffer({
            size: particleBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        
        // Copy data from the particle buffer to the staging buffer
        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
            this.particleBuffer, 0,
            stagingBuffer, 0,
            particleData.byteLength
        );
        
        // Submit the command buffer and wait for it to complete
        const copyCommands = commandEncoder.finish();
        this.device.queue.submit([copyCommands]);
        await this.device.queue.onSubmittedWorkDone();
        
        // Map the staging buffer to read the data
        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const stagingData = new Float32Array(stagingBuffer.getMappedRange());
        stagingBuffer.unmap();
        
        const positions: vec3[] = [];
        for (let i = 0; i < stagingData.length; i += 8) {
            positions.push(vec3.fromValues(stagingData[i], stagingData[i + 1], stagingData[i + 2]));
        }
        
        return positions;
    }

}