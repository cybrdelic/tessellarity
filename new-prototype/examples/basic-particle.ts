import {
    Simulation,
    SimulationParameter,
    BoundingBox,
    Transform,
    Vector3
} from '../core/foundation';
import { BasicBoundingBox } from '../core/spatial';
import { ResourceManager } from '../core/resources';

// Simplest possible simulation to validate architecture
export class BasicParticleSystem implements Simulation {
    id = 'basic-particles';
    name = 'Basic Particles';
    description = 'Simple animated particle system for testing';

    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private resources: ResourceManager;
    private transform = new Transform();
    private bounds = new BasicBoundingBox();

    private particles: Float32Array;
    private particleCount = 1000;
    private time = 0;

    // Parameters
    private animationSpeed = 1.0;
    private particleSize = 2.0;
    private waveAmplitude = 0.5;

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

        // Create particles (x, y, z, vx, vy, vz per particle)
        this.particles = new Float32Array(this.particleCount * 6);
        this.initializeParticles();

        // Create GPU buffer
        this.resources.createBuffer('particles', {
            size: this.particles.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        // Create render pipeline
        await this.createRenderPipeline();
    }

    private initializeParticles() {
        for (let i = 0; i < this.particleCount; i++) {
            const baseIndex = i * 6;
            // Random position
            this.particles[baseIndex + 0] = (Math.random() - 0.5) * 4; // x
            this.particles[baseIndex + 1] = (Math.random() - 0.5) * 4; // y
            this.particles[baseIndex + 2] = (Math.random() - 0.5) * 4; // z

            // Random velocity
            this.particles[baseIndex + 3] = (Math.random() - 0.5) * 0.1; // vx
            this.particles[baseIndex + 4] = (Math.random() - 0.5) * 0.1; // vy
            this.particles[baseIndex + 5] = (Math.random() - 0.5) * 0.1; // vz
        }
    }

    private async createRenderPipeline() {
        const shaderModule = this.device.createShaderModule({
            code: `
        struct VertexOutput {
          @builtin(position) position: vec4<f32>,
          @location(0) color: vec3<f32>,
        }

        @vertex
        fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
          var output: VertexOutput;
          output.position = vec4<f32>(position * 0.5, 1.0);
          output.color = vec3<f32>(
            (position.x + 2.0) / 4.0,
            (position.y + 2.0) / 4.0,
            (position.z + 2.0) / 4.0
          );
          return output;
        }

        @fragment
        fn fs_main(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
          return vec4<f32>(color, 1.0);
        }
      `
        });

        this.resources.createRenderPipeline('particles', {
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 6 * 4, // 6 floats per vertex
                    attributes: [{
                        format: 'float32x3',
                        offset: 0,
                        shaderLocation: 0
                    }]
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
                topology: 'point-list'
            }
        });
    }

    update(deltaTime: number) {
        this.time += deltaTime * this.animationSpeed;

        // Simple animation - wave motion and particle drift
        for (let i = 0; i < this.particleCount; i++) {
            const baseIndex = i * 6;

            // Wave motion
            this.particles[baseIndex + 1] +=
                Math.sin(this.time * 0.001 + i * 0.1) * this.waveAmplitude * deltaTime * 0.001;

            // Drift with velocity
            this.particles[baseIndex + 0] += this.particles[baseIndex + 3] * deltaTime * 0.01;
            this.particles[baseIndex + 1] += this.particles[baseIndex + 4] * deltaTime * 0.01;
            this.particles[baseIndex + 2] += this.particles[baseIndex + 5] * deltaTime * 0.01;

            // Boundary wrap
            if (Math.abs(this.particles[baseIndex + 0]) > 2) {
                this.particles[baseIndex + 3] *= -1;
            }
            if (Math.abs(this.particles[baseIndex + 1]) > 2) {
                this.particles[baseIndex + 4] *= -1;
            }
            if (Math.abs(this.particles[baseIndex + 2]) > 2) {
                this.particles[baseIndex + 5] *= -1;
            }
        }

        // Upload to GPU
        const buffer = this.resources.getBuffer('particles');
        if (buffer) {
            this.device.queue.writeBuffer(buffer, 0, this.particles);
        }
    }

    render(encoder: GPUCommandEncoder) {
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.1, g: 0.1, b: 0.2, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        const pipeline = this.resources.getRenderPipeline('particles');
        const buffer = this.resources.getBuffer('particles');

        if (pipeline && buffer) {
            renderPass.setPipeline(pipeline);
            renderPass.setVertexBuffer(0, buffer);
            renderPass.draw(this.particleCount);
        }

        renderPass.end();
    }

    cleanup() {
        this.resources.cleanup();
    }

    getParameters(): SimulationParameter[] {
        return [
            {
                name: 'animationSpeed',
                type: 'float',
                value: this.animationSpeed,
                range: [0.1, 5.0],
                description: 'Speed of particle animation'
            },
            {
                name: 'particleSize',
                type: 'float',
                value: this.particleSize,
                range: [1.0, 10.0],
                description: 'Size of particles'
            },
            {
                name: 'waveAmplitude',
                type: 'float',
                value: this.waveAmplitude,
                range: [0.1, 2.0],
                description: 'Amplitude of wave motion'
            }
        ];
    }

    setParameter(name: string, value: any) {
        switch (name) {
            case 'animationSpeed':
                this.animationSpeed = value;
                break;
            case 'particleSize':
                this.particleSize = value;
                break;
            case 'waveAmplitude':
                this.waveAmplitude = value;
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
