import { mat4, vec3 } from 'gl-matrix'; 
import renderShader from './shaders/render.wgsl';

export class Renderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private format: GPUTextureFormat;
    private pipeline!: GPURenderPipeline;
    // private vertexBuffer!: GPUBuffer;
    private cameraBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;
    private depthTexture!: GPUTexture;
    private depthTextureView!: GPUTextureView;
    private quadBuffer!: GPUBuffer; //for quad vertices

    constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
        this.device = device;
        this.context = context;
        this.format = format;
        this.createQuadBuffer();
        this.createPipeline();
        this.createDepthBuffer();
    }

    private createQuadBuffer() {
        // Create vertices for a quad
        const vertices = new Float32Array([
            -1, -1,  // Bottom-left
             1, -1,  // Bottom-right
            -1,  1,  // Top-left
             1,  1,  // Top-right
        ]);

        this.quadBuffer = this.device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.quadBuffer.getMappedRange()).set(vertices);
        this.quadBuffer.unmap();
    }

    private createDepthBuffer() {
        this.depthTexture = this.device.createTexture({
            size: {
                width: this.context.canvas.width,
                height: this.context.canvas.height,
                depthOrArrayLayers: 1
            },
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();
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

        this.pipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            vertex: {
                module: this.device.createShaderModule({
                    code: renderShader
                }),
                entryPoint: 'vertexMain',
                buffers: [
                    // Quad vertices
                    {
                        arrayStride: 8,
                        stepMode: 'vertex',
                        attributes: [{
                            format: 'float32x2',
                            offset: 0,
                            shaderLocation: 0
                        }]
                    },
                    // Particle data (instanced)
                    {
                        arrayStride: 32,
                        stepMode: 'instance',
                        attributes: [
                            {
                                format: 'float32x4',
                                offset: 0,
                                shaderLocation: 1
                            },
                            {
                                format: 'float32x4',
                                offset: 16,
                                shaderLocation: 2
                            }
                        ]
                    }
                ]
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: renderShader
                }),
                entryPoint: 'fragmentMain',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    }
                }]
            },
            primitive: {
                topology: 'triangle-strip',
                cullMode: 'none'
            },            
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus'
            }
        });

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
        const viewDistance = 5.0;
        // const eye = vec3.fromValues(5, 2, 0); 
        // for camera rotation
        // const eye = vec3.fromValues(
        //     viewDistance * 2, // If you want camera rotation
        //     2,                                         // Height
        //     viewDistance * 2  // If you want camera rotation
        // );   
        const radius = 5;
        const eye = vec3.fromValues(
            radius * Math.sin(performance.now() / 10000),
            2,
            radius * Math.cos(performance.now() / 10000)
        );    
        const center = vec3.fromValues(0, 0, 0);
        const up = vec3.fromValues(0, 1, 0);

        const model = mat4.create();
        const view = mat4.lookAt(mat4.create(), eye, center, up);
        const projection = mat4.perspective(mat4.create(), Math.PI / 4, this.context.canvas.width / this.context.canvas.height, 0.1, 100);

        this.device.queue.writeBuffer(this.cameraBuffer, 0, model as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 64, view as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 128, projection as Float32Array);

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store'
            }
        });
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.quadBuffer);
        renderPass.setVertexBuffer(1, particleBuffer);
        renderPass.draw(4, 8 * 1024, 0, 0); // 4 vertices per quad, NUM_PARTICLES instances
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    resize() {
        if (this.depthTexture) {
            this.depthTexture.destroy();
        }
        this.createDepthBuffer();
    }
}