import { renderUniformsViews, waterAppearanceViews } from '../../common';

/// <reference types="@webgpu/types" />

export interface WebGPUInitResult {
  device: GPUDevice;
  context: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
}

/**
 * Initialize WebGPU device + context and configure the canvas.
 */
export async function initWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUInitResult> {
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No suitable GPU adapter found');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new Error('Failed to acquire WebGPU context');

  // Allow dynamic DPR experimentation (currently fixed lower for perf)
  let devicePixelRatio = 0.7; // TODO: expose via a simple UI toggle later
  canvas.width = devicePixelRatio * canvas.clientWidth;
  canvas.height = devicePixelRatio * canvas.clientHeight;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
  });

  // Basic uniform defaults that previously lived in main.ts
  renderUniformsViews.texel_size.set([1 / canvas.width, 1 / canvas.height]);
  // Water defaults so first frame is not black before UI interaction
  waterAppearanceViews.color.set([0.2, 0.6, 1.0, 1.0]);
  waterAppearanceViews.transparency[0] = 0.3;
  waterAppearanceViews.reflectivity[0] = 0.4;
  waterAppearanceViews.waveHeight[0] = 0.0;

  return { device, context, presentationFormat };
}

export interface LoadedEnvironment {
  name: string;
  view: GPUTextureView;
}

/**
 * Load a set of cubemap environments (robust to partial failure). Returns array of views.
 */
export async function loadEnvironmentCubemaps(device: GPUDevice): Promise<LoadedEnvironment[]> {
  const park3Med = [
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/px.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/nx.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/py.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/ny.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/pz.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/nz.jpg'
  ];
  const definitions = [
    { name: 'Industrial Sunset', files: park3Med },
    { name: 'Venice Sunset', files: [
      'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/px.jpg',
      'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/nx.jpg',
      'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/py.jpg',
      'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/ny.jpg',
      'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/pz.jpg',
      'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/nz.jpg'
    ] },
    { name: 'Forest', files: [
      'https://threejs.org/examples/textures/cube/pisa/px.png',
      'https://threejs.org/examples/textures/cube/pisa/nx.png',
      'https://threejs.org/examples/textures/cube/pisa/py.png',
      'https://threejs.org/examples/textures/cube/pisa/ny.png',
      'https://threejs.org/examples/textures/cube/pisa/pz.png',
      'https://threejs.org/examples/textures/cube/pisa/nz.png'
    ] }
  ];

  const results: LoadedEnvironment[] = [];
  for (let i = 0; i < definitions.length; i++) {
    const def = definitions[i]!;
    try {
      const bitmaps = await Promise.all(def.files.map(async src => {
        const resp = await fetch(src);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return createImageBitmap(await resp.blob());
      }));
      // Guard against partial failure returning empty array (should not happen if no throw above)
      if (bitmaps.length !== 6 || !bitmaps[0]) {
        throw new Error(`Incomplete cubemap load for ${def.name}: got ${bitmaps.length} faces`);
      }
      const first = bitmaps[0]!;
      const tex = device.createTexture({
        dimension: '2d',
        size: [first.width, first.height, 6],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      bitmaps.forEach((bmp, face) => {
        device.queue.copyExternalImageToTexture(
          { source: bmp },
          { texture: tex, origin: [0, 0, face] },
          [bmp.width, bmp.height]
        );
      });
      results.push({ name: def.name, view: tex.createView({ dimension: 'cube' }) });
    } catch (e) {
      // If first fails we propagate, otherwise duplicate first as fallback
      if (!results.length) throw e;
      console.warn('Failed to load env', def.name, e);
      results.push({ name: def.name + ' (fallback)', view: results[0]!.view });
    }
  }
  return results;
}
