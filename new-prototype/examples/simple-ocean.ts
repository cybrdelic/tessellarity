import {
    Simulation,
    SimulationParameter,
    BoundingBox,
    Transform,
    Vector3
} from '../core/foundation';
import { BasicBoundingBox } from '../core/spatial';
import { ResourceManager } from '../core/resources';

export class SimpleOceanWaves implements Simulation {
    id = 'simple-ocean';
    name = 'Simple Ocean';
    description = 'Basic ocean wave simulation';

    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private resources: ResourceManager;
    private transform = new Transform();
    private bounds = new BasicBoundingBox({ x: -5, y: -1, z: -5 }, { x: 5, y: 1, z: 5 });

    private vertices: Float32Array;
    private indices: Uint16Array;
    private gridSize = 64;
    private time = 0;

    // Parameters
    private waveHeight = 0.5;
    private waveSpeed = 1.0;
    private waveFrequency = 1.0;

    async init(device: GPUDevice, canvas: HTMLCanvasElement) {
        this.device = device;
        this.canvas = canvas;
        this.context = canvas.getContext('webgpu') as GPUCanvasContext;
        this.resources = new ResourceManager(device);

        // Configure canvas
        this.context.configure({
            device: device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: 'premultiplied'
        });

        this.createOceanMesh();
        await this.createRenderPipeline();
    }

    private createOceanMesh() {
        const vertexCount = (this.gridSize + 1) * (this.gridSize + 1);
        this.vertices = new Float32Array(vertexCount * 6); // position + normal

        // Generate grid vertices
        for (let z = 0; z <= this.gridSize; z++) {
            for (let x = 0; x <= this.gridSize; x++) {
                const index = (z * (this.gridSize + 1) + x) * 6;

                // Position
                this.vertices[index + 0] = (x / this.gridSize - 0.5) * 10; // x
                this.vertices[index + 1] = 0; // y (will be updated in wave function)
                this.vertices[index + 2] = (z / this.gridSize - 0.5) * 10; // z

                // Normal (pointing up initially)
                this.vertices[index + 3] = 0;
                this.vertices[index + 4] = 1;
                this.vertices[index + 5] = 0;
            }
        }

        // Generate indices for triangles
        const indexCount = this.gridSize * this.gridSize * 6;
        this.indices = new Uint16Array(indexCount);

        let indexOffset = 0;
        for (let z = 0; z < this.gridSize; z++) {
            for (let x = 0; x < this.gridSize; x++) {
                const topLeft = z * (this.gridSize + 1) + x;
                const topRight = topLeft + 1;
                const bottomLeft = (z + 1) * (this.gridSize + 1) + x;
                const bottomRight = bottomLeft + 1;

                // First triangle
                this.indices[indexOffset++] = topLeft;
                this.indices[indexOffset++] = bottomLeft;
                this.indices[indexOffset++] = topRight;

                // Second triangle
                this.indices[indexOffset++] = topRight;
                this.indices[indexOffset++] = bottomLeft;
                this.indices[indexOffset++] = bottomRight;
            }
        }

        // Create GPU buffers
        this.resources.createBuffer('vertices', {
            size: this.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        this.resources.createBuffer('indices', {
            size: this.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        // Upload initial data
        const vertexBuffer = this.resources.getBuffer('vertices');
        const indexBuffer = this.resources.getBuffer('indices');
        if (vertexBuffer && indexBuffer) {
            this.device.queue.writeBuffer(vertexBuffer, 0, this.vertices);
            this.device.queue.writeBuffer(indexBuffer, 0, this.indices);
        }
    }

    private async createRenderPipeline() {
        const shaderModule = this.device.createShaderModule({
            code: `
        struct VertexOutput {
          @builtin(position) position: vec4<f32>,
          @location(0) worldPos: vec3<f32>,
          @location(1) normal: vec3<f32>,
        }

        @vertex
        fn vs_main(
          @location(0) position: vec3<f32>,
          @location(1) normal: vec3<f32>
        ) -> VertexOutput {
          var output: VertexOutput;
          output.position = vec4<f32>(position * 0.1, 1.0);
          output.worldPos = position;
          output.normal = normal;
          return output;
        }

        @fragment
        fn fs_main(
          @location(0) worldPos: vec3<f32>,
          @location(1) normal: vec3<f32>
        ) -> @location(0) vec4<f32> {
          let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
          let lightIntensity = max(dot(normal, lightDir), 0.2);

          let oceanColor = vec3<f32>(0.1, 0.3, 0.6);
          let finalColor = oceanColor * lightIntensity;

          return vec4<f32>(finalColor, 0.8);
        }
      `
        });

        this.resources.createRenderPipeline('ocean', {
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 6 * 4, // 6 floats per vertex
                    attributes: [
                        {
                            format: 'float32x3',
                            offset: 0,
                            shaderLocation: 0
                        },
                        {
                            format: 'float32x3',
                            offset: 12,
                            shaderLocation: 1
                        }
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat()
                }]
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back'
            }
        });
    }

    private updateWaves() {
        for (let z = 0; z <= this.gridSize; z++) {
            for (let x = 0; x <= this.gridSize; x++) {
                const index = (z * (this.gridSize + 1) + x) * 6;

                const worldX = this.vertices[index + 0];
                const worldZ = this.vertices[index + 2];

                // Generate waves using sin functions
                const wave1 = Math.sin(worldX * this.waveFrequency + this.time * this.waveSpeed);
                const wave2 = Math.sin(worldZ * this.waveFrequency * 0.7 + this.time * this.waveSpeed * 1.3);
                const wave3 = Math.sin((worldX + worldZ) * this.waveFrequency * 0.5 + this.time * this.waveSpeed * 0.8);

                this.vertices[index + 1] = (wave1 + wave2 * 0.5 + wave3 * 0.3) * this.waveHeight;

                // Calculate simple normal (pointing mostly up with some variation)
                const normalStrength = 0.1;
                this.vertices[index + 3] = Math.sin(worldX * this.waveFrequency) * normalStrength;
                this.vertices[index + 4] = 1.0;
                this.vertices[index + 5] = Math.sin(worldZ * this.waveFrequency) * normalStrength;
            }
        }
    }

    update(deltaTime: number) {
        this.time += deltaTime * 0.001;
        this.updateWaves();

        // Upload updated vertices to GPU
        const buffer = this.resources.getBuffer('vertices');
        if (buffer) {
            this.device.queue.writeBuffer(buffer, 0, this.vertices);
        }
    }

    render(encoder: GPUCommandEncoder) {
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.05, g: 0.1, b: 0.2, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        const pipeline = this.resources.getRenderPipeline('ocean');
        const vertexBuffer = this.resources.getBuffer('vertices');
        const indexBuffer = this.resources.getBuffer('indices');

        if (pipeline && vertexBuffer && indexBuffer) {
            renderPass.setPipeline(pipeline);
            renderPass.setVertexBuffer(0, vertexBuffer);
            renderPass.setIndexBuffer(indexBuffer, 'uint16');
            renderPass.drawIndexed(this.indices.length);
        }

        renderPass.end();
    }

    cleanup() {
        this.resources.cleanup();
    }

    getParameters(): SimulationParameter[] {
        return [
            {
                name: 'waveHeight',
                type: 'float',
                value: this.waveHeight,
                range: [0.1, 2.0],
                description: 'Height of waves'
            },
            {
                name: 'waveSpeed',
                type: 'float',
                value: this.waveSpeed,
                range: [0.1, 3.0],
                description: 'Speed of wave animation'
            },
            {
                name: 'waveFrequency',
                type: 'float',
                value: this.waveFrequency,
                range: [0.5, 3.0],
                description: 'Frequency of waves'
            }
        ];
    }

    setParameter(name: string, value: any) {
        switch (name) {
            case 'waveHeight':
                this.waveHeight = value;
                break;
            case 'waveSpeed':
                this.waveSpeed = value;
                break;
            case 'waveFrequency':
                this.waveFrequency = value;
                break;
        }
    }

    getBounds(): BoundingBox {
        return this.bounds;
    }

    getTransform(): Transform {
        return this.transform;
    }
}
