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
                   GPUTextureUsage.COPY_DST |
                   GPUTextureUsage.COPY_SRC // Add this flag
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
            size: 64 * 3 + 16,  // 3 matrices (64 bytes each) + viewport+padding (16 bytes)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    
        // Create bind group layouts first
        const cameraBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' }
                }
            ]
        });
    
        const finalBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'float',
                        viewDimension: '2d'
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {
                        type: 'filtering'
                    }
                }
            ]
        });
    
        // Create sampler
        const sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
        });
    
        // Create bind groups using the layouts
        this.bindGroup = this.device.createBindGroup({
            layout: cameraBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.cameraBuffer }
                }
            ]
        });
    
        this.finalBindGroup = this.device.createBindGroup({
            layout: finalBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.accumTextureView
                },
                {
                    binding: 1,
                    resource: sampler
                }
            ]
        });
    
        // Create pipeline layouts
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [cameraBindGroupLayout]
        });
    
        const finalPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [cameraBindGroupLayout, finalBindGroupLayout]
        });
    
        // Create accumulation pipeline
        this.pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
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
            layout: finalPipelineLayout,
            vertex: {
                module: this.device.createShaderModule({
                    code: renderShader
                }),
                entryPoint: 'vertexFinal',
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

    async render(particleBuffer: GPUBuffer) {
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
      // Adjust field of view and aspect ratio
        const aspect = this.context.canvas.width / this.context.canvas.height;
        const projection = mat4.perspective(
            mat4.create(),
            Math.PI / 5,  // Wider field of view
            aspect,
            0.1,
            100
        );

        // Create viewport data with padding
        const viewportData = new Float32Array([
            this.context.canvas.width,
            this.context.canvas.height,
            0.0,  // padding
            0.0   // padding
        ]);


        this.device.queue.writeBuffer(this.cameraBuffer, 0, model as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 64, view as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 128, projection as Float32Array);
        this.device.queue.writeBuffer(this.cameraBuffer, 192, viewportData);

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
        accumPass.draw(4, 4 * 1024);
        accumPass.end();

        // Debug: Read back accumulation texture values
        const debugBuffer = this.device.createBuffer({
            size: 4 * 4,  // Space for one RGBA value
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const debugCommandEncoder = this.device.createCommandEncoder();
        debugCommandEncoder.copyTextureToBuffer(
            { texture: this.accumTexture },
            { buffer: debugBuffer, bytesPerRow: 256, rowsPerImage: 1 },
            { width: 1, height: 1, depthOrArrayLayers: 1 }
        );
        
        this.device.queue.submit([debugCommandEncoder.finish()]);
        
        // Wait for the GPU to finish
        await debugBuffer.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(debugBuffer.getMappedRange());
        console.log('Accumulation texture value:', data);
        debugBuffer.unmap();

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
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setBindGroup(1, this.finalBindGroup);
        renderPass.setVertexBuffer(0, this.quadBuffer);
        renderPass.draw(4);  // Draw one quad
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