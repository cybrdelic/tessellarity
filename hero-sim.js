// Hero simulation using the exact same setup as main demo
import { mat4 } from 'https://cdn.skypack.dev/wgpu-matrix';
import { Camera } from './camera.ts';
import { MLSMPMSimulator, mlsmpmParticleStructSize } from './mls-mpm/mls-mpm.ts';
import { FluidRenderer } from './render/fluidRender.ts';
import { renderUniformsViews, renderUniformsValues, waterAppearanceValues, waterAppearanceViews, numParticlesMax } from './common.ts';

export class HeroSimulation {
    constructor() {
        this.device = null;
        this.canvas = null;
        this.context = null;
        this.simulator = null;
        this.renderer = null;
        this.camera = null;
        this.particleBuffer = null;
        this.posvelBuffer = null;
        this.renderUniformBuffer = null;
        this.waterAppearanceBuffer = null;
        this.isRunning = false;
        this.frameCount = 0;
        this.presentationFormat = null;
    }

    async init(canvas) {
        try {
            console.log('Hero simulation init starting...');
            this.canvas = canvas;

            // Use the exact same initialization as main.ts
            const initResult = await this.initWebGPU();
            if (!initResult) {
                return false;
            }

            await this.setupSimulation();
            console.log('Hero simulation setup complete');
            return true;
        } catch (error) {
            console.error('Failed to initialize hero simulation:', error);
            return false;
        }
    }

    async initWebGPU() {
        // Exact same WebGPU init as main.ts
        if (!navigator.gpu) {
            console.error("WebGPU is not supported on your browser.");
            return false;
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.error("Adapter is not available.");
            return false;
        }

        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');

        if (!this.context) {
            console.error("Failed to get WebGPU context");
            return false;
        }

        // Use same pixel ratio approach as main demo but smaller for performance
        let devicePixelRatio = 0.5; // Even smaller for hero demo
        this.canvas.width = devicePixelRatio * this.canvas.clientWidth;
        this.canvas.height = devicePixelRatio * this.canvas.clientHeight;

        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
        });

        console.log(`Canvas configured: ${this.canvas.width}x${this.canvas.height}`);
        return true;
    } async setupSimulation() {
        // Use exact same buffer setup as main.ts but smaller particle count
        const numParticles = 15000; // Reduced for hero demo

        // Create buffers with the exact same pattern as main.ts
        const maxParticleStructSize = Math.max(mlsmpmParticleStructSize, 64, 32); // Same calculation as main

        this.particleBuffer = this.device.createBuffer({
            label: 'hero particles buffer',
            size: maxParticleStructSize * numParticlesMax, // Use same max size approach
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.posvelBuffer = this.device.createBuffer({
            label: 'hero position buffer',
            size: 32 * numParticlesMax, // Same as main demo
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.renderUniformBuffer = this.device.createBuffer({
            label: 'hero render uniform buffer',
            size: renderUniformsValues.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.waterAppearanceBuffer = this.device.createBuffer({
            label: 'hero water appearance buffer',
            size: waterAppearanceValues.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Initialize uniforms exactly like main demo
        renderUniformsViews.texel_size.set([1.0 / this.canvas.width, 1.0 / this.canvas.height]);
        this.device.queue.writeBuffer(this.renderUniformBuffer, 0, renderUniformsValues);
        this.device.queue.writeBuffer(this.waterAppearanceBuffer, 0, waterAppearanceValues);

        // Load environment texture exactly like main demo does
        const park3Med = [
            'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/px.jpg',
            'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/nx.jpg',
            'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/py.jpg',
            'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/ny.jpg',
            'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/pz.jpg',
            'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/nz.jpg'
        ];

        // Load environment cubemap exactly like main demo
        let cubemapTextureView = null;
        try {
            const promises = park3Med.map(async (src) => {
                const response = await fetch(src);
                if (!response.ok) throw new Error(`Failed to load ${src}`);
                return createImageBitmap(await response.blob());
            });
            const imageBitmaps = await Promise.all(promises);

            const cubemapTexture = this.device.createTexture({
                dimension: '2d',
                size: [imageBitmaps[0].width, imageBitmaps[0].height, 6],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });

            for (let i = 0; i < imageBitmaps.length; i++) {
                const imageBitmap = imageBitmaps[i];
                this.device.queue.copyExternalImageToTexture(
                    { source: imageBitmap },
                    { texture: cubemapTexture, origin: [0, 0, i] },
                    [imageBitmap.width, imageBitmap.height]
                );
            }

            cubemapTextureView = cubemapTexture.createView({ dimension: 'cube' });
            console.log('Hero simulation cubemap loaded successfully');
        } catch (error) {
            console.warn('Failed to load hero simulation environment, creating fallback');
            // Create fallback white cubemap like FluidRenderer.updateEnvironment does
            const dummyTexture = this.device.createTexture({
                dimension: '2d',
                size: [1, 1, 6],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });

            const whitePixel = new Uint8Array([255, 255, 255, 255]);
            for (let i = 0; i < 6; i++) {
                this.device.queue.writeTexture(
                    { texture: dummyTexture, origin: [0, 0, i] },
                    whitePixel,
                    { bytesPerRow: 4 },
                    [1, 1]
                );
            }
            cubemapTextureView = dummyTexture.createView({ dimension: 'cube' });
        }

        // Use exact same simulator setup as main demo
        const mlsmpmFov = 45 * Math.PI / 180;
        const mlsmpmRadius = 0.6;
        const mlsmpmDiameter = 2 * mlsmpmRadius;

        this.simulator = new MLSMPMSimulator(
            this.particleBuffer,
            this.posvelBuffer,
            mlsmpmDiameter,
            this.device
        );

        // Initialize with smaller box size for hero demo
        const initBoxSize = [25, 20, 25]; // Smaller than main demo [35, 25, 55]
        this.simulator.reset(numParticles, initBoxSize);

        // Create renderer with valid environment texture (never null)
        this.renderer = new FluidRenderer(
            this.device,
            this.canvas,
            this.presentationFormat,
            mlsmpmRadius,
            mlsmpmFov,
            this.posvelBuffer,
            this.renderUniformBuffer,
            cubemapTextureView, // Always provide a valid texture view
            this.waterAppearanceBuffer
        );

        // Setup camera exactly like main demo
        this.camera = new Camera(this.canvas);
        const initDistance = 60; // Same as main demo mlsmpmInitDistances[0]
        const mlsmpmZoomRate = 1.5; // Same as main demo
        this.camera.reset(
            this.canvas,
            initDistance,
            [initBoxSize[0] / 2, initBoxSize[1] / 4, initBoxSize[2] / 2], // Same pattern as main
            mlsmpmFov,
            mlsmpmZoomRate
        );

        console.log('MLS-MPM simulation initialized with', numParticles, 'particles');
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('Starting hero MLS-MPM simulation');
        this.animate();
    }

    stop() {
        this.isRunning = false;
    }

    animate() {
        if (!this.isRunning) return;

        try {
            // Exact same frame execution as main demo
            this.device.queue.writeBuffer(this.renderUniformBuffer, 0, renderUniformsValues);

            const commandEncoder = this.device.createCommandEncoder();

            // Execute simulation exactly like main demo
            this.simulator.execute(commandEncoder);

            // Render exactly like main demo (sphereRenderFl = false)
            this.renderer.execute(this.context, commandEncoder, this.simulator.numParticles, false);

            this.device.queue.submit([commandEncoder.finish()]);

        } catch (error) {
            console.error('Hero animation error:', error);
            this.stop();
            return;
        }

        requestAnimationFrame(() => this.animate());
    }

    resize() {
        if (!this.canvas) return;

        // Same resize pattern as main demo
        let devicePixelRatio = 0.5;
        this.canvas.width = devicePixelRatio * this.canvas.clientWidth;
        this.canvas.height = devicePixelRatio * this.canvas.clientHeight;

        // Update uniforms
        renderUniformsViews.texel_size.set([1.0 / this.canvas.width, 1.0 / this.canvas.height]);
        this.device.queue.writeBuffer(this.renderUniformBuffer, 0, renderUniformsValues);

        if (this.camera) {
            this.camera.updateAspectRatio(this.canvas);
        }
    }

    destroy() {
        this.stop();
        this.device = null;
        this.canvas = null;
        this.context = null;
        this.simulator = null;
        this.renderer = null;
        this.camera = null;
    }
}
