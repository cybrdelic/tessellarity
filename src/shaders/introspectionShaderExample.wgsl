// Example: Simple compute shader with introspection integration
// This demonstrates how to use the introspection system in a real shader

// Include the introspection helper (in practice, you'd import this)
struct IntrospectSlot {
  frame: u32,
  error_code: u32,
  subject_id: u32,
  shader_tag: array<u32,2>, // reinterpret as 8 bytes ASCII (packed)
  stage_tag: array<u32,2>,  // reinterpret as 8 bytes ASCII
  value: f32,
}

@group(0) @binding(7) // Introspection buffer
var<storage, read_write> introspectBuffer: array<IntrospectSlot, 1024>;

fn pack8(a: array<u8,8>) -> array<u32,2> {
  var out: array<u32,2>;
  out[0] = u32(a[0]) | (u32(a[1]) << 8u) | (u32(a[2]) << 16u) | (u32(a[3]) << 24u);
  out[1] = u32(a[4]) | (u32(a[5]) << 8u) | (u32(a[6]) << 16u) | (u32(a[7]) << 24u);
  return out;
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
            idx,                                                 // slot index (use particle index)
            uniforms.frame,                                      // current frame number
            0u,                                                  // error code (0 = OK)
            idx,                                                 // subject ID (particle index)
            density,                                             // value to log (computed density)
            array<u8,8>('S','P','H','_','D','E','N','S'),       // shader tag "SPH_DENS"
            array<u8,8>('c','o','m','p','u','t','e',0)          // stage tag "compute"
        );
    }
    
    // INTROSPECTION: Log potential errors
    if (density > 10.0) { // Suspiciously high density
        // Use a rotating set of slots for errors (slots 512-1023)
        let error_slot = 512u + (idx % 512u);
        set_breadcrumb(
            error_slot,
            uniforms.frame,
            1u,                                                  // error code 1 = high density warning
            idx,                                                 // particle with the problem
            density,                                             // problematic density value
            array<u8,8>('S','P','H','_','E','R','R',0),         // shader tag "SPH_ERR"
            array<u8,8>('d','e','n','s','i','t','y',0)          // stage tag "density"
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
        let slot = (pixel_id / 100u) % 1024u; // Distribute across slots
        set_breadcrumb(
            slot,
            uniforms.frame,
            2u,                                                  // error code 2 = seam detected
            pixel_id,                                            // pixel coordinate as subject
            max_thickness_diff,                                  // thickness discontinuity magnitude
            array<u8,8>('S','E','A','M','_','D','E','T',0),     // shader tag "SEAM_DET"
            array<u8,8>('f','r','a','g','m','e','n','t',0)      // stage tag "fragment"
        );
    }
    
    return vec4f(color, 1.0);
}

fn computeSurfaceThickness(coord: vec2f) -> f32 {
    // Placeholder for actual surface thickness computation
    return 1.0;
}