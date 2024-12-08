import { mat4, vec3 } from 'gl-matrix'; 

export class Renderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private format: GPUTextureFormat;
    private pipeline!: GPURenderPipeline;
    private vertexBuffer!: GPUBuffer;
    private cameraBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;

    constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
        this.device = device;
        this.context = context;
        this.format = format;
        this.createPipeline();
    }

    private createPipeline() {
        // Create camera uniform buffer
        this.cameraBuffer = this.device.createBuffer({
            size: 64 * 3, // 3 4x4 matrices
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' }
                }
            ]
        });

        // Create pipeline
        this.pipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            vertex: {
                module: this.device.createShaderModule({
                    code: `
                        struct Camera {
                            model: mat4x4<f32>,
                            view: mat4x4<f32>,
                            projection: mat4x4<f32>
                        };
                        @binding(0) @group(0) var<uniform> camera: Camera;
                        
                        struct VertexOutput {
                            @builtin(position) position: vec4<f32>,
                            @location(0) color: vec4<f32>
                        };
                        
                        @vertex
                        fn main(@location(0) position: vec4<f32>) -> VertexOutput {
                            var output: VertexOutput;
                            output.position = camera.projection * camera.view * camera.model * vec4<f32>(position.xyz, 1.0);
                            output.color = vec4<f32>(1.0, 0.0, 0.0, 1.0);
                            return output;
                        }
                    `
                }),
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 32, // 8 floats * 4 bytes
                    attributes: [
                        {
                            format: 'float32x4',
                            offset: 0,
                            shaderLocation: 0
                        }
                    ]
                }]
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: `
                        @fragment
                        fn main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
                            return color;
                        }
                    `
                }),
                entryPoint: 'main',
                targets: [{
                    format: this.format
                }]
            },
            primitive: {
                topology: 'point-list'
            }
        });

        // Create bind group
        this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.cameraBuffer }
                }
            ]
        });
    }

    render(particleBuffer: GPUBuffer) {
        // Update camera matrices
        const radius = 5;
        // Convert arrays to vec3
        // const eye = vec3.fromValues(
        //     radius * Math.sin(performance.now() / 1000),
        //     2,
        //     radius * Math.cos(performance.now() / 1000)
        // );     
        const eye = vec3.fromValues(5, 0, 0);    
        const center = vec3.fromValues(0, 0, 0);
        const up = vec3.fromValues(0, 1, 0);

        const model = mat4.create();
        const view = mat4.lookAt(mat4.create(), eye, center, up);
        const projection = mat4.perspective(mat4.create(), Math.PI / 4, this.context.canvas.width / this.context.canvas.height, 0.1, 100);

        this.device.queue.writeBuffer(this.cameraBuffer, 0, model as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 64, view as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 128, projection as Float32Array);

        // Begin render pass
        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }]
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, particleBuffer);
        renderPass.draw(2 * 1024, 1, 0, 0); // Assuming 8192 particles
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }
}