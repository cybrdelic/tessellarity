// heightDeband.wgsl
// Post-diffusion single-row / band artifact suppression.
// Detect pixels whose height differs from both vertical neighbors in same signed direction
// (indicative of an isolated horizontal ridge) and blend toward the vertical average.
// Also recomputes dH/dx, dH/dy from corrected height so derivatives remain consistent.
// Input  (binding0): rgba16f (H, dH/dx, dH/dy, coverage)
// Output (binding1): rgba16f corrected

@group(0) @binding(0) var inHeight: texture_2d<f32>;
@group(0) @binding(1) var outHeight: texture_storage_2d<rgba16float, write>;

fn load(i: vec2i) -> vec4f {
  let dims = vec2i(textureDimensions(inHeight));
  let c = clamp(i, vec2i(0), dims-vec2i(1));
  return textureLoad(inHeight, vec2u(c), 0);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(inHeight);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let p = vec2i(gid.xy);
  let c = load(p);
  let hC = c.r; let cov = c.a;
  let hU = load(p + vec2i(0,-1)).r;
  let hD = load(p + vec2i(0, 1)).r;
  // Detection parameters
  let eps = 2.0e-4;         // minimum absolute deviation
  let relK = 0.02;          // relative threshold factor
  let dUp = hC - hU;
  let dDn = hC - hD;
  let sameSign = (dUp * dDn) > 0.0;
  let magOk = abs(dUp) > eps && abs(dDn) > eps;
  let relOk = abs(dUp) > relK * (abs(hC)+abs(hU)+1e-5) || abs(dDn) > relK * (abs(hC)+abs(hD)+1e-5);
  var hFix = hC;
  if (sameSign && magOk && relOk) {
    // Blend toward vertical average; keep a little of original to avoid over-flattening.
    let avg = 0.5 * (hU + hD);
    hFix = mix(hC, avg, 0.65);
  }
  // Recompute derivatives from corrected height (central differences)
  let hL = load(p + vec2i(-1,0)).r;
  let hR = load(p + vec2i( 1,0)).r;
  let hU2 = load(p + vec2i(0,-1)).r;
  let hD2 = load(p + vec2i(0, 1)).r;
  let dx = (hR - hL) * 0.5;
  let dy = (hD2 - hU2) * 0.5;
  textureStore(outHeight, p, vec4f(hFix, dx, dy, cov));
}
