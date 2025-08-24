import { boidsParticleStructSize } from '../boids/boids';
import { Camera } from '../camera';
import { compositionParamsValues, debugModeValues, effectParametersValues, effectsToggleValues, lightingControlsValues, renderUniformsValues, renderUniformsViews, waterAppearanceValues, waterAppearanceViews } from '../common';
import { MLSMPMSimulator, mlsmpmParticleStructSize } from '../mls-mpm/mls-mpm';
import { FluidRenderer } from '../render/fluidRender';
import { SkyboxRenderer } from '../render/SkyboxRenderer';
import { sphParticleStructSize } from '../sph/sph';
import { DebugHUD } from './debug/hud';

/// <reference types="@webgpu/types" />

async function initDevice(canvas: HTMLCanvasElement) {
  if(!navigator.gpu) throw new Error('WebGPU not supported');
  const adapter = await navigator.gpu.requestAdapter();
  if(!adapter) throw new Error('No adapter');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({device, format, alphaMode:'premultiplied'});
  return {device, context, format};
}

async function loadEnv(device: GPUDevice) {
  // Single lightweight env (park3) to keep minimal
  const urls = [
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/px.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/nx.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/py.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/ny.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/pz.jpg',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/nz.jpg'
  ];
  const bitmaps = await Promise.all(urls.map(async u=>createImageBitmap(await (await fetch(u)).blob())));
  if(bitmaps.length !== 6) throw new Error('Env load failed');
  const first = bitmaps[0]!;
  const tex = device.createTexture({
    dimension:'2d',
    size:[first.width, first.height, 6],
    format:'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT
  });
  bitmaps.forEach((bmp,i)=>{
    device.queue.copyExternalImageToTexture({source:bmp},{texture:tex,origin:[0,0,i]},[bmp.width,bmp.height]);
  });
  return tex.createView({dimension:'cube'});
}

function writeInitialUniforms(device: GPUDevice, waterAppearanceBuffer: GPUBuffer, debugModeBuffer: GPUBuffer, effectsToggleBuffer: GPUBuffer, lightingControlsBuffer: GPUBuffer, effectParametersBuffer: GPUBuffer, compositionParamsBuffer: GPUBuffer) {
  renderUniformsViews.texel_size.set([1/ (window.innerWidth), 1/(window.innerHeight)]);
  waterAppearanceViews.color.set([0.2,0.6,1.0,1.0]);
  waterAppearanceViews.transparency[0]=0.3;
  waterAppearanceViews.reflectivity[0]=0.4;
  waterAppearanceViews.waveHeight[0]=0.0;
  device.queue.writeBuffer(waterAppearanceBuffer,0,waterAppearanceValues);
  device.queue.writeBuffer(debugModeBuffer,0,debugModeValues);
  device.queue.writeBuffer(effectsToggleBuffer,0,effectsToggleValues);
  device.queue.writeBuffer(lightingControlsBuffer,0,lightingControlsValues);
  device.queue.writeBuffer(effectParametersBuffer,0,effectParametersValues);
  device.queue.writeBuffer(compositionParamsBuffer,0,compositionParamsValues);
}

async function main() {
  const canvas = document.getElementById('fluidCanvas') as HTMLCanvasElement;
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const {device, context, format} = await initDevice(canvas);

  // Buffers
  const maxStruct = Math.max(mlsmpmParticleStructSize, sphParticleStructSize, boidsParticleStructSize);
  const particleBuffer = device.createBuffer({size:maxStruct*500000, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const posvelBuffer = device.createBuffer({size:32*500000, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const renderUniformBuffer = device.createBuffer({size: renderUniformsValues.byteLength, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const waterAppearanceBuffer = device.createBuffer({size: waterAppearanceValues.byteLength, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const debugModeBuffer = device.createBuffer({size: debugModeValues.byteLength, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const effectsToggleBuffer = device.createBuffer({size: effectsToggleValues.byteLength, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const lightingControlsBuffer = device.createBuffer({size: lightingControlsValues.byteLength, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const effectParametersBuffer = device.createBuffer({size: effectParametersValues.byteLength, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const compositionParamsBuffer = device.createBuffer({size: compositionParamsValues.byteLength, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});

  writeInitialUniforms(device, waterAppearanceBuffer, debugModeBuffer, effectsToggleBuffer, lightingControlsBuffer, effectParametersBuffer, compositionParamsBuffer);

  // Simulators (start with MLS-MPM only for minimal; others optional)
  const mlsmpmSimulator = new MLSMPMSimulator(particleBuffer, posvelBuffer, 1.2, device);
  mlsmpmSimulator.reset(70000, [40,30,60]);

  const envView = await loadEnv(device);
  const renderer = new FluidRenderer(device, canvas, format, 0.6, 45*Math.PI/180, posvelBuffer, renderUniformBuffer, envView, waterAppearanceBuffer, debugModeBuffer, effectsToggleBuffer, lightingControlsBuffer, effectParametersBuffer, compositionParamsBuffer);
  const skybox = new SkyboxRenderer(device, format, renderUniformBuffer, envView);

  const depthTex = device.createTexture({size:[canvas.width, canvas.height], format:'depth24plus', usage:GPUTextureUsage.RENDER_ATTACHMENT});
  const depthView = depthTex.createView();

  const camera = new Camera(canvas);
  camera.reset(canvas, 70, [20, 30/4, 30], 45*Math.PI/180, 1.5);

  const hud = new DebugHUD();
  let last = performance.now();

  function frame(){
    const now = performance.now();
    const dt = now-last; last=now;
    const encoder = device.createCommandEncoder();

    mlsmpmSimulator.execute(encoder);

    const passSky: GPURenderPassDescriptor = {colorAttachments:[{view: context.getCurrentTexture().createView(), clearValue:{r:0,g:0,b:0,a:1}, loadOp:'clear', storeOp:'store'}], depthStencilAttachment:{view:depthView, depthClearValue:1, depthLoadOp:'clear', depthStoreOp:'store'}};
    const rpass = encoder.beginRenderPass(passSky);
    skybox.render(rpass); rpass.end();

    renderer.execute(context, encoder, mlsmpmSimulator.numParticles, false);

    device.queue.submit([encoder.finish()]);
    hud.tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch(e=>console.error(e));
