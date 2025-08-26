// Fullscreen triangle vertex shader (eliminates quad diagonal seam & per-triangle LOD divergence)
// We no longer pass interpolated UVs; fragments reconstruct UV from builtin position.
// Final minimal fullscreen vertex output: only clip-space position.
// All fragments must now use @builtin(position) to derive pixel + uv.
struct FSVertexOut { @builtin(position) position : vec4f };

// Provide render target dimensions for integer uv (legacy paths)
// Legacy overrides removed; per-fragment derive dims via textureDimensions of the target source.

@vertex
fn vs(@builtin(vertex_index) vertex_index : u32) -> FSVertexOut {
        var p: vec2f;
        switch(vertex_index) {
                case 0u: { p = vec2f(-1.0, -1.0); }
                case 1u: { p = vec2f( 3.0, -1.0); }
                default: { p = vec2f(-1.0,  3.0); }
        }
        return FSVertexOut(vec4f(p, 0.0, 1.0));
}

// Coordinate unification complete: no varying uv/iuv now exist.
// Fragment pattern (example):
//   struct FIn { @builtin(position) pos: vec4f };
//   @fragment fn fs(input: FIn) -> ... {
//       let dims = textureDimensions(sourceTex);
//       let pix = min(vec2u(u32(input.pos.x), u32(input.pos.y)), dims-vec2u(1u,1u));
//       let uv  = (vec2f(pix) + 0.5) / vec2f(f32(dims.x), f32(dims.y));
//       ...
//   }
