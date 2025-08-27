/// <reference types="@webgpu/types" />

/** Integration helper to wire ShaderIntrospector into the render loop with unified bindings. */
import { ShaderIntrospector } from '../ShaderIntrospector';
import { UnifiedResourceManager } from '../UnifiedBindings';

export class IntrospectionIntegration {
  private introspector: ShaderIntrospector;

  constructor(private device: GPUDevice, private queue: GPUQueue, introspector: ShaderIntrospector) {
    this.introspector = introspector;
  }

  /** Call once per frame (before submit). */
  encode(encoder: GPUCommandEncoder) { 
    this.introspector.encodeCopy(encoder); 
  }

  /** Optional async post-submit processing (fire & forget). */
  async postSubmit() { 
    /* Intentionally minimal now; panel polls itself. */ 
  }

  /**
   * Get the unified resource manager for advanced resource binding.
   * Returns null if unified bindings are not enabled.
   */
  getResourceManager(): UnifiedResourceManager | null {
    return this.introspector.getResourceManager();
  }

  /**
   * Get the stable bind group layout for pipeline creation.
   * This layout includes the introspection buffer and can be reused across pipelines.
   */
  getBindGroupLayout(): GPUBindGroupLayout | null {
    return this.introspector.getBindGroupLayout();
  }

  /**
   * Get the unified bind group with introspection buffer ready to use.
   * This bind group uses the stable layout and eliminates manual binding setup.
   */
  getBindGroup(): GPUBindGroup | null {
    return this.introspector.getUnifiedBindGroup();
  }

  /**
   * Helper to create a compute pipeline with introspection support.
   * Uses the unified binding layout automatically.
   */
  createComputePipeline(shaderModule: GPUShaderModule, entryPoint: string = 'main'): GPUComputePipeline | null {
    return this.introspector.createComputePipeline(shaderModule, entryPoint);
  }

  /**
   * Helper to create a render pipeline with introspection support.
   * Uses the unified binding layout automatically.
   */
  createRenderPipeline(
    vertexModule: GPUShaderModule,
    fragmentModule: GPUShaderModule,
    format: GPUTextureFormat,
    vertexEntry: string = 'vs_main',
    fragmentEntry: string = 'fs_main'
  ): GPURenderPipeline | null {
    return this.introspector.createRenderPipeline(
      vertexModule, 
      fragmentModule, 
      format, 
      vertexEntry, 
      fragmentEntry
    );
  }
}