import { makeShaderModule } from './makeShaderModule';
import skyboxShader from './skybox.wgsl';

export class SkyboxRenderer {
    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroup!: GPUBindGroup;
    private uniformBuffer: GPUBuffer;
    private sampler: GPUSampler;

    constructor(
        device: GPUDevice,
        presentationFormat: GPUTextureFormat,
        uniformBuffer: GPUBuffer,
        cubemapTextureView: GPUTextureView
    ) {
        this.device = device;
        this.uniformBuffer = uniformBuffer;

        // Create sampler for environment map
        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            addressModeW: 'clamp-to-edge',
        });

        // Create shader module
    const shaderModule = makeShaderModule(device, skyboxShader);

        // Create render pipeline
        this.pipeline = device.createRenderPipeline({
            label: 'skybox pipeline',
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs',
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs',
                targets: [{
                    format: presentationFormat,
                    blend: {
                        color: {
                            srcFactor: 'one',
                            dstFactor: 'zero',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'zero',
                        },
                    },
                }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
                format: 'depth24plus',
            },
        });

        // Create bind group
        this.updateCubemap(cubemapTextureView);
    }

    updateCubemap(cubemapTextureView: GPUTextureView) {
        this.bindGroup = this.device.createBindGroup({
            label: 'skybox bind group',
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer,
                    },
                },
                {
                    binding: 1,
                    resource: cubemapTextureView,
                },
                {
                    binding: 2,
                    resource: this.sampler,
                },
            ],
        });
    }

    render(renderPass: GPURenderPassEncoder) {
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.draw(3); // Fullscreen triangle
    }
}
