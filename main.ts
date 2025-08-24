import { BoidsSimulator, boidsParticleStructSize } from './boids/boids';
import { Camera } from './camera';
import { compositionParamsValues, debugModeValues, debugModeViews, effectParametersValues, effectParametersViews, effectsToggleValues, effectsToggleViews, initializeCompositionDefaults, lightingControlsValues, lightingControlsViews, numParticlesMax, renderUniformsValues, renderUniformsViews, waterAppearanceValues, waterAppearanceViews } from './common';
import { MLSMPMSimulator, mlsmpmParticleStructSize } from './mls-mpm/mls-mpm';
import { FluidRenderer } from './render/fluidRender';
import { SkyboxRenderer } from './render/SkyboxRenderer';
import { initWebGPU, loadEnvironmentCubemaps } from './src/app/webgpuSetup';
import { EnhancedLODIntegration, EnhancedLODResult } from './src/core/EnhancedLODIntegration';
import { ENHANCED_LOD_UI_STYLES, ENHANCED_LOD_UI_TEMPLATE } from './src/core/EnhancedLODUI';
import { DebugLayer, DebugVisualizationMode } from './src/debug/DebugModes';
import { DebugHUD } from './src/debug/hud';

/// <reference types="@webgpu/types" />

// Define global option arrays safely
const modeNames: Record<number,string> = {};
const layerNames: Record<number,string> = {};

// init() extracted to src/app/webgpuSetup.ts (initWebGPU)

let hud: DebugHUD | undefined;

async function main() {
	const canvas = document.querySelector('canvas') as HTMLCanvasElement;
	const { device, presentationFormat, context } = await initWebGPU(canvas);

	console.log("initialization done")
	context.configure({
		device,
		format: presentationFormat,
		alphaMode: 'premultiplied',
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
	})

	// Environment cubemaps
	const environments = await loadEnvironmentCubemaps(device);
	const cubemapTextureViews = environments.map(e => e.view);
	// Fallback to a single 1x1 white cube if no environments loaded (should not occur)
	if (!cubemapTextureViews.length) {
		const fallbackTex = device.createTexture({
			label: 'fallback-white-cubemap',
			dimension: '2d',
			size: [1,1,6],
			format: 'rgba8unorm',
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
		});
		const whitePixel = new Uint8Array([255,255,255,255]);
		for (let face=0; face<6; face++) {
			device.queue.writeTexture({texture: fallbackTex, origin: {x:0,y:0,z:face}}, whitePixel, {bytesPerRow:4}, {width:1,height:1,depthOrArrayLayers:1});
		}
		cubemapTextureViews.push(fallbackTex.createView({dimension:'cube'}));
	}
	let currentEnvironmentIndex = 0;
	console.log('cubemap initialization done');

	// uniform buffer を作る
	renderUniformsViews.texel_size.set([1.0 / canvas.width, 1.0 / canvas.height]);
	// storage buffer を作る
	const maxParticleStructSize = Math.max(mlsmpmParticleStructSize, boidsParticleStructSize) // SPH removed
	const particleBuffer = device.createBuffer({
		label: 'particles buffer',
		size: maxParticleStructSize * numParticlesMax,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	})
	const posvelBuffer = device.createBuffer({
		label: 'position buffer',
		size: 32 * numParticlesMax,  // 32 = 2 x vec3f + padding
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});
	const renderUniformBuffer = device.createBuffer({
		label: 'filter uniform buffer',
		size: renderUniformsValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const waterAppearanceBuffer = device.createBuffer({
		label: 'water appearance buffer',
		size: waterAppearanceValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	// Initialize default water appearance (prevent black surface before UI interaction)
	waterAppearanceViews.color.set([0.2, 0.6, 1.0, 1.0]); // default bluish
	waterAppearanceViews.transparency[0] = 0.3;
	waterAppearanceViews.reflectivity[0] = 0.4;
	waterAppearanceViews.waveHeight[0] = 0.0;
	device.queue.writeBuffer(waterAppearanceBuffer, 0, waterAppearanceValues);
	// Create debug mode buffer
	const debugModeBuffer = device.createBuffer({
		label: 'debug mode buffer',
		size: debugModeValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	// Create effects toggle buffer
	const effectsToggleBuffer = device.createBuffer({
		label: 'effects toggle buffer',
		size: effectsToggleValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	// Create lighting controls buffer
	const lightingControlsBuffer = device.createBuffer({
		label: 'lighting controls buffer',
		size: lightingControlsValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// Create effect parameters buffer
	const effectParametersBuffer = device.createBuffer({
		label: 'effect parameters buffer',
		size: effectParametersValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// Create composition parameters buffer
	const compositionParamsBuffer = device.createBuffer({
		label: 'composition parameters buffer',
		size: compositionParamsValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// Initialize effects toggle (all enabled by default)
	effectsToggleViews.enableReynoldsPhysics[0] = 1;
	effectsToggleViews.enableCavitation[0] = 1;
	effectsToggleViews.enableFoam[0] = 1;
	effectsToggleViews.enableTurbulentNormals[0] = 1;
	effectsToggleViews.enableSpecular[0] = 1;
	effectsToggleViews.enableSubsurface[0] = 1;
	effectsToggleViews.enableFresnel[0] = 1;
	effectsToggleViews.enableReflection[0] = 1; effectsToggleViews.enableRefraction[0] = 1;
	effectsToggleViews.enableCaustics[0] = 1;
	effectsToggleViews.enableDispersion[0] = 1;
	effectsToggleViews.enableAbsorption[0] = 1; effectsToggleViews.enableDepthColoring[0] = 1;
	effectsToggleViews.enableVelocityColoring[0] = 1;
	effectsToggleViews.enableRimLighting[0] = 1;
	effectsToggleViews.enableColorAbsorption[0] = 1;
	effectsToggleViews.enableVarianceLightTransport[0] = 0; // Start disabled for testing
	device.queue.writeBuffer(effectsToggleBuffer, 0, effectsToggleValues);

	// Initialize lighting controls with default values
	// Main light - slightly warm sun key
	lightingControlsViews.mainLightDirection.set([0.55, -0.75, -0.35]);
	lightingControlsViews.mainLightIntensity[0] = 1.25; // a bit stronger for definition
	lightingControlsViews.mainLightColor.set([1.0, 0.96, 0.90]); // warm white
	lightingControlsViews.mainLightEnabled[0] = 1;

	// Fill light - cool sky bounce, lower intensity
	lightingControlsViews.fillLightDirection.set([-0.35, -0.45, 0.82]);
	lightingControlsViews.fillLightIntensity[0] = 0.35; // reduced to avoid washing out
	lightingControlsViews.fillLightColor.set([0.70, 0.82, 1.0]); // desaturated cool
	lightingControlsViews.fillLightEnabled[0] = 1;

	// Rim light - subtle warm edge, reduced intensity
	lightingControlsViews.rimLightDirection.set([0.85, 0.15, -0.30]);
	lightingControlsViews.rimLightIntensity[0] = 0.25;
	lightingControlsViews.rimLightColor.set([1.0, 0.92, 0.84]);
	lightingControlsViews.rimLightEnabled[0] = 1;

	// Global ambient - neutral cool ocean haze (avoid purple cast)
	lightingControlsViews.ambientIntensity[0] = 0.22; // slightly lower so key drives scene
	lightingControlsViews.ambientColor.set([0.28, 0.38, 0.46]); // balanced cool teal, no magenta component
	lightingControlsViews.shadowIntensity[0] = 0.8;
	lightingControlsViews.lightingMode[0] = 0; // 0=realistic
	// Advanced lighting properties
	lightingControlsViews.specularIntensityMultiplier[0] = 0.9; // mild reduction to curb sparkle in sparse regions
	lightingControlsViews.subsurfaceIntensityMultiplier[0] = 0.85; // reduce base subsurface brightness

	// Additional lighting properties (for WebGPU 160-byte alignment)
	lightingControlsViews.lightingPower[0] = 1.0;        // Default gamma/power
	lightingControlsViews.lightingContrast[0] = 1.0;     // Default contrast
	lightingControlsViews.volumetricIntensity[0] = 1.0;  // Default volumetric intensity
	lightingControlsViews.rimLightingPower[0] = 1.0;     // Default rim lighting power
	lightingControlsViews.lightingPadding1[0] = 0.0;     // Padding for alignment
	lightingControlsViews.lightingPadding2[0] = 0.0;     // Padding for alignment
	lightingControlsViews.lightingPadding3[0] = 0.0;     // Padding for alignment
	lightingControlsViews.lightingPadding4[0] = 0.0;     // Padding for alignment
	device.queue.writeBuffer(lightingControlsBuffer, 0, lightingControlsValues);

	// Initialize effect parameters with default values
	// Reynolds Physics Parameters
	effectParametersViews.reynoldsScale[0] = 1.0;
	effectParametersViews.turbulenceStrength[0] = 1.0;
	effectParametersViews.viscosityFactor[0] = 1.0;
	effectParametersViews.cascadeEffect[0] = 1.0;

	// Cavitation Parameters
	effectParametersViews.cavitationThreshold[0] = 2337.0;
	effectParametersViews.cavitationStrength[0] = 1.0;
	effectParametersViews.pressureScale[0] = 1.0;
	effectParametersViews.cavitationFalloff[0] = 1.0;

	// Foam Parameters
	effectParametersViews.foamIntensity[0] = 1.0;
	effectParametersViews.foamThreshold[0] = 0.5;
	effectParametersViews.foamDecay[0] = 0.8;
	effectParametersViews.foamCoverage[0] = 0.5;

	// Turbulent Normals Parameters
	effectParametersViews.normalStrength[0] = 0.2;
	effectParametersViews.normalScale[0] = 1.0;
	effectParametersViews.normalSmoothness[0] = 0.85;
	effectParametersViews.normalStability[0] = 0.6;

	// Specular Parameters
	effectParametersViews.specularPower[0] = 4096.0;
	effectParametersViews.specularScale[0] = 3.0;
	effectParametersViews.specularRoughness[0] = 0.05;
	effectParametersViews.specularFresnel[0] = 2.0;	// Subsurface Parameters
	effectParametersViews.subsurfaceDepth[0] = 0.4;
	effectParametersViews.subsurfaceScale[0] = 0.6; // Reduced to prevent excessive subsurface brightness
	effectParametersViews.subsurfaceColor[0] = 1.0;
	effectParametersViews.subsurfaceDistortion[0] = 0.5;

	// Fresnel Parameters
	effectParametersViews.fresnelPower[0] = 1.5;
	effectParametersViews.fresnelScale[0] = 0.1;
	effectParametersViews.fresnelBias[0] = 0.0;
	effectParametersViews.fresnelContrast[0] = 1.0;

	// Reflection Parameters
	effectParametersViews.reflectionStrength[0] = 1.0;
	effectParametersViews.reflectionBlur[0] = 0.0;
	effectParametersViews.reflectionDistortion[0] = 1.0;
	effectParametersViews.reflectionFade[0] = 1.0;

	// Refraction Parameters
	effectParametersViews.refractionStrength[0] = 1.0;
	effectParametersViews.refractionIndex[0] = 1.333;
	effectParametersViews.refractionChromatic[0] = 0.0;
	effectParametersViews.refractionScale[0] = 1.0;

	// Caustics Parameters
	effectParametersViews.causticsStrength[0] = 0.2;
	effectParametersViews.causticsScale[0] = 10.0;
	effectParametersViews.causticsSpeed[0] = 1.0;
	effectParametersViews.causticsContrast[0] = 1.0;

	// Absorption Parameters
	effectParametersViews.absorptionStrength[0] = 1.0;
	effectParametersViews.absorptionDepth[0] = 0.15;
	effectParametersViews.absorptionColor[0] = 1.0;
	effectParametersViews.absorptionScattering[0] = 0.2;

	// Depth Coloring Parameters
	effectParametersViews.depthColorStrength[0] = 1.0;
	effectParametersViews.depthColorScale[0] = 0.2;
	effectParametersViews.depthColorContrast[0] = 1.0;
	effectParametersViews.depthColorSaturation[0] = 1.0;

	// Velocity Coloring Parameters
	effectParametersViews.velocityColorStrength[0] = 0.5;
	effectParametersViews.velocityColorScale[0] = 0.5;
	effectParametersViews.velocityColorContrast[0] = 1.0;
	effectParametersViews.velocityColorThreshold[0] = 0.05;

	// Rim Lighting Parameters
	effectParametersViews.rimLightStrength[0] = 0.6; // Reduced default rim strength
	effectParametersViews.rimLightPower[0] = 1.6;   // Increased power to tighten rim highlight
	effectParametersViews.rimLightScale[0] = 1.0;
	effectParametersViews.rimLightContrast[0] = 1.0;
	// Color Absorption Parameters
	effectParametersViews.colorAbsorptionRed[0] = 0.45;
	effectParametersViews.colorAbsorptionGreen[0] = 0.15;
	effectParametersViews.colorAbsorptionBlue[0] = 0.05;
	effectParametersViews.colorAbsorptionDepth[0] = 0.1;	// Variance Light Transport Parameters - Enhanced for visibility
	effectParametersViews.varianceSamples[0] = 9.0;
	effectParametersViews.varianceStrength[0] = 3.0; // Increased from 2.0 for even more visible effect
	effectParametersViews.varianceRadius[0] = 3.0;   // Increased from 2.0 for larger sampling area
	effectParametersViews.varianceThreshold[0] = 0.02; // Decreased from 0.05 for easier activation

	device.queue.writeBuffer(effectParametersBuffer, 0, effectParametersValues);

	// Initialize composition parameters with default values
	initializeCompositionDefaults();
	device.queue.writeBuffer(compositionParamsBuffer, 0, compositionParamsValues);

	// Initialize debug mode (disabled by default)
	debugModeViews.mode[0] = DebugVisualizationMode.NONE;
	debugModeViews.layer[0] = DebugLayer.RAW;
	debugModeViews.intensity[0] = 1.0;
	device.queue.writeBuffer(debugModeBuffer, 0, debugModeValues);

	console.log("buffer allocating done")	// Centralized simulation configurations with safe particle limits
	const maxGridCount = 64 * 64 * 64; // 262,144 - MLS-MPM grid limit
	const simulationConfigs = {
		'mls-mpm': {
			name: 'MLS-MPM',
			maxParticles: 1000000, // Extended limit to 1M particles
			defaultParticles: 70000,
			minParticles: 1,
			boxSizes: [[35, 25, 55], [40, 30, 60], [45, 40, 80], [50, 50, 80], [55, 60, 90]],
			cameraDistances: [60, 70, 90, 100, 120],
			showWaterControls: true,
			sliderLabel: 'Box width:',
			particleLabel: 'Number of Particles'
		},
		'boids': {
			name: 'Boids',
			maxParticles: 25000, // Reduced from unsafe 30K limit
			defaultParticles: 10000,
			minParticles: 1,
			boxSizes: [[40, 30, 40], [50, 40, 50], [60, 50, 60], [70, 60, 70], [80, 70, 80]],
			cameraDistances: [80, 100, 120, 140, 160],
			showWaterControls: false,
			sliderLabel: 'Flight area:',
			particleLabel: 'Flock Size'
		}
	}
	// Legacy variables updated for new slider-based particle count system
	const getCurrentConfig = (mode: string) => simulationConfigs[mode as keyof typeof simulationConfigs]

	// Current particle count for each simulation (will be managed by sliders)
	let currentParticleCount = {
		'mls-mpm': simulationConfigs['mls-mpm'].defaultParticles,
		'boids': simulationConfigs['boids'].defaultParticles
	}

	// Legacy arrays kept for compatibility during transition
	let mlsmpmInitBoxSizes = simulationConfigs['mls-mpm'].boxSizes
	let mlsmpmInitDistances = simulationConfigs['mls-mpm'].cameraDistances
	let boidsInitBoxSizes = simulationConfigs['boids'].boxSizes
	let boidsInitDistances = simulationConfigs['boids'].cameraDistances
	const canvasElement = document.getElementById("fluidCanvas") as HTMLCanvasElement;
	// シミュレーション，カメラの初期化
	const mlsmpmFov = 45 * Math.PI / 180;
	const mlsmpmRadius = 0.6;
	const mlsmpmDiameter = 2 * mlsmpmRadius;
	const mlsmpmZoomRate = 1.5;
	const mlsmpmSimulator = new MLSMPMSimulator(particleBuffer, posvelBuffer, mlsmpmDiameter, device);
	const boidsFov = 45 * Math.PI / 180;
	const boidsRadius = 0.3;
	const boidsDiameter = 2 * boidsRadius;
	const boidsZoomRate = 0.8;
	const boidsSimulator = new BoidsSimulator(particleBuffer, posvelBuffer, boidsDiameter, device); const mlsmpmRenderer = new FluidRenderer(
		device,
		canvas,
		presentationFormat,
		mlsmpmRadius,
		mlsmpmFov,
		posvelBuffer,
		renderUniformBuffer,
		cubemapTextureViews[currentEnvironmentIndex]!,
		waterAppearanceBuffer,
		debugModeBuffer,
		effectsToggleBuffer,
		lightingControlsBuffer,
		effectParametersBuffer,
		compositionParamsBuffer,
	); const sphRenderer = new FluidRenderer(
		device,
		canvas,
		presentationFormat,
		sphRadius,
		sphFov,
		posvelBuffer,
		renderUniformBuffer,
		cubemapTextureViews[currentEnvironmentIndex]!,
		waterAppearanceBuffer,
		debugModeBuffer,
		effectsToggleBuffer,
		lightingControlsBuffer,
		effectParametersBuffer,
		compositionParamsBuffer
	); const boidsRenderer = new FluidRenderer(
		device,
		canvas,
		presentationFormat,
		boidsRadius,
		boidsFov,
		posvelBuffer,
		renderUniformBuffer,
		cubemapTextureViews[currentEnvironmentIndex]!,
		waterAppearanceBuffer,
		debugModeBuffer,
		effectsToggleBuffer,
		lightingControlsBuffer,
		effectParametersBuffer,
		compositionParamsBuffer);
	// Create skybox renderer for environment background
	const skyboxRenderer = new SkyboxRenderer(
		device,
		presentationFormat,
		renderUniformBuffer,
		cubemapTextureViews[currentEnvironmentIndex]!
	);

	// Create shared depth texture for skybox rendering
	const skyboxDepthTexture = device.createTexture({
		size: [canvas.width, canvas.height],
		format: 'depth24plus',
		usage: GPUTextureUsage.RENDER_ATTACHMENT,
	});
	const skyboxDepthTextureView = skyboxDepthTexture.createView();

	// --- Enhanced LOD Integration ---
	const lodIntegration = {
		'mls-mpm': new EnhancedLODIntegration('mls-mpm'),
		'sph': new EnhancedLODIntegration('sph'),
		'boids': new EnhancedLODIntegration('boids')
	};

	console.log("simulator initialization done")

	const camera = new Camera(canvasElement);
	// ボタン押下の監視	// Particle count slider with debouncing
	let particleCountChangeTimeout: number | null = null;
	let particleCountChanged = false;
	let newParticleCount = 70000;

	const particleCountSlider = document.getElementById('particle-count-slider') as HTMLInputElement;
	const particleCountValue = document.getElementById('particle-count-value') as HTMLSpanElement;

	if (particleCountSlider && particleCountValue) {
		particleCountSlider.addEventListener('input', function (event) {
			const target = event.target as HTMLInputElement;
			const value = parseInt(target.value);
			particleCountValue.textContent = value.toLocaleString();

			// Clear existing timeout
			if (particleCountChangeTimeout) {
				clearTimeout(particleCountChangeTimeout);
			}

			// Set debounced update (150ms delay)
			particleCountChangeTimeout = 150;
			setTimeout(() => {
				particleCountChanged = true;
				newParticleCount = value;
			}, 150);
		});
	}

	let simulationModeForm = document.getElementById('simulation-mode') as HTMLFormElement;
	let simulationModePressed = false;
	let simulationModePressedButton = "mls-mpm";
	simulationModeForm.addEventListener('change', function (event) {
		const target = event.target as HTMLInputElement;
		if (target?.name === 'simulation-mode') {
			simulationModePressed = true
			simulationModePressedButton = target.value
		}
	});
	const particleCountLabel = document.getElementById("particle-count-label") as HTMLElement;
	// Helper function to update UI labels and slider limits based on current simulation mode
	const updateUILabels = (mode: string) => {
		const config = getCurrentConfig(mode)
		if (!config) {
			console.error('No config found for mode:', mode)
			return
		}

		particleCountLabel.textContent = config.particleLabel

		// Update particle count slider for new simulation mode
		const particleSlider = document.getElementById('particle-count-slider') as HTMLInputElement;
		const particleValue = document.getElementById('particle-count-value') as HTMLSpanElement;

		if (particleSlider && particleValue) {
			particleSlider.min = config.minParticles.toString()
			particleSlider.max = config.maxParticles.toString()
			particleSlider.value = config.defaultParticles.toString()
			particleValue.textContent = config.defaultParticles.toLocaleString()
			currentParticleCount[mode as keyof typeof currentParticleCount] = config.defaultParticles
		}

		const sliderLabel = document.getElementById('slider-label') as HTMLLabelElement;
		sliderLabel.textContent = config.sliderLabel

		const waterAppearanceControls = document.getElementById('water-appearance-controls');
		if (waterAppearanceControls) {
			waterAppearanceControls.style.display = config.showWaterControls ? "block" : "none";
		}
	}

	// デバイスロストの監視
	let errorLog = document.getElementById('error-reason') as HTMLSpanElement;
	errorLog.textContent = "";
	device.lost.then(info => {
		const reason = info.reason ? `reason: ${info.reason}` : 'unknown reason';
		errorLog.textContent = reason;
	});	// Initialize with default configuration
	const defaultMode = 'mls-mpm'
	const defaultSizeIndex = 1 // Medium
	const initDistance = mlsmpmInitDistances[defaultSizeIndex] ?? 70;
	let initBoxSize: number[] = (mlsmpmInitBoxSizes[defaultSizeIndex] as number[] | undefined) ?? [40,30,60];
	let realBoxSize: number[] = [...initBoxSize];
	mlsmpmSimulator.reset(currentParticleCount[defaultMode], initBoxSize);
	camera.reset(canvasElement, initDistance, [ initBoxSize[0]! / 2, initBoxSize[1]! / 4, initBoxSize[2]! / 2],
		mlsmpmFov, mlsmpmZoomRate)
	// Initialize UI with default mode
	updateUILabels(defaultMode)
	let sphereRenderFl = false;
	let sphFl = false;
	let boidsFl = false;
	let boxWidthRatio = 1.;
	let lodUpdateFrameCount = 0; // For periodic LOD status updates

	console.log("simulation start");
	async function frame() {
		const start = performance.now();
		// Handle simulation mode changes
		if (simulationModePressed) {
			// Clean, configuration-driven mode switching
			if (simulationModePressedButton == "mls-mpm") {
				sphFl = false
				boidsFl = false
			} else if (simulationModePressedButton == "sph") {
				sphFl = true
				boidsFl = false
			} else if (simulationModePressedButton == "boids") {
				sphFl = false
				boidsFl = true
			}

			// Update UI based on new mode - one function call instead of 20+ lines!
			updateUILabels(simulationModePressedButton)

			simulationModePressed = false
			particleCountChanged = true // Trigger particle count update for new mode
		}

		// Handle particle count changes with debouncing
		if (particleCountChanged) {
			const currentMode = boidsFl ? 'boids' : (sphFl ? 'sph' : 'mls-mpm');
			const config = getCurrentConfig(currentMode);

			// Clamp particle count to valid range for current simulation
			let clampedCount = Math.max(config.minParticles, Math.min(config.maxParticles, newParticleCount));
			currentParticleCount[currentMode as keyof typeof currentParticleCount] = clampedCount;

			// Use default box size (index 1 = medium)
			const defaultSizeIndex = 1;

			if (boidsFl) {
				initBoxSize = boidsInitBoxSizes[defaultSizeIndex] ?? initBoxSize;
				boidsSimulator.reset(clampedCount, initBoxSize);
				camera.reset(canvasElement, boidsInitDistances[defaultSizeIndex] ?? 100, [initBoxSize[0]! / 2, initBoxSize[1]! / 2, initBoxSize[2]! / 2],
					boidsFov, boidsZoomRate);
			} else if (sphFl) {
				initBoxSize = sphInitBoxSizes[defaultSizeIndex] ?? initBoxSize;
				sphSimulator.reset(clampedCount, initBoxSize);
				camera.reset(canvasElement, sphInitDistances[defaultSizeIndex] ?? 3.0, [0, -initBoxSize[1]! + 0.1, 0],
					sphFov, sphZoomRate);
			} else {
				initBoxSize = mlsmpmInitBoxSizes[defaultSizeIndex] ?? initBoxSize;
				mlsmpmSimulator.reset(clampedCount, initBoxSize);
				camera.reset(canvasElement, (mlsmpmInitDistances[defaultSizeIndex] ?? initDistance) as number, [initBoxSize[0]! / 2, initBoxSize[1]! / 4, initBoxSize[2]! / 2],
					mlsmpmFov, mlsmpmZoomRate);
			}

			realBoxSize = [...(initBoxSize ?? realBoxSize)]
			let slider = document.getElementById("slider") as HTMLInputElement
			slider.value = "100"

			// Update display value to show clamped count
			if (particleCountValue) {
				particleCountValue.textContent = clampedCount.toLocaleString();
			}
			if (particleCountSlider) {
				particleCountSlider.value = clampedCount.toString();
			}

			particleCountChanged = false
		}
		// ボックスサイズの変更
		const slider = document.getElementById("slider") as HTMLInputElement
		const particle = document.getElementById("particle") as HTMLInputElement
		sphereRenderFl = particle.checked
		let curBoxWidthRatio = parseInt(slider.value) / 200 + 0.5
		const minClosingSpeed = sphFl ? -0.015 : (boidsFl ? -0.01 : -0.007)
		const dVal = Math.max(curBoxWidthRatio - boxWidthRatio, minClosingSpeed)
		boxWidthRatio += dVal

		// 行列の更新
		realBoxSize[2] = initBoxSize[2]! * boxWidthRatio
		if (boidsFl) {
			boidsSimulator.changeBoxSize(realBoxSize)
		} else if (sphFl) {
			sphSimulator.changeBoxSize(realBoxSize)
		} else {
			mlsmpmSimulator.changeBoxSize(realBoxSize)
		} device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformsValues)
		const commandEncoder = device.createCommandEncoder()

		// Render skybox first as background
		const skyboxPassDescriptor: GPURenderPassDescriptor = {
			colorAttachments: [
				{
					view: context.getCurrentTexture().createView(),
					clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
					loadOp: 'clear',
					storeOp: 'store',
				},
			],
			depthStencilAttachment: {
				view: skyboxDepthTextureView,
				depthClearValue: 1.0,
				depthLoadOp: 'clear',
				depthStoreOp: 'store',
			},
		};

		const skyboxPassEncoder = commandEncoder.beginRenderPass(skyboxPassDescriptor);
		skyboxRenderer.render(skyboxPassEncoder);
		skyboxPassEncoder.end();

		// Execute simulation and rendering with Enhanced LOD
		let effectiveParticleCount = 0;
		let lodResult: EnhancedLODResult;
		const currentFrameTime = 16.67; // Default ~60fps frame time in milliseconds
		if (boidsFl) {
			boidsSimulator.execute(commandEncoder)
			lodResult = lodIntegration['boids'].getEnhancedLODSettings(
				boidsSimulator.numParticles,
				camera,
				realBoxSize,
				currentFrameTime
			);
			effectiveParticleCount = lodResult.effectiveParticleCount;
			boidsRenderer.execute(context, commandEncoder, effectiveParticleCount, sphereRenderFl);
		} else if (sphFl) {
			sphSimulator.execute(commandEncoder)
			lodResult = lodIntegration['sph'].getEnhancedLODSettings(
				sphSimulator.numParticles,
				camera,
				realBoxSize,
				currentFrameTime
			);
			effectiveParticleCount = lodResult.effectiveParticleCount;
			sphRenderer.execute(context, commandEncoder, effectiveParticleCount, sphereRenderFl);
		} else {
			mlsmpmSimulator.execute(commandEncoder)
			lodResult = lodIntegration['mls-mpm'].getEnhancedLODSettings(
				mlsmpmSimulator.numParticles,
				camera,
				realBoxSize,
				currentFrameTime
			);
			effectiveParticleCount = lodResult.effectiveParticleCount;
			mlsmpmRenderer.execute(context, commandEncoder, effectiveParticleCount, sphereRenderFl);
		}		// Store the result for UI updates
		lastEnhancedLODResult = lodResult;

		// Apply particle size scaling from LOD
		if (lodResult && lodResult.particleSizeScale !== 1.0) {
			if (boidsFl) {
				const scaledDiameter = boidsSimulator.renderDiameter * lodResult.particleSizeScale;
				renderUniformsViews.sphere_size.set([scaledDiameter]);
			} else if (sphFl) {
				const scaledDiameter = sphSimulator.renderDiameter * lodResult.particleSizeScale;
				renderUniformsViews.sphere_size.set([scaledDiameter]);
			} else {
				const scaledDiameter = mlsmpmSimulator.renderDiameter * lodResult.particleSizeScale;
				renderUniformsViews.sphere_size.set([scaledDiameter]);
			}
			// Update the render uniforms buffer with the new sphere size
			device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformsValues);
		}

		device.queue.submit([commandEncoder.finish()])
		const end = performance.now();
		hud?.tick(end - start);

		// Update LOD status display periodically
		if (lodUpdateFrameCount % 10 === 0 && (window as any).updateLODStatus) {
			(window as any).updateLODStatus();
		}
		lodUpdateFrameCount++;

		requestAnimationFrame(frame)
	} requestAnimationFrame(frame)
	// Guard optional UI elements (allow stripped UI builds)
	const waterColorInput = document.getElementById('water-color') as HTMLInputElement | null;
	if (waterColorInput) {
		const transparencyInput = document.getElementById('transparency') as HTMLInputElement | null;
		const reflectivityInput = document.getElementById('reflectivity') as HTMLInputElement | null;
		const waveHeightInput = document.getElementById('wave-height') as HTMLInputElement | null;
		waterColorInput.addEventListener('input', (e) => {
			const color = (e.target as HTMLInputElement).value;
			const r = parseInt(color.substr(1, 2), 16) / 255;
			const g = parseInt(color.substr(3, 2), 16) / 255;
			const b = parseInt(color.substr(5, 2), 16) / 255;
			waterAppearanceViews.color.set([r, g, b, 1.0]);
			device.queue.writeBuffer(waterAppearanceBuffer, 0, waterAppearanceValues);
		});
		transparencyInput?.addEventListener('input', (e) => {
			waterAppearanceViews.transparency[0] = parseInt((e.target as HTMLInputElement).value) / 100;
			device.queue.writeBuffer(waterAppearanceBuffer, 16, waterAppearanceViews.transparency);
		});
		reflectivityInput?.addEventListener('input', (e) => {
			waterAppearanceViews.reflectivity[0] = parseInt((e.target as HTMLInputElement).value) / 100;
			device.queue.writeBuffer(waterAppearanceBuffer, 20, waterAppearanceViews.reflectivity);
		});
		waveHeightInput?.addEventListener('input', (e) => {
			waterAppearanceViews.waveHeight[0] = parseInt((e.target as HTMLInputElement).value) / 100;
			device.queue.writeBuffer(waterAppearanceBuffer, 24, waterAppearanceViews.waveHeight);
		});
	}
	// Sphere containment toggle (press 'O') cycles enabled state for active renderer
	let sphereContainEnabled = false;
	window.addEventListener('keydown', (ev) => {
		if (ev.key === 'o' || ev.key === 'O') {
			sphereContainEnabled = !sphereContainEnabled;
			// Choose active renderer based on current sim mode (mls-mpm prioritized)
			const center: [number,number,number] = [0,0,0];
			const radius = 3.5; // default radius; adjust later via UI if needed
			mlsmpmRenderer.setSphereContain(sphereContainEnabled, center, radius);
			sphRenderer.setSphereContain(sphereContainEnabled, center, radius);
			boidsRenderer.setSphereContain(sphereContainEnabled, center, radius);
			console.log(`[SphereContain] ${sphereContainEnabled ? 'Enabled' : 'Disabled'} (radius ${radius})`);
		}
	});
	// Environment selector event listener
	const environmentSelect = document.getElementById('environment-select') as HTMLSelectElement;
	environmentSelect.addEventListener('change', (e) => {
		currentEnvironmentIndex = parseInt((e.target as HTMLSelectElement).value);		// Update renderers with new environment
		if (currentEnvironmentIndex === -1) {
			// Use white background (no environment map)
			mlsmpmRenderer.updateEnvironment(null);
			sphRenderer.updateEnvironment(null);
			boidsRenderer.updateEnvironment(null);
			// For skybox, we could create a white cubemap or skip rendering
		} else {
			mlsmpmRenderer.updateEnvironment(cubemapTextureViews[currentEnvironmentIndex]!);
			sphRenderer.updateEnvironment(cubemapTextureViews[currentEnvironmentIndex]!);
			boidsRenderer.updateEnvironment(cubemapTextureViews[currentEnvironmentIndex]!);
			skyboxRenderer.updateCubemap(cubemapTextureViews[currentEnvironmentIndex]!);
		}
	});

	// Debug Mode Event Handlers
	const debugModeEnabled = document.getElementById('debug-mode-enabled') as HTMLInputElement;
	const debugModeControls = document.getElementById('debug-mode-controls') as HTMLDivElement;
	const debugModeSelect = document.getElementById('debug-mode-select') as HTMLSelectElement;
	const debugLayerSelect = document.getElementById('debug-layer-select') as HTMLSelectElement;
	const debugIntensity = document.getElementById('debug-intensity') as HTMLInputElement;
	const debugIntensityValue = document.getElementById('debug-intensity-value') as HTMLSpanElement;
	const debugExportButton = document.getElementById('debug-export') as HTMLButtonElement;
	const debugInfoOverlay = document.getElementById('debug-info-overlay') as HTMLDivElement;
	const debugInfoClose = document.getElementById('debug-info-close') as HTMLButtonElement;

	// Debug mode elements
	const debugCurrentMode = document.getElementById('debug-current-mode') as HTMLSpanElement;
	const debugCurrentLayer = document.getElementById('debug-current-layer') as HTMLSpanElement;
	const debugCurrentIntensity = document.getElementById('debug-current-intensity') as HTMLSpanElement;
	const debugFps = document.getElementById('debug-fps') as HTMLSpanElement;
	const debugParticleCount = document.getElementById('debug-particle-count') as HTMLSpanElement;

	let debugModeActive = false;
	let frameCount = 0;
	let lastFrameTime = performance.now();

	// Ensure the dropdown reflects all currently implemented debug modes (auto-sync with enum)
	(function ensureDebugModeOptions() {
		const modeNamesFull = ['None', 'Depth Map', 'Thickness Map', 'Surface Normals', 'Absorption Effects',
			'Velocity Field', 'Pressure Distribution', 'Surface Curvature', 'Fresnel Effects',
			'Caustics Patterns', 'Refraction Rays', 'View Angle (N·V)', 'Fresnel Layer Scalar', 'Foam Probability', 'Height Field', 'Slope Magnitude',
			'Raw Height', 'Fresnel Hotspots', 'Curvature Magnitude', 'Slope/Capillary/Foam', 'Height Variance', 'Mirror Difference', 'Mid Split Mask',
			'Raw NoV', 'Lifted NoV', 'NoV Delta'];
		if (debugModeSelect.options.length !== modeNamesFull.length) {
			debugModeSelect.innerHTML = modeNamesFull.map((name, i) => `<option value="${i}">${i} - ${name}</option>`).join('');
		}
	})();
	// Update debug info display
	function updateDebugInfo() {
		const modeNames = ['None', 'Depth Map', 'Thickness Map', 'Surface Normals', 'Absorption Effects',
			'Velocity Field', 'Pressure Distribution', 'Surface Curvature', 'Fresnel Effects',
			'Caustics Patterns', 'Refraction Rays', 'View Angle (N·V)', 'Fresnel Layer Scalar', 'Foam Probability', 'Height Field', 'Slope Magnitude',
			'Raw Height', 'Fresnel Hotspots', 'Curvature Magnitude', 'Slope/Capillary/Foam', 'Height Variance', 'Mirror Difference', 'Mid Split Mask'];
		const layerNames = ['Raw Data', 'Filtered Data', 'Differential'];

		const dm = debugModeViews.mode[0] ?? 0;
		const dl = debugModeViews.layer[0] ?? 0;
		const di = debugModeViews.intensity[0] ?? 1.0;
		debugCurrentMode.textContent = modeNames[dm] || 'Unknown';
		debugCurrentLayer.textContent = layerNames[dl] || 'Unknown';
		debugCurrentIntensity.textContent = `${Math.round(di * 100)}%`;

		// Update particle count based on current simulation
		const particleCountElement = document.getElementById('particle-count-value') as HTMLSpanElement;
		if (particleCountElement) {
			debugParticleCount.textContent = particleCountElement.textContent || '--';
		}

		// Update FPS
		frameCount++;
		const currentTime = performance.now();
		if (currentTime - lastFrameTime >= 1000) {
			debugFps.textContent = `${frameCount} FPS`;
			frameCount = 0;
			lastFrameTime = currentTime;
		}
	}

	// Update all renderers with new debug settings
	function updateDebugMode() {
		device.queue.writeBuffer(debugModeBuffer, 0, debugModeValues);

		// Update all renderer instances
		mlsmpmRenderer.setDebugMode(debugModeViews.mode[0]!, debugModeViews.layer[0]!, debugModeViews.intensity[0]!);
		sphRenderer.setDebugMode(debugModeViews.mode[0]!, debugModeViews.layer[0]!, debugModeViews.intensity[0]!);
		boidsRenderer.setDebugMode(debugModeViews.mode[0]!, debugModeViews.layer[0]!, debugModeViews.intensity[0]!);

		updateDebugInfo();
	}

	// Debug mode toggle
	debugModeEnabled.addEventListener('change', (e) => {
		debugModeActive = (e.target as HTMLInputElement).checked;
		debugModeControls.style.display = debugModeActive ? 'block' : 'none';
		debugInfoOverlay.style.display = debugModeActive ? 'block' : 'none';

		// Add visual indicator to debug control group
		const debugControlGroup = debugModeEnabled.closest('.control-group') as HTMLDivElement;
		if (debugModeActive) {
			debugControlGroup.classList.add('debug-mode-active');
			debugModeViews.mode[0] = parseInt(debugModeSelect.value);
		} else {
			debugControlGroup.classList.remove('debug-mode-active');
			debugModeViews.mode[0] = DebugVisualizationMode.NONE;
		}

		updateDebugMode();
	});

	// Debug mode selector
	debugModeSelect.addEventListener('change', (e) => {
		debugModeViews.mode[0] = parseInt((e.target as HTMLSelectElement).value);
		updateDebugMode();
	});

	// Debug layer selector
	debugLayerSelect.addEventListener('change', (e) => {
		debugModeViews.layer[0] = parseInt((e.target as HTMLSelectElement).value);
		updateDebugMode();
	});

	// Debug intensity slider
	debugIntensity.addEventListener('input', (e) => {
		const value = parseInt((e.target as HTMLInputElement).value);
		debugModeViews.intensity[0] = value / 100;
		debugIntensityValue.textContent = `${value}%`;
		updateDebugMode();
	});

	// Debug export functionality
	debugExportButton.addEventListener('click', async () => {
		try {
			// Import the debug export utility
			const { DebugExporter } = await import('./src/debug/DebugExport');
			const exporter = new DebugExporter();

			// Get current debug mode info for filename
			const modeNames = ['none', 'depth', 'thickness', 'normals', 'absorption',
				'velocity', 'pressure', 'curvature', 'fresnel', 'caustics', 'refraction', 'nov', 'f_layer', 'foam_prob', 'height', 'slope',
				'raw_height', 'f_layer_hot', 'curvature_mag', 'slope_cap_foam', 'height_var', 'mirror_diff', 'mid_split'];
			const layerNames = ['raw', 'filtered', 'differential'];

			const _dm = debugModeViews.mode[0] ?? 0;
			const _dl = debugModeViews.layer[0] ?? 0;
			const _di = debugModeViews.intensity[0] ?? 1.0;
			const modeName = modeNames[_dm] || 'unknown';
			const layerName = layerNames[_dl] || 'unknown';
			const intensity = Math.round(_di * 100);

			const filename = `debug_${modeName}_${layerName}_${intensity}pct_${Date.now()}`;

			// Visual feedback
			debugExportButton.innerHTML = '<i class="fas fa-check"></i><span>Exported!</span>';
			setTimeout(() => {
				debugExportButton.innerHTML = '<i class="fas fa-download"></i><span>Export Debug Screenshot</span>';
			}, 2000);

		} catch (error) {
			console.error('Failed to export debug screenshot:', error);
			debugExportButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Export Failed</span>';
			setTimeout(() => {
				debugExportButton.innerHTML = '<i class="fas fa-download"></i><span>Export Debug Screenshot</span>';
			}, 2000);
		}
	});

	// Debug info overlay close button
	debugInfoClose.addEventListener('click', () => {
		debugInfoOverlay.style.display = 'none';
		debugModeEnabled.checked = false;
		debugModeActive = false;
		debugModeControls.style.display = 'none';

		const debugControlGroup = debugModeEnabled.closest('.control-group') as HTMLDivElement;
		debugControlGroup.classList.remove('debug-mode-active');

		debugModeViews.mode[0] = DebugVisualizationMode.NONE;
		updateDebugMode();
	});

	// Add debug info updates to render loop (call this in the existing render loop)
	const originalRender = render;
	function render() {
		originalRender();
		if (debugModeActive) {
			updateDebugInfo();
		}
	}
	// Keyboard shortcut for debug mode (D key)
	document.addEventListener('keydown', (e) => {
		if (e.code === 'KeyD' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
			debugModeEnabled.click();
		}
	});	// Expose global function for effects toggle updates
	(window as any).updateEffectsToggle = (index: number, enabled: boolean) => {
		// Update the specific effect in the effects toggle buffer
		const effectKeys = [
			'enableReynoldsPhysics', 'enableCavitation', 'enableFoam', 'enableTurbulentNormals',
			'enableSpecular', 'enableSubsurface', 'enableFresnel', 'enableReflection',
			'enableRefraction', 'enableCaustics', 'enableDispersion', 'enableAbsorption',
			'enableDepthColoring', 'enableVelocityColoring', 'enableRimLighting', 'enableColorAbsorption',
			'enableVarianceLightTransport'
		];

		if (index >= 0 && index < effectKeys.length) {
			const effectKey = effectKeys[index] as keyof typeof effectsToggleViews;
			effectsToggleViews[effectKey][0] = enabled ? 1 : 0;

			// Write the updated buffer to GPU
			device.queue.writeBuffer(effectsToggleBuffer, 0, effectsToggleValues);

			// Update all renderer instances with the current effects toggle buffer
			mlsmpmRenderer.updateEffectsToggles(effectsToggleValues);
			sphRenderer.updateEffectsToggles(effectsToggleValues);
			boidsRenderer.updateEffectsToggles(effectsToggleValues); console.log(`Updated effect ${effectKey} (index ${index}) to ${enabled ? 'enabled' : 'disabled'}`);
		} else {
			console.error(`Invalid effect index: ${index}`);
		}
	};

	// Expose global function for lighting controls updates
	(window as any).updateLightingControls = (parameter: string, value: any) => {
		// Update the specific lighting parameter in the lighting controls buffer
		try {
			switch (parameter) {
				// Lighting mode
				case 'lightingMode':
					lightingControlsViews.lightingMode[0] = value;
					break;

				// Main light parameters
				case 'mainLightDirection':
					lightingControlsViews.mainLightDirection.set(value);
					break;
				case 'mainLightIntensity':
					lightingControlsViews.mainLightIntensity[0] = value;
					break;
				case 'mainLightColor':
					lightingControlsViews.mainLightColor.set(value);
					break;
				case 'mainLightEnabled':
					lightingControlsViews.mainLightEnabled[0] = value;
					break;

				// Fill light parameters
				case 'fillLightDirection':
					lightingControlsViews.fillLightDirection.set(value);
					break;
				case 'fillLightIntensity':
					lightingControlsViews.fillLightIntensity[0] = value;
					break;
				case 'fillLightColor':
					lightingControlsViews.fillLightColor.set(value);
					break;
				case 'fillLightEnabled':
					lightingControlsViews.fillLightEnabled[0] = value;
					break;

				// Rim light parameters
				case 'rimLightDirection':
					lightingControlsViews.rimLightDirection.set(value);
					break;
				case 'rimLightIntensity':
					lightingControlsViews.rimLightIntensity[0] = value;
					break;
				case 'rimLightColor':
					lightingControlsViews.rimLightColor.set(value);
					break;
				case 'rimLightEnabled':
					lightingControlsViews.rimLightEnabled[0] = value;
					break;

				// Global lighting parameters
				case 'ambientIntensity':
					lightingControlsViews.ambientIntensity[0] = value;
					break;
				case 'ambientColor':
					lightingControlsViews.ambientColor.set(value);
					break;
				case 'shadowIntensity':
					lightingControlsViews.shadowIntensity[0] = value;
					break;
				case 'specularIntensityMultiplier':
					lightingControlsViews.specularIntensityMultiplier[0] = value;
					break;
				case 'subsurfaceIntensityMultiplier':
					lightingControlsViews.subsurfaceIntensityMultiplier[0] = value;
					break;

				default:
					console.error(`Unknown lighting parameter: ${parameter}`);
					return;
			}

			// Write the updated buffer to GPU
			device.queue.writeBuffer(lightingControlsBuffer, 0, lightingControlsValues);

			// Update all renderer instances with the current lighting controls buffer
			mlsmpmRenderer.updateEnvironment(currentEnvironmentIndex === -1 ? null : cubemapTextureViews[currentEnvironmentIndex]!);
			sphRenderer.updateEnvironment(currentEnvironmentIndex === -1 ? null : cubemapTextureViews[currentEnvironmentIndex]!);
			boidsRenderer.updateEnvironment(currentEnvironmentIndex === -1 ? null : cubemapTextureViews[currentEnvironmentIndex]!); console.log(`Updated lighting parameter ${parameter} to ${value}`);
		} catch (error) {
			console.error(`Error updating lighting parameter ${parameter}:`, error);
		}
	};
	// Global function to update effect parameters
	(window as any).updateEffectParameters = function (parameterIndex: number, value: number) {
		try {
			// Update the parameter in the effect parameters buffer
			const parameterOffset = parameterIndex * 4; // Each parameter is 4 bytes (f32)
			const parameterView = new Float32Array(effectParametersValues, parameterOffset, 1);
			parameterView[0] = value;

			// Write the updated buffer to GPU
			device.queue.writeBuffer(effectParametersBuffer, 0, effectParametersValues);

			console.log(`Updated effect parameter ${parameterIndex} to ${value}`);
		} catch (error) {
			console.error(`Error updating effect parameter ${parameterIndex}:`, error);
		}
	};
	// --- Enhanced LOD Control Interface Functions ---
	// Get current LOD information for UI display
	(window as any).getCurrentLODInfo = function () {
		try {
			let currentLODIntegration: EnhancedLODIntegration;
			let totalParticles: number;

			// Get the appropriate LOD integration based on current simulation mode
			if (boidsFl) {
				currentLODIntegration = lodIntegration['boids'];
				totalParticles = boidsSimulator.numParticles;
			} else if (sphFl) {
				currentLODIntegration = lodIntegration['sph'];
				totalParticles = sphSimulator.numParticles;
			} else {
				currentLODIntegration = lodIntegration['mls-mpm'];
				totalParticles = mlsmpmSimulator.numParticles;
			}

			// Get enhanced LOD settings
			const lodResult = currentLODIntegration.getEnhancedLODSettings(
				totalParticles,
				camera,
				realBoxSize,
				16.67 // Default frame time
			);			// Get LOD info from the manager
			const lodInfo = currentLODIntegration.getEnhancedLODInfo();

			return {
				totalParticles,
				activeParticles: lodResult.effectiveParticleCount,
				cameraDistance: lodResult.cameraDistance,
				ratio: lodResult.particleRatio,
				enabled: lodInfo.enabled,
				simulationMode: boidsFl ? 'boids' : sphFl ? 'sph' : 'mls-mpm',
				// Enhanced LOD info
				shaderMode: lodResult.shaderMode,
				lightingMode: lodResult.lightingMode,
				renderScale: lodResult.renderScale,
				focusPoint: lodResult.focusPoint,
				focusRadius: lodResult.focusRadius,
				qualityZones: lodResult.qualityZones,
				qualityAdaptationActive: lodResult.qualityAdaptationActive
			};
		} catch (error) {
			console.error('Error getting LOD info:', error);
			return null;
		}
	};

	// Enable/disable LOD system
	(window as any).setLODEnabled = function (enabled: boolean) {
		try {
			Object.values(lodIntegration).forEach(integration => {
				integration.setEnabled(enabled);
			});
			console.log(`LOD system ${enabled ? 'enabled' : 'disabled'}`);
		} catch (error) {
			console.error('Error setting LOD enabled state:', error);
		}
	};
	// Update LOD configuration
	(window as any).setLODConfig = function (config: any) {
		try {
			Object.values(lodIntegration).forEach(integration => {
				// Map basic LOD config to enhanced LOD config
				const enhancedConfig = {
					enabled: config.enabled ?? true,
					minDistance: config.minDistance ?? 30,
					maxDistance: config.maxDistance ?? 200,
					minParticleRatio: (config.minParticleRatio ?? 30) / 100, // Convert percentage to ratio - now represents FAR distance ratio
					smoothTransition: config.smoothTransition ?? true,
					updateFrequency: config.updateFrequency ?? 5,
					// Add enhanced features with defaults
					enableHighResolutionFocus: true,
					focusRadius: 50,
					adaptiveQuality: true,
					performanceThreshold: 60,
					enableSpatialLOD: true,
					maxQualityZones: 3
				};
				integration.updateConfig(enhancedConfig);
			});
			console.log('LOD configuration updated:', config);
		} catch (error) {
			console.error('Error updating LOD configuration:', error);
		}
	};

	// Reset LOD parameter (for reset buttons)
	(window as any).resetLODParameter = function (parameterId: string, defaultValue: any) {
		try {
			// This function is handled by the HTML JavaScript
			// It's just a placeholder for consistency			console.log(`Resetting LOD parameter ${parameterId} to ${defaultValue}`);
		} catch (error) {
			console.error(`Error resetting LOD parameter ${parameterId}:`, error);
		}
	};

	// Clear temporal buffers to eliminate ghost artifacts
	(window as any).clearTemporalBuffers = function () {
		try {
			boidsRenderer.clearTemporalBuffers();
			sphRenderer.clearTemporalBuffers();
			mlsmpmRenderer.clearTemporalBuffers();
			console.log('All temporal buffers cleared - ghost artifacts eliminated');
		} catch (error) {
			console.error('Error clearing temporal buffers:', error);
		}
	};	// Initialize Enhanced LOD UI
	const initEnhancedLODUI = () => {
		console.log('Starting Enhanced LOD UI initialization...');

		// Add enhanced LOD styles to the document
		const styleSheet = document.createElement('style');
		styleSheet.textContent = ENHANCED_LOD_UI_STYLES;
		document.head.appendChild(styleSheet);
		console.log('Enhanced LOD styles added');

		// Find the existing LOD controls section
		const enableLODCheckbox = document.getElementById('enable-lod');
		console.log('Found enable-lod checkbox:', enableLODCheckbox);

		if (enableLODCheckbox) {
			const existingLODSection = enableLODCheckbox.closest('.control-group');
			console.log('Found existing LOD section:', existingLODSection);
			if (existingLODSection) {
				// Instead of replacing, hide the old section and add the new one after it
				(existingLODSection as HTMLElement).style.display = 'none';

				// Create the enhanced LOD section
				const enhancedSection = document.createElement('div');
				enhancedSection.className = 'control-group';
				enhancedSection.innerHTML = ENHANCED_LOD_UI_TEMPLATE;

				// Insert the enhanced section after the hidden one
				existingLODSection.parentNode?.insertBefore(enhancedSection, existingLODSection.nextSibling);
				console.log('Added enhanced LOD section after existing one');

				// Now initialize the enhanced controls directly here instead of via script
				setTimeout(() => {
					console.log('Initializing enhanced LOD controls...');

					// Enhanced LOD master toggle
					const masterToggle = document.getElementById('enable-enhanced-lod');
					if (masterToggle) {
						masterToggle.addEventListener('change', function (e) {
							const enabled = (e.target as HTMLInputElement).checked;
							console.log('Enhanced LOD enabled:', enabled);
							if ((window as any).setEnhancedLODEnabled) {
								(window as any).setEnhancedLODEnabled(enabled);
							}
						});
						console.log('Enhanced LOD master toggle initialized');
					}

					// Enhanced preset buttons
					const presetButtons = ['performance', 'balanced', 'quality', 'ultra'];
					presetButtons.forEach(preset => {
						const button = document.getElementById(`enhanced-lod-preset-${preset}`);
						if (button) {
							button.addEventListener('click', function () {
								console.log(`Applying enhanced ${preset} preset`);
								// Define enhanced presets
								const enhancedPresets = {
									performance: {
										enabled: true,
										enableFocusEnhancement: false,
										enablePerformanceAdaptation: true,
										targetFrameRate: 60,
										distantShaderMode: 'minimal',
										distantLightingMode: 'single',
										focusRadius: 30
									},
									balanced: {
										enabled: true,
										enableFocusEnhancement: true,
										enablePerformanceAdaptation: true,
										targetFrameRate: 60,
										distantShaderMode: 'simplified',
										distantLightingMode: 'dual',
										focusRadius: 50
									},
									quality: {
										enabled: true,
										enableFocusEnhancement: true,
										enablePerformanceAdaptation: false,
										targetFrameRate: 30,
										distantShaderMode: 'full',
										distantLightingMode: 'full',
										focusRadius: 70
									},
									ultra: {
										enabled: true,
										enableFocusEnhancement: true,
										enablePerformanceAdaptation: false,
										targetFrameRate: 30,
										distantShaderMode: 'full',
										distantLightingMode: 'full',
										focusRadius: 100,
										focusQualityMultiplier: 4.0
									}
								}; if ((window as any).setEnhancedLODConfig) {
									(window as any).setEnhancedLODConfig(enhancedPresets[preset as keyof typeof enhancedPresets]);
								}

								// Update button styling to show which preset is active
								presetButtons.forEach(p => {
									const btn = document.getElementById(`enhanced-lod-preset-${p}`);
									if (btn) {
										btn.classList.remove('primary');
									}
								});
								button.classList.add('primary');
							});
							console.log(`Enhanced ${preset} preset button initialized`);
						}
					});

						// Auto-select ultra preset by default after buttons are initialized
						const ultraBtn = document.getElementById('enhanced-lod-preset-ultra');
						if (ultraBtn) {
							ultraBtn.click();
							console.log('Ultra preset auto-applied by default.');
						}

					// Advanced LOD Settings accordion toggle
					const advancedToggle = document.getElementById('enhanced-lod-advanced-toggle');
					const advancedContent = document.getElementById('enhanced-lod-advanced-content');
					if (advancedToggle && advancedContent) {
						advancedToggle.addEventListener('click', function () {
							const isVisible = advancedContent.style.display !== 'none';
							advancedContent.style.display = isVisible ? 'none' : 'block';

							// Rotate the chevron icon
							const chevron = advancedToggle.querySelector('i.fa-chevron-down');
							if (chevron) {
								if (isVisible) {
									(chevron as HTMLElement).style.transform = 'rotate(0deg)';
								} else {
									(chevron as HTMLElement).style.transform = 'rotate(180deg)';
								}
							}

							console.log('Advanced LOD settings toggled:', !isVisible);
						});
						console.log('Advanced LOD accordion toggle initialized');
					}

					// Advanced control checkboxes
					const advancedControls = [
						'enable-geometric-lod',
						'enable-physics-lod',
						'enable-resolution-lod',
						'enable-temporal-lod'
					];

					advancedControls.forEach(controlId => {
						const control = document.getElementById(controlId);
						if (control) {
							control.addEventListener('change', function (e) {
								const enabled = (e.target as HTMLInputElement).checked;
								const configKey = controlId.replace('enable-', '').replace(/-/g, '');
								const config = { [configKey]: enabled };

								console.log(`Advanced control ${controlId}:`, enabled);
								if ((window as any).updateEnhancedLODConfig) {
									(window as any).updateEnhancedLODConfig(config);
								}
							});
							console.log(`Advanced control ${controlId} initialized`);
						}
					});

					// Add missing slider event listeners
					// Focus radius slider
					const focusRadiusSlider = document.getElementById('focus-radius');
					if (focusRadiusSlider) {
						focusRadiusSlider.addEventListener('input', function (e) {
							const value = parseFloat((e.target as HTMLInputElement).value);
							const valueDisplay = document.getElementById('focus-radius-value');
							if (valueDisplay) {
								valueDisplay.textContent = value.toString();
							}
							console.log('Focus radius changed to:', value);
							if ((window as any).updateEnhancedLODConfig) {
								(window as any).updateEnhancedLODConfig({ focusRadius: value });
							}
						});
						console.log('Focus radius slider initialized');
					}

					// Focus quality slider
					const focusQualitySlider = document.getElementById('focus-quality');
					if (focusQualitySlider) {
						focusQualitySlider.addEventListener('input', function (e) {
							const value = parseFloat((e.target as HTMLInputElement).value);
							const valueDisplay = document.getElementById('focus-quality-value');
							if (valueDisplay) {
								valueDisplay.textContent = value.toFixed(1) + 'x';
							}
							console.log('Focus quality changed to:', value);
							if ((window as any).updateEnhancedLODConfig) {
								(window as any).updateEnhancedLODConfig({ focusQualityMultiplier: value });
							}
						});
						console.log('Focus quality slider initialized');
					}

					// Target FPS slider
					const targetFPSSlider = document.getElementById('target-fps');
					if (targetFPSSlider) {
						targetFPSSlider.addEventListener('input', function (e) {
							const value = parseInt((e.target as HTMLInputElement).value);
							const valueDisplay = document.getElementById('target-fps-value');
							if (valueDisplay) {
								valueDisplay.textContent = value.toString();
							}
							console.log('Target FPS changed to:', value);
							if ((window as any).updateEnhancedLODConfig) {
								(window as any).updateEnhancedLODConfig({ targetFrameRate: value });
							}
						});
						console.log('Target FPS slider initialized');
					}

					// Adaptation speed slider
					const adaptationSpeedSlider = document.getElementById('adaptation-speed');
					if (adaptationSpeedSlider) {
						adaptationSpeedSlider.addEventListener('input', function (e) {
							const value = parseFloat((e.target as HTMLInputElement).value);
							const valueDisplay = document.getElementById('adaptation-speed-value');
							if (valueDisplay) {
								valueDisplay.textContent = value.toFixed(2);
							}
							console.log('Adaptation speed changed to:', value);
							if ((window as any).updateEnhancedLODConfig) {
								(window as any).updateEnhancedLODConfig({ qualityAdjustmentRate: value });
							}
						});
						console.log('Adaptation speed slider initialized');
					}

					// Enhanced LOD toggle controls
					const enhancedToggles = [
						{ id: 'enable-focus-enhancement', config: 'enableFocusEnhancement' },
						{ id: 'enable-auto-focus', config: 'adaptiveFocusPoint' },
						{ id: 'enable-performance-adaptation', config: 'enablePerformanceAdaptation' }
					];

					enhancedToggles.forEach(toggle => {
						const element = document.getElementById(toggle.id);
						if (element) {
							element.addEventListener('change', function (e) {
								const enabled = (e.target as HTMLInputElement).checked;
								console.log(`${toggle.id} changed to:`, enabled);
								if ((window as any).updateEnhancedLODConfig) {
									(window as any).updateEnhancedLODConfig({ [toggle.config]: enabled });
								}
							});
							console.log(`Toggle ${toggle.id} initialized`);
						}
					});

					// Additional sliders for Visual Quality LOD
					const qualityTransitionSlider = document.getElementById('quality-transition-distance');
					if (qualityTransitionSlider) {
						qualityTransitionSlider.addEventListener('input', function (e) {
							const value = parseInt((e.target as HTMLInputElement).value);
							const valueDisplay = document.getElementById('quality-transition-distance-value');
							if (valueDisplay) {
								valueDisplay.textContent = value.toString();
							}
							console.log('Quality transition distance changed to:', value);
							if ((window as any).updateEnhancedLODConfig) {
								(window as any).updateEnhancedLODConfig({ shaderTransitionDistance: value });
							}
						});
						console.log('Quality transition distance slider initialized');
					}

					// Distant render scale slider
					const distantRenderScaleSlider = document.getElementById('distant-render-scale');
					if (distantRenderScaleSlider) {
						distantRenderScaleSlider.addEventListener('input', function (e) {
							const value = parseFloat((e.target as HTMLInputElement).value);
							const valueDisplay = document.getElementById('distant-render-scale-value');
							if (valueDisplay) {
								valueDisplay.textContent = Math.round(value * 100) + '%';
							}
							console.log('Distant render scale changed to:', value);
							if ((window as any).updateEnhancedLODConfig) {
								(window as any).updateEnhancedLODConfig({ distantRenderScale: value });
							}
						});
						console.log('Distant render scale slider initialized');
					}

					// Min update rate slider
					const minUpdateRateSlider = document.getElementById('min-update-rate');
					if (minUpdateRateSlider) {
						minUpdateRateSlider.addEventListener('input', function (e) {
							const value = parseInt((e.target as HTMLInputElement).value);
							const valueDisplay = document.getElementById('min-update-rate-value');
							if (valueDisplay) {
								valueDisplay.textContent = value + ' fps';
							}
							console.log('Min update rate changed to:', value);
							if ((window as any).updateEnhancedLODConfig) {
								(window as any).updateEnhancedLODConfig({ minUpdateRate: value });
							}
						});
						console.log('Min update rate slider initialized');
					}

					// Shader mode radio buttons
					const shaderModeRadios = document.querySelectorAll('input[name="distant-shader-mode"]');
					shaderModeRadios.forEach(radio => {
						radio.addEventListener('change', function (e) {
							if ((e.target as HTMLInputElement).checked) {
								const value = (e.target as HTMLInputElement).value;
								console.log('Distant shader mode changed to:', value);
								if ((window as any).updateEnhancedLODConfig) {
									(window as any).updateEnhancedLODConfig({ distantShaderMode: value });
								}
							}
						});
					});
					console.log('Shader mode radio buttons initialized');

					console.log('Enhanced LOD controls initialization complete');
				}, 100);
			}
		} else {
			console.error('Could not find enable-lod checkbox - Enhanced LOD UI not added');
		}
		console.log('Enhanced LOD UI initialization finished');
	};

	// Initialize the enhanced LOD UI
	setTimeout(initEnhancedLODUI, 100); // Small delay to ensure DOM is ready

	// Fallback: Make sure basic LOD controls work with enhanced system if UI replacement fails
	setTimeout(() => {
		// Check if basic LOD controls are still present and enhance them
		const basicLODToggle = document.getElementById('enable-lod');
		if (basicLODToggle && !document.getElementById('enable-enhanced-lod')) {
			console.log('Enhanced LOD UI not found, enhancing basic controls...');

			// Make basic LOD toggle work with enhanced system
			basicLODToggle.addEventListener('change', function (e) {
				const enabled = (e.target as HTMLInputElement).checked;
				if ((window as any).setEnhancedLODEnabled) {
					(window as any).setEnhancedLODEnabled(enabled);
				}
			});

			// Make basic preset buttons work with enhanced system
			const presetButtons = ['performance', 'balanced', 'quality'];
			presetButtons.forEach(preset => {
				const button = document.getElementById(`lod-preset-${preset}`);
				if (button) {
					button.addEventListener('click', function () {
						console.log(`Applying enhanced ${preset} preset`);
						const presetConfigs = {
							performance: {
								enabled: true,
								enableFocusEnhancement: false,
								enablePerformanceAdaptation: true,
								targetFrameRate: 60,
								distantShaderMode: 'minimal',
								distantLightingMode: 'single'
							},
							balanced: {
								enabled: true,
								enableFocusEnhancement: true,
								enablePerformanceAdaptation: true,
								targetFrameRate: 60,
								distantShaderMode: 'simplified',
								distantLightingMode: 'dual'
							},
							quality: {
								enabled: true,
								enableFocusEnhancement: true,
								enablePerformanceAdaptation: false,
								targetFrameRate: 30,
								distantShaderMode: 'full',
								distantLightingMode: 'full'
							}
						};
						if ((window as any).setEnhancedLODConfig) {
							(window as any).setEnhancedLODConfig(presetConfigs[preset as keyof typeof presetConfigs]);
						}
					});
				}
			});

			console.log('Basic LOD controls enhanced');
		}
	}, 500); // Longer delay to ensure everything is loaded

	// Store last LOD result for status display
	let lastEnhancedLODResult: EnhancedLODResult | null = null;
	// Update LOD status display
	(window as any).updateLODStatus = function () {
		try {
			if (lastEnhancedLODResult) {
				const lodResult = lastEnhancedLODResult as EnhancedLODResult;

				// Update Enhanced LOD status display elements
				const activeParticlesEl = document.getElementById('enhanced-lod-active-particles') || document.getElementById('lod-active-particles');
				const focusDistanceEl = document.getElementById('enhanced-lod-focus-distance') || document.getElementById('lod-camera-distance');
				const qualityPercentEl = document.getElementById('enhanced-lod-quality-percent') || document.getElementById('lod-ratio');
				const qualityBadgeEl = document.getElementById('enhanced-lod-quality-badge') || document.getElementById('lod-level-badge');
				const frameRateEl = document.getElementById('enhanced-lod-frame-rate');
				const shaderModeEl = document.getElementById('enhanced-lod-shader-mode');
				const lightingModeEl = document.getElementById('enhanced-lod-lighting-mode');
				const physicsModeEl = document.getElementById('enhanced-lod-physics-mode');

				if (activeParticlesEl) {
					activeParticlesEl.textContent = lodResult.effectiveParticleCount.toLocaleString();
				}
				if (focusDistanceEl) {
					focusDistanceEl.textContent = lodResult.cameraDistance.toFixed(1);
				}
				if (qualityPercentEl) {
					qualityPercentEl.textContent = Math.round(lodResult.particleRatio * 100) + '%';
				}
				if (qualityBadgeEl) {
					const level = lodResult.particleRatio > 0.8 ? 'ULTRA' : lodResult.particleRatio > 0.6 ? 'HIGH' : lodResult.particleRatio > 0.4 ? 'MEDIUM' : 'LOW';
					qualityBadgeEl.textContent = level;
					qualityBadgeEl.className = 'quality-badge quality-' + level.toLowerCase();
				} if (frameRateEl) {
					const fps = Math.round(1000 / lodResult.frameTime);
					frameRateEl.textContent = fps.toString();
				}
				if (shaderModeEl) {
					shaderModeEl.textContent = lodResult.shaderMode.charAt(0).toUpperCase() + lodResult.shaderMode.slice(1);
				}
				if (lightingModeEl) {
					const lightCount = lodResult.lightingMode === 'full' ? '3' : lodResult.lightingMode === 'dual' ? '2' : '1';
					lightingModeEl.textContent = lightCount + ' Lights';
				}
				if (physicsModeEl) {
					physicsModeEl.textContent = lodResult.physicsMode.charAt(0).toUpperCase() + lodResult.physicsMode.slice(1);
				}
			}
		} catch (error) {
			console.error('Error updating LOD status:', error);
		}
	};
	// Enhanced LOD specific functions for the Enhanced UI
	(window as any).setEnhancedLODEnabled = function (enabled: boolean) {
		try {
			Object.values(lodIntegration).forEach(integration => {
				integration.setEnabled(enabled);
			});
			console.log(`Enhanced LOD system ${enabled ? 'enabled' : 'disabled'}`);
		} catch (error) {
			console.error('Error setting Enhanced LOD enabled state:', error);
		}
	};

	(window as any).setEnhancedLODConfig = function (config: any) {
		try {
			Object.values(lodIntegration).forEach(integration => {
				integration.updateConfig(config);
			});
			console.log('Enhanced LOD configuration updated:', config);
		} catch (error) {
			console.error('Error updating Enhanced LOD configuration:', error);
		}
	};

	(window as any).updateEnhancedLODConfig = function (config: any) {
		try {
			Object.values(lodIntegration).forEach(integration => {
				integration.updateConfig(config);
			});
			console.log('Enhanced LOD configuration updated:', config);
		} catch (error) {
			console.error('Error updating Enhanced LOD configuration:', error);
		}
	};
}

main()
