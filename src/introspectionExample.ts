/// <reference types="@webgpu/types" />

/**
 * Example integration of the Enhanced Runtime Shader Introspection System
 * This file demonstrates both unified binding approach and legacy compatibility
 */

import { ShaderIntrospector } from './core/ShaderIntrospector';
import { IntrospectionIntegration } from './core/integration/IntrospectionIntegration';

// Enhanced example showing the new unified binding system
export async function setupIntrospectionExample(device: GPUDevice) {
    console.log('Setting up Enhanced Introspection System...');
    
    // Option 1: Use unified binding system (Recommended)
    const shaderIntrospector = new ShaderIntrospector(device, { 
        slotCount: 1024, 
        pollIntervalMs: 500, 
        maxDisplay: 60,
        useUnifiedBindings: true // Enable unified binding system
    });
    
    // Attach debug panel for live monitoring
    shaderIntrospector.attachDebugPanel();
    
    // Create integration helper
    const introspectionIntegration = new IntrospectionIntegration(device, device.queue, shaderIntrospector);

    // Get unified resource manager for simplified resource binding
    const resourceManager = introspectionIntegration.getResourceManager();
    if (!resourceManager) {
        throw new Error('Unified bindings not enabled');
    }

    console.log('✅ Unified binding system ready');
    console.log('  - Introspection buffer auto-bound to slot 7');
    console.log('  - Stable bind group layout created');
    console.log('  - No binding conflicts possible');

    // Example frame function showing integration
    function renderFrame() {
        const commandEncoder = device.createCommandEncoder();
        
        // Encode your simulation & rendering passes here...
        // Use integration.createComputePipeline() for pipelines with introspection
        
        // Example:
        // const pipeline = introspectionIntegration.createComputePipeline(yourShaderModule);
        // const bindGroup = introspectionIntegration.getBindGroup();
        // const computePass = commandEncoder.beginComputePass();
        // computePass.setPipeline(pipeline);
        // computePass.setBindGroup(0, bindGroup); // Unified bind group with introspection
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
        introspector: shaderIntrospector,
        integration: introspectionIntegration,
        resourceManager,
        renderFrame,
        // Legacy compatibility
        legacyBuffer: shaderIntrospector.getStorageBuffer()
    };
}

// Legacy manual binding example (backwards compatibility)
export async function setupLegacyIntrospectionExample(device: GPUDevice) {
    console.log('Setting up Legacy Introspection System...');
    
    // Option 2: Use legacy manual binding approach
    const shaderIntrospector = new ShaderIntrospector(device, { 
        slotCount: 1024, 
        pollIntervalMs: 500, 
        maxDisplay: 60,
        useUnifiedBindings: false // Disable unified bindings
    });
    
    shaderIntrospector.attachDebugPanel();
    const introspectionIntegration = new IntrospectionIntegration(device, device.queue, shaderIntrospector);

    // Manual bind group layout creation (legacy approach)
    const debugBindGroupLayout = device.createBindGroupLayout({
        label: 'debug-bind-group-layout',
        entries: [
            // Your existing bindings go here (0-6)...
            {
                binding: 7, // Introspection buffer binding
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
            // Your existing resource bindings (0-6)...
            {
                binding: 7,
                resource: {
                    buffer: shaderIntrospector.getStorageBuffer()
                }
            }
        ]
    });

    console.log('✅ Legacy introspection system ready');
    console.log('  - Manual binding to slot 7');
    console.log('  - Requires careful conflict management');

    return {
        shaderIntrospector,
        introspectionIntegration,
        debugBindGroup,
        debugBindGroupLayout,
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
            array<u8,8>('U','N','I','F','I','E','D',0),         // shader tag  
            array<u8,8>('c','o','m','p','u','t','e',0)          // stage tag
        );
    }
}
*/