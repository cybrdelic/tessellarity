// temporalSurface.wgsl
// Temporal Stabilization Module (TSM) - reduces flicker via reprojection + variance clamp + blend
// Input:  current surface frame (normals/thickness/coverage)
// Output: temporally stabilized surface frame

@group(0) @binding(0) var currentSurface  : texture_2d<f32>;    // RGBA16F: current frame
@group(0) @binding(1) var prevSurface     : texture_2d<f32>;    // RGBA16F: previous frame
@group(0) @binding(2) var velocityTex     : texture_2d<f32>;    // RG16F: screen-space motion vectors
@group(0) @binding(3) var sampLinear      : sampler;
@group(0) @binding(4) var<uniform> params : TempParams;
@group(0) @binding(5) var outSurface      : texture_storage_2d<rgba16float, write>;

struct TempParams {
  invRes        : vec2<f32>, // 8 bytes
  temporalAlpha : f32,       // blend factor
  pad0          : f32,       // padding to 16 bytes
}

const DEPTH_THRESHOLD : f32 = 0.015;
const NORMAL_THRESHOLD: f32 = 0.6;
const VARIANCE_K      : f32 = 2.0;

fn unpackOct(p: vec2<f32>) -> vec3<f32> {
  var f = p * 2.0 - 1.0;
  var n = vec3<f32>(f, 1.0 - abs(f.x) - abs(f.y));
  let t = clamp(-n.z, 0.0, 1.0);
  n.x += select(0.0, -sign(n.x), n.z < 0.0) * t;
  n.y += select(0.0, -sign(n.y), n.z < 0.0) * t;
  return normalize(n);
}

fn packOct(n: vec3<f32>) -> vec2<f32> {
  let v = n / (abs(n.x) + abs(n.y) + abs(n.z));
  var p = v.xy;
  if (v.z < 0.0) {
    p = (1.0 - abs(p.yx)) * sign(p.xy);
  }
  return p * 0.5 + 0.5;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(currentSurface);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let coord = vec2<i32>(gid.xy);
  let uv = (vec2<f32>(coord) + 0.5) * params.invRes;

  // Sample current frame
  let current = textureLoad(currentSurface, coord, 0);
  let currentN = unpackOct(current.xy);
  let currentT = current.z;  // thickness
  let currentC = current.w;  // coverage

  // Early exit for empty pixels
  if (currentT <= 0.0) {
    textureStore(outSurface, coord, current);
    return;
  }

  // Sample screen-space velocity
  let velocity = textureLoad(velocityTex, coord, 0).xy;
  let prevUV = uv - velocity * params.invRes;

  // Check if reprojection is valid (within bounds)
  if (any(prevUV < vec2<f32>(0.0)) || any(prevUV > vec2<f32>(1.0))) {
    textureStore(outSurface, coord, current);
    return;
  }

  // Sample previous frame with bilinear filtering
  let prevSample = textureSampleLevel(prevSurface, sampLinear, prevUV, 0.0);
  let prevN = unpackOct(prevSample.xy);
  let prevT = prevSample.z;
  let prevC = prevSample.w;

  // Validity checks
  let depthValid = abs(currentT - prevT) < DEPTH_THRESHOLD;
  let normalValid = dot(currentN, prevN) > NORMAL_THRESHOLD;

  if (!depthValid || !normalValid) {
    textureStore(outSurface, coord, current);
    return;
  }

  // Local variance estimation (3x3 neighborhood)
  var meanT = 0.0;
  var meanC = 0.0;
  var varT = 0.0;
  var varC = 0.0;
  var count = 0.0;

  for (var dy = -1; dy <= 1; dy += 1) {
    for (var dx = -1; dx <= 1; dx += 1) {
      let sampleCoord = coord + vec2<i32>(dx, dy);
      if (sampleCoord.x >= 0 && sampleCoord.y >= 0 &&
          sampleCoord.x < i32(dims.x) && sampleCoord.y < i32(dims.y)) {
        let neighborSample = textureLoad(currentSurface, sampleCoord, 0);
        let nT = neighborSample.z;
        let nC = neighborSample.w;
        meanT += nT;
        meanC += nC;
        count += 1.0;
      }
    }
  }

  meanT /= count;
  meanC /= count;

  // Compute variance
  for (var dy = -1; dy <= 1; dy += 1) {
    for (var dx = -1; dx <= 1; dx += 1) {
      let sampleCoord = coord + vec2<i32>(dx, dy);
      if (sampleCoord.x >= 0 && sampleCoord.y >= 0 &&
          sampleCoord.x < i32(dims.x) && sampleCoord.y < i32(dims.y)) {
        let neighborSample = textureLoad(currentSurface, sampleCoord, 0);
        let nT = neighborSample.z;
        let nC = neighborSample.w;
        let diffT = nT - meanT;
        let diffC = nC - meanC;
        varT += diffT * diffT;
        varC += diffC * diffC;
      }
    }
  }

  varT = sqrt(varT / count);
  varC = sqrt(varC / count);

  // Variance clamp (SVGF-style)
  let clampMinT = meanT - VARIANCE_K * varT;
  let clampMaxT = meanT + VARIANCE_K * varT;
  let clampMinC = meanC - VARIANCE_K * varC;
  let clampMaxC = meanC + VARIANCE_K * varC;

  let clampedPrevT = clamp(prevT, clampMinT, clampMaxT);
  let clampedPrevC = clamp(prevC, clampMinC, clampMaxC);

  // Temporal blend
  let alpha = params.temporalAlpha;
  let finalT = mix(currentT, clampedPrevT, alpha);
  let finalC = mix(currentC, clampedPrevC, alpha);

  // Normal blending (slerp approximation)
  let finalN = normalize(mix(currentN, prevN, alpha));
  let finalNPacked = packOct(finalN);

  textureStore(outSurface, coord, vec4<f32>(finalNPacked, finalT, finalC));
}
