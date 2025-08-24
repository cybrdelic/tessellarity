// heightBlur.wgsl
// Generate blurred height fields at multiple radii for physically robust multi-scale metrics.
// Two entry points:
//   blur2 : radius=2 Gaussian
//   blur4 : radius=4 Gaussian (computed from input which may already be blurred once)
// Input: src height texture (R channel = height in view-space projection convention used elsewhere)
// Output: rgba16f storage (R height blurred, A=1)

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dstTex: texture_storage_2d<rgba16float, write>;

fn gaussianWeight(r: f32, sigma: f32) -> f32 {
  return exp(-(r*r) / (2.0 * sigma * sigma));
}

// Generic blur with compile-time radius & sigma
fn blurSample(coord: vec2i, radius: i32, sigma: f32) -> f32 {
  let dims = textureDimensions(srcTex);
  var sum = 0.0;
  var wsum = 0.0;
  for (var y: i32 = -radius; y <= radius; y++) {
    for (var x: i32 = -radius; x <= radius; x++) {
      let offset = vec2i(x,y);
      let p = clamp(coord + offset, vec2i(0), vec2i(dims) - vec2i(1));
      let h = textureLoad(srcTex, vec2u(p), 0).r;
      let rlen = length(vec2f(f32(x), f32(y)));
      let w = gaussianWeight(rlen, sigma);
      sum += h * w;
      wsum += w;
    }
  }
  return sum / max(wsum, 1e-6);
}

@compute @workgroup_size(8,8,1)
fn blur2(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(srcTex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let h = blurSample(vec2i(gid.xy), 2, 1.25); // sigma tuned ~ radius * 0.62
  textureStore(dstTex, vec2i(gid.xy), vec4f(h,0.0,0.0,1.0));
}

@compute @workgroup_size(8,8,1)
fn blur4(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(srcTex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let h = blurSample(vec2i(gid.xy), 4, 2.5); // sigma ~ radius * 0.62
  textureStore(dstTex, vec2i(gid.xy), vec4f(h,0.0,0.0,1.0));
}
