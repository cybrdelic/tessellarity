import { PrefixSumKernel } from 'webgpu-radix-sort';
import { mat4 } from 'wgpu-matrix'

import { Camera } from './camera'
import { mlsmpmParticleStructSize, MLSMPMSimulator } from './mls-mpm/mls-mpm'
import { SPHSimulator, sphParticleStructSize } from './sph/sph';
import { BoidsSimulator, boidsParticleStructSize } from './boids/boids';
import { renderUniformsViews, renderUniformsValues, numParticlesMax, waterAppearanceValues, waterAppearanceViews } from './common'
import { FluidRenderer } from './render/fluidRender'

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

	// Load all environment textures
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
	const maxParticleStructSize = Math.max(mlsmpmParticleStructSize, sphParticleStructSize, boidsParticleStructSize)
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
	let mlsmpmNumParticleParams = [40000, 70000, 120000, 200000]
	let mlsmpmInitBoxSizes = [[35, 25, 55], [40, 30, 60], [45, 40, 80], [50, 50, 80]]
	let mlsmpmInitDistances = [60, 70, 90, 100]
	let sphNumParticleParams = [10000, 20000, 30000, 40000]
	let sphInitBoxSizes = [[0.7, 2.0, 0.7], [1.0, 2.0, 1.0], [1.2, 2.0, 1.2], [1.4, 2.0, 1.4]]
	let sphInitDistances = [2.6, 3.0, 3.4, 3.8]
	let boidsNumParticleParams = [5000, 10000, 15000, 20000]
	let boidsInitBoxSizes = [[40, 30, 40], [50, 40, 50], [60, 50, 60], [70, 60, 70]]
	let boidsInitDistances = [80, 100, 120, 140]

	const canvasElement = document.getElementById("fluidCanvas") as HTMLCanvasElement;
	// シミュレーション，カメラの初期化
	const mlsmpmFov = 45 * Math.PI / 180
	const mlsmpmRadius = 0.6
	const mlsmpmDiameter = 2 * mlsmpmRadius
	const mlsmpmZoomRate = 1.5
	const mlsmpmSimulator = new MLSMPMSimulator(particleBuffer, posvelBuffer, mlsmpmDiameter, device)
	const sphFov = 45 * Math.PI / 180
	const sphRadius = 0.04
	const sphDiameter = 2 * sphRadius
	const sphZoomRate = 0.05
	const sphSimulator = new SPHSimulator(particleBuffer, posvelBuffer, sphDiameter, device)
	const boidsFov = 45 * Math.PI / 180
	const boidsRadius = 0.3
	const boidsDiameter = 2 * boidsRadius
	const boidsZoomRate = 0.8
	const boidsSimulator = new BoidsSimulator(particleBuffer, posvelBuffer, boidsDiameter, device)

	const mlsmpmRenderer = new FluidRenderer(
		device,
		canvas,
		presentationFormat,
		mlsmpmRadius,
		mlsmpmFov,
		posvelBuffer,
		renderUniformBuffer,
		cubemapTextureViews[currentEnvironmentIndex],
		waterAppearanceBuffer // Add this parameter
	);

	const sphRenderer = new FluidRenderer(
		device,
		canvas,
		presentationFormat,
		sphRadius,
		sphFov,
		posvelBuffer,
		renderUniformBuffer,
		cubemapTextureViews[currentEnvironmentIndex],
		waterAppearanceBuffer // Add this parameter
	);

	const boidsRenderer = new FluidRenderer(
		device,
		canvas,
		presentationFormat,
		boidsRadius,
		boidsFov,
		posvelBuffer,
		renderUniformBuffer,
		cubemapTextureViews[currentEnvironmentIndex],
		waterAppearanceBuffer
	);

	console.log("simulator initialization done")

	const camera = new Camera(canvasElement);

	// ボタン押下の監視
	let numberButtonForm = document.getElementById('number-button') as HTMLFormElement;
	let numberButtonPressed = false;
	let numberButtonPressedButton = "1"
	numberButtonForm.addEventListener('change', function (event) {
		const target = event.target as HTMLInputElement
		if (target?.name === 'options') {
			numberButtonPressed = true
			numberButtonPressedButton = target.value
		}
	});
	let simulationModeForm = document.getElementById('simulation-mode') as HTMLFormElement;
	let simulationModePressed = false;
	let simulationModePressedButton = "mls-mpm"
	simulationModeForm.addEventListener('change', function (event) {
		const target = event.target as HTMLInputElement
		if (target?.name === 'options') {
			simulationModePressed = true
			simulationModePressedButton = target.value
		}
	});
	const smallValue = document.getElementById("small-value") as HTMLSpanElement;
	const mediumValue = document.getElementById("medium-value") as HTMLSpanElement;
	const largeValue = document.getElementById("large-value") as HTMLSpanElement;
	const veryLargeValue = document.getElementById("very-large-value") as HTMLSpanElement;
	const particleCountLabel = document.getElementById("particle-count-label") as HTMLElement;

	// デバイスロストの監視
	let errorLog = document.getElementById('error-reason') as HTMLSpanElement;
	errorLog.textContent = "";
	device.lost.then(info => {
		const reason = info.reason ? `reason: ${info.reason}` : 'unknown reason';
		errorLog.textContent = reason;
	});

	// はじめは mls-mpm
	const initDistance = mlsmpmInitDistances[1]
	let initBoxSize = mlsmpmInitBoxSizes[1]
	let realBoxSize = [...initBoxSize];
	mlsmpmSimulator.reset(mlsmpmNumParticleParams[1], mlsmpmInitBoxSizes[1])
	camera.reset(canvasElement, initDistance, [initBoxSize[0] / 2, initBoxSize[1] / 4, initBoxSize[2] / 2],
		mlsmpmFov, mlsmpmZoomRate)
	smallValue.textContent = "Small (40,000 particles)"
	mediumValue.textContent = "Medium (70,000 particles)"
	largeValue.textContent = "Large (120,000 particles)"
	veryLargeValue.textContent = "Very Large (200,000 particles)"
	let sphereRenderFl = false
	let sphFl = false
	let boidsFl = false
	let boxWidthRatio = 1.

	console.log("simulation start")
	async function frame() {
		const start = performance.now(); if (simulationModePressed) {
			const waterAppearanceControls = document.getElementById('water-appearance-controls');
			const sliderLabel = document.getElementById('slider-label') as HTMLLabelElement;
			if (simulationModePressedButton == "mls-mpm") {
				sphFl = false
				boidsFl = false
				particleCountLabel.textContent = "Number of Particles"
				smallValue.textContent = "Small (40,000 particles)"
				mediumValue.textContent = "Medium (70,000 particles)"
				largeValue.textContent = "Large (120,000 particles)"
				veryLargeValue.textContent = "Very Large (200,000 particles)"
				waterAppearanceControls!.style.display = "block";
				sliderLabel.textContent = "Box width:";
			} else if (simulationModePressedButton == "sph") {
				sphFl = true
				boidsFl = false
				particleCountLabel.textContent = "Number of Particles"
				smallValue.textContent = "Small (10,000 particles)"
				mediumValue.textContent = "Medium (20,000 particles)"
				largeValue.textContent = "Large (30,000 particles)"
				veryLargeValue.textContent = "Very Large (40,000 particles)"
				waterAppearanceControls!.style.display = "block";
				sliderLabel.textContent = "Box width:";
			} else if (simulationModePressedButton == "boids") {
				sphFl = false
				boidsFl = true
				particleCountLabel.textContent = "Flock Size"
				smallValue.textContent = "Small Flock (5,000 boids)"
				mediumValue.textContent = "Medium Flock (10,000 boids)"
				largeValue.textContent = "Large Flock (15,000 boids)"
				veryLargeValue.textContent = "Massive Flock (20,000 boids)"
				waterAppearanceControls!.style.display = "none";
				sliderLabel.textContent = "Flight area:";
			}
			simulationModePressed = false
			numberButtonPressed = true
		}
		if (numberButtonPressed) {
			const paramsIdx = parseInt(numberButtonPressedButton)
			if (boidsFl) {
				initBoxSize = boidsInitBoxSizes[paramsIdx]
				boidsSimulator.reset(boidsNumParticleParams[paramsIdx], initBoxSize)
				camera.reset(canvasElement, boidsInitDistances[paramsIdx], [initBoxSize[0] / 2, initBoxSize[1] / 2, initBoxSize[2] / 2],
					boidsFov, boidsZoomRate)
			} else if (sphFl) {
				initBoxSize = sphInitBoxSizes[paramsIdx]
				sphSimulator.reset(sphNumParticleParams[paramsIdx], initBoxSize)
				camera.reset(canvasElement, sphInitDistances[paramsIdx], [0, -initBoxSize[1] + 0.1, 0],
					sphFov, sphZoomRate)
			} else {
				initBoxSize = mlsmpmInitBoxSizes[paramsIdx]
				mlsmpmSimulator.reset(mlsmpmNumParticleParams[paramsIdx], initBoxSize)
				camera.reset(canvasElement, mlsmpmInitDistances[paramsIdx], [initBoxSize[0] / 2, initBoxSize[1] / 4, initBoxSize[2] / 2],
					mlsmpmFov, mlsmpmZoomRate)
			}
			realBoxSize = [...initBoxSize]
			let slider = document.getElementById("slider") as HTMLInputElement
			slider.value = "100"
			numberButtonPressed = false
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
		realBoxSize[2] = initBoxSize[2] * boxWidthRatio
		if (boidsFl) {
			boidsSimulator.changeBoxSize(realBoxSize)
		} else if (sphFl) {
			sphSimulator.changeBoxSize(realBoxSize)
		} else {
			mlsmpmSimulator.changeBoxSize(realBoxSize)
		}
		device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformsValues)

		const commandEncoder = device.createCommandEncoder()
		// 計算のためのパス
		if (boidsFl) {
			boidsSimulator.execute(commandEncoder)
			boidsRenderer.execute(context, commandEncoder, boidsSimulator.numParticles, sphereRenderFl)
		} else if (sphFl) {
			sphSimulator.execute(commandEncoder)
			sphRenderer.execute(context, commandEncoder, sphSimulator.numParticles, sphereRenderFl)
		} else {
			mlsmpmSimulator.execute(commandEncoder)
			mlsmpmRenderer.execute(context, commandEncoder, mlsmpmSimulator.numParticles, sphereRenderFl)
		}

		device.queue.submit([commandEncoder.finish()])
		const end = performance.now();
		// console.log(`js: ${(end - start).toFixed(1)}ms`);

		requestAnimationFrame(frame)
	}
	requestAnimationFrame(frame)

	const waterColorInput = document.getElementById('water-color') as HTMLInputElement;
	const transparencyInput = document.getElementById('transparency') as HTMLInputElement;
	const reflectivityInput = document.getElementById('reflectivity') as HTMLInputElement;
	const waveHeightInput = document.getElementById('wave-height') as HTMLInputElement;

	waterColorInput.addEventListener('input', (e) => {
		const color = (e.target as HTMLInputElement).value;
		const r = parseInt(color.substr(1, 2), 16) / 255;
		const g = parseInt(color.substr(3, 2), 16) / 255;
		const b = parseInt(color.substr(5, 2), 16) / 255;
		waterAppearanceViews.color.set([r, g, b, 1.0]);
		device.queue.writeBuffer(waterAppearanceBuffer, 0, waterAppearanceValues);
	});

	transparencyInput.addEventListener('input', (e) => {
		waterAppearanceViews.transparency[0] = parseInt((e.target as HTMLInputElement).value) / 100;
		device.queue.writeBuffer(waterAppearanceBuffer, 16, waterAppearanceViews.transparency);
	});

	reflectivityInput.addEventListener('input', (e) => {
		waterAppearanceViews.reflectivity[0] = parseInt((e.target as HTMLInputElement).value) / 100;
		device.queue.writeBuffer(waterAppearanceBuffer, 20, waterAppearanceViews.reflectivity);
	});

	waveHeightInput.addEventListener('input', (e) => {
		waterAppearanceViews.waveHeight[0] = parseInt((e.target as HTMLInputElement).value) / 100;
		device.queue.writeBuffer(waterAppearanceBuffer, 24, waterAppearanceViews.waveHeight);
	});

	// Environment selector event listener
	const environmentSelect = document.getElementById('environment-select') as HTMLSelectElement;
	environmentSelect.addEventListener('change', (e) => {
		currentEnvironmentIndex = parseInt((e.target as HTMLSelectElement).value);
		// Update renderers with new environment
		if (currentEnvironmentIndex === -1) {
			// Use white background (no environment map)
			mlsmpmRenderer.updateEnvironment(null);
			sphRenderer.updateEnvironment(null);
			boidsRenderer.updateEnvironment(null);
		} else {
			mlsmpmRenderer.updateEnvironment(cubemapTextureViews[currentEnvironmentIndex]);
			sphRenderer.updateEnvironment(cubemapTextureViews[currentEnvironmentIndex]);
			boidsRenderer.updateEnvironment(cubemapTextureViews[currentEnvironmentIndex]);
		}
	});
}

main()
