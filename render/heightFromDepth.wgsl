// heightFromDepth.wgsl
// Reconstruct a smoothed height field and its gradient from filtered depth & thickness.
// Output RGBA16F:
//  R: height (view-space negative Z or normalized 0..1)
//  G: dH/dx (view space horizontal derivative)
//  B: dH/dy
//  A: coverage (passed through)

@group(0) @binding(0) var depthTex: texture_2d<f32>;      // filtered depth map (r32float -> sampled as f32)
@group(0) @binding(1) var surfaceTex: texture_2d<f32>;    // surface normals/thickness/coverage (rgba16f) optional source for coverage
@group(0) @binding(2) var outHeight: texture_storage_2d<rgba16float, write>;

const EPS: f32 = 1e-5;

fn sampleDepth(i: vec2i) -> f32 {
  let dims = vec2i(textureDimensions(depthTex));
  let clamped = clamp(i, vec2i(0), dims-vec2i(1));
  return textureLoad(depthTex, vec2u(clamped), 0).r; // view-space z (negative forward)
}

fn sampleCoverage(i: vec2i) -> f32 {
  let dims = vec2i(textureDimensions(surfaceTex));
  let clamped = clamp(i, vec2i(0), dims-vec2i(1));
  return textureLoad(surfaceTex, vec2u(clamped), 0).a;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(depthTex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let icoord = vec2i(gid.xy);
  // Sample center + 4-neighborhood for Sobel-lite gradient
  let c = sampleDepth(icoord);
  let l = sampleDepth(icoord + vec2i(-1,0));
  let r = sampleDepth(icoord + vec2i( 1,0));
  let u = sampleDepth(icoord + vec2i(0,-1));
  let d = sampleDepth(icoord + vec2i(0, 1));
  // View-space depth: convert to height by negation (assuming -Z forward)
  let h = -c;
  let dhdx = (r - l) * 0.5;
  let dhdy = (d - u) * 0.5;
  let cov = sampleCoverage(icoord);
  textureStore(outHeight, icoord, vec4f(h, dhdx, dhdy, cov));
}
