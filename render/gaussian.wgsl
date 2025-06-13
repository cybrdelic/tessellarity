// @group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: FilterUniforms;

struct GaussianFragmentInput {
    @location(0) uv: vec2f,
    @location(1) iuv: vec2f
}

struct FilterUniforms {
    blur_dir: vec2f, // 解像度で割る
}

@fragment
fn fs(input: GaussianFragmentInput) -> @location(0) vec4f {
    // thickness は unfilterable か？
    var thickness: f32 = textureLoad(texture, vec2u(input.iuv), 0).r;
    if thickness == 0. {
        return vec4f(0., 0., 0., 1.);
    }    // Enhanced filter size for smoother surface reconstruction
    var filter_size: i32 = 30; // Increased for ultra-smooth blending
    var sigma: f32 = f32(filter_size) / 2.0; // Wider Gaussian for maximum smoothness
    var two_sigma: f32 = 2.0 * sigma * sigma;

    var sum = 0.;
    var wsum = 0.;    // Get texture dimensions for boundary checking
    var texture_dims = textureDimensions(texture);

    // Ultra-smooth bilateral-like filtering for seamless surfaces with boundary handling
    var center_thickness = thickness;

    for (var x: i32 = -filter_size; x <= filter_size; x++) {
        var coords: vec2f = vec2f(f32(x));
        var sample_pos = input.iuv + uniforms.blur_dir * coords;

        // Clamp sample position to valid texture bounds
        var clamped_pos = clamp(sample_pos, vec2f(0.0), vec2f(f32(texture_dims.x - 1), f32(texture_dims.y - 1)));
        var sampled_thickness: f32 = textureLoad(texture, vec2u(clamped_pos), 0).r;

        // Check if we're sampling outside bounds and adjust weight accordingly
        var out_of_bounds = any(sample_pos != clamped_pos);
        var boundary_penalty = select(1.0, 0.1, out_of_bounds); // Heavily reduce weight for out-of-bounds samples

        // Spatial weight (Gaussian)
        var spatial_weight: f32 = exp(-coords.x * coords.x / two_sigma) * boundary_penalty;

        // Range weight (preserve boundaries) - much reduced sensitivity for ultra-smooth surface
        var thickness_diff = abs(sampled_thickness - center_thickness);
        var range_weight: f32 = exp(-thickness_diff * thickness_diff * 50.0); // Much reduced from 200.0

        var final_weight = spatial_weight * range_weight;

        sum += sampled_thickness * final_weight;
        wsum += final_weight;
    }

    sum /= wsum;

    return vec4f(sum, 0., 0., 1.);
}
