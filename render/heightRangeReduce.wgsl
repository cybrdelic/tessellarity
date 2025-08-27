// heightRangeReduce.wgsl
// Global min/max height reduction & encoding parameter derivation.
// Three entry points (same bind group layout):
//   init     : initialize atomic min/max (atoms)
//   reduce   : parallel scan over depth texture updating min/max
//   finalize : compute encoding (minH, range, invRange)
// Height = -depth (depth is view-space z, negative forward).

// Store raw float bits inside signed 32-bit atomics. We avoid WGSL compareExchangeWeak (not yet standardized in all runtimes)
// by using atomicMin/Max directly on integer ordering of IEEE754 when restricted to non-negative range after offset.
// Simpler: keep two pass initialization with large sentinels and update using atomicMin/Max on integer bit patterns for floats cast to i32.
struct HeightRangeAtoms { minVal: atomic<i32>, maxVal: atomic<i32> }
struct HeightEncoding { minH: f32, invRange: f32, range: f32, padding: f32 }

@group(0) @binding(0) var depthTex: texture_2d<f32>;                // used by reduce
@group(0) @binding(1) var<storage, read_write> atoms: HeightRangeAtoms; // atomic min/max
@group(0) @binding(2) var<storage, read_write> encoding: HeightEncoding; // written in finalize

// NOTE: WebGPU WGSL currently exposes atomicMin/atomicMax for integer types only.
// We'll remap float domain to ordered integer domain using bitcast after biasing to positive range.
fn floatToOrderedInt(x: f32) -> i32 {
  // Bias by adding constant so (h + bias) >= 0. Assume |h| < 1e7.
  let bias = 10000000.0;
  let b = x + bias;
  return bitcast<i32>(b);
}
fn orderedIntToFloat(i: i32) -> f32 {
  let bias = 10000000.0;
  return bitcast<f32>(i) - bias;
}

@compute @workgroup_size(1,1,1)
fn init() {
  // Initialize with sentinels (min large positive, max large negative after ordering transform)
  atomicStore(&(atoms.minVal), floatToOrderedInt(  9999999.0));
  atomicStore(&(atoms.maxVal), floatToOrderedInt( -9999999.0));
}

@compute @workgroup_size(8,8,1)
fn reduce(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(depthTex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let d = textureLoad(depthTex, gid.xy, 0).r;
  let h = -d;
  if (h != h || abs(h) > 1e8) { return; }
  // Convert to ordered ints and apply integer atomics
  let oi = floatToOrderedInt(h);
  atomicMin(&(atoms.minVal), oi);
  atomicMax(&(atoms.maxVal), oi);
}

@compute @workgroup_size(1,1,1)
fn finalize() {
  let minH = orderedIntToFloat(atomicLoad(&(atoms.minVal)));
  let maxH = orderedIntToFloat(atomicLoad(&(atoms.maxVal)));
  var lo = min(minH, maxH);
  var hi = max(minH, maxH);
  if (!(lo == lo)) { lo = 0.0; }
  if (!(hi == hi)) { hi = 1.0; }
  let range = max(hi - lo, 1e-5);
  encoding.minH = lo;
  encoding.range = range;
  encoding.invRange = 1.0 / range;
  encoding.padding = 0.0;
}
