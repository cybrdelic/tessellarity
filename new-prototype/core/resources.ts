export class ResourceManager {
    private buffers = new Map<string, GPUBuffer>();
    private textures = new Map<string, GPUTexture>();
    private pipelines = new Map<string, GPURenderPipeline>();

    constructor(private device: GPUDevice) { }

    createBuffer(name: string, descriptor: GPUBufferDescriptor): GPUBuffer {
        if (this.buffers.has(name)) {
            this.buffers.get(name)?.destroy();
        }

        const buffer = this.device.createBuffer(descriptor);
        this.buffers.set(name, buffer);
        return buffer;
    }

    getBuffer(name: string): GPUBuffer | undefined {
        return this.buffers.get(name);
    }

    createTexture(name: string, descriptor: GPUTextureDescriptor): GPUTexture {
        if (this.textures.has(name)) {
            this.textures.get(name)?.destroy();
        }

        const texture = this.device.createTexture(descriptor);
        this.textures.set(name, texture);
        return texture;
    }

    getTexture(name: string): GPUTexture | undefined {
        return this.textures.get(name);
    }

    createRenderPipeline(name: string, descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
        const pipeline = this.device.createRenderPipeline(descriptor);
        this.pipelines.set(name, pipeline);
        return pipeline;
    }

    getRenderPipeline(name: string): GPURenderPipeline | undefined {
        return this.pipelines.get(name);
    }

    cleanup() {
        this.buffers.forEach(buffer => buffer.destroy());
        this.textures.forEach(texture => texture.destroy());
        this.buffers.clear();
        this.textures.clear();
        this.pipelines.clear();
    }
}
