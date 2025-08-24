// velocityMap.wgsl
// Simplified screen velocity computation - we'll skip this for now and use a simpler approach

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

// For now, output zero velocity (temporal disabled)
@vertex
fn vs(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
        vec2f(-1.0, -1.0), vec2f( 1.0,  1.0), vec2f(-1.0,  1.0)
    );
    let pos = positions[vertex_index];
    return VertexOutput(vec4f(pos, 0.0, 1.0), pos * 0.5 + 0.5);
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    // Zero velocity for now (temporal stabilization disabled initially)
    return vec4f(0.0, 0.0, 0.0, 1.0);
}
