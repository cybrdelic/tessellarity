/// <reference types="@webgpu/types" />

/** Integration helper to wire ShaderIntrospector into the render loop. */
import { ShaderIntrospector } from '../ShaderIntrospector';

export class IntrospectionIntegration {
  constructor(private device: GPUDevice, private queue: GPUQueue, private introspector: ShaderIntrospector) {}

  /** Call once per frame (before submit). */
  encode(encoder: GPUCommandEncoder) { this.introspector.encodeCopy(encoder); }

  /** Optional async post-submit processing (fire & forget). */
  async postSubmit() { /* Intentionally minimal now; panel polls itself. */ }
}