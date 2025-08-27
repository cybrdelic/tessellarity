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

// UNIFIED BINDING: Always @group(0) @binding(7) for introspection buffer
// This slot is reserved in the unified binding layout and never conflicts
@group(0) @binding(7)
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

// Example usage inside a compute shader:
// set_breadcrumb(global_invocation_id.x, uniforms.frame, 0u, particleId, density, array<u8,8>('M','L','S','M','P','M',0,0), array<u8,8>('c','o','m','p','u','t','e',0));