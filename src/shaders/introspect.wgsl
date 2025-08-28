// Runtime Introspection WGSL Helper
// Import into compute / fragment shaders with build tooling (or concatenate).
// Now uses the unified binding layout system for stable, conflict-free bindings.

struct IntrospectSlot {
  frame: u32,
  error_code: u32,
  subject_id: u32,
  shader_tag: array<u32,2>, // reinterpret as 8 bytes ASCII (packed)
  stage_tag: array<u32,2>,  // reinterpret as 8 bytes ASCII
  value: f32,
}

// UNIFIED BINDING: Always @group(0) @binding(15) for introspection buffer
// This slot is reserved in the unified binding layout and never conflicts
// Moved from slot 7 to avoid conflict with existing EffectsToggle usage
@group(0) @binding(15)
var<storage, read_write> introspectBuffer: array<IntrospectSlot, 1024>;

fn set_breadcrumb(idx: u32, frame: u32, error_code: u32, subject: u32, value: f32, shader: array<u32,2>, stage: array<u32,2>) {
  if (idx >= 1024u) { return; }
  introspectBuffer[idx].frame = frame;
  introspectBuffer[idx].error_code = error_code;
  introspectBuffer[idx].subject_id = subject;
  introspectBuffer[idx].shader_tag = shader;
  introspectBuffer[idx].stage_tag = stage;
  introspectBuffer[idx].value = value;
}

// Helper function to create packed u32 arrays from string literals
// Each u32 packs 4 ASCII characters in little-endian format
fn create_tag_mlsmpm() -> array<u32,2> {
  var tag: array<u32,2>;
  tag[0] = 77u | (76u << 8u) | (83u << 16u) | (77u << 24u);  // 'MLSM'
  tag[1] = 80u | (77u << 8u) | (0u << 16u) | (0u << 24u);    // 'PM\0\0'
  return tag;
}

fn create_tag_compute() -> array<u32,2> {
  var tag: array<u32,2>;
  tag[0] = 99u | (111u << 8u) | (109u << 16u) | (112u << 24u);  // 'comp'
  tag[1] = 117u | (116u << 8u) | (101u << 16u) | (0u << 24u);   // 'ute\0'
  return tag;
}

fn create_tag_boids() -> array<u32,2> {
  var tag: array<u32,2>;
  tag[0] = 98u | (111u << 8u) | (105u << 16u) | (100u << 24u);  // 'boid'
  tag[1] = 115u | (0u << 8u) | (0u << 16u) | (0u << 24u);       // 's\0\0\0'
  return tag;
}

fn create_tag_fluid() -> array<u32,2> {
  var tag: array<u32,2>;
  tag[0] = 102u | (108u << 8u) | (117u << 16u) | (105u << 24u); // 'flui'
  tag[1] = 100u | (0u << 8u) | (0u << 16u) | (0u << 24u);       // 'd\0\0\0'
  return tag;
}

fn create_tag_fragment() -> array<u32,2> {
  var tag: array<u32,2>;
  tag[0] = 102u | (114u << 8u) | (97u << 16u) | (103u << 24u);  // 'frag'
  tag[1] = 109u | (101u << 8u) | (110u << 16u) | (116u << 24u); // 'ment'
  return tag;
}

fn create_tag_unified() -> array<u32,2> {
  var tag: array<u32,2>;
  tag[0] = 117u | (110u << 8u) | (105u << 16u) | (102u << 24u); // 'unif'
  tag[1] = 105u | (101u << 8u) | (100u << 16u) | (0u << 24u);   // 'ied\0'
  return tag;
}

// Example usage inside a compute shader:
// set_breadcrumb(global_invocation_id.x, uniforms.frame, 0u, particleId, density, create_tag_mlsmpm(), create_tag_compute());