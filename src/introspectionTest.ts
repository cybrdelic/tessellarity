/// <reference types="@webgpu/types" />

/**
 * Basic test for the ShaderIntrospector functionality
 * This validates that the core system works without complex integration
 */

import { ShaderIntrospector, IntrospectionRecord } from './core/ShaderIntrospector';

export async function testShaderIntrospector(): Promise<boolean> {
    // Initialize WebGPU
    if (!navigator.gpu) {
        console.error('WebGPU not supported');
        return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error('No WebGPU adapter found');
        return false;
    }

    const device = await adapter.requestDevice();

    try {
        // Create introspector
        const introspector = new ShaderIntrospector(device, { slotCount: 16 });
        
        // Test buffer creation
        const buffer = introspector.getStorageBuffer();
        console.log('✓ Storage buffer created:', buffer.label);

        // Test encoding copy (should not throw)
        const encoder = device.createCommandEncoder();
        introspector.encodeCopy(encoder);
        console.log('✓ Copy encoding works');

        // Test fetch on empty buffer (should return empty array)
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
        
        const records = await introspector.fetch();
        console.log('✓ Fetch completed, records:', records.length);

        // Test debug panel creation (should not throw in browser)
        if (typeof document !== 'undefined') {
            introspector.attachDebugPanel('test-introspection-panel');
            console.log('✓ Debug panel attached');
            
            // Clean up
            introspector.detachDebugPanel();
            const panel = document.getElementById('test-introspection-panel');
            if (panel) {
                panel.remove();
            }
        }

        console.log('✓ All ShaderIntrospector tests passed');
        return true;

    } catch (error) {
        console.error('✗ ShaderIntrospector test failed:', error);
        return false;
    }
}

// Test WGSL compilation (basic syntax check)
export function validateWGSLIntrospection(device: GPUDevice): boolean {
    try {
        // Test that the WGSL introspection helper compiles
        const wgslSource = `
// Minimal test of introspection WGSL
struct IntrospectSlot {
  frame: u32,
  error_code: u32,
  subject_id: u32,
  shader_tag: array<u32,2>,
  stage_tag: array<u32,2>,
  value: f32,
}

@group(0) @binding(0)
var<storage, read_write> introspectBuffer: array<IntrospectSlot, 16>;

fn create_tag_test() -> array<u32,2> {
  var tag: array<u32,2>;
  tag[0] = 116u | (101u << 8u) | (115u << 16u) | (116u << 24u);  // 'test'
  tag[1] = 0u | (0u << 8u) | (0u << 16u) | (0u << 24u);          // '\0\0\0\0'
  return tag;
}

fn create_tag_compute() -> array<u32,2> {
  var tag: array<u32,2>;
  tag[0] = 99u | (111u << 8u) | (109u << 16u) | (112u << 24u);  // 'comp'
  tag[1] = 117u | (116u << 8u) | (101u << 16u) | (0u << 24u);   // 'ute\0'
  return tag;
}

fn set_breadcrumb(idx: u32, frame: u32, error_code: u32, subject: u32, value: f32, shader: array<u32,2>, stage: array<u32,2>) {
  if (idx >= 16u) { return; }
  introspectBuffer[idx].frame = frame;
  introspectBuffer[idx].error_code = error_code;
  introspectBuffer[idx].subject_id = subject;
  introspectBuffer[idx].shader_tag = shader;
  introspectBuffer[idx].stage_tag = stage;
  introspectBuffer[idx].value = value;
}

@compute @workgroup_size(1)
fn test_main() {
  set_breadcrumb(0u, 1u, 0u, 42u, 3.14, create_tag_test(), create_tag_compute());
}
        `;

        const shaderModule = device.createShaderModule({
            code: wgslSource,
            label: 'introspection-test-shader'
        });

        console.log('✓ WGSL introspection syntax is valid');
        return true;

    } catch (error) {
        console.error('✗ WGSL introspection validation failed:', error);
        return false;
    }
}

// Run tests if this file is executed directly
if (typeof window !== 'undefined') {
    window.addEventListener('load', async () => {
        console.log('Running ShaderIntrospector tests...');
        
        const basicTest = await testShaderIntrospector();
        if (!basicTest) return;

        // Test WGSL validation
        if (navigator.gpu) {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                const device = await adapter.requestDevice();
                validateWGSLIntrospection(device);
            }
        }
        
        console.log('All introspection tests completed');
    });
}