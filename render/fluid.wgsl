@group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(3) var thickness_texture: texture_2d<f32>;
@group(0) @binding(4) var envmap_texture: texture_cube<f32>;
@group(0) @binding(5) var<uniform> waterAppearance: WaterAppearance;

struct RenderUniforms {
    texel_size: vec2f,
    sphere_size: f32,
    inv_projection_matrix: mat4x4f,
    projection_matrix: mat4x4f,
    view_matrix: mat4x4f,
    inv_view_matrix: mat4x4f,
}

struct WaterAppearance {
    color: vec4<f32>,
    transparency: f32,
    reflectivity: f32,
    waveHeight: f32,
    padding: f32,
}

struct FragmentInput {
    @location(0) uv: vec2f,
    @location(1) iuv: vec2f,
}

fn computeViewPosFromUVDepth(tex_coord: vec2f, depth: f32) -> vec3f {
    var ndc: vec4f = vec4f(tex_coord.x * 2.0 - 1.0, 1.0 - 2.0 * tex_coord.y, 0.0, 1.0);
    // なんかこれで合う
    ndc.z = -uniforms.projection_matrix[2].z + uniforms.projection_matrix[3].z / depth;
    ndc.w = 1.0;

    var eye_pos: vec4f = uniforms.inv_projection_matrix * ndc;

    return eye_pos.xyz / eye_pos.w;
}

fn getViewPosFromTexCoord(tex_coord: vec2f, iuv: vec2f) -> vec3f {
    var depth: f32 = abs(textureLoad(texture, vec2u(iuv), 0).x);
    return computeViewPosFromUVDepth(tex_coord, depth);
}

@fragment
fn fs(input: FragmentInput) -> @location(0) vec4f {
    var depth: f32 = abs(textureLoad(texture, vec2u(input.iuv), 0).r);

    // Calculate background color for both early return and later use
    var rayDir = normalize(computeViewPosFromUVDepth(input.uv, 1000.0));
    var worldRayDir = (uniforms.inv_view_matrix * vec4f(rayDir, 0.0)).xyz;
    var bgColor = textureSampleLevel(envmap_texture, texture_sampler, worldRayDir, 0.).rgb;

    // Make background transparent, only render water
    if depth >= 1e4 || depth <= 0.0 {
        // Return fully transparent for non-water pixels
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    var viewPos: vec3f = computeViewPosFromUVDepth(input.uv, depth);
    var thickness = textureLoad(thickness_texture, vec2u(input.iuv), 0).r;

    var ddx: vec3f = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texel_size.x, 0.), input.iuv + vec2f(1.0, 0.0)) - viewPos;
    var ddy: vec3f = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texel_size.y), input.iuv + vec2f(0.0, 1.0)) - viewPos;
    var ddx2: vec3f = viewPos - getViewPosFromTexCoord(input.uv + vec2f(-uniforms.texel_size.x, 0.), input.iuv + vec2f(-1.0, 0.0));
    var ddy2: vec3f = viewPos - getViewPosFromTexCoord(input.uv + vec2f(0., -uniforms.texel_size.y), input.iuv + vec2f(0.0, -1.0));

    if abs(ddx.z) > abs(ddx2.z) {
        ddx = ddx2;
    }
    if abs(ddy.z) > abs(ddy2.z) {
        ddy = ddy2;
    }

    var normal: vec3f = -normalize(cross(ddx, ddy));

    // Edge enhancement for better definition against white background
    var edgeFactor = 1.0;
    var depthGradient = length(vec2f(
        abs(ddx.z),
        abs(ddy.z)
    ));
    edgeFactor = mix(1.0, 2.0, clamp(depthGradient * 10.0, 0.0, 1.0));

    rayDir = normalize(viewPos);
    var lightDir = normalize((uniforms.view_matrix * vec4f(0.3, -0.7, -0.6, 0.)).xyz);
    var H: vec3f = normalize(lightDir - rayDir);

    // Calculate velocity magnitude and physics variables ONCE
    var velocityMagnitude = length(ddx + ddy);
    var pressureDensity = 1.0 + thickness * 3.0;
    var depthPressure = abs(viewPos.z) * 0.2;
    var compressionFactor = pow(pressureDensity + depthPressure, 0.8);
    var density = compressionFactor;

    // Cavitation physics calculation
    var hydrostaticPressure = abs(viewPos.z) * 9.81 * 1000.0;
    var dynamicPressure = velocityMagnitude * velocityMagnitude * 500.0;
    var totalPressure = hydrostaticPressure + dynamicPressure;
    var cavitationThreshold = 2337.0;
    var cavitationFactor = clamp((cavitationThreshold - totalPressure) / cavitationThreshold, 0.0, 1.0);

    // Foam and surface calculations
    var turbulence = velocityMagnitude * 0.1;
    var foamIntensity = cavitationFactor * turbulence * 2.0;
    var foamInfluence = foamIntensity;

    // === REYNOLDS NUMBER TURBULENCE PHYSICS === (Keep this!)
    var kinematicViscosity = 0.001;
    var characteristicLength = uniforms.sphere_size;
    var reynoldsNumber = velocityMagnitude * characteristicLength / kinematicViscosity;
    var turbulenceOnset = 4000.0;
    var turbulenceIntensity = clamp((reynoldsNumber - turbulenceOnset) / turbulenceOnset, 0.0, 1.0);

    // Create turbulent vorticity from velocity gradients
    var velocityGradient = ddx + ddy;
    var vorticity = cross(ddx, ddy);
    var vorticityMagnitude = length(vorticity) * turbulenceIntensity;

    // Kolmogorov cascade
    var kolmogorovScale = pow(pow(kinematicViscosity, 3.0) / (velocityMagnitude * velocityMagnitude * velocityMagnitude + 1e-6), 0.25);
    var cascadeEffect = 1.0 / (1.0 + kolmogorovScale * 10.0);

    // Apply turbulent surface deformation
    var turbulentDeformation = vorticity * 0.02 * turbulenceIntensity * cascadeEffect; // Reduced from 0.05
    var turbulentNormal = normal + turbulentDeformation;

    // Simplified high-frequency details based on flow simulation
    var highFreqTurbulence = vec3f(
        sin(viewPos.x * 15.0 + vorticityMagnitude * 10.0) * turbulenceIntensity * 0.01,
        0.0,
        cos(viewPos.z * 15.0 + cascadeEffect * 8.0) * turbulenceIntensity * 0.01
    );
    turbulentNormal += highFreqTurbulence;
    normal = normalize(turbulentNormal);

    // Surface properties based on turbulence
    var surfaceRoughness = clamp(velocityMagnitude * 0.5 + foamIntensity * 0.3 + turbulenceIntensity * 0.2, 0.0, 0.8);
    var baseSpecularPower = mix(512.0, 32.0, surfaceRoughness);
    var specularIntensity = mix(1.2, 0.3, surfaceRoughness);

    // Specular calculations
    var viewDotNormal = abs(dot(normal, -rayDir));
    var fresnelSpecular = pow(1.0 - viewDotNormal, 2.0);
    var specular1: f32 = pow(max(0.0, dot(H, normal)), baseSpecularPower) * specularIntensity * fresnelSpecular;
    var specular2: f32 = pow(max(0.0, dot(H, normal)), baseSpecularPower * 0.25) * specularIntensity * 0.3;
    var specular: f32 = (specular1 + specular2) * (1.0 - foamInfluence * 0.7);

    // Enhanced subsurface scattering
    var depthFactor = clamp(abs(viewPos.z) * 0.15, 0.0, 1.0);
    var subsurfaceIntensity = mix(1.2, 0.4, depthFactor); // Increased intensity
    var subsurface: f32 = max(0.0, dot(-lightDir, normal)) * thickness * subsurfaceIntensity;

    // Move subsurfaceColor calculation AFTER baseWaterColor is defined
    // var subsurfaceColor: vec3f = baseWaterColor * subsurface * mix(2.0, 1.0, waterAppearance.transparency);

    // Enhanced realistic absorption that preserves color character
    var baseAbsorption = 0.03; // Reduced base absorption
    var colorInfluence = 0.3; // Increased color influence
    var absorptionCoeffs = vec3f(
        baseAbsorption + (1.0 - waterAppearance.color.r) * colorInfluence,
        baseAbsorption + (1.0 - waterAppearance.color.g) * colorInfluence * 0.8, // Less green absorption
        baseAbsorption + (1.0 - waterAppearance.color.b) * colorInfluence * 0.6  // Even less blue absorption
    );

    // Depth-dependent absorption
    var depthAbsorptionFactor = clamp(thickness * 0.8, 0.1, 2.0);
    var transmittance: vec3f = exp(-density * depthAbsorptionFactor * absorptionCoeffs);

    // Depth-based water color variation
    var thicknessFactor = clamp(thickness * 2.0, 0.0, 1.0);
    var waterInfluence = pow(depthFactor * thicknessFactor, 0.3);

    var lightAngle = abs(dot(normal, lightDir));
    var viewAngle = abs(dot(normal, -rayDir));
    var angleInfluence = mix(0.7, 1.2, lightAngle * viewAngle);

    // Depth zones
    var shallowZone = clamp(1.0 - depthFactor * 1.5, 0.0, 1.0);
    var mediumZone = clamp(depthFactor * 2.5 - 0.8, 0.0, 1.0) * clamp(1.8 - depthFactor * 2.5, 0.0, 1.0);
    var deepZone = clamp(depthFactor - 0.7, 0.0, 1.0);

    var shallowAlbedo = mix(waterAppearance.color.rgb, vec3f(1.0, 1.0, 1.0), 0.2);
    var mediumAlbedo = waterAppearance.color.rgb;
    var deepAlbedo = waterAppearance.color.rgb * vec3f(0.8, 0.85, 0.95);

    var turbidityFactor = clamp(velocityMagnitude * 0.3 + turbulenceIntensity * 0.2, 0.0, 1.0);
    var sedimentColor = mix(waterAppearance.color.rgb, vec3f(0.9, 0.85, 0.7), turbidityFactor * 0.2);

    var complexWaterColor = shallowAlbedo * shallowZone + mediumAlbedo * mediumZone + deepAlbedo * deepZone;
    complexWaterColor = mix(complexWaterColor, sedimentColor, turbidityFactor * 0.15);
    complexWaterColor *= angleInfluence;

    var baseWaterColor = mix(complexWaterColor, vec3f(1.0), foamInfluence);

    // NOW define subsurfaceColor after baseWaterColor is available
    var subsurfaceColor: vec3f = baseWaterColor * subsurface * mix(2.0, 1.0, waterAppearance.transparency);

    // Fresnel calculation
    var F0 = 0.02;
    var adjustedF0 = F0 + surfaceRoughness * 0.6;
    var fresnel: f32 = clamp(adjustedF0 + (1.0 - adjustedF0) * pow(1.0 - dot(normal, -rayDir), 5.0), 0., 1.0);

    // Reflection
    var reflectionDir: vec3f = reflect(rayDir, normal);
    var reflectionDirWorld: vec3f = (uniforms.inv_view_matrix * vec4f(reflectionDir, 0.0)).xyz;
    var reflectionColor: vec3f = textureSampleLevel(envmap_texture, texture_sampler, reflectionDirWorld, 0.).rgb;

    // Refraction with proper physics
    var waterRefractiveIndex = 1.33;
    var airRefractiveIndex = 1.0;
    var eta = airRefractiveIndex / waterRefractiveIndex;

    var refractionDir: vec3f = refract(rayDir, normal, eta);
    if length(refractionDir) < 0.1 {
        refractionDir = reflect(rayDir, normal);
    }

    var refractionDirWorld: vec3f = (uniforms.inv_view_matrix * vec4f(refractionDir, 0.0)).xyz;
    var refractedBgColor: vec3f = textureSampleLevel(envmap_texture, texture_sampler, refractionDirWorld, 0.).rgb;

    // Chromatic dispersion
    var dispersionStrength = 0.4 * thickness;
    var redEta = eta * 0.999;
    var blueEta = eta * 1.001;

    var redRefractionDir = refract(rayDir, normal, redEta);
    var blueRefractionDir = refract(rayDir, normal, blueEta);

    if length(redRefractionDir) < 0.1 {
        redRefractionDir = refractionDir;
    }
    if length(blueRefractionDir) < 0.1 {
        blueRefractionDir = refractionDir;
    }

    var redRefractedWorld = (uniforms.inv_view_matrix * vec4f(redRefractionDir, 0.0)).xyz;
    var blueRefractedWorld = (uniforms.inv_view_matrix * vec4f(blueRefractionDir, 0.0)).xyz;

    var dispersedRefraction = vec3f(
        textureSampleLevel(envmap_texture, texture_sampler, redRefractedWorld, 0.).r,
        refractedBgColor.g,
        textureSampleLevel(envmap_texture, texture_sampler, blueRefractedWorld, 0.).b
    );

    // REMOVE VOLUMETRIC SCATTERING - it's causing the lattice
    // Use the flow simulation data directly instead

    // CAUSTICS FROM FLOW SIMULATION DATA
    var causticsIntensity = 0.0;
    var causticsColor = vec3f(0.0);

    // Use actual surface curvature from the simulation
    var surfaceCurvature = length(cross(ddx, ddy)) / (length(ddx) * length(ddy) + 0.001); // Actual curvature
    var normalCurvature = length(ddx + ddy); // Surface variation from simulation

    // Calculate light convergence based on surface normal variation
    var lightConvergence = 0.0;
    var lightDir3D = normalize(vec3f(0.3, -0.7, -0.6)); // World space light direction

    // Sample neighboring normals to calculate light focusing
    var neighborOffsets = array<vec2f, 4>(
        vec2f(uniforms.texel_size.x, 0.0),
        vec2f(-uniforms.texel_size.x, 0.0),
        vec2f(0.0, uniforms.texel_size.y),
        vec2f(0.0, -uniforms.texel_size.y)
    );

    var avgNormalDivergence = 0.0;
    for (var i = 0; i < 4; i = i + 1) {
        var neighborUV = input.uv + neighborOffsets[i];
        if all(neighborUV >= vec2f(0.0)) && all(neighborUV <= vec2f(1.0)) {
            var neighborDepth = abs(textureLoad(texture, vec2u(neighborUV / uniforms.texel_size), 0).r);
            if neighborDepth < 1e4 && neighborDepth > 0.0 {
                var neighborViewPos = computeViewPosFromUVDepth(neighborUV, neighborDepth);
                var neighborDdx = neighborViewPos - viewPos;
                var neighborDdy = neighborViewPos - viewPos;
                var neighborNormal = normalize(cross(neighborDdx, neighborDdy));
                avgNormalDivergence += dot(normal, neighborNormal);
            }
        }
    }
    avgNormalDivergence /= 4.0;

    // Light convergence based on how much normals are focusing light
    lightConvergence = 1.0 - avgNormalDivergence; // Higher when normals converge

    // Caustics intensity from actual light focusing
    causticsIntensity = lightConvergence * surfaceCurvature * thickness * 2.0;
    causticsIntensity = clamp(causticsIntensity, 0.0, 1.0);

    // Caustics color - brighter where light focuses
    causticsColor = mix(baseWaterColor, vec3f(1.4, 1.3, 1.1), causticsIntensity);

    // ENHANCED REFRACTION using flow data instead of random sampling
    var flowBasedRefraction = refractedBgColor;

    // Use velocity to create flow-based distortion
    var flowDistortion = vec2f(ddx.x, ddy.y) * 0.01; // Use actual flow gradients
    var distortedRefractionDir = normalize(refractionDir + vec3f(flowDistortion, 0.0));
    var distortedRefractionWorld = (uniforms.inv_view_matrix * vec4f(distortedRefractionDir, 0.0)).xyz;
    flowBasedRefraction = textureSampleLevel(envmap_texture, texture_sampler, distortedRefractionWorld, 0.).rgb;

    // Blend with caustics based on flow simulation data
    var enhancedRefractedColor = mix(flowBasedRefraction, causticsColor, causticsIntensity * 0.6);

    // Use enhanced refraction
    var properRefractedColor = mix(enhancedRefractedColor, dispersedRefraction, dispersionStrength * clamp(thickness, 0.0, 1.0));

    // FIX DEPTH COLORING - use thickness for depth-based effects instead of redeclaring depthFactor
    var thicknessBasedDepth = clamp(thickness * 2.0, 0.0, 1.0); // Use different variable name
    var shallowColor = mix(vec3f(1.0), baseWaterColor, 0.3);
    var deepColor = baseWaterColor * vec3f(0.6, 0.7, 0.8);

    var depthBasedWaterColor = mix(shallowColor, deepColor, thicknessBasedDepth);
    depthBasedWaterColor = mix(depthBasedWaterColor, vec3f(1.0), foamInfluence * (1.0 - thicknessBasedDepth));

    var minWaterInfluence = 0.2;
    var waterInfluenceCorrect = clamp(density * thickness * 0.8, minWaterInfluence, 1.0);
    var waterColoredRefraction = mix(properRefractedColor, depthBasedWaterColor, waterInfluenceCorrect * (1.0 - waterAppearance.transparency * 0.7));

    var depthAbsorption = exp(-thickness * 1.2);
    var finalRefractionColor = waterColoredRefraction * depthAbsorption + subsurfaceColor * (1.0 - thicknessBasedDepth);

    var waterWithEffects = mix(finalRefractionColor, reflectionColor, fresnel);

    // Enhanced transparency that preserves effects
    var baseTransparency = waterAppearance.transparency;

    // Preserve specular and fresnel effects even with high transparency
    var preservedSpecular = specular * mix(1.0, 0.3, baseTransparency);
    var preservedFresnel = fresnel * mix(1.0, 0.7, baseTransparency);

    // Enhanced refraction blending that maintains water characteristics
    var transparentRefraction = mix(properRefractedColor, waterColoredRefraction, 1.0 - baseTransparency * 0.8);

    // Maintain water color influence even with transparency
    var waterColorStrength = mix(1.0, 0.4, baseTransparency);
    var coloredRefraction = mix(transparentRefraction, depthBasedWaterColor, waterColorStrength * waterInfluenceCorrect);

    // Caustics should remain visible with transparency
    var visibleCaustics = mix(coloredRefraction, causticsColor, causticsIntensity * mix(0.6, 0.3, baseTransparency));

    // Improved final composition
    var refractionComponent = mix(visibleCaustics, reflectionColor, preservedFresnel);

    // Rim lighting for better edge definition against white background
    var rimIntensity = pow(1.0 - abs(dot(normal, -rayDir)), 3.0);
    var rimColor = waterAppearance.color.rgb * rimIntensity * 0.5;

    // Single finalColor declaration with all components
    var finalColor = preservedSpecular + refractionComponent + rimColor;

    // Apply reflectivity without washing out effects
    var reflectivityStrength = waterAppearance.reflectivity * mix(0.8, 0.4, baseTransparency);
    finalColor = mix(finalColor, reflectionColor, reflectivityStrength);

    // Enhance contrast for white backgrounds
    var contrastBoost = mix(1.0, 1.4, baseTransparency);
    finalColor = pow(finalColor, vec3f(1.0 / contrastBoost)) * contrastBoost;

    // Adaptive background handling for white backgrounds
    var bgLuminance = dot(bgColor, vec3f(0.299, 0.587, 0.114));
    var isWhiteBackground = step(0.9, bgLuminance);    // Calculate water opacity based on thickness and view angle
    var waterOpacity = mix(
        baseTransparency * 0.4,  // Increased minimum opacity for better visibility
        1.0 - baseTransparency * 0.6,  // Adjusted maximum opacity
        clamp(thickness * (1.0 + fresnel) * 1.2, 0.0, 1.0) // Enhanced thickness influence
    );

    // Enhanced fresnel effect on opacity for better edge definition
    waterOpacity = mix(waterOpacity, 1.0, fresnel * 0.8);

    // Apply additional opacity boost for white backgrounds
    var bgBoost = isWhiteBackground * 0.2;
    waterOpacity = clamp(waterOpacity + bgBoost, 0.0, 1.0);

    return vec4f(finalColor, waterOpacity);

    // return vec4f(viewPos.y * 100, 0, 0, 1.0);

    // 法線
    // return vec4f(0.5 * normal + 0.5, 1.);
    // 法線の y 成分
    // return vec4f(vec3f(normal.x, 0, 0), 1);
    // return vec4f(vec3f(normal.y, 0, 0), 1);
    // return vec4f(vec3f(normal.z, 0, 0), 1);
    // specular だけ
    // return vec4f(vec3f(specular), 1);
    // reflection だけ
    // return vec4f(reflectionColor, 1.);
    // return vec4f(fresnel, 0., 0., 1.);
}
