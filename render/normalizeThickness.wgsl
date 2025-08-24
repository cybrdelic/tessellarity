// normalizeThickness.wgsl
// Takes weighted thickness (sum_i w_i * t_i) and weight sum (sum_i w_i)
// Produces normalized thickness = (sum w_i * t_i) / (sum w_i)
// If weight sum < epsilon, outputs 0.

@group(0) @binding(0) var weightedThicknessTex : texture_2d<f32>; // r16float sampled
@group(0) @binding(1) var weightTex : texture_2d<f32>;            // r16float sampled
@group(0) @binding(2) var outNormalized : texture_storage_2d<rgba16float, write>; // rgba16float storage

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
    let dimWeighted = textureDimensions(weightedThicknessTex);
    if (gid.x >= dimWeighted.x || gid.y >= dimWeighted.y) { return; }
    let coord = vec2<i32>(gid.xy);
    // 3x3 neighborhood smoothing to stabilize normalization (reduces temporal jitter)
    var wtSum = 0.0;
    var wSum = 0.0;
    let dims = vec2<i32>(dimWeighted);
    // Clamp all neighbor gathers to valid coordinates (previously undefined OOB reads could create seams)
    for (var dy = -1; dy <= 1; dy = dy + 1) {
        for (var dx = -1; dx <= 1; dx = dx + 1) {
            var off = coord + vec2<i32>(dx, dy);
            off = clamp(off, vec2<i32>(0), dims - vec2<i32>(1));
            let wtN = textureLoad(weightedThicknessTex, vec2<u32>(off), 0).r;
            let wN  = textureLoad(weightTex, vec2<u32>(off), 0).r;
            wtSum += wtN;
            wSum  += wN;
        }
    }
    let eps = 1e-6;
    let minWeight = 0.001; // Prevent zero-weight regions that create horizontal lines
    let safeWeight = max(wSum, minWeight);
    let normThickness = select(0.0, wtSum / safeWeight, wSum > eps);
    textureStore(outNormalized, coord, vec4<f32>(normThickness, 0.0, 0.0, 1.0));
}
