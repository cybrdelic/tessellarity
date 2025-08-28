/**
 * Separate Compute and Surface Bind Group Layouts
 * 
 * Addresses the WebGPU storage buffer limit (8 storage buffers per compute stage)
 * by splitting bindings into separate layouts for compute and rendering stages.
 * 
 * This replaces the unified layout approach which was hitting the storage buffer limit.
 */

export interface ComputeBindingSlots {
  // Core simulation buffers (storage)
  particles: 0;           // Main particle buffer (storage)
  particlesAux: 1;        // Auxiliary/target particle buffer (storage)
  gridData: 2;            // Grid cell data (storage) 
  positionOutput: 3;      // Position output for rendering (storage)
  introspection: 4;       // ShaderIntrospector buffer (storage) - 5 total storage buffers

  // Uniforms (don't count toward storage limit)
  environment: 5;         // Environment parameters (uniform)
  simulationParams: 6;    // Simulation-specific parameters (uniform)
  boxSize: 7;             // Box size buffer (uniform)
}

export interface SurfaceBindingSlots {
  // Rendering resources
  sampLinear: 0;          // Linear sampler
  texSample: 1;           // Sample texture
  texHeight: 2;           // Height texture
  texPressure: 3;         // Pressure texture
  texNormal: 4;           // Normal texture
  texThickness: 5;        // Thickness texture
  texCubemap: 6;          // Environment cubemap
  
  // Rendering uniforms
  effectsToggle: 7;       // EffectsToggle buffer (uniform) - preserves existing slot
  renderUniforms: 8;      // Rendering uniforms (uniform)
  compositionParams: 9;   // Composition parameters (uniform)
  lightingControls: 10;   // Lighting controls (uniform)
  waterAppearance: 11;    // Water appearance (uniform)
  
  // Introspection for fragment shaders
  introspection: 15;      // ShaderIntrospector buffer (storage) - same slot for consistency
}

export const COMPUTE_BINDING_SLOTS: ComputeBindingSlots = {
  particles: 0,
  particlesAux: 1,
  gridData: 2,
  positionOutput: 3,
  introspection: 4,
  environment: 5,
  simulationParams: 6,
  boxSize: 7,
};

export const SURFACE_BINDING_SLOTS: SurfaceBindingSlots = {
  sampLinear: 0,
  texSample: 1,
  texHeight: 2,
  texPressure: 3,
  texNormal: 4,
  texThickness: 5,
  texCubemap: 6,
  effectsToggle: 7,
  renderUniforms: 8,
  compositionParams: 9,
  lightingControls: 10,
  waterAppearance: 11,
  introspection: 15,
};

/**
 * Create compute bind group layout (≤8 storage buffers)
 */
export function createComputeBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    label: 'ComputeBindGroupLayout',
    entries: [
      // Storage buffers (5 total - well under the 8 limit)
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // introspection
      
      // Uniform buffers (don't count toward storage limit)
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
}

/**
 * Create surface bind group layout (for vertex/fragment shaders)
 */
export function createSurfaceBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    label: 'SurfaceBindGroupLayout',
    entries: [
      // Samplers and textures
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: 'cube' } },
      
      // Uniform buffers
      { binding: 7, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 8, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 9, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 10, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 11, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      
      // Introspection buffer (only 1 storage buffer for fragment stage)
      { binding: 15, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'storage' } },
    ],
  });
}

/**
 * Resource manager for compute pipelines
 */
export class ComputeResourceManager {
  private device: GPUDevice;
  private layout: GPUBindGroupLayout;
  private resources: Map<keyof ComputeBindingSlots, GPUBuffer> = new Map();
  private bindGroup: GPUBindGroup | null = null;
  private needsRebuild = true;
  
  constructor(device: GPUDevice) {
    this.device = device;
    this.layout = createComputeBindGroupLayout(device);
  }
  
  getBindGroupLayout(): GPUBindGroupLayout {
    return this.layout;
  }
  
  setResource(slot: keyof ComputeBindingSlots, buffer: GPUBuffer): void {
    this.resources.set(slot, buffer);
    this.needsRebuild = true;
  }
  
  getBindGroup(): GPUBindGroup {
    if (this.needsRebuild || !this.bindGroup) {
      this.rebuildBindGroup();
    }
    return this.bindGroup!;
  }
  
  private rebuildBindGroup(): void {
    const entries: GPUBindGroupEntry[] = [];
    
    for (const [slotName, slotNumber] of Object.entries(COMPUTE_BINDING_SLOTS)) {
      const resource = this.resources.get(slotName as keyof ComputeBindingSlots);
      if (resource) {
        entries.push({
          binding: slotNumber,
          resource: { buffer: resource },
        });
      }
    }
    
    this.bindGroup = this.device.createBindGroup({
      label: 'ComputeBindGroup',
      layout: this.layout,
      entries,
    });
    
    this.needsRebuild = false;
  }
}

/**
 * Resource manager for surface rendering pipelines
 */
export class SurfaceResourceManager {
  private device: GPUDevice;
  private layout: GPUBindGroupLayout;
  private resources: Map<keyof SurfaceBindingSlots, GPUBuffer | GPUTextureView | GPUSampler> = new Map();
  private bindGroup: GPUBindGroup | null = null;
  private needsRebuild = true;
  
  constructor(device: GPUDevice) {
    this.device = device;
    this.layout = createSurfaceBindGroupLayout(device);
  }
  
  getBindGroupLayout(): GPUBindGroupLayout {
    return this.layout;
  }
  
  setResource(slot: keyof SurfaceBindingSlots, resource: GPUBuffer | GPUTextureView | GPUSampler): void {
    this.resources.set(slot, resource);
    this.needsRebuild = true;
  }
  
  getBindGroup(): GPUBindGroup {
    if (this.needsRebuild || !this.bindGroup) {
      this.rebuildBindGroup();
    }
    return this.bindGroup!;
  }
  
  private rebuildBindGroup(): void {
    const entries: GPUBindGroupEntry[] = [];
    
    for (const [slotName, slotNumber] of Object.entries(SURFACE_BINDING_SLOTS)) {
      const resource = this.resources.get(slotName as keyof SurfaceBindingSlots);
      if (resource) {
        if (resource instanceof GPUBuffer) {
          entries.push({
            binding: slotNumber,
            resource: { buffer: resource },
          });
        } else {
          entries.push({
            binding: slotNumber,
            resource: resource,
          });
        }
      }
    }
    
    this.bindGroup = this.device.createBindGroup({
      label: 'SurfaceBindGroup',
      layout: this.layout,
      entries,
    });
    
    this.needsRebuild = false;
  }
}