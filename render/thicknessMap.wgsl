// Restored full uniform block (must match CPU-side renderUniformBuffer layout)
struct RenderUniforms {
    @align(8) texel_size: vec2f,
    sphere_size: f32,
    padding0: f32,
    @align(16) inv_projection_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_matrix: mat4x4<f32>,
    inv_view_matrix: mat4x4<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    // View-space Z of particle center for projected radius -> pixel radius energy normalization
    @location(1) centerZ: f32,
}

struct ThicknessMapFragmentInput {
    @location(0) uv: vec2f,
    @location(1) centerZ: f32,
}

struct PosVel {
    position: vec3f,
    v: vec3f,
}

@group(0) @binding(0) var<storage> particles: array<PosVel>;
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;

@vertex
fn vs(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32
) -> VertexOutput {
    var corner_positions : array<vec2f,6> = array<vec2f,6>(
        vec2f( 0.5,  0.5),
        vec2f( 0.5, -0.5),
        vec2f(-0.5, -0.5),
        vec2f( 0.5,  0.5),
        vec2f(-0.5, -0.5),
        vec2f(-0.5,  0.5),
    );
    let real_position = particles[instance_index].position;

    let corner2 = corner_positions[vertex_index] * uniforms.sphere_size;
    let corner = vec3f(corner2.x, corner2.y, 0.0);
    let uv = corner_positions[vertex_index] + 0.5;

    // Proper view & clip transform
    let view_position4 = uniforms.view_matrix * vec4f(real_position, 1.0);
    let view_position = view_position4.xyz;
    let clip_position = uniforms.projection_matrix * (view_position4 + vec4f(corner, 0.0));
    // Pass positive depth magnitude for radius scaling (assumes right-handed with -Z forward)
    let centerZ = -view_position.z;
    return VertexOutput(clip_position, uv, centerZ);
}

// Multiple render targets:
//  - color(0): accumulated weighted thickness sum (r channel)
//  - color(1): accumulated weight sum (r channel)
struct FSOut {
    @location(0) color0: vec4f,
    @location(1) color1: vec4f,
}

@fragment
fn fs(input: ThicknessMapFragmentInput) -> FSOut {
    // Unit disk coordinates
    var p: vec2f = input.uv * 2.0 - 1.0;
    var r2: f32 = dot(p, p);
    if r2 > 1.0 { discard; }

    // Local hemisphere thickness profile (acts as per-particle thickness measure)
    var localThickness: f32 = sqrt(1.0 - r2);

    // Energy-normalized isotropic Gaussian kernel on unit disk footprint (slightly wider to reduce particle edge faceting)
    let sigma: f32 = 0.55; // broadened further to soften particle imprint / edge faceting
    let wSpatial: f32 = exp(-0.5 * (r2) / (sigma * sigma));

    // Projected particle radius (in pixels) for normalization.
    // Approximate pixel radius from projection parameters.
    // radiusWorld = 0.5 * sphere_size (quad extends [-0.5,0.5]).
    let radiusWorld: f32 = uniforms.sphere_size * 0.5;
    // Derive horizontal projection scale from matrix (m00)
    let projScaleX: f32 = uniforms.projection_matrix[0][0];
    let z: f32 = max(1e-5, input.centerZ);
    let radiusNDC: f32 = (radiusWorld * projScaleX) / z; // approximate NDC radius
    // Convert NDC radius to pixels: width = 1/texel_size.x, NDC -> pixels scale factor = 0.5 * width
    let screenWidth: f32 = 1.0 / uniforms.texel_size.x;
    let rPx: f32 = radiusNDC * 0.5 * screenWidth;
    let sigmaPx: f32 = max(1e-4, rPx * sigma);
    let norm: f32 = 1.0 / (2.0 * 3.14159265 * sigmaPx * sigmaPx);

    // Final kernel weight (spatial * energy normalization)
    let w: f32 = wSpatial * norm;

    // Accumulate weighted thickness and weight
    let weightedThickness = w * localThickness;
    var outData: FSOut;
    outData.color0 = vec4f(weightedThickness, 0.0, 0.0, 1.0);
    outData.color1 = vec4f(w, 0.0, 0.0, 1.0);
    return outData;
}
