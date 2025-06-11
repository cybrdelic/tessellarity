// @group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: FilterUniforms;

struct FragmentInput {
    @location(0) uv: vec2f,
    @location(1) iuv: vec2f,
}

override depth_threshold: f32;  // これは何？
override projected_particle_constant: f32; // これは Babylon.js で計算していたやつか．
override max_filter_size: f32;
struct FilterUniforms {
    blur_dir: vec2f, // 解像度で割る
}


@fragment
fn fs(input: FragmentInput) -> @location(0) vec4f {
    // 正かどうかを確かめる
    var depth: f32 = abs(textureLoad(texture, vec2u(input.iuv), 0).r);

    // ここが有効になるためには，背景の depth を適切に設定しなきゃいけないな．
    if depth >= 1e4 || depth <= 0. {
        return vec4f(vec3f(depth), 1.);
    }

    // Enhanced adaptive filter sizing - larger kernels for smoother results
    var base_filter_size: i32 = min(i32(max_filter_size), i32(ceil(projected_particle_constant / depth)));
    var adaptive_filter_size: i32 = max(base_filter_size, 8); // Minimum size for better smoothing

    // Enhanced sigma calculations for smoother falloff
    var sigma: f32 = f32(adaptive_filter_size) / 2.5; // Reduced divisor for wider spread
    var two_sigma: f32 = 2.0 * sigma * sigma;
    var sigma_depth: f32 = depth_threshold / 2.5; // Reduced divisor for more tolerance
    var two_sigma_depth: f32 = 2.0 * sigma_depth * sigma_depth;

    var sum: f32 = 0.0;
    var wsum: f32 = 0.0;

    // Enhanced filtering for ultra-smooth results
    for (var x: i32 = -adaptive_filter_size; x <= adaptive_filter_size; x++) {
        var coords: vec2f = vec2f(f32(x));
        var sampled_depth: f32 = abs(textureLoad(texture, vec2u(input.iuv + coords * uniforms.blur_dir), 0).r);

        // Enhanced distance weighting with softer falloff
        var rr: f32 = dot(coords, coords);
        var w: f32 = exp(-rr / two_sigma);

        // More tolerant depth weighting
        var r_depth: f32 = sampled_depth - depth;
        var wd: f32 = exp(-r_depth * r_depth / two_sigma_depth);

        // Additional surface continuity weighting
        var continuity_weight = 1.0;
        if abs(r_depth) < depth_threshold * 0.5 {
            continuity_weight = 1.5; // Boost weights for similar depths
        }

        var final_weight = w * wd * continuity_weight;
        sum += sampled_depth * final_weight;
        wsum += final_weight;
    }

    sum /= wsum;

    // Additional temporal-like smoothing using neighboring pixels
    var neighbor_sum: f32 = 0.0;
    var neighbor_count: f32 = 0.0;

    for (var dy: i32 = -1; dy <= 1; dy++) {
        for (var dx: i32 = -1; dx <= 1; dx++) {
            if dx == 0 && dy == 0 {
                continue;
            }

            var neighbor_coord = input.iuv + vec2f(f32(dx), f32(dy));
            var neighbor_depth = abs(textureLoad(texture, vec2u(neighbor_coord), 0).r);

            if neighbor_depth > 0.0 && neighbor_depth < 1e4 {
                var depth_diff = abs(neighbor_depth - sum);
                if depth_diff < depth_threshold * 2.0 {
                    neighbor_sum += neighbor_depth;
                    neighbor_count += 1.0;
                }
            }
        }
    }

    if neighbor_count > 0.0 {
        var neighbor_avg = neighbor_sum / neighbor_count;
        sum = mix(sum, neighbor_avg, 0.15); // Gentle blending with neighbors
    }

    return vec4f(sum, 0., 0., 1.);
}
