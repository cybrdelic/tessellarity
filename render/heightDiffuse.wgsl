// heightDiffuse.wgsl
// Multi-iteration-friendly diffusion / blur on height field (rgba16f: H, dH/dx, dH/dy, coverage)
// Focus: smooth high-frequency particle residual while preserving large-scale shape and avoid dark edge thinning.

@group(0) @binding(0) var inHeight: texture_2d<f32>;
@group(0) @binding(1) var outHeight: texture_storage_2d<rgba16float, write>;

fn sample(i: vec2i) -> vec4f {
  let dims = vec2i(textureDimensions(inHeight));
  let c = clamp(i, vec2i(0), dims-vec2i(1));
  return textureLoad(inHeight, vec2u(c), 0);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(inHeight);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let icoord = vec2i(gid.xy);
  // 9-tap cross + diagonals (adaptive bilateral on height & coverage)
  let center = sample(icoord);
  let hC = center.r; let dxC = center.g; let dyC = center.b; let covC = center.a;
  var accumH = hC * 8.0; var wsum = 8.0; // stronger self-weight to reduce thinning
  var accumDX = dxC * 8.0; var accumDY = dyC * 8.0; var accumCov = covC * 8.0;
  let rangeK = 14.0; // lower than previous 20 (softer)
  let covK = 6.0;    // penalize mixing with very low coverage
  // Offsets (4-neighborhood + diagonals)
  for (var oy = -1; oy <= 1; oy++) {
    for (var ox = -1; ox <= 1; ox++) {
      if (ox == 0 && oy == 0) { continue; }
      let s = sample(icoord + vec2i(ox,oy));
      let dh = abs(s.r - hC);
      let dcov = abs(s.a - covC);
      var w = 1.0;
      // Spatial weight (Manhattan + diagonal attenuation)
      let man = abs(f32(ox)) + abs(f32(oy));
      w *= select(0.85, 1.0, man < 1.1);
      w *= select(0.55, 1.0, man > 1.1);
      // Range (height)
      w *= exp(-dh * rangeK);
      // Coverage similarity (avoid pulling in sparse edge noise strongly)
      w *= exp(-dcov * covK);
      accumH += s.r * w;
      accumDX += s.g * w;
      accumDY += s.b * w;
      accumCov += s.a * w;
      wsum += w;
    }
  }
  let inv = 1.0 / wsum;
  var h = accumH * inv;
  var dx = accumDX * inv;
  var dy = accumDY * inv;
  // Re-normalize derivatives to new smoothed surface (finite difference approx)
  // (Optional: keep original derivatives; we lightly blend)
  dx = mix(dx, dxC, 0.15);
  dy = mix(dy, dyC, 0.15);
  var cov = accumCov * inv;
  // Slight coverage lift to prevent edge darkening after diffusion
  cov = max(cov, covC * 0.92);
  textureStore(outHeight, icoord, vec4f(h, dx, dy, cov));
}
