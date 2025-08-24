// Surface computation utilities - independent geometric calculations
// Pure geometric functions with no cross-dependencies

fn computeViewPosFromUVDepth(tex_coord: vec2f, depth: f32, projection_matrix: mat4x4f, inv_projection_matrix: mat4x4f) -> vec3f {
    var ndc: vec4f = vec4f(tex_coord.x * 2.0 - 1.0, 1.0 - 2.0 * tex_coord.y, 0.0, 1.0);
    ndc.z = -projection_matrix[2].z + projection_matrix[3].z / depth;
    ndc.w = 1.0;

    var eye_pos: vec4f = inv_projection_matrix * ndc;
    return eye_pos.xyz / eye_pos.w;
}

fn getViewPosFromTexCoord(tex_coord: vec2f, iuv: vec2f, texture: texture_2d<f32>,
                         projection_matrix: mat4x4f, inv_projection_matrix: mat4x4f) -> vec3f {
    var depth: f32 = abs(textureLoad(texture, vec2u(iuv), 0).x);
    return computeViewPosFromUVDepth(tex_coord, depth, projection_matrix, inv_projection_matrix);
}

fn safeThicknessSample(coords: vec2f, thickness_texture: texture_2d<f32>) -> f32 {
    var texture_dims = textureDimensions(thickness_texture);
    var clamped_coords = clamp(coords, vec2f(0.0), vec2f(f32(texture_dims.x - 1), f32(texture_dims.y - 1)));
    return textureLoad(thickness_texture, vec2u(clamped_coords), 0).r;
}

fn calculateSurfaceNormal(input: FragmentInput, uniforms: RenderUniforms, texture: texture_2d<f32>) -> vec3f {
    var viewPos = computeViewPosFromUVDepth(input.uv, abs(textureLoad(texture, vec2u(input.iuv), 0).r),
                                           uniforms.projection_matrix, uniforms.inv_projection_matrix);

    // Multi-sample surface normal calculation
    var ddx = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texel_size.x, 0.), input.iuv + vec2f(1.0, 0.0),
                                    texture, uniforms.projection_matrix, uniforms.inv_projection_matrix) - viewPos;
    var ddy = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texel_size.y), input.iuv + vec2f(0.0, 1.0),
                                    texture, uniforms.projection_matrix, uniforms.inv_projection_matrix) - viewPos;
    var ddx2 = viewPos - getViewPosFromTexCoord(input.uv + vec2f(-uniforms.texel_size.x, 0.), input.iuv + vec2f(-1.0, 0.0),
                                               texture, uniforms.projection_matrix, uniforms.inv_projection_matrix);
    var ddy2 = viewPos - getViewPosFromTexCoord(input.uv + vec2f(0., -uniforms.texel_size.y), input.iuv + vec2f(0.0, -1.0),
                                               texture, uniforms.projection_matrix, uniforms.inv_projection_matrix);

    // Choose smoothest gradients
    if abs(ddx.z) > abs(ddx2.z) {
        ddx = ddx2;
    }
    if abs(ddy.z) > abs(ddy2.z) {
        ddy = ddy2;
    }

    // Apply smoothing
    var smoothingFactor = 0.65;
    ddx *= smoothingFactor;
    ddy *= smoothingFactor;

    // Cross-gradient smoothing
    var avgGradient = (ddx + ddy) * 0.5;
    ddx = mix(ddx, avgGradient, 0.2);
    ddy = mix(ddy, avgGradient, 0.2);

    return -normalize(cross(ddx, ddy));
}

fn calculateSmoothThickness(input: FragmentInput, thickness_texture: texture_2d<f32>) -> f32 {
    var thickness = textureLoad(thickness_texture, vec2u(input.iuv), 0).r;

    // Multi-level smoothing
    var thicknessL = safeThicknessSample(input.iuv + vec2f(-1.0, 0.0), thickness_texture);
    var thicknessR = safeThicknessSample(input.iuv + vec2f(1.0, 0.0), thickness_texture);
    var thicknessU = safeThicknessSample(input.iuv + vec2f(0.0, -1.0), thickness_texture);
    var thicknessD = safeThicknessSample(input.iuv + vec2f(0.0, 1.0), thickness_texture);

    // Diagonal samples
    var thicknessLU = safeThicknessSample(input.iuv + vec2f(-1.0, -1.0), thickness_texture);
    var thicknessRU = safeThicknessSample(input.iuv + vec2f(1.0, -1.0), thickness_texture);
    var thicknessLD = safeThicknessSample(input.iuv + vec2f(-1.0, 1.0), thickness_texture);
    var thicknessRD = safeThicknessSample(input.iuv + vec2f(1.0, 1.0), thickness_texture);

    // Bilateral filtering
    var thicknessSum = thickness * 8.0 + (thicknessL + thicknessR + thicknessU + thicknessD) * 4.0 +
                      (thicknessLU + thicknessRU + thicknessLD + thicknessRD) * 2.0;
    var smoothedThickness = thicknessSum / 32.0;

    // Wider-range smoothing
    var thicknessL2 = safeThicknessSample(input.iuv + vec2f(-2.0, 0.0), thickness_texture);
    var thicknessR2 = safeThicknessSample(input.iuv + vec2f(2.0, 0.0), thickness_texture);
    var thicknessU2 = safeThicknessSample(input.iuv + vec2f(0.0, -2.0), thickness_texture);
    var thicknessD2 = safeThicknessSample(input.iuv + vec2f(0.0, 2.0), thickness_texture);

    var wideSmoothedThickness = (smoothedThickness * 4.0 + thicknessL2 + thicknessR2 + thicknessU2 + thicknessD2) / 8.0;

    return mix(thickness, mix(smoothedThickness, wideSmoothedThickness, 0.3), 0.85);
}

fn createSurfaceData(input: FragmentInput, uniforms: RenderUniforms, texture: texture_2d<f32>,
                    thickness_texture: texture_2d<f32>) -> SurfaceData {
    let icoord = vec2u(u32(input.iuv.x), u32(input.iuv.y));
        // Sample depth using integer pixel coordinates derived from interpolated iuv
        let depth = abs(textureLoad(texture, vec2u(input.iuv), 0).r);
    let position = computeViewPosFromUVDepth(input.uv, depth, uniforms.projection_matrix, uniforms.inv_projection_matrix);
    let normal = calculateSurfaceNormal(input, uniforms, texture);
    let thickness = calculateSmoothThickness(input, thickness_texture);
    let d = abs(position.z);
    let rayDir = normalize(position);
    let viewDotNormal = max(dot(normal, -rayDir), 0.0);
    // Coverage estimation (occupancy over 3x3 neighborhood) using thickness texture directly
    var occ = 0.0;
    let threshold = 0.005;
    occ += step(threshold, thickness);
        // Manually sample 8 neighbors (avoid dynamic indexing)
        occ += step(threshold, safeThicknessSample(input.iuv + vec2f(-1.0, 0.0), thickness_texture));
        occ += step(threshold, safeThicknessSample(input.iuv + vec2f( 1.0, 0.0), thickness_texture));
        occ += step(threshold, safeThicknessSample(input.iuv + vec2f( 0.0,-1.0), thickness_texture));
        occ += step(threshold, safeThicknessSample(input.iuv + vec2f( 0.0, 1.0), thickness_texture));
        occ += step(threshold, safeThicknessSample(input.iuv + vec2f(-1.0,-1.0), thickness_texture));
        occ += step(threshold, safeThicknessSample(input.iuv + vec2f( 1.0,-1.0), thickness_texture));
        occ += step(threshold, safeThicknessSample(input.iuv + vec2f(-1.0, 1.0), thickness_texture));
        occ += step(threshold, safeThicknessSample(input.iuv + vec2f( 1.0, 1.0), thickness_texture));
    let coverage = occ / 9.0;
    return SurfaceData(position, normal, thickness, d, rayDir, viewDotNormal, coverage);
}
