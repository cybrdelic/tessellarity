/**
 * CPU-side Diagnostics with Error Scopes
 * 
 * Implements GPU error tracking and per-pass limit checks as suggested
 * to provide runtime diagnostics when pipeline creation fails.
 */

export interface DiagnosticsEvent {
  timestamp: number;
  type: 'error' | 'validation' | 'warning' | 'info';
  pass: string;
  message: string;
  details?: any;
}

export interface PassLimits {
  storageBuffersCompute: number;
  storageBuffersFragment: number;
  uniformBuffers: number;
  textures: number;
  samplers: number;
}

export const WEBGPU_LIMITS: PassLimits = {
  storageBuffersCompute: 8,
  storageBuffersFragment: 8,
  uniformBuffers: 16,
  textures: 16,
  samplers: 16,
};

export class GPUDiagnostics {
  private device: GPUDevice;
  private events: DiagnosticsEvent[] = [];
  private maxEvents: number = 1000;
  private onEvent?: (event: DiagnosticsEvent) => void;
  
  constructor(device: GPUDevice, options: { maxEvents?: number; onEvent?: (event: DiagnosticsEvent) => void } = {}) {
    this.device = device;
    this.maxEvents = options.maxEvents ?? 1000;
    this.onEvent = options.onEvent;
  }
  
  /**
   * Wrap pipeline creation with error scope
   */
  async createComputePipelineWithDiagnostics(
    descriptor: GPUComputePipelineDescriptor,
    passName: string
  ): Promise<GPUComputePipeline | null> {
    this.device.pushErrorScope('validation');
    this.device.pushErrorScope('out-of-memory');
    this.device.pushErrorScope('internal');
    
    let pipeline: GPUComputePipeline;
    try {
      pipeline = this.device.createComputePipeline(descriptor);
    } catch (error) {
      this.logEvent('error', passName, `Pipeline creation failed: ${error}`, { descriptor, error });
      return null;
    }
    
    // Check for errors
    const internalError = await this.device.popErrorScope();
    const memoryError = await this.device.popErrorScope();
    const validationError = await this.device.popErrorScope();
    
    if (validationError) {
      this.logEvent('error', passName, `Validation error: ${validationError.message}`, { error: validationError });
      return null;
    }
    
    if (memoryError) {
      this.logEvent('error', passName, `Out of memory: ${memoryError.message}`, { error: memoryError });
      return null;
    }
    
    if (internalError) {
      this.logEvent('error', passName, `Internal error: ${internalError.message}`, { error: internalError });
      return null;
    }
    
    this.logEvent('info', passName, 'Compute pipeline created successfully');
    return pipeline;
  }
  
  /**
   * Wrap render pipeline creation with error scope
   */
  async createRenderPipelineWithDiagnostics(
    descriptor: GPURenderPipelineDescriptor,
    passName: string
  ): Promise<GPURenderPipeline | null> {
    this.device.pushErrorScope('validation');
    this.device.pushErrorScope('out-of-memory');
    this.device.pushErrorScope('internal');
    
    let pipeline: GPURenderPipeline;
    try {
      pipeline = this.device.createRenderPipeline(descriptor);
    } catch (error) {
      this.logEvent('error', passName, `Render pipeline creation failed: ${error}`, { descriptor, error });
      return null;
    }
    
    // Check for errors
    const internalError = await this.device.popErrorScope();
    const memoryError = await this.device.popErrorScope();
    const validationError = await this.device.popErrorScope();
    
    if (validationError) {
      this.logEvent('error', passName, `Validation error: ${validationError.message}`, { error: validationError });
      return null;
    }
    
    if (memoryError) {
      this.logEvent('error', passName, `Out of memory: ${memoryError.message}`, { error: memoryError });
      return null;
    }
    
    if (internalError) {
      this.logEvent('error', passName, `Internal error: ${internalError.message}`, { error: internalError });
      return null;
    }
    
    this.logEvent('info', passName, 'Render pipeline created successfully');
    return pipeline;
  }
  
  /**
   * Wrap bind group layout creation with error scope and limit checking
   */
  async createBindGroupLayoutWithDiagnostics(
    descriptor: GPUBindGroupLayoutDescriptor,
    passName: string
  ): Promise<GPUBindGroupLayout | null> {
    // Pre-validate against limits
    const limitViolations = this.checkBindGroupLayoutLimits(descriptor);
    if (limitViolations.length > 0) {
      for (const violation of limitViolations) {
        this.logEvent('error', passName, violation);
      }
      return null;
    }
    
    this.device.pushErrorScope('validation');
    this.device.pushErrorScope('out-of-memory');
    this.device.pushErrorScope('internal');
    
    let layout: GPUBindGroupLayout;
    try {
      layout = this.device.createBindGroupLayout(descriptor);
    } catch (error) {
      this.logEvent('error', passName, `Bind group layout creation failed: ${error}`, { descriptor, error });
      return null;
    }
    
    // Check for errors
    const internalError = await this.device.popErrorScope();
    const memoryError = await this.device.popErrorScope();
    const validationError = await this.device.popErrorScope();
    
    if (validationError) {
      this.logEvent('error', passName, `Validation error: ${validationError.message}`, { error: validationError });
      return null;
    }
    
    if (memoryError) {
      this.logEvent('error', passName, `Out of memory: ${memoryError.message}`, { error: memoryError });
      return null;
    }
    
    if (internalError) {
      this.logEvent('error', passName, `Internal error: ${internalError.message}`, { error: internalError });
      return null;
    }
    
    this.logEvent('info', passName, 'Bind group layout created successfully');
    return layout;
  }
  
  /**
   * Check bind group layout against WebGPU limits
   */
  private checkBindGroupLayoutLimits(descriptor: GPUBindGroupLayoutDescriptor): string[] {
    const violations: string[] = [];
    let storageBuffersCompute = 0;
    let storageBuffersFragment = 0;
    let uniformBuffers = 0;
    let textures = 0;
    let samplers = 0;
    
    for (const entry of descriptor.entries) {
      if (entry.buffer) {
        if (entry.buffer.type === 'storage' || entry.buffer.type === 'read-only-storage') {
          if (entry.visibility & GPUShaderStage.COMPUTE) {
            storageBuffersCompute++;
          }
          if (entry.visibility & GPUShaderStage.FRAGMENT) {
            storageBuffersFragment++;
          }
        } else if (entry.buffer.type === 'uniform') {
          uniformBuffers++;
        }
      } else if (entry.texture) {
        textures++;
      } else if (entry.sampler) {
        samplers++;
      }
    }
    
    if (storageBuffersCompute > WEBGPU_LIMITS.storageBuffersCompute) {
      violations.push(`Storage buffers in compute stage (${storageBuffersCompute}) exceeds limit (${WEBGPU_LIMITS.storageBuffersCompute})`);
    }
    
    if (storageBuffersFragment > WEBGPU_LIMITS.storageBuffersFragment) {
      violations.push(`Storage buffers in fragment stage (${storageBuffersFragment}) exceeds limit (${WEBGPU_LIMITS.storageBuffersFragment})`);
    }
    
    if (uniformBuffers > WEBGPU_LIMITS.uniformBuffers) {
      violations.push(`Uniform buffers (${uniformBuffers}) exceeds limit (${WEBGPU_LIMITS.uniformBuffers})`);
    }
    
    if (textures > WEBGPU_LIMITS.textures) {
      violations.push(`Textures (${textures}) exceeds limit (${WEBGPU_LIMITS.textures})`);
    }
    
    if (samplers > WEBGPU_LIMITS.samplers) {
      violations.push(`Samplers (${samplers}) exceeds limit (${WEBGPU_LIMITS.samplers})`);
    }
    
    return violations;
  }
  
  /**
   * Wrap command submission with error scope
   */
  async submitCommandsWithDiagnostics(
    commands: GPUCommandBuffer[],
    passName: string
  ): Promise<boolean> {
    this.device.pushErrorScope('validation');
    this.device.pushErrorScope('out-of-memory');
    this.device.pushErrorScope('internal');
    
    try {
      this.device.queue.submit(commands);
    } catch (error) {
      this.logEvent('error', passName, `Command submission failed: ${error}`, { error });
      return false;
    }
    
    // Check for errors
    const internalError = await this.device.popErrorScope();
    const memoryError = await this.device.popErrorScope();
    const validationError = await this.device.popErrorScope();
    
    if (validationError) {
      this.logEvent('error', passName, `Validation error during submission: ${validationError.message}`, { error: validationError });
      return false;
    }
    
    if (memoryError) {
      this.logEvent('error', passName, `Out of memory during submission: ${memoryError.message}`, { error: memoryError });
      return false;
    }
    
    if (internalError) {
      this.logEvent('error', passName, `Internal error during submission: ${internalError.message}`, { error: internalError });
      return false;
    }
    
    return true;
  }
  
  /**
   * Log a diagnostics event
   */
  private logEvent(type: DiagnosticsEvent['type'], pass: string, message: string, details?: any) {
    const event: DiagnosticsEvent = {
      timestamp: performance.now(),
      type,
      pass,
      message,
      details,
    };
    
    this.events.push(event);
    
    // Trim events if we exceed maxEvents
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Log to console
    const prefix = `[GPU:${pass}]`;
    switch (type) {
      case 'error':
        console.error(prefix, message, details);
        break;
      case 'warning':
        console.warn(prefix, message, details);
        break;
      case 'info':
        console.log(prefix, message);
        break;
      default:
        console.log(prefix, message, details);
    }
    
    // Call event handler if provided
    if (this.onEvent) {
      this.onEvent(event);
    }
  }
  
  /**
   * Get all events
   */
  getEvents(): DiagnosticsEvent[] {
    return [...this.events];
  }
  
  /**
   * Get events for a specific pass
   */
  getEventsForPass(passName: string): DiagnosticsEvent[] {
    return this.events.filter(event => event.pass === passName);
  }
  
  /**
   * Get events of a specific type
   */
  getEventsByType(type: DiagnosticsEvent['type']): DiagnosticsEvent[] {
    return this.events.filter(event => event.type === type);
  }
  
  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
  }
  
  /**
   * Attach a debug panel for CPU diagnostics
   */
  attachDebugPanel(containerId: string = 'gpu-diagnostics-panel'): void {
    if (typeof document === 'undefined') return;
    
    let el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = containerId;
      Object.assign(el.style, {
        position: 'fixed', 
        top: '8px', 
        left: '8px', 
        width: '400px',
        maxHeight: '300px', 
        overflow: 'auto', 
        background: 'rgba(0,0,0,0.75)',
        color: '#eee', 
        font: '12px monospace', 
        padding: '8px', 
        border: '1px solid #444',
        borderRadius: '6px', 
        zIndex: 9998
      });
      document.body.appendChild(el);
    }
    
    const header = document.createElement('div');
    header.textContent = 'GPU Diagnostics (CPU-side)';
    header.style.fontWeight = 'bold';
    el.appendChild(header);
    
    const content = document.createElement('div');
    content.style.marginTop = '6px';
    el.appendChild(content);
    
    // Update function
    const updatePanel = () => {
      const recentEvents = this.events.slice(-20); // Show last 20 events
      content.innerHTML = recentEvents.map(event => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        const typeIcon = event.type === 'error' ? '🔴' : event.type === 'warning' ? '🟡' : '🟢';
        return `${typeIcon} ${time} [${event.pass}] ${event.message}`;
      }).join('<br>') || 'No events';
    };
    
    // Set up event listener
    this.onEvent = updatePanel;
    updatePanel(); // Initial update
  }
}