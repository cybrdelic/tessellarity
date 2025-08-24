// foamTemporal.wgsl
// Temporal accumulation & decay of foam mask.
// Inputs:
//  - physical metrics texture: slope, curvature, instantaneous foam candidate (B), coverage (A)
//  - previous foam accumulation (R16F) (can be empty first frame)
// Output:
//  - updated foam accumulation (R16F), stored in-place via storage binding

// Extended foam parameters include adaptive scaling factors.
struct FoamParams {
  growRate: f32,
  decayRate: f32,
  appearThreshold: f32,
  disappearThreshold: f32,
  slopeScale: f32,
  curvatureScale: f32,
  smoothing: f32,
  padding: f32,
}

@group(0) @binding(0) var physicalTex: texture_2d<f32>; // slope, curvature, foamCandidate, coverage
@group(0) @binding(1) var prevFoam: texture_2d<f32>;    // previous accumulated foam (r16f in .r)
@group(0) @binding(2) var outFoam: texture_storage_2d<rgba16float, write>; // new accumulation
@group(0) @binding(3) var<uniform> foamParams: FoamParams;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(physicalTex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coord = vec2u(gid.xy);
  let phys = textureLoad(physicalTex, coord, 0);
  let slope = phys.r;
  let dirCurv = phys.g;
  let crestRaw = clamp(phys.b, 0.0, 1.0);
  let coverage = clamp(phys.a, 0.0, 1.0);
  let prev = textureLoad(prevFoam, coord, 0).r;

  // Normalize metrics
  let slopeN = saturate(slope / (1.0 + slope));
  let negCurv = max(0.0, -dirCurv);
  let curvN = negCurv / (1.0 + negCurv);
  // Smoothed instantaneous candidate blends raw crest with previous accumulation (acts like inertia)
  let foamCand = mix(crestRaw, (crestRaw + prev) * 0.5, foamParams.smoothing);

  // Event mask with hysteresis: appear if candidate > appearThreshold, disappear if < disappearThreshold
  // Adaptive thresholds based on local dynamics (lower thresholds where slope & negative curvature suggest breaking)
  let appearBase = foamParams.appearThreshold;
  let disappearBase = foamParams.disappearThreshold;
  let adapt = foamParams.slopeScale * slopeN + foamParams.curvatureScale * curvN;
  let appearT = clamp(appearBase - adapt, 0.02, 0.95);
  let disappearT = clamp(disappearBase - adapt * 0.5, 0.01, appearT - 0.01);
  let growMask = select(0.0, 1.0, foamCand > appearT);
  let keepMask = select(0.0, 1.0, foamCand > disappearT);

  // Growth: instantaneous candidate contributes proportionally above appear threshold
  let excess = max(0.0, foamCand - appearT) / max(1e-4, 1.0 - appearT);
  let growth = excess * foamParams.growRate * growMask;

  // Decay: apply unless we are strongly above disappear threshold
  let decay = foamParams.decayRate * (1.0 - keepMask);

  var accum = prev;
  accum = accum + growth - decay * accum; // exponential-like decay

  // Coverage modulation prevents foam in ultra sparse regions & clamps density
  accum *= smoothstep(0.15, 0.6, coverage);

  accum = clamp(accum, 0.0, 1.0);
  textureStore(outFoam, vec2i(coord), vec4f(accum,0.0,0.0,1.0));
}
