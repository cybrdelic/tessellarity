struct Particle {
    position: vec3f, 
    v: vec3f, 
    C: mat3x3f, 
}
struct Cell {
    vx: atomic<i32>, 
    vy: atomic<i32>, 
    vz: atomic<i32>, 
    mass: atomic<i32>, 
}

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

override fixed_point_multiplier: f32; 

fn encodeFixedPoint(floating_point: f32) -> i32 {
	return i32(floating_point * fixed_point_multiplier);
}

// Pack 4 ASCII characters into u32 (little-endian)
fn pack4(c0: u32, c1: u32, c2: u32, c3: u32) -> u32 {
  return c0 | (c1 << 8u) | (c2 << 16u) | (c3 << 24u);
}

fn create_tag_mls() -> array<u32,2> {
    return array<u32,2>(pack4(109u, 108u, 115u, 0u), pack4(0u, 0u, 0u, 0u)); // "mls\0", "\0\0\0\0"
}

fn create_tag_compute() -> array<u32,2> {
    return array<u32,2>(pack4(99u, 111u, 109u, 112u), pack4(117u, 116u, 101u, 0u)); // "comp", "ute\0"
}

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


@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> cells: array<Cell>;
@group(0) @binding(2) var<uniform> init_box_size: vec3f;
@group(0) @binding(15) var<storage, read_write> introspectBuffer: IntrospectRing;

@compute @workgroup_size(64)
fn p2g_1(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x < arrayLength(&particles)) {
        var weights: array<vec3f, 3>;

        let particle = particles[id.x];
        let cell_idx: vec3f = floor(particle.position);
        let cell_diff: vec3f = particle.position - (cell_idx + 0.5f);
        weights[0] = 0.5f * (0.5f - cell_diff) * (0.5f - cell_diff);
        weights[1] = 0.75f - cell_diff * cell_diff;
        weights[2] = 0.5f * (0.5f + cell_diff) * (0.5f + cell_diff);

        let C: mat3x3f = particle.C;

        for (var gx = 0; gx < 3; gx++) {
            for (var gy = 0; gy < 3; gy++) {
                for (var gz = 0; gz < 3; gz++) {
                    let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;
                    let cell_x: vec3f = vec3f(
                            cell_idx.x + f32(gx) - 1., 
                            cell_idx.y + f32(gy) - 1.,
                            cell_idx.z + f32(gz) - 1.  
                        );
                    let cell_dist = (cell_x + 0.5f) - particle.position;

                    let Q: vec3f = C * cell_dist;

                    let mass_contrib: f32 = weight * 1.0; // assuming particle.mass = 1.0
                    let vel_contrib: vec3f = mass_contrib * (particle.v + Q);
                    let cell_index: i32 = 
                        i32(cell_x.x) * i32(init_box_size.y) * i32(init_box_size.z) + 
                        i32(cell_x.y) * i32(init_box_size.z) + 
                        i32(cell_x.z);
                    atomicAdd(&cells[cell_index].mass, encodeFixedPoint(mass_contrib));
                    atomicAdd(&cells[cell_index].vx, encodeFixedPoint(vel_contrib.x));
                    atomicAdd(&cells[cell_index].vy, encodeFixedPoint(vel_contrib.y));
                    atomicAdd(&cells[cell_index].vz, encodeFixedPoint(vel_contrib.z));
                }
            }
        }
        
        // Emit introspection breadcrumb for particle velocity magnitude
        let velocity_magnitude = length(particle.v);
        let shader = create_tag_mls();
        let stage = create_tag_compute();
        set_breadcrumb(0u, 0u, id.x, velocity_magnitude, shader[0], shader[1], stage[0], stage[1]);
    }
}