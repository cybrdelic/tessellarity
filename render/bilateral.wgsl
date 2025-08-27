// Bilateral depth filter (screen-space). Minimal standalone implementation.
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: FilterUniforms;

struct BilateralFragmentInput { @builtin(position) pos: vec4f };

override depth_threshold: f32;
override projected_particle_constant: f32;
override max_filter_size: f32;
// Seam mitigation switches
override BILATERAL_SMOOTH_FIX: bool = true; // enable smoothing & continuous weighting
override FRACTIONAL_DUAL_BLEND: bool = true; // blend full kernels R0 and R0+1 instead of partial outer ring
override DEBUG_OUTPUT_RADIUS: bool = false; // if true encode radius info in G,B channels for diagnostics
override BILATERAL_1D_LOCAL_AVG: bool = true; // use only along-blur neighbors for depth_avg to remove cross-pass asymmetry

struct FilterUniforms {
    blur_dir: vec2f,
}

@fragment
fn fs(input: BilateralFragmentInput) -> @location(0) vec4f {
    let dims = textureDimensions(texture);
    let pix = vec2u(clamp(input.pos.xy, vec2f(0.0), vec2f(f32(dims.x-1u), f32(dims.y-1u))));
    var depth: f32 = abs(textureLoad(texture, pix, 0).r);

    if depth >= 1e4 || depth <= 0. {
        return vec4f(vec3f(depth), 1.);
    }

    // Get texture dimensions for boundary checking
    let texture_dims = vec2f(f32(dims.x), f32(dims.y));
    // Original discrete kernel selection induces row-wise step changes when depth crosses integer thresholds.
    // Mitigation: derive a smoothed representative depth (local average) and use float kernel radius with floor.
    // Neighbor coordinate selection without ternary (WGSL lacks ?:). Use select/min patterns.
    let lx_u: u32 = select(pix.x - 1u, 0u, pix.x == 0u);
    let rx_u: u32 = min(pix.x + 1u, dims.x - 1u);
    let uy_u: u32 = select(pix.y - 1u, 0u, pix.y == 0u);
    let dy_u: u32 = min(pix.y + 1u, dims.y - 1u);
    var lcoord = vec2f(f32(lx_u), f32(pix.y));
    var rcoord = vec2f(f32(rx_u), f32(pix.y));
    var ucoord = vec2f(f32(pix.x), f32(uy_u));
    var dcoord = vec2f(f32(pix.x), f32(dy_u));
    let depth_l = abs(textureLoad(texture, vec2u(lcoord), 0).r);
    let depth_r = abs(textureLoad(texture, vec2u(rcoord), 0).r);
    let depth_u = abs(textureLoad(texture, vec2u(ucoord), 0).r);
    let depth_d = abs(textureLoad(texture, vec2u(dcoord), 0).r);
    // Asymmetry note: horizontal pass previously mixed vertical neighbors (unfiltered vertically) causing potential radius discontinuity vs vertical pass (whose left/right are already filtered). Option: restrict to 1D neighbors only.
    var depth_avg: f32;
    if (BILATERAL_1D_LOCAL_AVG) {
        // Use only neighbors aligned with blur_dir axis for stable two-pass symmetry.
        let along_dir_sum = select(depth_l + depth_r, depth_u + depth_d, uniforms.blur_dir.y > uniforms.blur_dir.x);
        depth_avg = (depth + along_dir_sum * 0.5) / 2.0; // depth plus average of two axis neighbors
    } else {
        depth_avg = (depth + depth_l + depth_r + depth_u + depth_d) * 0.2;
    }
    if (!BILATERAL_SMOOTH_FIX) { depth_avg = depth; }
    // Continuous radius (fractional kernel) to remove single-row derivative seam.
    // Rf: unclamped float radius; R0: inner full-weight radius; outer ring (R0+1) blended by frac.
    var base_filter_size_f: f32 = min(max_filter_size, projected_particle_constant / max(depth_avg, 1e-5));
    var Rf_unclamped: f32 = max(base_filter_size_f, 16.0);
    var Rf: f32 = min(Rf_unclamped, max_filter_size); // final float radius
    var R0: i32 = i32(floor(Rf));
    var R1: i32 = i32(min(f32(R0 + 1), max_filter_size));
    var frac: f32 = Rf - f32(R0); // [0,1)
    // Gaussian sigma based on continuous radius to avoid w discontinuity at integer boundaries.
    var sigma: f32 = Rf / 1.5;
    var two_sigma: f32 = 2.0 * sigma * sigma;
    var sigma_depth: f32 = depth_threshold / 0.8;
    var two_sigma_depth: f32 = 2.0 * sigma_depth * sigma_depth;

    var sum: f32 = 0.0;
    if (FRACTIONAL_DUAL_BLEND && BILATERAL_SMOOTH_FIX && frac > 0.0001) {
        // Accumulate two full kernels (R0 and R1) then blend their normalized results by frac.
        var sum0: f32 = 0.0; var wsum0: f32 = 0.0;
        var sum1: f32 = 0.0; var wsum1: f32 = 0.0;
        for (var x: i32 = -R1; x <= R1; x++) {
            var coords: vec2f = vec2f(f32(x));
            var sample_pos = vec2f(pix) + coords * uniforms.blur_dir;
            var clamped_pos = clamp(sample_pos, vec2f(0.0), texture_dims - vec2f(1.0));
            var sampled_depth: f32 = abs(textureLoad(texture, vec2u(clamped_pos), 0).r);
            if sampled_depth <= 0.0 || sampled_depth >= 1e4 { continue; }
            var rr: f32 = dot(coords, coords);
            var w: f32 = exp(-rr / two_sigma);
            var r_depth: f32 = sampled_depth - depth;
            var wd: f32 = exp(-r_depth * r_depth / two_sigma_depth);
            var continuity_weight: f32;
            if (BILATERAL_SMOOTH_FIX) {
                let t = clamp(1.0 - (abs(r_depth) / (depth_threshold * 1.2)), 0.0, 1.0);
                continuity_weight = 1.0 + 1.5 * (t * t * (3.0 - 2.0*t));
            } else {
                continuity_weight = select(1.0, 2.5, abs(r_depth) < depth_threshold * 1.2);
            }
            var final_weight: f32 = w * wd * continuity_weight;
            // Always contribute to larger kernel (R1 path)
            sum1 += sampled_depth * final_weight;
            wsum1 += final_weight;
            // Contribute to smaller kernel only if inside R0
            if (abs(x) <= R0) {
                sum0 += sampled_depth * final_weight;
                wsum0 += final_weight;
            }
        }
        if wsum0 > 0.0 { sum0 /= wsum0; } else { sum0 = depth; }
        if wsum1 > 0.0 { sum1 /= wsum1; } else { sum1 = depth; }
        sum = mix(sum0, sum1, frac);
    } else {
        // Fallback: single pass with scaled outer ring (previous method)
        var wsum: f32 = 0.0;
        for (var x: i32 = -R1; x <= R1; x++) {
            var coords: vec2f = vec2f(f32(x));
            var sample_pos = vec2f(pix) + coords * uniforms.blur_dir;
            var clamped_pos = clamp(sample_pos, vec2f(0.0), texture_dims - vec2f(1.0));
            var sampled_depth: f32 = abs(textureLoad(texture, vec2u(clamped_pos), 0).r);
            if sampled_depth <= 0.0 || sampled_depth >= 1e4 { continue; }
            var rr: f32 = dot(coords, coords);
            var w: f32 = exp(-rr / two_sigma);
            var r_depth: f32 = sampled_depth - depth;
            var wd: f32 = exp(-r_depth * r_depth / two_sigma_depth);
            var continuity_weight: f32;
            if (BILATERAL_SMOOTH_FIX) {
                let t = clamp(1.0 - (abs(r_depth) / (depth_threshold * 1.2)), 0.0, 1.0);
                continuity_weight = 1.0 + 1.5 * (t * t * (3.0 - 2.0*t));
            } else {
                continuity_weight = select(1.0, 2.5, abs(r_depth) < depth_threshold * 1.2);
            }
            var ring_scale: f32 = select(1.0, frac, abs(x) > R0);
            var final_weight = w * wd * continuity_weight * ring_scale;
            sum += sampled_depth * final_weight; wsum += final_weight;
        }
        if wsum > 0.0 { sum /= wsum; } else { sum = depth; }
    }

    if (!BILATERAL_SMOOTH_FIX) {
        // Preserve original secondary neighborhood blend when fix disabled.
        var neighbor_sum: f32 = 0.0;
        var neighbor_wsum: f32 = 0.0;
        var radius: i32 = 4;
        for (var dy: i32 = -radius; dy <= radius; dy++) {
            for (var dx: i32 = -radius; dx <= radius; dx++) {
                if dx == 0 && dy == 0 { continue; }
                var neighbor_coord = vec2f(pix) + vec2f(f32(dx), f32(dy));
                if neighbor_coord.x >= 0.0 && neighbor_coord.x < texture_dims.x && neighbor_coord.y >= 0.0 && neighbor_coord.y < texture_dims.y {
                    var neighbor_depth = abs(textureLoad(texture, vec2u(neighbor_coord), 0).r);
                    if neighbor_depth > 0.0 && neighbor_depth < 1e4 {
                        var dist = length(vec2f(f32(dx), f32(dy)));
                        var spatial_weight = exp(-dist * dist / 16.0);
                        var depth_diff = abs(neighbor_depth - sum);
                        var depth_weight = exp(-depth_diff * depth_diff / (depth_threshold * depth_threshold * 8.0));
                        var weight = spatial_weight * depth_weight;
                        neighbor_sum += neighbor_depth * weight;
                        neighbor_wsum += weight;
                    }
                }
            }
        }
        if neighbor_wsum > 0.0 { let neighbor_avg = neighbor_sum / neighbor_wsum; sum = mix(sum, neighbor_avg, 0.6); }
    }

    if (DEBUG_OUTPUT_RADIUS) {
        // R: filtered depth, G: normalized Rf, B: frac for visualizing radius transition
        return vec4f(sum, Rf / max_filter_size, frac, 1.0);
    }
    return vec4f(sum, 0.0, 0.0, 1.0);
}
