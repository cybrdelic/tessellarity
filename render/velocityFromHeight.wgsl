// velocityFromHeight.wgsl
// Derive a pseudo-velocity field from the (diffused) height field. This is a helper
// instrumentation pass so downstream shading & debug modes have non-zero variation.
// Output (RGBA16F):
//  R: vx (screen space, pixels per frame scaled)
//  G: vy
//  B: slope magnitude (for reference)
//  A: coverage (forwarded from height texture .a)

@group(0) @binding(0) var heightTex: texture_2d<f32>;          // diffused height (h, dh/dx, dh/dy, cov)
@group(0) @binding(1) var outVelocity: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(heightTex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let icoord = vec2i(gid.xy);
  // Sample center + neighbor heights (use R channel raw height)
  let c  = textureLoad(heightTex, vec2u(icoord), 0);
  // Use provided derivatives in G,B when available to avoid resampling neighbors
  var dhdx = c.g; // stored derivative
  var dhdy = c.b;
  // Fallback: if derivatives extremely small, approximate from 4-neighborhood to introduce variation
  if (abs(dhdx) + abs(dhdy) < 1e-6) {
    let l = textureLoad(heightTex, vec2u(clamp(icoord + vec2i(-1,0), vec2i(0), vec2i(dims)-vec2i(1))), 0).r;
    let r = textureLoad(heightTex, vec2u(clamp(icoord + vec2i( 1,0), vec2i(0), vec2i(dims)-vec2i(1))), 0).r;
    let u = textureLoad(heightTex, vec2u(clamp(icoord + vec2i(0,-1), vec2i(0), vec2i(dims)-vec2i(1))), 0).r;
    let d = textureLoad(heightTex, vec2u(clamp(icoord + vec2i(0, 1), vec2i(0), vec2i(dims)-vec2i(1))), 0).r;
    dhdx = (r - l) * 0.5;
    dhdy = (d - u) * 0.5;
  }
  // Velocity direction: downhill (negative gradient). Scale by slope magnitude with mild attenuation.
  let slope = sqrt(dhdx * dhdx + dhdy * dhdy);
  let scale = 4.0; // shaping constant (tunable)
  let vx = -dhdx * scale;
  let vy = -dhdy * scale;
  // Optional clamp to keep visualization bounded
  let vmax = 5.0;
  let vxf = clamp(vx, -vmax, vmax);
  let vyf = clamp(vy, -vmax, vmax);
  textureStore(outVelocity, icoord, vec4f(vxf, vyf, slope, c.a));
}
