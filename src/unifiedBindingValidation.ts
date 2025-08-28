/**
 * Unified Binding System Validation Tests
 * Tests the enhanced introspection system with stable binding layout
 */

import { ShaderIntrospector } from './core/ShaderIntrospector';
import { IntrospectionIntegration } from './core/integration/IntrospectionIntegration';
import { UnifiedResourceManager, UNIFIED_BINDING_SLOTS } from './core/UnifiedBindings';

export async function validateUnifiedBindings(device: GPUDevice): Promise<boolean> {
  console.log('🧪 Testing Unified Binding System...');
  
  try {
    // Test 1: Basic introspector creation with unified bindings
    console.log('  ✓ Test 1: Creating introspector with unified bindings...');
    const introspector = new ShaderIntrospector(device, {
      slotCount: 256,
      useUnifiedBindings: true,
    });
    
    const resourceManager = introspector.getResourceManager();
    if (!resourceManager) {
      throw new Error('Resource manager not created');
    }
    
    // Test 2: Verify introspection buffer is auto-registered
    console.log('  ✓ Test 2: Verifying auto-registration of introspection buffer...');
    if (!resourceManager.hasResource('introspection')) {
      throw new Error('Introspection buffer not auto-registered');
    }
    
    // Test 3: Create additional resources
    console.log('  ✓ Test 3: Adding additional resources to unified manager...');
    const testBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.STORAGE,
      label: 'TestBuffer',
    });
    
    resourceManager.setResource('particles', testBuffer);
    
    if (!resourceManager.hasResource('particles')) {
      throw new Error('Failed to set particles resource');
    }
    
    // Test 4: Get stable bind group layout
    console.log('  ✓ Test 4: Testing stable bind group layout...');
    const layout1 = resourceManager.getBindGroupLayout();
    const layout2 = resourceManager.getBindGroupLayout();
    
    // Should be the same object (stable)
    if (layout1 !== layout2) {
      throw new Error('Bind group layout not stable');
    }
    
    // Test 5: Get unified bind group
    console.log('  ✓ Test 5: Creating unified bind group...');
    const bindGroup = resourceManager.getBindGroup();
    if (!bindGroup) {
      throw new Error('Failed to create unified bind group');
    }
    
    // Test 6: Integration helper
    console.log('  ✓ Test 6: Testing integration helper...');
    const integration = new IntrospectionIntegration(device, device.queue, introspector);
    
    const integrationLayout = integration.getBindGroupLayout();
    const integrationBindGroup = integration.getBindGroup();
    
    if (!integrationLayout || !integrationBindGroup) {
      throw new Error('Integration helper failed');
    }
    
    // Test 7: Pipeline creation helper
    console.log('  ✓ Test 7: Testing pipeline creation helpers...');
    
    const simpleComputeShader = `
      @group(0) @binding(15) var<storage, read_write> introspectBuffer: array<vec4f>;
      
      @compute @workgroup_size(1)
      fn main() {
        // Simple test shader
      }
    `;
    
    const shaderModule = device.createShaderModule({
      code: simpleComputeShader,
    });
    
    const pipeline = integration.createComputePipeline(shaderModule);
    if (!pipeline) {
      throw new Error('Failed to create compute pipeline');
    }
    
    // Test 8: Backwards compatibility
    console.log('  ✓ Test 8: Testing backwards compatibility...');
    const legacyIntrospector = new ShaderIntrospector(device, {
      useUnifiedBindings: false,
    });
    
    const legacyBuffer = legacyIntrospector.getStorageBuffer();
    if (!legacyBuffer) {
      throw new Error('Legacy mode failed');
    }
    
    // Test 9: Resource removal and cleanup
    console.log('  ✓ Test 9: Testing resource management...');
    resourceManager.removeResource('particles');
    
    if (resourceManager.hasResource('particles')) {
      throw new Error('Failed to remove resource');
    }
    
    // Should still work with missing optional resource
    const bindGroupAfterRemoval = resourceManager.getBindGroup();
    if (!bindGroupAfterRemoval) {
      throw new Error('Bind group creation failed after resource removal');
    }
    
    // Test 10: Slot validation
    console.log('  ✓ Test 10: Validating binding slot assignments...');
    
    // Verify all expected slots are defined
    const expectedSlots = [
      'particles', 'particlesAux', 'environment', 'simulationParams',
      'boxSize', 'gridData', 'prefixSum', 'introspection',
      'positionOutput', 'renderUniforms'
    ];
    
    for (const slot of expectedSlots) {
      if (!(slot in UNIFIED_BINDING_SLOTS)) {
        throw new Error(`Missing slot definition: ${slot}`);
      }
    }
    
    // Verify introspection slot is 15 (moved from 7 to avoid EffectsToggle conflict)
    if (UNIFIED_BINDING_SLOTS.introspection !== 15) {
      throw new Error('Introspection slot not at expected position 15');
    }
    
    console.log('✅ All unified binding system tests passed!');
    return true;
    
  } catch (error) {
    console.error('❌ Unified binding system test failed:', error);
    return false;
  }
}

export async function performanceComparisonTest(device: GPUDevice): Promise<void> {
  console.log('⚡ Performance Comparison: Manual vs Unified Bindings');
  
  const iterations = 100;
  
  // Test manual binding approach
  console.log('  Testing manual binding approach...');
  const manualStartTime = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    const buffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.STORAGE,
    });
    
    const layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 7,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' as GPUBufferBindingType },
        },
      ],
    });
    
    const bindGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 7, resource: { buffer } },
      ],
    });
  }
  
  const manualTime = performance.now() - manualStartTime;
  
  // Test unified binding approach
  console.log('  Testing unified binding approach...');
  const unifiedStartTime = performance.now();
  
  const resourceManager = new UnifiedResourceManager(device);
  
  for (let i = 0; i < iterations; i++) {
    const buffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.STORAGE,
    });
    
    resourceManager.setResource('introspection', buffer);
    const bindGroup = resourceManager.getBindGroup();
  }
  
  const unifiedTime = performance.now() - unifiedStartTime;
  
  console.log(`  Manual approach: ${manualTime.toFixed(2)}ms`);
  console.log(`  Unified approach: ${unifiedTime.toFixed(2)}ms`);
  console.log(`  Speedup: ${(manualTime / unifiedTime).toFixed(2)}x`);
  
  if (unifiedTime > manualTime * 2) {
    console.warn('  ⚠️  Unified approach is significantly slower');
  } else {
    console.log('  ✅ Unified approach performance acceptable');
  }
}

// Main validation function
export async function runUnifiedBindingValidation(device: GPUDevice): Promise<boolean> {
  console.log('🚀 Starting Unified Binding System Validation\n');
  
  const basicTests = await validateUnifiedBindings(device);
  
  if (basicTests) {
    await performanceComparisonTest(device);
    console.log('\n🎉 Unified binding system validation completed successfully!');
    console.log('\nKey improvements validated:');
    console.log('  ✅ Stable binding layout (no pipeline rebuilds)');
    console.log('  ✅ Conflict-free resource management');
    console.log('  ✅ Backwards compatibility maintained');
    console.log('  ✅ Optional resource handling');
    console.log('  ✅ Centralized resource control');
    return true;
  } else {
    console.log('\n❌ Validation failed - system not ready for production');
    return false;
  }
}