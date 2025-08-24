// Precompute normal, thickness, coverage (RGBA16F): RG oct normal, B thickness, A coverage.

@group(0) @binding(0) var thickness_texture: texture_2d<f32>;
@group(0) @binding(1) var weight_texture: texture_2d<f32>;

// Coverage shaping constants (tuned to suppress discrete particle footprints)
// TARGET_OVERLAPS: approximate expected summed weight for a fully dense sheet
const TARGET_OVERLAPS: f32 = 3.2; // slightly higher -> lowers per-particle coverage
const MIN_COVERAGE: f32 = 0.05;   // allow near-transparent gaps before normalization
const COV_GAMMA: f32 = 0.9;       // gentler lift (closer to linear)
// Removed gradient-based normal derivation; surface shader now uses height field normals.

struct FragmentInput {
    @location(0) uv: vec2f,
    @location(1) iuv: vec2f, // legacy (not used for pixel addressing anymore)
    @builtin(position) pos: vec4f,
}

// TEMPORARY DIAGNOSTIC SWITCH
// When true we bypass normal/coverage logic and emit a vivid visualization so we can
// confirm this pass is executing and the surface texture is being consumed downstream.
// Set to false after diagnosing the "all black water" condition.
// Set to false now that diagnostic gradient is no longer needed.
const DEBUG_FORCE_VIS: bool = false;

fn packOctahedral(n: vec3f) -> vec2f {
    let v = n / (abs(n.x) + abs(n.y) + abs(n.z));
    var p = v.xy;
    if (v.z < 0.0) {
        p = (1.0 - abs(p.yx)) * sign(p.xy);
    }
    return p * 0.5 + 0.5;
}

fn gaussian3x3Weight(offset: vec2f) -> f32 {
    let ax = abs(offset.x);
    let ay = abs(offset.y);
    let wx = select(1.0, 2.0, ax < 0.5);
    let wy = select(1.0, 2.0, ay < 0.5);
    return (wx * wy) / 16.0;
}

fn sampleThickness(icoord: vec2i) -> f32 {
    let dims = vec2i(textureDimensions(thickness_texture));
    let clamped = clamp(icoord, vec2i(0), dims - vec2i(1));
    return textureLoad(thickness_texture, vec2u(clamped), 0).r;
}

fn sampleWeight(icoord: vec2i) -> f32 {
    let dims = vec2i(textureDimensions(weight_texture));
    let clamped = clamp(icoord, vec2i(0), dims - vec2i(1));
    return textureLoad(weight_texture, vec2u(clamped), 0).r;
}

// Reconstruct a very rough normal from nearby thickness variation so downstream
// shading has baseline directional variation even if height gradient pass is
// overly diffused or temporarily flat. This prevents the "uniform ink" look
// when the surface shader blends in this legacy normal channel.
fn computeNormal(coord: vec2u) -> vec3f {
    let dims = vec2i(textureDimensions(thickness_texture));
    let c = vec2i(coord);
    // Central differences over clamped neighborhood
    let l = sampleThickness(c + vec2i(-1, 0));
    let r = sampleThickness(c + vec2i( 1, 0));
    let u = sampleThickness(c + vec2i(0, -1));
    let d = sampleThickness(c + vec2i(0,  1));
    let dx = (r - l) * 0.5;
    let dy = (d - u) * 0.5;
    // Scale down so it only supplies gentle variation; height-based normal will dominate later.
    let scale = 2.5; // tuned small to avoid re‑introducing particle imprint / diagonal bias
    var n = normalize(vec3f(-dx * scale, -dy * scale, 1.0));
    if (any(n != n) || length(n) < 1e-5) { n = vec3f(0.0,0.0,1.0); }
    return n;
}

fn computeSmoothedCoverage(coord: vec2u) -> f32 {
    // The weight texture is already heavily blurred upstream: apply a very small box to further de-speckle
    let icoord = vec2i(coord);
    var accum = 0.0;
    for (var dy = -1; dy <= 1; dy += 1) {
        for (var dx = -1; dx <= 1; dx += 1) {
            accum += sampleWeight(icoord + vec2i(dx, dy));
        }
    }
    let weightAvg = accum / 9.0;
    let invTarget = 1.0 / max(1e-6, TARGET_OVERLAPS);
    let covRaw = clamp(weightAvg * invTarget, 0.0, 1.0);
    // Mild gamma lift while preserving low-end variation (helps hide particle dots)
    let lifted = pow(covRaw, COV_GAMMA);
    // No hard floor; softly bias instead
    let biased = lifted * (1.0 - MIN_COVERAGE) + MIN_COVERAGE * lifted;
    return clamp(biased, 0.0, 1.0);
}

fn smoothNormal(n: vec3f, coord: vec2u) -> vec3f { return n; }

@fragment
fn fs(input: FragmentInput) -> @location(0) vec4f {
    // Use integer UV coordinates for pixel-perfect addressing, eliminating diagonal seams
    let dims = textureDimensions(thickness_texture);
    let pixI = clamp(vec2i(input.iuv), vec2i(0), vec2i(dims) - vec2i(1));
    let coord = vec2u(pixI);

    if (DEBUG_FORCE_VIS) {
        // Simple gradient + thickness/weight probe so a non-zero image appears if this pass runs.
        let dimsF = vec2f(dims);
        let uv = (vec2f(pixI) + 0.5) / dimsF;
        let thicknessProbe = sampleThickness(vec2i(coord));
        // Local 3x3 average weight (duplicating small portion of computeSmoothedCoverage for visibility)
        var wAccum = 0.0;
        for (var dy = -1; dy <= 1; dy += 1) {
            for (var dx = -1; dx <= 1; dx += 1) {
                wAccum += sampleWeight(vec2i(coord) + vec2i(dx, dy));
            }
        }
        let wAvg = wAccum / 9.0;
        // Encode: R = uv.x, G = uv.y, B = thickness, A = 1 so downstream shading isn't culled.
        return vec4f(uv.x, uv.y, thicknessProbe * 0.25, 1.0);
    }

    // Neutral normal placeholder; real normals from height field in surface shader
    var normal = computeNormal(coord);
    let normalPacked = packOctahedral(normal);

    // Sample thickness (already smoothed upstream)
    let thickness = sampleThickness(vec2i(coord));

    // Compute coverage from smoothed weight (matches thickness support)
    let coverage = computeSmoothedCoverage(coord);

    return vec4f(normalPacked.x, normalPacked.y, thickness, coverage);
}
