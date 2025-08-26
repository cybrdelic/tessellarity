// velocityMap.wgsl
// Screen-Space ABI migration: no varying UV; derive integer pixel + uv from builtin(position).
// Currently returns zero velocity (temporal stabilization placeholder).

struct FSIn { @builtin(position) pos: vec4f };

@fragment
fn fs(input: FSIn) -> @location(0) vec4f {
    // Derive uv if/when needed (kept for future velocity packing)
    // let dims = vec2f(1.0); // placeholder (would sample a reference texture for true dims)
    // let uv = input.pos.xy / dims;
    return vec4f(0.0, 0.0, 0.0, 1.0);
}
