/// <reference types="@webgpu/types" />

/**
 * ShaderIntrospector
 * MVP runtime shader breadcrumb & metrics capture for WebGPU.
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

  constructor(device: GPUDevice, options: ShaderIntrospectorOptions = {}) {
    this.device = device;
    this.options = options;
    this.slotCount = options.slotCount ?? 1024;
    // 32 bytes per slot
    this.bufferSize = this.slotCount * 32;

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
  }

  /**
   * Returns GPU buffer to bind into a bind group.
   */
  getStorageBuffer(): GPUBuffer { return this.introspectBuffer; }

  /**
   * Encode copy from GPU-visible storage buffer to readback buffer.
   */
  encodeCopy(encoder: GPUCommandEncoder) {
    encoder.copyBufferToBuffer(this.introspectBuffer, 0, this.readbackBuffer, 0, this.bufferSize);
  }

  /**
   * Map, parse, and unmap readback buffer. Non-blocking errors are caught.
   */
  async fetch(): Promise<IntrospectionRecord[]> {
    try {
      await this.readbackBuffer.mapAsync(GPUMapMode.READ);
      const u8 = new Uint8Array(this.readbackBuffer.getMappedRange());
      const records: IntrospectionRecord[] = [];
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      for (let i = 0; i < this.slotCount; i++) {
        const base = i * 32;
        const frame = dv.getUint32(base + 0, true);
        const errorCode = dv.getUint32(base + 4, true);
        const subjectId = dv.getUint32(base + 8, true);
        // Skip empty slots fast
        if (frame === 0 && errorCode === 0 && subjectId === 0) continue;
        const shader = this.readAscii(u8, base + 12, 8);
        const stage  = this.readAscii(u8, base + 20, 8);
        const value  = dv.getFloat32(base + 28, true);
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
}