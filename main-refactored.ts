import { mat4 } from 'wgpu-matrix'

import { Camera } from './camera'
import { MLSMPMSimulator, mlsmpmParticleStructSize } from './mls-mpm/mls-mpm'
import { SPHSimulator, sphParticleStructSize } from './sph/sph';
import { BoidsSimulator, boidsParticleStructSize } from './boids/boids';
import { renderUniformsViews, renderUniformsValues, numParticlesMax, waterAppearanceValues, waterAppearanceViews } from './common'
import { FluidRenderer } from './render/fluidRender'

// Import new architecture components
import { SimulationMode } from './src/core/SimulationMode';
import { ConfigManager } from './src/core/SimulatorConfig';
import { ApplicationManager } from './src/core/ApplicationManager';

/// <reference types="@webgpu/types" />

async function init() {
    const canvas: HTMLCanvasElement = document.querySelector('canvas')!

    if (!navigator.gpu) {
        alert("WebGPU is not supported on your browser.");
        throw new Error()
    }

    const adapter = await navigator.gpu.requestAdapter()

    if (!adapter) {
        alert("Adapter is not available.");
        throw new Error()
    }

    const device = await adapter.requestDevice()

    const context = canvas.getContext('webgpu') as GPUCanvasContext

    if (!context) {
        throw new Error()
    }

    // const { devicePixelRatio } = window
    // let devicePixelRatio  = 3.0;
    let devicePixelRatio = 0.7;
    canvas.width = devicePixelRatio * canvas.clientWidth
    canvas.height = devicePixelRatio * canvas.clientHeight

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat()

    context.configure({
        device,
        format: presentationFormat,
    })

    return { canvas, device, presentationFormat, context }
}

async function main() {
    const { canvas, device, presentationFormat, context } = await init();

    console.log("initialization done")

    context.configure({
        device,
        format: presentationFormat,
    })

    // Create multiple cubemap textures for different environments
    let cubemapTextures: GPUTexture[] = [];
    let cubemapTextureViews: GPUTextureView[] = [];
    let currentEnvironmentIndex = 0;

    const park3Med = [
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/px.jpg', // +X
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/nx.jpg', // –X
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/py.jpg', // +Y
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/ny.jpg', // –Y
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/pz.jpg', // +Z
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/nz.jpg'  // –Z
    ];

    const environments = [
        {
            name: "Industrial Sunset",
            files: park3Med
        },
        {
            name: "Venice Sunset",
            files: [
                'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/px.jpg',
                'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/nx.jpg',
                'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/py.jpg',
                'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/ny.jpg',
                'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/pz.jpg',
                'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/nz.jpg'
            ]
        },
        {
            name: "Forest",
            files: [
                'https://threejs.org/examples/textures/cube/pisa/px.png',
                'https://threejs.org/examples/textures/cube/pisa/nx.png',
                'https://threejs.org/examples/textures/cube/pisa/py.png',
                'https://threejs.org/examples/textures/cube/pisa/ny.png',
                'https://threejs.org/examples/textures/cube/pisa/pz.png',
                'https://threejs.org/examples/textures/cube/pisa/nz.png'
            ]
        }
    ];

    // Load environment textures
    for (let envIndex = 0; envIndex < environments.length; envIndex++) {
        const environment = environments[envIndex];
        try {
            const promises = environment.files.map(async (src) => {
                const response = await fetch(src);
                if (!response.ok) throw new Error(`Failed to load ${src}`);
                return createImageBitmap(await response.blob());
            });
            const imageBitmaps = await Promise.all(promises);

            const cubemapTexture = device.createTexture({
                dimension: '2d',
                size: [imageBitmaps[0].width, imageBitmaps[0].height, 6],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });

            for (let i = 0; i < imageBitmaps.length; i++) {
                const imageBitmap = imageBitmaps[i];
                device.queue.copyExternalImageToTexture(
                    { source: imageBitmap },
                    { texture: cubemapTexture, origin: [0, 0, i] },
                    [imageBitmap.width, imageBitmap.height]
                );
            }

            cubemapTextures.push(cubemapTexture);
            cubemapTextureViews.push(cubemapTexture.createView({ dimension: 'cube' }));
        } catch (error) {
            console.warn(`Failed to load environment ${environment.name}, using fallback`);
            // Use the first environment as fallback
            if (envIndex === 0) throw error;
            cubemapTextures.push(cubemapTextures[0]);
            cubemapTextureViews.push(cubemapTextureViews[0]);
        }
    }

    console.log("cubemap initialization done")

    // uniform buffer を作る
    renderUniformsViews.texel_size.set([1.0 / canvas.width, 1.0 / canvas.height]);
    // storage buffer を作る
    const maxParticleStructSize = ConfigManager.getMaxParticleStructSize();
    const particleBuffer = device.createBuffer({
        label: 'particles buffer',
        size: maxParticleStructSize * numParticlesMax,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    const posvelBuffer = device.createBuffer({
        label: 'position buffer',
        size: 32 * numParticlesMax,  // 32 = 2 x vec3f + padding
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    const renderUniformBuffer = device.createBuffer({
        label: 'filter uniform buffer',
        size: renderUniformsValues.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const waterAppearanceBuffer = device.createBuffer({
        label: 'water appearance buffer',
        size: waterAppearanceValues.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    console.log("buffer allocating done")

    const canvasElement = document.getElementById("fluidCanvas") as HTMLCanvasElement;
    const camera = new Camera(canvasElement);

    // Initialize simulators using configuration system
    const mlsmpmConfig = ConfigManager.getConfig(SimulationMode.MLSMPM);
    const sphConfig = ConfigManager.getConfig(SimulationMode.SPH);
    const boidsConfig = ConfigManager.getConfig(SimulationMode.BOIDS);

    const mlsmpmSimulator = new MLSMPMSimulator(
        particleBuffer,
        posvelBuffer,
        mlsmpmConfig.renderSettings.radius * 2,
        device
    );
    const sphSimulator = new SPHSimulator(
        particleBuffer,
        posvelBuffer,
        sphConfig.renderSettings.radius * 2,
        device
    );
    const boidsSimulator = new BoidsSimulator(
        particleBuffer,
        posvelBuffer,
        boidsConfig.renderSettings.radius * 2,
        device
    );

    // Create renderers using configuration system
    const mlsmpmRenderer = new FluidRenderer(
        device,
        canvas,
        presentationFormat,
        mlsmpmConfig.renderSettings.radius,
        mlsmpmConfig.renderSettings.fov,
        posvelBuffer,
        renderUniformBuffer,
        cubemapTextureViews[currentEnvironmentIndex],
        waterAppearanceBuffer
    );

    const sphRenderer = new FluidRenderer(
        device,
        canvas,
        presentationFormat,
        sphConfig.renderSettings.radius,
        sphConfig.renderSettings.fov,
        posvelBuffer,
        renderUniformBuffer,
        cubemapTextureViews[currentEnvironmentIndex],
        waterAppearanceBuffer
    );

    const boidsRenderer = new FluidRenderer(
        device,
        canvas,
        presentationFormat,
        boidsConfig.renderSettings.radius,
        boidsConfig.renderSettings.fov,
        posvelBuffer,
        renderUniformBuffer,
        cubemapTextureViews[currentEnvironmentIndex],
        waterAppearanceBuffer
    );

    console.log("simulator initialization done")

    // Initialize Application Manager
    const appManager = new ApplicationManager(canvasElement, camera);

    // Register all simulators
    appManager.registerSimulator(SimulationMode.MLSMPM, mlsmpmSimulator, mlsmpmRenderer);
    appManager.registerSimulator(SimulationMode.SPH, sphSimulator, sphRenderer);
    appManager.registerSimulator(SimulationMode.BOIDS, boidsSimulator, boidsRenderer);

    // Initialize with default mode
    appManager.initialize();    // Set up particle rendering toggle
    let sphereRenderFl = false;
    let particleCheckbox = document.getElementById('particle') as HTMLInputElement;
    if (particleCheckbox) {
        particleCheckbox.addEventListener('change', function (event) {
            sphereRenderFl = (event.target as HTMLInputElement).checked;
        });
    }    // Set up environment change controls
    let environmentSelect = document.getElementById('environment-select') as HTMLSelectElement;
    if (environmentSelect) {
        environmentSelect.addEventListener('change', function (event) {
            currentEnvironmentIndex = parseInt((event.target as HTMLSelectElement).value);

            if (currentEnvironmentIndex === -1) {
                // Use white background (no environment map)
                mlsmpmRenderer.updateEnvironment(null);
                sphRenderer.updateEnvironment(null);
                boidsRenderer.updateEnvironment(null);
                console.log('Switched to white background');
            } else {
                const newEnvironmentView = cubemapTextureViews[currentEnvironmentIndex];
                // Update all renderers with new environment
                mlsmpmRenderer.updateEnvironment(newEnvironmentView);
                sphRenderer.updateEnvironment(newEnvironmentView);
                boidsRenderer.updateEnvironment(newEnvironmentView);
                console.log(`Switched to environment: ${environments[currentEnvironmentIndex].name}`);
            }
        });

        // Device lost monitoring
        let errorLog = document.getElementById('error-reason') as HTMLSpanElement;
        errorLog.textContent = "";
        device.lost.then(info => {
            const reason = info.reason ? `reason: ${info.reason}` : 'unknown reason';
            errorLog.textContent = reason;
            appManager.getUIManager().showError(reason);
        });

        console.log("simulation start")

        // Main render loop
        async function frame() {
            const start = performance.now();

            // Update box size based on slider
            appManager.updateBoxSize();

            // Update water appearance
            device.queue.writeBuffer(waterAppearanceBuffer, 0, waterAppearanceValues);
            device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformsValues);

            // Create command encoder and execute simulation
            const commandEncoder = device.createCommandEncoder();
            // Execute current simulation
            appManager.executeSimulation(commandEncoder);

            // Render current simulation
            const currentRenderer = appManager.getCurrentRenderer();
            const currentSimulator = appManager.getCurrentSimulator();
            currentRenderer.execute(context, commandEncoder, currentSimulator.numParticles, sphereRenderFl);

            device.queue.submit([commandEncoder.finish()]); const end = performance.now();
            // console.log(`Frame time: ${(end - start).toFixed(1)}ms`);

            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
    }
}

main().catch(console.error);
