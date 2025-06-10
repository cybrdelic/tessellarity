@group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(3) var thickness_texture: texture_2d<f32>;
@group(0) @binding(4) var envmap_texture: texture_cube<f32>;
@group(0) @binding(5) var<uniform> waterAppearance: WaterAppearance;
@group(0) @binding(6) var<uniform> debug: DebugUniforms;

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

struct DebugUniforms {
    mode: u32,
    layer: u32,
    intensity: f32,
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
    var H: vec3f = normalize(lightDir - rayDir);    // Calculate velocity magnitude and physics variables ONCE
    // Use separate X and Z velocity components for better variation
    var velocityX = length(vec3f(ddx.x, 0.0, 0.0));
    var velocityZ = length(vec3f(0.0, 0.0, ddy.z));
    var velocityMagnitude = sqrt(velocityX * velocityX + velocityZ * velocityZ + length(ddx.y) * length(ddy.y));
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
    normal = normalize(turbulentNormal);    // Surface properties based on turbulence - enhanced for more shine
    var surfaceRoughness = clamp(velocityMagnitude * 0.4 + foamIntensity * 0.25 + turbulenceIntensity * 0.15, 0.0, 0.7);
    var baseSpecularPower = mix(768.0, 48.0, surfaceRoughness); // Increased specular power range
    var specularIntensity = mix(1.8, 0.4, surfaceRoughness); // Increased specular intensity

    // Specular calculations
    var viewDotNormal = abs(dot(normal, -rayDir));
    var fresnelSpecular = pow(1.0 - viewDotNormal, 2.0);
    var specular1: f32 = pow(max(0.0, dot(H, normal)), baseSpecularPower) * specularIntensity * fresnelSpecular;
    var specular2: f32 = pow(max(0.0, dot(H, normal)), baseSpecularPower * 0.25) * specularIntensity * 0.3;
    var specular: f32 = (specular1 + specular2) * (1.0 - foamInfluence * 0.7);    // Enhanced subsurface scattering
    var depthFactor = clamp(abs(viewPos.z) * 0.12, 0.0, 1.0); // Reduced depth influence
    var subsurfaceIntensity = mix(1.6, 0.6, depthFactor); // Increased intensity range
    var subsurface: f32 = max(0.0, dot(-lightDir, normal)) * thickness * subsurfaceIntensity;

    // Move subsurfaceColor calculation AFTER baseWaterColor is defined
    // var subsurfaceColor: vec3f = baseWaterColor * subsurface * mix(2.0, 1.0, waterAppearance.transparency);    // Enhanced realistic absorption that preserves color character
    var baseAbsorption = 0.05; // Higher base absorption for deeper color
    var colorInfluence = 0.3; // Reduced color influence for more subtle tinting
    var absorptionCoeffs = vec3f(
        baseAbsorption + (1.0 - waterAppearance.color.r) * colorInfluence,
        baseAbsorption + (1.0 - waterAppearance.color.g) * colorInfluence,
        baseAbsorption + (1.0 - waterAppearance.color.b) * colorInfluence * 0.8  // Slightly less blue absorption
    );

    // Realistic depth-dependent absorption
    var depthAbsorptionFactor = clamp(thickness * 1.2, 0.2, 3.0); // Increased depth range
    var transmittance: vec3f = exp(-density * depthAbsorptionFactor * absorptionCoeffs);

    // Natural depth-based water color variation
    var thicknessFactor = clamp(thickness * 1.5, 0.0, 1.0);
    var waterInfluence = pow(depthFactor * thicknessFactor, 0.5); // Less aggressive depth falloff

    var lightAngle = abs(dot(normal, lightDir));
    var viewAngle = abs(dot(normal, -rayDir));
    var angleInfluence = mix(0.6, 1.0, lightAngle * viewAngle); // Reduced angle influence range

    // Depth zones with realistic ocean color variation
    var shallowZone = clamp(1.0 - depthFactor * 2.0, 0.0, 1.0);
    var mediumZone = clamp(depthFactor * 2.5 - 0.8, 0.0, 1.0) * clamp(2.0 - depthFactor * 2.5, 0.0, 1.0);
    var deepZone = clamp(depthFactor - 0.4, 0.0, 1.0);

    // Natural ocean color progression
    var shallowAlbedo = mix(waterAppearance.color.rgb, vec3f(0.2, 0.3, 0.35), 0.3); // Darker shallow water
    var mediumAlbedo = waterAppearance.color.rgb * vec3f(0.8, 0.9, 1.0); // Slight blue shift in medium depth
    var deepAlbedo = waterAppearance.color.rgb * vec3f(0.6, 0.7, 0.8); // Darker in deep water

    // Reduced turbidity effect for clearer water
    var turbidityFactor = clamp(velocityMagnitude * 0.15 + turbulenceIntensity * 0.1, 0.0, 1.0);
    var sedimentColor = mix(waterAppearance.color.rgb, vec3f(0.15, 0.2, 0.25), turbidityFactor * 0.2);

    var complexWaterColor = shallowAlbedo * shallowZone + mediumAlbedo * mediumZone + deepAlbedo * deepZone;
    complexWaterColor = mix(complexWaterColor, sedimentColor, turbidityFactor * 0.15);
    complexWaterColor *= angleInfluence;

    var baseWaterColor = mix(complexWaterColor, vec3f(1.0), foamInfluence);

    // NOW define subsurfaceColor after baseWaterColor is available
    var subsurfaceColor: vec3f = baseWaterColor * subsurface * mix(2.0, 1.0, waterAppearance.transparency);

    // Fresnel calculation
    var F0 = 0.02;    var adjustedF0 = F0 + surfaceRoughness * 0.4; // Reduced roughness influence
    var fresnel: f32 = clamp(adjustedF0 + (1.0 - adjustedF0) * pow(1.0 - dot(normal, -rayDir), 4.0), 0., 1.0); // Softer fresnel

    // Enhanced Reflection with boosted intensity
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
    var finalColor = preservedSpecular + refractionComponent + rimColor;    // Apply reflectivity and boost overall brightness
    var reflectivityStrength = waterAppearance.reflectivity * mix(0.9, 0.5, baseTransparency);
    finalColor = mix(finalColor, reflectionColor * 1.4, reflectivityStrength); // Boosted reflection intensity

    // Apply overall brightness boost
    finalColor *= 1.4; // Global brightness multiplier

    // Enhance contrast and brightness for white backgrounds
    var contrastBoost = mix(1.2, 1.6, baseTransparency);
    finalColor = pow(finalColor, vec3f(1.0 / contrastBoost)) * contrastBoost;

    // Adaptive background handling for white backgrounds
    var bgLuminance = dot(bgColor, vec3f(0.299, 0.587, 0.114));
    var isWhiteBackground = step(0.9, bgLuminance);    // Calculate water opacity based on thickness and view angle
    var waterOpacity = mix(
        baseTransparency * 0.5,  // More base opacity
        1.0 - baseTransparency * 0.3,  // Less maximum transparency
        clamp(thickness * (1.0 + fresnel), 0.0, 1.0)
    );

    // Natural fresnel effect
    waterOpacity = mix(waterOpacity, 1.0, fresnel * 0.6);

    // Subtle background interaction
    var bgBoost = isWhiteBackground * 0.15;
    waterOpacity = clamp(waterOpacity + bgBoost, 0.0, 1.0);
    finalColor *= 0.9; // Reduced global brightness for deeper appearance

    // DEBUG MODE VISUALIZATION SYSTEM
    if debug.mode != 0u {
        switch (debug.mode) {            case 1u: { // DEPTH
                // Use view space depth for better visualization
                let viewDepth = abs(viewPos.z);
                let normalizedDepth = viewDepth * debug.intensity * 0.1;
                return vec4f(vec3f(normalizedDepth), 1.0);
            }            case 2u: { // THICKNESS
                // Combine thickness with density for more variation
                let thicknessWithDensity = thickness * density * debug.intensity * 0.2;
                return vec4f(vec3f(thicknessWithDensity), 1.0);
            }
            case 3u: { // NORMALS
                if debug.layer == 0u {
                    // Raw normals (world space)
                    return vec4f(0.5 * normal + 0.5, 1.0);
                } else {
                    // Normal components separated
                    return vec4f(vec3f(abs(normal.x)), 1.0); // X component only
                }
            }            case 4u: { // ABSORPTION
                // Use actual transmittance calculation with density variation
                let actualAbsorption = 1.0 - length(transmittance) * debug.intensity;
                return vec4f(vec3f(actualAbsorption), 1.0);
            }case 5u: { // VELOCITY/FLOW
                // Use actual velocity from position derivatives (more accurate)
                let velocityX = length(ddx) * sign(ddx.x);
                let velocityZ = length(ddy) * sign(ddy.z); 
                let actualVelocity = sqrt(velocityX * velocityX + velocityZ * velocityZ) * debug.intensity;
                return vec4f(vec3f(actualVelocity), 1.0);
            }
            case 6u: { // PRESSURE (derived from compression)
                // Use actual density variation instead of uniform thickness
                let pressureFromDensity = density * debug.intensity * 0.1;
                return vec4f(vec3f(pressureFromDensity), 1.0);
            }
            case 7u: { // CURVATURE
                // Use actual surface curvature from cross product magnitude
                let actualCurvature = length(cross(ddx, ddy)) / (length(ddx) * length(ddy) + 0.001);
                return vec4f(vec3f(actualCurvature * debug.intensity), 1.0);
            }
            case 8u: { // FRESNEL
                return vec4f(vec3f(fresnel), 1.0);
            }            case 9u: { // CAUSTICS
                // Use actual caustics from light convergence calculation
                return vec4f(vec3f(causticsIntensity * debug.intensity), 1.0);
            }
            case 10u: { // REFRACTION
                let refractionStrength = length(rayDir) * debug.intensity;
                return vec4f(vec3f(refractionStrength), 1.0);
            }
            default: {
                return vec4f(1.0, 0.0, 1.0, 1.0); // Error color (magenta)
            }
        }
    }

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
