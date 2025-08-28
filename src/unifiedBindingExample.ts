/**
 * Example: Using the Unified Binding System with Shader Introspection
 * 
 * This example demonstrates how the unified binding layout eliminates
 * pipeline rebuild issues and provides a stable, conflict-free interface.
 */

import { ShaderIntrospector } from './core/ShaderIntrospector';
import { IntrospectionIntegration } from './core/integration/IntrospectionIntegration';
import { UnifiedResourceManager, UNIFIED_BINDING_SLOTS } from './core/UnifiedBindings';

// Example shader source using unified bindings
const exampleComputeShader = `
// Include the introspection helper (uses unified binding slot 15)
struct IntrospectSlot {
  frame: u32,
  error_code: u32,
  subject_id: u32,
  shader_tag: array<u32,2>,
  stage_tag: array<u32,2>,
  value: f32,
}

// Standard unified binding slots
@group(0) @binding(0) var<storage, read_write> particles: array<vec4f>;
@group(0) @binding(2) var<uniform> environment: vec4f;
@group(0) @binding(3) var<uniform> simulationParams: vec4f;
@group(0) @binding(15) var<storage, read_write> introspectBuffer: array<IntrospectSlot>;

// Introspection helper functions
fn pack8(a: array<u8,8>) -> array<u32,2> {
  var out: array<u32,2>;
  out[0] = u32(a[0]) | (u32(a[1]) << 8u) | (u32(a[2]) << 16u) | (u32(a[3]) << 24u);
  out[1] = u32(a[4]) | (u32(a[5]) << 8u) | (u32(a[6]) << 16u) | (u32(a[7]) << 24u);
  return out;
}

fn create_tag_unified() -> array<u8,8> {
  var tag: array<u8,8>;
  tag[0] = 85u;  // 'U'
  tag[1] = 78u;  // 'N'
  tag[2] = 73u;  // 'I'
  tag[3] = 70u;  // 'F'
  tag[4] = 73u;  // 'I'
  tag[5] = 69u;  // 'E'
  tag[6] = 68u;  // 'D'
  tag[7] = 0u;   // null terminator
  return tag;
}

fn create_tag_compute() -> array<u8,8> {
  var tag: array<u8,8>;
  tag[0] = 99u;  // 'c'
  tag[1] = 111u; // 'o'
  tag[2] = 109u; // 'm'
  tag[3] = 112u; // 'p'
  tag[4] = 117u; // 'u'
  tag[5] = 116u; // 't'
  tag[6] = 101u; // 'e'
  tag[7] = 0u;   // null terminator
  return tag;
}

fn set_breadcrumb(idx: u32, frame: u32, error_code: u32, subject: u32, value: f32, shader: array<u8,8>, stage: array<u8,8>) {
  if (idx >= arrayLength(&introspectBuffer)) { return; }
  introspectBuffer[idx].frame = frame;
  introspectBuffer[idx].error_code = error_code;
  introspectBuffer[idx].subject_id = subject;
  introspectBuffer[idx].shader_tag = pack8(shader);
  introspectBuffer[idx].stage_tag = pack8(stage);
  introspectBuffer[idx].value = value;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let index = global_id.x;
  if (index >= arrayLength(&particles)) { return; }
  
  // Example computation
  particles[index] = particles[index] + vec4f(0.01, 0.0, 0.0, 0.0);
  
  // Emit introspection data - no binding conflicts!
  set_breadcrumb(
    index,
    1u, // frame number
    0u, // no error
    index, // particle ID
    length(particles[index].xyz), // magnitude
    create_tag_unified(),
    create_tag_compute()
  );
}
`;

export async function unifiedBindingExample(device: GPUDevice) {
  console.log('Starting Unified Binding System Example...');
  
  // 1. Create the introspection system with unified bindings enabled
  const introspector = new ShaderIntrospector(device, {
    slotCount: 1024,
    useUnifiedBindings: true, // Enable unified binding system
  });
  
  // 2. Create integration helper
  const integration = new IntrospectionIntegration(device, device.queue, introspector);
  
  // 3. Get the unified resource manager
  const resourceManager = integration.getResourceManager();
  if (!resourceManager) {
    throw new Error('Unified bindings not enabled');
  }
  
  // 4. Create example buffers
  const particleBuffer = device.createBuffer({
    size: 1024 * 16, // 1024 vec4f particles
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'ParticleBuffer',
  });
  
  const environmentBuffer = device.createBuffer({
    size: 16, // vec4f
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'EnvironmentBuffer',
  });
  
  const simulationParamsBuffer = device.createBuffer({
    size: 16, // vec4f  
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'SimulationParamsBuffer',
  });
  
  // 5. Bind resources to unified slots
  resourceManager.setResource('particles', particleBuffer);
  resourceManager.setResource('environment', environmentBuffer);
  resourceManager.setResource('simulationParams', simulationParamsBuffer);
  // Note: 'introspection' slot is already set by ShaderIntrospector constructor
  
  // 6. Create shader module
  const shaderModule = device.createShaderModule({
    label: 'UnifiedExampleShader',
    code: exampleComputeShader,
  });
  
  // 7. Create compute pipeline using unified layout - NO BINDING CONFLICTS!
  const pipeline = integration.createComputePipeline(shaderModule, 'main');
  if (!pipeline) {
    throw new Error('Failed to create pipeline');
  }
  
  // 8. Get the unified bind group - works with any pipeline using the unified layout
  const bindGroup = integration.getBindGroup();
  if (!bindGroup) {
    throw new Error('Failed to get bind group');
  }
  
  // 9. Execute the compute shader
  const encoder = device.createCommandEncoder({ label: 'UnifiedExample' });
  
  const pass = encoder.beginComputePass({ label: 'UnifiedComputePass' });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup); // Single, stable bind group for all pipelines!
  pass.dispatchWorkgroups(Math.ceil(1024 / 64));
  pass.end();
  
  // 10. Copy introspection data
  integration.encode(encoder);
  
  // 11. Submit and read results
  device.queue.submit([encoder.finish()]);
  
  // 12. Fetch introspection data
  const records = await introspector.fetch();
  console.log(`Captured ${records.length} introspection records:`);
  records.slice(0, 5).forEach((record, i) => {
    console.log(`  [${i}] F${record.frame} ${record.shader}/${record.stage} ID:${record.subjectId} value:${record.value.toFixed(3)}`);
  });
  
  console.log('✅ Unified Binding System Example completed successfully!');
  console.log('Key benefits demonstrated:');
  console.log('  - Single stable bind group layout');
  console.log('  - No binding conflicts between systems');
  console.log('  - Reusable bind groups across pipelines');
  console.log('  - No pipeline rebuilds when adding/removing features');
  
  return {
    introspector,
    integration,
    resourceManager,
    pipeline,
    bindGroup,
  };
}

/**
 * Example of migrating existing code to use unified bindings
 */
export function migrationExample() {
  console.log('Migration Guide: From Manual Bindings to Unified System');
  console.log('');
  
  console.log('BEFORE (Manual binding management):');
  console.log(`
// Each pipeline needs custom bind group layout
const bindGroupLayout = device.createBindGroupLayout({
  entries: [
    { binding: 0, ... }, // Particles
    { binding: 1, ... }, // Environment  
    { binding: 7, ... }, // Introspection (manual conflict avoidance)
  ]
});

const pipeline = device.createComputePipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout] // Different for each pipeline!
  }),
  // ... shader
});

const bindGroup = device.createBindGroup({
  layout: bindGroupLayout, // Must match pipeline exactly
  entries: [
    { binding: 0, resource: { buffer: particleBuffer } },
    { binding: 1, resource: { buffer: envBuffer } },
    { binding: 7, resource: { buffer: introspectBuffer } },
  ]
});
`);
  
  console.log('AFTER (Unified binding system):');
  console.log(`
// Create introspector with unified bindings
const introspector = new ShaderIntrospector(device, { useUnifiedBindings: true });
const integration = new IntrospectionIntegration(device, device.queue, introspector);
const resourceManager = integration.getResourceManager();

// Bind all resources to standard slots
resourceManager.setResource('particles', particleBuffer);
resourceManager.setResource('environment', envBuffer);
// introspection slot already bound automatically

// Create pipeline with stable layout
const pipeline = integration.createComputePipeline(shaderModule);

// Get unified bind group (works with ALL pipelines using unified layout)
const bindGroup = integration.getBindGroup();
`);
  
  console.log('Benefits of migration:');
  console.log('  ✅ No more binding conflicts');
  console.log('  ✅ Reuse bind groups across pipelines');
  console.log('  ✅ No pipeline rebuilds');
  console.log('  ✅ Centralized resource management');
  console.log('  ✅ Future-proof binding slots');
}