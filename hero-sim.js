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
        this.lastCursorPosition = { x: 0, y: 0 };
        this.cursorActive = false;
        this.cameraPathTime = 0;
        this.splashCooldown = 0;
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
            this.setupInteraction();
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

        // Use full window dimensions instead of parent element
        let devicePixelRatio = Math.min(window.devicePixelRatio, 2);
        this.canvas.width = window.innerWidth * devicePixelRatio;
        this.canvas.height = window.innerHeight * devicePixelRatio;        // Set CSS size to full screen and ensure it covers the entire viewport        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '1';
        this.canvas.style.pointerEvents = 'none'; // Prevent interfering with other elements
        this.canvas.style.margin = '0';
        this.canvas.style.padding = '0';
        this.canvas.style.overflow = 'hidden';
        this.canvas.style.background = 'transparent';

        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            // Add these alpha settings
            alphaMode: 'premultiplied',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
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
        });        // Initialize uniforms with custom water appearance for landing page
        renderUniformsViews.texel_size.set([1.0 / this.canvas.width, 1.0 / this.canvas.height]);

        // Set custom water appearance for landing page        waterAppearanceViews.color.set([0.2, 0.5, 0.7, 1.0]); // Enhanced blue-green tint
        waterAppearanceViews.transparency.set([0.75]); // Less transparent for better visibility
        waterAppearanceViews.reflectivity.set([0.7]); // More reflective for better HDRI visibility
        waterAppearanceViews.waveHeight.set([1.5]); // Higher waves for more dramatic effect

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
        }        // Use exact same simulator setup as main demo
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

    setupInteraction() {
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.cursorActive) {
                this.cursorActive = true;
            }
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;

            // Only create splash if we've moved enough and cooldown is done
            const dx = x - this.lastCursorPosition.x;
            const dy = y - this.lastCursorPosition.y;
            const distSquared = dx * dx + dy * dy;

            if (distSquared > 0.001 && this.splashCooldown <= 0) {
                this.createSplashAtPosition(x, y);
                this.splashCooldown = 10; // frames between splashes
            }

            this.lastCursorPosition = { x, y };
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.cursorActive = false;
        });
    } createSplashAtPosition(x, y) {
        // Convert normalized coordinates to simulation space - using the box size from simulator
        const simX = x * 25; // Match initBoxSize[0] from setupSimulation
        const simY = y * 20; // Match initBoxSize[1] from setupSimulation

        // Create a buffer for new particles
        const particleCount = 75; // Keep same number of particles
        const particlesBuf = new ArrayBuffer(mlsmpmParticleStructSize * particleCount);

        // Add particles in a radius with random distribution
        const radius = 3; // Reduced to match simulation scale
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const r = Math.random() * radius;
            const px = simX + Math.cos(angle) * r;
            const py = simY + Math.sin(angle) * r;
            const pz = 12.5; // Center in Z (half of initBoxSize[2])

            // Calculate velocities
            const velocityY = 2 + Math.random() * 1;
            const velocityX = (Math.random() - 0.5) * 1;
            const velocityZ = (Math.random() - 0.5) * 1;

            // Create particle following MLSMPMSimulator particle format
            const offset = mlsmpmParticleStructSize * i;
            const particleViews = {
                position: new Float32Array(particlesBuf, offset + 0, 3),
                v: new Float32Array(particlesBuf, offset + 16, 3),
                C: new Float32Array(particlesBuf, offset + 32, 12),
            };

            // Set position and velocity
            particleViews.position.set([px, py, pz]);
            particleViews.v.set([velocityX, velocityY, velocityZ]);
            // Initialize C matrix to zero (no deformation)
            particleViews.C.fill(0);
        }

        // Write the new particles to the GPU buffer
        // Write to offset after existing particles to avoid overwriting
        const bufferOffset = this.simulator.numParticles * mlsmpmParticleStructSize;
        this.device.queue.writeBuffer(this.particleBuffer, bufferOffset, particlesBuf);

        // Update particle count in simulator
        this.simulator.numParticles = Math.min(this.simulator.numParticles + particleCount, numParticlesMax);
    } updateCameraPath() {
        if (!this.camera) return;

        // Update camera position along a gentle figure-8 path
        this.cameraPathTime += 0.001;
        const t = this.cameraPathTime;

        // Create a smooth figure-8 pattern
        const scale = 20;
        const x = Math.sin(t) * scale;
        const y = Math.sin(t * 0.5) * scale * 0.5;
        const z = Math.cos(t) * scale;

        // Create view matrix for new position
        const targetPos = [x, y + 30, z];
        var mat = mat4.lookAt(
            targetPos, // position
            [0, 0, 0], // target
            [0, 1, 0]  // up
        );        // Update view matrix smoothly
        renderUniformsViews.view_matrix.set(mat);
        renderUniformsViews.inv_view_matrix.set(mat4.inverse(mat));
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('Starting hero MLS-MPM simulation');
        this.animate();
    }

    stop() {
        this.isRunning = false;
    } animate() {
        if (!this.isRunning) return;

        try {
            // Update simulation state
            this.update();

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

    update() {
        // ...existing code...
        if (this.splashCooldown > 0) {
            this.splashCooldown--;
        }

        this.updateCameraPath();
    } resize() {
        if (!this.canvas) return;

        // Use window dimensions for full screen
        const devicePixelRatio = Math.min(window.devicePixelRatio, 2);
        this.canvas.width = window.innerWidth * devicePixelRatio;
        this.canvas.height = window.innerHeight * devicePixelRatio;        // Update CSS size and ensure full viewport coverage
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100vw';
        this.canvas.style.height = '100vh';
        this.canvas.style.margin = '0';
        this.canvas.style.padding = '0';
        this.canvas.style.overflow = 'hidden';

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
