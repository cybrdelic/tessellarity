// Example: Simple compute shader with introspection integration
// This demonstrates how to use the introspection system in a real shader

// Include the introspection helper (in practice, you'd import this)
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

@group(0) @binding(15) // Introspection buffer - moved from slot 7 to avoid conflicts
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

// Example application: Particle density computation with introspection
struct Particle {
  position: vec3f,
  velocity: vec3f,
  density: f32,
  pressure: f32,
}

struct Uniforms {
  frame: u32,
  deltaTime: f32,
  numParticles: u32,
  smoothingRadius: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
// ... other bindings 2-6 for your application
// @binding(7) is the introspection buffer

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let idx = global_id.x;
    if (idx >= uniforms.numParticles) { return; }
    
    // Compute particle density (example algorithm)
    var density = 0.0;
    let pos_i = particles[idx].position;
    
    for (var j = 0u; j < uniforms.numParticles; j++) {
        let pos_j = particles[j].position;
        let distance = length(pos_i - pos_j);
        
        if (distance < uniforms.smoothingRadius) {
            // Simple kernel function
            let h = uniforms.smoothingRadius;
            let q = distance / h;
            if (q < 1.0) {
                density += (1.0 - q * q) * (1.0 - q * q);
            }
        }
    }
    
    // Store computed density
    particles[idx].density = density;
    
    // INTROSPECTION: Log density values for debugging
    // Only log first 64 particles to avoid overwhelming the buffer
    if (idx < 64u) {
        set_breadcrumb(
            uniforms.frame,                                      // current frame number
            0u,                                                  // error code (0 = OK)
            idx,                                                 // subject ID (particle index)
            density,                                             // value to log (computed density)
            pack4(83u, 80u, 72u, 95u),                         // shader tag "SPH_" (first 4 chars)
            pack4(68u, 69u, 78u, 83u),                         // shader tag "DENS" (last 4 chars)
            pack4(99u, 111u, 109u, 112u),                      // stage tag "comp" (first 4 chars)
            pack4(117u, 116u, 101u, 0u)                        // stage tag "ute\0" (last 4 chars)
        );
    }
    
    // INTROSPECTION: Log potential errors
    if (density > 10.0) { // Suspiciously high density
        set_breadcrumb(
            uniforms.frame,
            1u,                                                  // error code 1 = high density warning
            idx,                                                 // particle with the problem
            density,                                             // problematic density value
            pack4(83u, 80u, 72u, 95u),                         // shader tag "SPH_" (first 4 chars)
            pack4(69u, 82u, 82u, 0u),                          // shader tag "ERR\0" (last 4 chars)
            pack4(100u, 101u, 110u, 115u),                     // stage tag "dens" (first 4 chars)
            pack4(105u, 116u, 121u, 0u)                        // stage tag "ity\0" (last 4 chars)
        );
    }
}

// Example fragment shader with introspection for seam debugging
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4f {
    // Simple fullscreen triangle
    let x = f32((vertex_index << 1u) & 2u);
    let y = f32(vertex_index & 2u);
    return vec4f(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let pixel_id = u32(pos.x) + u32(pos.y) * 1920u; // Assuming 1920 width
    
    // Your surface reconstruction / rendering logic here...
    let surface_thickness = computeSurfaceThickness(pos.xy);
    let color = vec3f(0.2, 0.6, 1.0); // Water color
    
    // INTROSPECTION: Log pixels with potential seam artifacts
    // Check for discontinuities in surface thickness
    let neighbors = array<vec2f, 4>(
        vec2f(pos.x + 1.0, pos.y),
        vec2f(pos.x - 1.0, pos.y), 
        vec2f(pos.x, pos.y + 1.0),
        vec2f(pos.x, pos.y - 1.0)
    );
    
    var max_thickness_diff = 0.0;
    for (var i = 0; i < 4; i++) {
        let neighbor_thickness = computeSurfaceThickness(neighbors[i]);
        max_thickness_diff = max(max_thickness_diff, abs(surface_thickness - neighbor_thickness));
    }
    
    // Log suspicious thickness discontinuities (potential seams)
    if (max_thickness_diff > 0.5 && pixel_id % 100u == 0u) { // Sample 1% of suspicious pixels
        set_breadcrumb(
            uniforms.frame,
            2u,                                                  // error code 2 = seam detected
            pixel_id,                                            // pixel coordinate as subject
            max_thickness_diff,                                  // thickness discontinuity magnitude
            pack4(83u, 69u, 65u, 77u),                         // shader tag "SEAM" (first 4 chars)
            pack4(95u, 68u, 69u, 84u),                         // shader tag "_DET" (last 4 chars)
            pack4(102u, 114u, 97u, 103u),                      // stage tag "frag" (first 4 chars)
            pack4(109u, 101u, 110u, 116u)                      // stage tag "ment" (last 4 chars)
        );
    }
    
    return vec4f(color, 1.0);
}

fn computeSurfaceThickness(coord: vec2f) -> f32 {
    // Placeholder for actual surface thickness computation
    return 1.0;
}