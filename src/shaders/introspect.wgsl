// Runtime Introspection WGSL Helper
// Import into compute / fragment shaders with build tooling (or concatenate).
// Now uses the unified binding layout system for stable, conflict-free bindings.

struct IntrospectSlot {
  frame       : u32,
  error_code  : u32,
  subject_id  : u32,
  shader_tag0 : u32, // 4 ASCII bytes (LE)
  shader_tag1 : u32, // 4 ASCII bytes (LE)
  stage_tag0  : u32, // 4 ASCII bytes (LE)
  stage_tag1  : u32, // 4 ASCII bytes (LE)
  value       : f32,
}

struct IntrospectRing {
  head  : atomic<u32>,
  slots : array<IntrospectSlot, 1024>,
}

// UNIFIED BINDING: Always @group(0) @binding(15) for introspection buffer
// This slot is reserved in the unified binding layout and never conflicts
// Moved from slot 7 to avoid conflict with existing EffectsToggle usage
@group(0) @binding(15)
var<storage, read_write> introspectBuffer: IntrospectRing;

// Atomic ring buffer: threads compete for slots
fn set_breadcrumb(frame: u32, error_code: u32, subject: u32, value: f32, shader_tag0: u32, shader_tag1: u32, stage_tag0: u32, stage_tag1: u32) {
  let idx = atomicAdd(&introspectBuffer.head, 1u) % 1024u;
  introspectBuffer.slots[idx].frame = frame;
  introspectBuffer.slots[idx].error_code = error_code;
  introspectBuffer.slots[idx].subject_id = subject;
  introspectBuffer.slots[idx].shader_tag0 = shader_tag0;
  introspectBuffer.slots[idx].shader_tag1 = shader_tag1;
  introspectBuffer.slots[idx].stage_tag0 = stage_tag0;
  introspectBuffer.slots[idx].stage_tag1 = stage_tag1;
  introspectBuffer.slots[idx].value = value;
}

// Pack 4 ASCII characters into u32 (little-endian)
fn pack4(c0: u32, c1: u32, c2: u32, c3: u32) -> u32 {
  return c0 | (c1 << 8u) | (c2 << 16u) | (c3 << 24u);
}

// Helper function to create packed u32 arrays from string literals
// Each u32 packs 4 ASCII characters in little-endian format
fn create_tag_mlsmpm() -> array<u32,2> {
  return array<u32,2>(pack4(77u, 76u, 83u, 77u), pack4(80u, 77u, 0u, 0u)); // "MLSM", "PM\0\0"
}

fn create_tag_compute() -> array<u32,2> {
  return array<u32,2>(pack4(99u, 111u, 109u, 112u), pack4(117u, 116u, 101u, 0u)); // "comp", "ute\0"
}

fn create_tag_boids() -> array<u32,2> {
  return array<u32,2>(pack4(98u, 111u, 105u, 100u), pack4(115u, 0u, 0u, 0u)); // "boid", "s\0\0\0"
}

fn create_tag_fluid() -> array<u32,2> {
  return array<u32,2>(pack4(102u, 108u, 117u, 105u), pack4(100u, 0u, 0u, 0u)); // "flui", "d\0\0\0"
}

fn create_tag_fragment() -> array<u32,2> {
  return array<u32,2>(pack4(102u, 114u, 97u, 103u), pack4(109u, 101u, 110u, 116u)); // "frag", "ment"
}

fn create_tag_unified() -> array<u32,2> {
  return array<u32,2>(pack4(117u, 110u, 105u, 102u), pack4(105u, 101u, 100u, 0u)); // "unif", "ied\0"
}

// Convenience wrappers for common patterns
fn breadcrumb_mlsmpm(frame: u32, subject: u32, value: f32) {
  let shader = create_tag_mlsmpm();
  let stage = create_tag_compute();
  set_breadcrumb(frame, 0u, subject, value, shader[0], shader[1], stage[0], stage[1]);
}

fn breadcrumb_boids(frame: u32, subject: u32, value: f32) {
  let shader = create_tag_boids();
  let stage = create_tag_compute();
  set_breadcrumb(frame, 0u, subject, value, shader[0], shader[1], stage[0], stage[1]);
}

fn breadcrumb_fluid_frag(frame: u32, subject: u32, value: f32) {
  let shader = create_tag_fluid();
  let stage = create_tag_fragment();
  set_breadcrumb(frame, 0u, subject, value, shader[0], shader[1], stage[0], stage[1]);
}

// Example usage inside a compute shader:
// let shader = create_tag_mlsmpm();
// let stage = create_tag_compute();  
// set_breadcrumb(uniforms.frame, 0u, particleId, density, shader[0], shader[1], stage[0], stage[1]);