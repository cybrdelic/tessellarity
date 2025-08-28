/// <reference types="@webgpu/types" />

import { UnifiedResourceManager, UNIFIED_BINDING_SLOTS } from './UnifiedBindings';

/**
 * ShaderIntrospector
 * Enhanced runtime shader breadcrumb & metrics capture for WebGPU with unified binding layout.
 *
 * Now uses the stable binding layout system to eliminate pipeline rebuild issues.
 * Always binds to slot 15 (@group(0) @binding(15)) as defined in the unified layout.
 * Moved from slot 7 to avoid conflict with existing EffectsToggle usage in fluid shaders.
 *
 * Slot Layout (32 bytes) per index i:
 * 0  - 3  u32 frame
 * 4  - 7  u32 errorCode
 * 8  - 11 u32 subjectId (pixel / particle / cell / etc.)
 * 12 - 19 8 x u8 shaderTag (ASCII, zero padded)
 * 20 - 27 8 x u8 stageTag  (ASCII, zero padded)
 * 28 - 31 f32 value (generic metric / magnitude / debug scalar)
 *
 * WGSL arrays align to 16-byte boundaries; packed u8 arrays inside struct
 * are valid so long as total struct size is multiple of 16. 32 bytes satisfies.
 */
export interface IntrospectionRecord {
  frame: number;
  errorCode: number;
  subjectId: number;
  shader: string; // up to 8 chars
  stage: string;  // up to 8 chars
  value: number;
}

export interface ShaderIntrospectorOptions {
  slotCount?: number;        // default 1024
  pollIntervalMs?: number;   // for internal polling (if used by attachDebugPanel)
  maxDisplay?: number;       // max entries retained for panel
  enableLogging?: boolean;   // reserved for future Node JSONL logging
  useUnifiedBindings?: boolean; // whether to integrate with UnifiedResourceManager
}

export class ShaderIntrospector {
  private device: GPUDevice;
  private slotCount: number;
  private bufferSize: number;
  private introspectBuffer: GPUBuffer;
  private readbackBuffer: GPUBuffer;
  private options: ShaderIntrospectorOptions;
  private lastParsed: IntrospectionRecord[] = [];
  private pollingHandle: number | null = null;
  private resourceManager: UnifiedResourceManager | null = null;

  constructor(device: GPUDevice, options: ShaderIntrospectorOptions = {}) {
    this.device = device;
    this.options = { useUnifiedBindings: true, ...options };
    this.slotCount = options.slotCount ?? 1024;
    // Ring buffer structure: 4 bytes (atomic head) + padding to 16-byte boundary + 32 bytes per slot
    // The atomic head needs to be at the start, followed by the slots array
    // head: 4 bytes + 12 bytes padding (to reach 16-byte boundary) + slots: 32 * slotCount
    this.bufferSize = 16 + this.slotCount * 32; // 16 bytes for head+padding, then slots

    this.introspectBuffer = device.createBuffer({
      size: this.bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'introspectBuffer'
    });

    this.readbackBuffer = device.createBuffer({
      size: this.bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'introspectReadback'
    });

    // Auto-register with unified resource manager if enabled
    if (this.options.useUnifiedBindings) {
      this.resourceManager = new UnifiedResourceManager(device);
      this.resourceManager.setResource('introspection', this.introspectBuffer);
    }
  }

  /**
   * Returns GPU buffer to bind into a bind group.
   * For manual binding setups (backwards compatibility).
   */
  getStorageBuffer(): GPUBuffer { return this.introspectBuffer; }

  /**
   * Get the unified resource manager (if using unified bindings).
   * This provides access to the stable bind group layout.
   */
  getResourceManager(): UnifiedResourceManager | null {
    return this.resourceManager;
  }

  /**
   * Get the stable bind group layout (if using unified bindings).
   */
  getBindGroupLayout(): GPUBindGroupLayout | null {
    return this.resourceManager?.getBindGroupLayout() ?? null;
  }

  /**
   * Get the unified bind group with introspection buffer included.
   * This bind group uses the stable layout and can be used across multiple pipelines.
   */
  getUnifiedBindGroup(): GPUBindGroup | null {
    return this.resourceManager?.getBindGroup() ?? null;
  }

  /**
   * Encode copy from GPU-visible storage buffer to readback buffer.
   */
  encodeCopy(encoder: GPUCommandEncoder) {
    encoder.copyBufferToBuffer(this.introspectBuffer, 0, this.readbackBuffer, 0, this.bufferSize);
  }

  /**
   * Map, parse, and unmap readback buffer. Non-blocking errors are caught.
   * Updated to handle atomic ring buffer structure.
   */
  async fetch(): Promise<IntrospectionRecord[]> {
    try {
      await this.readbackBuffer.mapAsync(GPUMapMode.READ);
      const u8 = new Uint8Array(this.readbackBuffer.getMappedRange());
      const records: IntrospectionRecord[] = [];
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      
      // Read the atomic head to know how many entries have been written
      const head = dv.getUint32(0, true);
      const slotsStart = 16; // Skip 16 bytes (atomic head + padding to alignment)
      
      // Parse only up to 'head' entries, but cap at slotCount for safety
      const entriesToRead = Math.min(head, this.slotCount);
      
      for (let i = 0; i < entriesToRead; i++) {
        const base = slotsStart + i * 32;
        const frame = dv.getUint32(base + 0, true);
        const errorCode = dv.getUint32(base + 4, true);
        const subjectId = dv.getUint32(base + 8, true);
        
        // Skip empty slots fast
        if (frame === 0 && errorCode === 0 && subjectId === 0) continue;
        
        // Read packed shader and stage tags (each stored as 2 u32s)
        const shaderTag0 = dv.getUint32(base + 12, true);
        const shaderTag1 = dv.getUint32(base + 16, true);
        const stageTag0 = dv.getUint32(base + 20, true);
        const stageTag1 = dv.getUint32(base + 24, true);
        const value = dv.getFloat32(base + 28, true);
        
        // Unpack the tags back to ASCII strings
        const shader = this.unpackTag(shaderTag0, shaderTag1);
        const stage = this.unpackTag(stageTag0, stageTag1);
        
        records.push({ frame, errorCode, subjectId, shader, stage, value });
      }
      
      this.readbackBuffer.unmap();
      this.lastParsed = records;
      return records;
    } catch (err) {
      console.warn('[ShaderIntrospector] fetch failed:', err);
      try { this.readbackBuffer.unmap(); } catch {}
      return this.lastParsed;
    }
  }

  private unpackTag(tag0: number, tag1: number): string {
    let result = '';
    
    // Unpack first u32 (4 characters)
    for (let i = 0; i < 4; i++) {
      const c = (tag0 >> (i * 8)) & 0xFF;
      if (c === 0) break;
      if (c >= 32 && c < 127) result += String.fromCharCode(c);
    }
    
    // Unpack second u32 (4 more characters)
    for (let i = 0; i < 4; i++) {
      const c = (tag1 >> (i * 8)) & 0xFF;
      if (c === 0) break;
      if (c >= 32 && c < 127) result += String.fromCharCode(c);
    }
    
    return result;
  }

  private readAscii(src: Uint8Array, offset: number, len: number): string {
    let out = '';
    for (let i = 0; i < len; i++) {
      const c = src[offset + i];
      if (c === undefined || c === 0) break;
      if (c >= 32 && c < 127) out += String.fromCharCode(c);
    }
    return out;
  }

  /** Attach a minimal live panel (if document present). */
  attachDebugPanel(containerId: string = 'introspection-panel') {
    if (typeof document === 'undefined') return;
    let el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = containerId;
      Object.assign(el.style, {
        position: 'fixed', top: '8px', right: '8px', width: '360px',
        maxHeight: '340px', overflow: 'auto', background: 'rgba(0,0,0,0.75)',
        color: '#eee', font: '12px monospace', padding: '8px', border: '1px solid #444',
        borderRadius: '6px', zIndex: '9999'
      });
      document.body.appendChild(el);
    }
    const header = document.createElement('div');
    header.textContent = 'Shader Introspection (live)';
    header.style.fontWeight = 'bold';
    el.appendChild(header);
    const pre = document.createElement('pre');
    pre.style.marginTop = '6px';
    el.appendChild(pre);

    const interval = this.options.pollIntervalMs ?? 500;
    const maxDisplay = this.options.maxDisplay ?? 50;
    const tick = async () => {
      const recs = await this.fetch();
      const recent = recs.slice(-maxDisplay);
      pre.textContent = recent.map(r => `F${r.frame} EC${r.errorCode} ID${r.subjectId} ${r.shader}/${r.stage} v=${r.value.toFixed(3)}`).join('\n') || 'No data';
    };
    this.pollingHandle = window.setInterval(tick, interval);
  }

  detachDebugPanel() {
    if (this.pollingHandle) {
      clearInterval(this.pollingHandle);
      this.pollingHandle = null;
    }
  }

  /**
   * Create a compute pipeline with the unified binding layout.
   * This eliminates the need for manual bind group layout management.
   */
  createComputePipeline(shaderModule: GPUShaderModule, entryPoint: string = 'main'): GPUComputePipeline | null {
    if (!this.resourceManager) {
      console.warn('[ShaderIntrospector] Unified bindings not enabled, use manual pipeline creation');
      return null;
    }

    return this.device.createComputePipeline({
      label: `IntrospectionComputePipeline_${entryPoint}`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.resourceManager.getBindGroupLayout()],
      }),
      compute: {
        module: shaderModule,
        entryPoint,
      },
    });
  }

  /**
   * Create a render pipeline with the unified binding layout.
   */
  createRenderPipeline(
    vertexModule: GPUShaderModule,
    fragmentModule: GPUShaderModule,
    format: GPUTextureFormat,
    vertexEntry: string = 'vs_main',
    fragmentEntry: string = 'fs_main'
  ): GPURenderPipeline | null {
    if (!this.resourceManager) {
      console.warn('[ShaderIntrospector] Unified bindings not enabled, use manual pipeline creation');
      return null;
    }

    return this.device.createRenderPipeline({
      label: `IntrospectionRenderPipeline_${fragmentEntry}`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.resourceManager.getBindGroupLayout()],
      }),
      vertex: {
        module: vertexModule,
        entryPoint: vertexEntry,
      },
      fragment: {
        module: fragmentModule,
        entryPoint: fragmentEntry,
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }
}