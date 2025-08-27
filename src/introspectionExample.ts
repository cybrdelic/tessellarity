/// <reference types="@webgpu/types" />

/**
 * Example integration of the Runtime Shader Introspection System
 * This file demonstrates how to integrate the introspection system into a main render loop
 */

import { ShaderIntrospector } from './core/ShaderIntrospector';
import { IntrospectionIntegration } from './core/integration/IntrospectionIntegration';

// This is a minimal example showing how to integrate the introspection system
// into your main application loop. Adapt the binding indices and integration
// points to match your actual application structure.

export async function setupIntrospectionExample(device: GPUDevice) {
    // Instantiate introspection system
    const shaderIntrospector = new ShaderIntrospector(device, { 
        slotCount: 1024, 
        pollIntervalMs: 500, 
        maxDisplay: 60 
    });
    
    // Attach debug panel for live monitoring
    shaderIntrospector.attachDebugPanel();
    
    // Create integration helper
    const introspectionIntegration = new IntrospectionIntegration(device, device.queue, shaderIntrospector);

    // Example: Create a bind group layout that includes the introspection buffer
    // NOTE: Adjust group/binding indices to avoid conflicts with your existing bindings
    const debugBindGroupLayout = device.createBindGroupLayout({
        label: 'debug-bind-group-layout',
        entries: [
            // Your existing bindings go here...
            // binding 0-6 for your application
            {
                binding: 7, // This matches the binding in introspect.wgsl
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: 'storage' as GPUBufferBindingType
                }
            }
        ]
    });

    // Create bind group with the introspection buffer
    const debugBindGroup = device.createBindGroup({
        layout: debugBindGroupLayout,
        entries: [
            // Your existing resource bindings...
            {
                binding: 7,
                resource: {
                    buffer: shaderIntrospector.getStorageBuffer()
                }
            }
        ]
    });

    // Example frame function showing integration
    function renderFrame() {
        const commandEncoder = device.createCommandEncoder();
        
        // Encode your simulation & rendering passes here...
        // These would use the debugBindGroup that includes the introspection buffer
        
        // Example compute pass that could use introspection:
        // const computePass = commandEncoder.beginComputePass();
        // computePass.setPipeline(yourPipeline);
        // computePass.setBindGroup(0, debugBindGroup); // Includes introspection buffer
        // computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        // computePass.end();

        // IMPORTANT: Encode introspection copy after all shader writes
        introspectionIntegration.encode(commandEncoder);
        
        const commandBuffer = commandEncoder.finish();
        device.queue.submit([commandBuffer]);

        // Optional async post-processing (currently minimal)
        introspectionIntegration.postSubmit();
    }

    return {
        shaderIntrospector,
        introspectionIntegration,
        debugBindGroup,
        debugBindGroupLayout,
        renderFrame
    };
}

// Example of how to use set_breadcrumb in WGSL shaders:
/*
In your compute shader, after importing introspect.wgsl:

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let idx = global_id.x;
    
    // Your compute logic here...
    let density = computeDensity(idx);
    
    // Example breadcrumb: log density values for debugging
    if (idx < 64u) { // Only log first 64 particles to avoid spam
        set_breadcrumb(
            idx,                                                 // slot index
            uniforms.frame,                                      // current frame
            0u,                                                  // error code (0 = OK)
            idx,                                                 // subject ID (particle index)
            density,                                             // value to log
            array<u8,8>('M','L','S','M','P','M',0,0),           // shader tag
            array<u8,8>('c','o','m','p','u','t','e',0)          // stage tag
        );
    }
}
*/