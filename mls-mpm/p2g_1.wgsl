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
    frame: u32,
    error_code: u32,
    subject_id: u32,
    shader_tag: array<u32,2>,
    stage_tag: array<u32,2>,
    value: f32,
}

override fixed_point_multiplier: f32; 

fn encodeFixedPoint(floating_point: f32) -> i32 {
	return i32(floating_point * fixed_point_multiplier);
}

fn create_tag_mls() -> array<u32,2> {
    var tag: array<u32,2>;
    tag[0] = 109u | (108u << 8u) | (115u << 16u) | (0u << 24u);  // 'mls\0'
    tag[1] = 0u | (0u << 8u) | (0u << 16u) | (0u << 24u);        // '\0\0\0\0'
    return tag;
}

fn create_tag_p2g() -> array<u32,2> {
    var tag: array<u32,2>;
    tag[0] = 112u | (50u << 8u) | (103u << 16u) | (0u << 24u);  // 'p2g\0'
    tag[1] = 0u | (0u << 8u) | (0u << 16u) | (0u << 24u);       // '\0\0\0\0'
    return tag;
}
    tag[1] = 50u;  // '2'
    tag[2] = 103u; // 'g'
    tag[3] = 0u;   // null terminator
    tag[4] = 0u;
    tag[5] = 0u;
    tag[6] = 0u;
    tag[7] = 0u;
    return tag;
}

fn create_tag_compute() -> array<u32,2> {
    var tag: array<u32,2>;
    tag[0] = 99u | (111u << 8u) | (109u << 16u) | (112u << 24u);  // 'comp'
    tag[1] = 117u | (116u << 8u) | (101u << 16u) | (0u << 24u);   // 'ute\0'
    return tag;
}

fn set_breadcrumb(idx: u32, frame: u32, error_code: u32, subject: u32, value: f32, shader: array<u32,2>, stage: array<u32,2>) {
    if (idx >= arrayLength(&introspectBuffer)) { return; }
    introspectBuffer[idx].frame = frame;
    introspectBuffer[idx].error_code = error_code;
    introspectBuffer[idx].subject_id = subject;
    introspectBuffer[idx].shader_tag = shader;
    introspectBuffer[idx].stage_tag = stage;
    introspectBuffer[idx].value = value;
}


@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> cells: array<Cell>;
@group(0) @binding(2) var<uniform> init_box_size: vec3f;
@group(0) @binding(15) var<storage, read_write> introspectBuffer: array<IntrospectSlot>;

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
        set_breadcrumb(id.x % 1024u, 0u, 0u, id.x, velocity_magnitude, create_tag_mls(), create_tag_compute());
    }
}