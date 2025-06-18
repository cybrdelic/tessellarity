// Skybox/Environment background shader
// Renders the environment map as a background when no fluid is present

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) worldDirection: vec3f,
}

struct RenderUniforms {
    texel_size: vec2f,
    sphere_size: vec2f,
    inv_projection_matrix: mat4x4f,
    projection_matrix: mat4x4f,
    view_matrix: mat4x4f,
    inv_view_matrix: mat4x4f,
}

@group(0) @binding(0) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(1) var envmap_texture: texture_cube<f32>;
@group(0) @binding(2) var envmap_sampler: sampler;

// Fullscreen triangle vertices
var<private> positions: array<vec2f, 3> = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
);

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let pos = positions[vertexIndex];

    output.position = vec4f(pos, 0.999, 1.0); // Render at far plane

    // Get world direction from screen position
    // Use inverse projection to get view space position
    var viewPos = uniforms.inv_projection_matrix * vec4f(pos, 1.0, 1.0);
    viewPos = viewPos / viewPos.w;

    // Transform to world space (remove translation from view matrix)
    var rotationOnlyView = uniforms.view_matrix;
    rotationOnlyView[3] = vec4f(0.0, 0.0, 0.0, 1.0);
    var worldDir = transpose(mat3x3f(
        rotationOnlyView[0].xyz,
        rotationOnlyView[1].xyz,
        rotationOnlyView[2].xyz
    )) * viewPos.xyz;

    output.worldDirection = normalize(worldDir);

    return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    // Sample the environment map
    var envColor = textureSample(envmap_texture, envmap_sampler, input.worldDirection).rgb;

    // Apply some tone mapping and color adjustments
    var exposureScale = 1.0;
    envColor = envColor * exposureScale;

    // Apply a slight warm tint
    var colorGrading = vec3f(1.02, 1.0, 0.98);
    envColor = envColor * colorGrading;

    // Ensure good visibility
    envColor = max(envColor, vec3f(0.05)); // Prevent completely black areas

    return vec4f(envColor, 1.0);
}
