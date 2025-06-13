// @group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: FilterUniforms;

struct BilateralFragmentInput {
    @location(0) uv: vec2f,
    @location(1) iuv: vec2f,
}

override depth_threshold: f32;
override projected_particle_constant: f32;
override max_filter_size: f32;

struct FilterUniforms {
    blur_dir: vec2f,
}

@fragment
fn fs(input: BilateralFragmentInput) -> @location(0) vec4f {
    var depth: f32 = abs(textureLoad(texture, vec2u(input.iuv), 0).r);

    if depth >= 1e4 || depth <= 0. {
        return vec4f(vec3f(depth), 1.);
    }

    // Get texture dimensions for boundary checking
    var texture_dims = textureDimensions(texture);    var base_filter_size: i32 = min(i32(max_filter_size), i32(projected_particle_constant / depth));
    var adaptive_filter_size: i32 = max(base_filter_size, 16);

    var sigma: f32 = f32(adaptive_filter_size) / 1.5;
    var two_sigma: f32 = 2.0 * sigma * sigma;
    var sigma_depth: f32 = depth_threshold / 0.8;
    var two_sigma_depth: f32 = 2.0 * sigma_depth * sigma_depth;

    var sum: f32 = 0.0;
    var wsum: f32 = 0.0;    for (var x: i32 = -adaptive_filter_size; x <= adaptive_filter_size; x++) {
        var coords: vec2f = vec2f(f32(x));
        var sample_pos = input.iuv + coords * uniforms.blur_dir;

        var clamped_pos = clamp(sample_pos, vec2f(0.0), vec2f(f32(texture_dims.x - 1), f32(texture_dims.y - 1)));
        var sampled_depth: f32 = abs(textureLoad(texture, vec2u(clamped_pos), 0).r);

        if sampled_depth <= 0.0 || sampled_depth >= 1e4 {
            continue;
        }

        var rr: f32 = dot(coords, coords);
        var w: f32 = exp(-rr / two_sigma);

        var r_depth: f32 = sampled_depth - depth;
        var wd: f32 = exp(-r_depth * r_depth / two_sigma_depth);

        var continuity_weight = 1.0;
        if abs(r_depth) < depth_threshold * 1.2 {
            continuity_weight = 2.5;
        }

        var final_weight = w * wd * continuity_weight;
        sum += sampled_depth * final_weight;
        wsum += final_weight;
    }

    if wsum > 0.0 {
        sum /= wsum;
    } else {
        sum = depth;
    }    var neighbor_sum: f32 = 0.0;
    var neighbor_wsum: f32 = 0.0;
    var radius: i32 = 4;

    for (var dy: i32 = -radius; dy <= radius; dy++) {
        for (var dx: i32 = -radius; dx <= radius; dx++) {
            if dx == 0 && dy == 0 {
                continue;
            }

            var neighbor_coord = input.iuv + vec2f(f32(dx), f32(dy));

            if neighbor_coord.x >= 0.0 && neighbor_coord.x < f32(texture_dims.x) && neighbor_coord.y >= 0.0 && neighbor_coord.y < f32(texture_dims.y) {

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

    if neighbor_wsum > 0.0 {
        var neighbor_avg = neighbor_sum / neighbor_wsum;
        sum = mix(sum, neighbor_avg, 0.6);
    }

    return vec4f(sum, 0., 0., 1.);
}
