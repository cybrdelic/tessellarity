/**
 * Unified Binding Layout System
 * 
 * Implements a "frozen interface" approach where all possible GPU resource bindings
 * are defined upfront in a stable layout. This eliminates the need to rebuild
 * pipelines when bindings change and provides a centralized resource management system.
 * 
 * All shaders should use these predefined binding slots. Unused slots simply
 * remain empty without causing issues.
 */

export interface UnifiedBindingSlots {
  // Standard simulation buffers
  particles: 0;           // Main particle buffer (read_write)
  particlesAux: 1;        // Auxiliary/target particle buffer (read/read_write)
  environment: 2;         // Environment parameters (uniform)
  simulationParams: 3;    // Simulation-specific parameters (uniform)
  boxSize: 4;             // Box size buffer (uniform)
  
  // Grid-based simulation buffers
  gridData: 5;            // Grid cell data (read_write)
  prefixSum: 6;           // Prefix sum for sorting (read)
  
  // Legacy/external bindings (preserved for compatibility)
  effectsToggle: 7;       // EffectsToggle buffer (uniform) - preserves existing fluid shader bindings
  
  // Rendering and output buffers
  positionOutput: 8;      // Position output for rendering (read_write)
  renderUniforms: 9;      // Rendering uniforms (uniform)
  
  // Future expansion slots (10-14 reserved)
  reserved10: 10;
  reserved11: 11;
  reserved12: 12;
  reserved13: 13;
  reserved14: 14;
  
  // Introspection system (moved to avoid conflicts)
  introspection: 15;      // ShaderIntrospector buffer (read_write) - moved from slot 7 to avoid EffectsToggle conflict
}

export const UNIFIED_BINDING_SLOTS: UnifiedBindingSlots = {
  particles: 0,
  particlesAux: 1,
  environment: 2,
  simulationParams: 3,
  boxSize: 4,
  gridData: 5,
  prefixSum: 6,
  effectsToggle: 7,
  positionOutput: 8,
  renderUniforms: 9,
  reserved10: 10,
  reserved11: 11,
  reserved12: 12,
  reserved13: 13,
  reserved14: 14,
  introspection: 15,
};

/**
 * Resource binding information for each slot
 */
export interface BindingResourceInfo {
  type: 'buffer' | 'texture' | 'sampler';
  usage: 'uniform' | 'storage' | 'read-only-storage';
  visibility: GPUShaderStageFlags;
  optional?: boolean; // Whether this binding is optional and can be null
}

export const UNIFIED_BINDING_LAYOUT: Record<keyof UnifiedBindingSlots, BindingResourceInfo> = {
  particles: {
    type: 'buffer',
    usage: 'storage',
    visibility: GPUShaderStage.COMPUTE,
  },
  particlesAux: {
    type: 'buffer',
    usage: 'storage',
    visibility: GPUShaderStage.COMPUTE,
  },
  environment: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
  },
  simulationParams: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.COMPUTE,
  },
  boxSize: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
  },
  gridData: {
    type: 'buffer',
    usage: 'storage',
    visibility: GPUShaderStage.COMPUTE,
    optional: true,
  },
  prefixSum: {
    type: 'buffer',
    usage: 'read-only-storage',
    visibility: GPUShaderStage.COMPUTE,
    optional: true,
  },
  effectsToggle: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
    optional: true,
  },
  positionOutput: {
    type: 'buffer',
    usage: 'storage',
    visibility: GPUShaderStage.COMPUTE,
    optional: true,
  },
  renderUniforms: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    optional: true,
  },
  reserved10: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.FRAGMENT,
    optional: true,
  },
  reserved11: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.FRAGMENT,
    optional: true,
  },
  reserved12: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.FRAGMENT,
    optional: true,
  },
  reserved13: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.FRAGMENT,
    optional: true,
  },
  reserved14: {
    type: 'buffer',
    usage: 'uniform',
    visibility: GPUShaderStage.FRAGMENT,
    optional: true,
  },
  introspection: {
    type: 'buffer',
    usage: 'storage',
    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
    optional: true,
  },
};

/**
 * Creates the unified bind group layout that all pipelines should use.
 * This layout is frozen and should never change to avoid pipeline rebuilds.
 */
export function createUnifiedBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  const entries: GPUBindGroupLayoutEntry[] = [];
  
  for (const [slotName, binding] of Object.entries(UNIFIED_BINDING_LAYOUT)) {
    const slotNumber = UNIFIED_BINDING_SLOTS[slotName as keyof UnifiedBindingSlots];
    
    let bufferType: GPUBufferBindingType;
    switch (binding.usage) {
      case 'uniform':
        bufferType = 'uniform';
        break;
      case 'storage':
        bufferType = 'storage';
        break;
      case 'read-only-storage':
        bufferType = 'read-only-storage';
        break;
      default:
        throw new Error(`Unknown binding usage: ${binding.usage}`);
    }
    
    entries.push({
      binding: slotNumber,
      visibility: binding.visibility,
      buffer: {
        type: bufferType,
      },
    });
  }
  
  return device.createBindGroupLayout({
    label: 'UnifiedBindGroupLayout',
    entries,
  });
}

/**
 * Resource manager for unified bindings
 */
export class UnifiedResourceManager {
  private device: GPUDevice;
  private layout: GPUBindGroupLayout;
  private resources: Map<keyof UnifiedBindingSlots, GPUBuffer> = new Map();
  private bindGroup: GPUBindGroup | null = null;
  private needsRebuild = true;
  
  constructor(device: GPUDevice) {
    this.device = device;
    this.layout = createUnifiedBindGroupLayout(device);
  }
  
  /**
   * Get the stable bind group layout
   */
  getBindGroupLayout(): GPUBindGroupLayout {
    return this.layout;
  }
  
  /**
   * Set a resource for a specific binding slot
   */
  setResource(slot: keyof UnifiedBindingSlots, buffer: GPUBuffer): void {
    this.resources.set(slot, buffer);
    this.needsRebuild = true;
  }
  
  /**
   * Remove a resource from a specific binding slot
   */
  removeResource(slot: keyof UnifiedBindingSlots): void {
    this.resources.delete(slot);
    this.needsRebuild = true;
  }
  
  /**
   * Get the current bind group, creating it if necessary
   */
  getBindGroup(): GPUBindGroup {
    if (this.needsRebuild || !this.bindGroup) {
      this.rebuildBindGroup();
    }
    return this.bindGroup!;
  }
  
  /**
   * Create a dummy buffer for optional bindings that aren't set
   */
  private createDummyBuffer(info: BindingResourceInfo): GPUBuffer {
    let usage: GPUBufferUsageFlags;
    switch (info.usage) {
      case 'uniform':
        usage = GPUBufferUsage.UNIFORM;
        break;
      case 'storage':
        usage = GPUBufferUsage.STORAGE;
        break;
      case 'read-only-storage':
        usage = GPUBufferUsage.STORAGE;
        break;
      default:
        usage = GPUBufferUsage.STORAGE;
    }
    
    return this.device.createBuffer({
      size: 16, // Minimum buffer size
      usage,
      label: 'DummyBuffer',
    });
  }
  
  /**
   * Rebuild the bind group with current resources
   */
  private rebuildBindGroup(): void {
    const entries: GPUBindGroupEntry[] = [];
    
    for (const [slotName, binding] of Object.entries(UNIFIED_BINDING_LAYOUT)) {
      const slotNumber = UNIFIED_BINDING_SLOTS[slotName as keyof UnifiedBindingSlots];
      const resource = this.resources.get(slotName as keyof UnifiedBindingSlots);
      
      let buffer: GPUBuffer;
      if (resource) {
        buffer = resource;
      } else if (binding.optional) {
        // Create a dummy buffer for optional bindings
        buffer = this.createDummyBuffer(binding);
      } else {
        throw new Error(`Required binding ${slotName} (slot ${slotNumber}) is not set`);
      }
      
      entries.push({
        binding: slotNumber,
        resource: { buffer },
      });
    }
    
    this.bindGroup = this.device.createBindGroup({
      label: 'UnifiedBindGroup',
      layout: this.layout,
      entries,
    });
    
    this.needsRebuild = false;
  }
  
  /**
   * Get resource for a specific slot
   */
  getResource(slot: keyof UnifiedBindingSlots): GPUBuffer | undefined {
    return this.resources.get(slot);
  }
  
  /**
   * Check if a slot has a resource
   */
  hasResource(slot: keyof UnifiedBindingSlots): boolean {
    return this.resources.has(slot);
  }
  
  /**
   * Clear all resources and force rebuild
   */
  clear(): void {
    this.resources.clear();
    this.needsRebuild = true;
  }
}