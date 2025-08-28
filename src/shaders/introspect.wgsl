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

fn pack8(a: array<u8,8>) -> array<u32,2> {
  var out: array<u32,2>;
  out[0] = u32(a[0]) | (u32(a[1]) << 8u) | (u32(a[2]) << 16u) | (u32(a[3]) << 24u);
  out[1] = u32(a[4]) | (u32(a[5]) << 8u) | (u32(a[6]) << 16u) | (u32(a[7]) << 24u);
  return out;
}

fn to_arr8(str: ptr<function, array<u8,8>>) -> array<u8,8> {
  return (*str);
}

fn set_breadcrumb(idx: u32, frame: u32, error_code: u32, subject: u32, value: f32, shader: array<u8,8>, stage: array<u8,8>) {
  if (idx >= 1024u) { return; }
  introspectBuffer[idx].frame = frame;
  introspectBuffer[idx].error_code = error_code;
  introspectBuffer[idx].subject_id = subject;
  introspectBuffer[idx].shader_tag = pack8(shader);
  introspectBuffer[idx].stage_tag = pack8(stage);
  introspectBuffer[idx].value = value;
}

// Helper function to create byte array from string literals
// WGSL doesn't support character literals, so we use numeric byte values
fn create_tag_mlsmpm() -> array<u8,8> {
  var tag: array<u8,8>;
  tag[0] = 77u;  // 'M'
  tag[1] = 76u;  // 'L' 
  tag[2] = 83u;  // 'S'
  tag[3] = 77u;  // 'M'
  tag[4] = 80u;  // 'P'
  tag[5] = 77u;  // 'M'
  tag[6] = 0u;   // null terminator
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

// Example usage inside a compute shader:
// set_breadcrumb(global_invocation_id.x, uniforms.frame, 0u, particleId, density, create_tag_mlsmpm(), create_tag_compute());