import { mat4, vec3 } from 'gl-matrix';
import renderShader from './shaders/render.wgsl';

export class Renderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private format: GPUTextureFormat;
    private pipeline!: GPURenderPipeline;
    private finalPipeline!: GPURenderPipeline;
    private cameraBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;
    private finalBindGroup!: GPUBindGroup;
    private depthTexture!: GPUTexture;
    private depthTextureView!: GPUTextureView;
    private quadBuffer!: GPUBuffer;
    private accumTexture!: GPUTexture;
    private accumTextureView!: GPUTextureView;

    constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
        this.device = device;
        this.context = context;
        this.format = format;
        
        this.createAccumulationTexture();
        this.createQuadBuffer();
        this.createDepthBuffer();
        this.createPipelines();
    }

    private createAccumulationTexture() {
        const width = this.context.canvas.width;
        const height = this.context.canvas.height;

        this.accumTexture = this.device.createTexture({
            size: {
                width: this.context.canvas.width,
                height: this.context.canvas.height,
                depthOrArrayLayers: 1
            },
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | 
                   GPUTextureUsage.TEXTURE_BINDING |
                   GPUTextureUsage.COPY_DST
        });
        this.accumTextureView = this.accumTexture.createView();
    }

    private createQuadBuffer() {
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


    private createPipelines() {
        // Create camera uniform buffer
        this.cameraBuffer = this.device.createBuffer({
            size: 64 * 3,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    
        // Create bind group layout for camera (used in both passes)
        const cameraBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' }
                }
            ]
        });
    
        // Create bind group layout for final pass (needs both camera and texture)
        const finalBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'float',
                        viewDimension: '2d'
                    }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {
                        type: 'filtering'
                    }
                }
            ]
        });

        // Add a sampler for texture sampling
        const sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
        });

    
        // Create camera bind group
        this.bindGroup = this.device.createBindGroup({
            layout: cameraBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.cameraBuffer }
                }
            ]
        });
    
        // Create final pass bind group
        this.finalBindGroup = this.device.createBindGroup({
            layout: finalBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.cameraBuffer }
                },
                {
                    binding: 1,
                    resource: this.accumTextureView
                },
                {
                    binding: 2,
                    resource: sampler
                }
            ]
        });
    
        // Create accumulation pipeline
        this.pipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [cameraBindGroupLayout]
            }),
            vertex: {
                module: this.device.createShaderModule({
                    code: renderShader
                }),
                entryPoint: 'vertexMain',
                buffers: [
                    {
                        arrayStride: 8,
                        stepMode: 'vertex',
                        attributes: [{
                            format: 'float32x2',
                            offset: 0,
                            shaderLocation: 0
                        }]
                    },
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
                    format: 'rgba16float',
                    blend: {
                        color: {
                            srcFactor: 'one',
                            dstFactor: 'one',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one',
                            operation: 'add'
                        }
                    }
                }]
            },
            primitive: {
                topology: 'triangle-strip',
                stripIndexFormat: 'uint32',
                cullMode: 'none'
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus'
            }
        });
    
        // Create final pipeline
        this.finalPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [finalBindGroupLayout]
            }),
            vertex: {
                module: this.device.createShaderModule({
                    code: renderShader
                }),
                entryPoint: 'vertexFinal',  // Use the new vertex entry point
                buffers: [{
                    arrayStride: 8,
                    stepMode: 'vertex',
                    attributes: [{
                        format: 'float32x2',
                        offset: 0,
                        shaderLocation: 0
                    }]
                }]
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: renderShader
                }),
                entryPoint: 'fragmentFinal',
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
            }
        });
    }
    

    render(particleBuffer: GPUBuffer) {
        const viewDistance = 5.0;
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
        const projection = mat4.perspective(
            mat4.create(),
            Math.PI / 4,
            this.context.canvas.width / this.context.canvas.height,
            0.1,
            100
        );

        this.device.queue.writeBuffer(this.cameraBuffer, 0, model as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 64, view as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 128, projection as Float32Array);

        const commandEncoder = this.device.createCommandEncoder();

        // First pass - accumulate field
        const accumPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.accumTextureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
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

        accumPass.setPipeline(this.pipeline);
        accumPass.setBindGroup(0, this.bindGroup);
        accumPass.setVertexBuffer(0, this.quadBuffer);
        accumPass.setVertexBuffer(1, particleBuffer);
        accumPass.draw(4, 8 * 1024);
        accumPass.end();

        // Second pass - render final surface
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }]
        });

        renderPass.setPipeline(this.finalPipeline);
        renderPass.setBindGroup(0, this.finalBindGroup);
        renderPass.setVertexBuffer(0, this.quadBuffer);
        renderPass.draw(4, 1);  // Draw one quad
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    resize() {
        if (this.depthTexture) {
            this.depthTexture.destroy();
        }
        if (this.accumTexture) {
            this.accumTexture.destroy();
        }
        this.createDepthBuffer();
        this.createAccumulationTexture();
    }
}