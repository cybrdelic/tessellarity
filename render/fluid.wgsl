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

    // Move texture sampling operations before any conditionals
    var reflection: vec3f;
    var finalColor: vec3f;

    // Use environment map as background instead of white
    if depth >= 1e4 || depth <= 0. {
        return vec4f(bgColor, 1.);
    }

    var viewPos: vec3f = computeViewPosFromUVDepth(input.uv, depth); // z は負

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
    // Update rayDir calculation to use the actual view direction for this pixel
    rayDir = normalize(viewPos);
    var lightDir = normalize((uniforms.view_matrix * vec4f(0.3, -0.7, -0.6, 0.)).xyz);
    var H: vec3f = normalize(lightDir - rayDir);
    var specular1: f32 = pow(max(0.0, dot(H, normal)), 128.0) * 1.0; // Sharp highlight
    var specular2: f32 = pow(max(0.0, dot(H, normal)), 32.0) * 0.5;  // Broader highlight
    var specular: f32 = specular1 + specular2;
    var diffuse: f32 = max(0.0, dot(lightDir, normal)) * 1.0;

    var density = 1.5;

    var thickness = textureLoad(thickness_texture, vec2u(input.iuv), 0).r;
    var diffuseColor = waterAppearance.color.rgb;

    // Calculate velocity magnitude first (needed for pressure calculations)
    var velocityMagnitude = length(ddx + ddy);

    // MLS-MPM pressure-based density calculation from simulation
    var pressureDensity = 1.0 + thickness * 3.0;  // From p2g_2.wgsl pressure calculation
    var depthPressure = abs(viewPos.z) * 0.2;     // Hydrostatic pressure
    var compressionFactor = pow(pressureDensity + depthPressure, 0.8); // Non-linear compression
    density = compressionFactor;

    // Add cavitation physics calculation
    var hydrostaticPressure = abs(viewPos.z) * 9.81 * 1000.0; // ρgh in Pascals
    var dynamicPressure = velocityMagnitude * velocityMagnitude * 500.0; // 0.5ρv² approximation
    var totalPressure = hydrostaticPressure + dynamicPressure;
    var cavitationThreshold = 2337.0; // Vapor pressure of water at 20°C in Pascals
    var cavitationFactor = clamp((cavitationThreshold - totalPressure) / cavitationThreshold, 0.0, 1.0);

    // Generate foam/bubbles in cavitating regions
    var turbulence = velocityMagnitude * 0.1; // Move turbulence calculation here too
    var foamIntensity = cavitationFactor * turbulence * 2.0;
    var foamColor = mix(vec3f(1.0, 1.0, 1.0), waterAppearance.color.rgb, 0.3); // Foam tinted with water color

    // === REYNOLDS NUMBER TURBULENCE PHYSICS ===
    // Calculate Reynolds number from MLS-MPM velocity field
    var kinematicViscosity = 0.001; // Water viscosity m²/s
    var characteristicLength = uniforms.sphere_size; // Particle size as length scale
    var reynoldsNumber = velocityMagnitude * characteristicLength / kinematicViscosity;

    // Turbulent flow occurs when Re > 2000 for pipe flow, ~4000 for open flow
    var turbulenceOnset = 4000.0;
    var turbulenceIntensity = clamp((reynoldsNumber - turbulenceOnset) / turbulenceOnset, 0.0, 1.0);

    // Create turbulent vorticity from velocity gradients (from MLS-MPM grid)
    var velocityGradient = ddx + ddy; // Velocity field gradient
    var vorticity = cross(ddx, ddy); // Vorticity = curl of velocity field
    var vorticityMagnitude = length(vorticity) * turbulenceIntensity;

    // Kolmogorov cascade - energy dissipation at small scales
    var kolmogorovScale = pow(pow(kinematicViscosity, 3.0) / (velocityMagnitude * velocityMagnitude * velocityMagnitude + 1e-6), 0.25);
    var cascadeEffect = 1.0 / (1.0 + kolmogorovScale * 10.0);

    // Apply turbulent surface deformation
    var turbulentDeformation = vorticity * 0.05 * turbulenceIntensity * cascadeEffect;
    var turbulentNormal = normal + turbulentDeformation;

    // Add high-frequency turbulent details
    var highFreqTurbulence = vec3f(
        sin(viewPos.x * 25.0 + vorticityMagnitude * 15.0) * turbulenceIntensity * 0.02,
        cos(viewPos.y * 20.0 + reynoldsNumber * 0.001) * turbulenceIntensity * 0.01,
        sin(viewPos.z * 30.0 + cascadeEffect * 10.0) * turbulenceIntensity * 0.02
    );
    turbulentNormal += highFreqTurbulence;

    // Additional surface perturbation using velocity from MLS-MPM
    turbulentNormal += vec3f(
        sin(viewPos.x * 15.0 + turbulence * 20.0) * turbulence,
        0.0,
        cos(viewPos.z * 15.0 + turbulence * 20.0) * turbulence
    );
    normal = normalize(turbulentNormal);

    // Enhanced subsurface scattering with depth-dependent intensity
    var depthFactor = clamp(abs(viewPos.z) * 0.15, 0.0, 1.0); // Reduced multiplier for less extreme depth effects
    var subsurfaceIntensity = mix(0.8, 0.3, depthFactor); // Increased base scattering
    var subsurface: f32 = max(0.0, dot(-lightDir, normal)) * thickness * subsurfaceIntensity;

    // Lighter absorption coefficients for more realistic water
    var baseAbsorption = 0.05; // Reduced from 0.1
    var absorptionCoeffs = vec3f(
        baseAbsorption + (1.0 - waterAppearance.color.r) * 0.2, // Reduced from 0.4
        baseAbsorption + (1.0 - waterAppearance.color.g) * 0.2,
        baseAbsorption + (1.0 - waterAppearance.color.b) * 0.2
    );
    var transmittance: vec3f = exp(-density * thickness * absorptionCoeffs);

    // More realistic depth-based albedo variation
    var thicknessFactor = clamp(thickness * 2.0, 0.0, 1.0); // Reduced from 3.0
    var waterInfluence = pow(depthFactor * thicknessFactor, 0.3); // Reduced from 0.5 for less contrast

    // Improved lighting model
    var lightAngle = abs(dot(normal, lightDir));
    var viewAngle = abs(dot(normal, -rayDir));
    var angleInfluence = mix(0.7, 1.2, lightAngle * viewAngle); // Brighter base lighting

    // Brighter depth zones
    var shallowZone = clamp(1.0 - depthFactor * 1.5, 0.0, 1.0); // Less aggressive depth transition
    var mediumZone = clamp(depthFactor * 2.5 - 0.8, 0.0, 1.0) * clamp(1.8 - depthFactor * 2.5, 0.0, 1.0);
    var deepZone = clamp(depthFactor - 0.7, 0.0, 1.0);

    // Brighter albedo for each zone
    var shallowAlbedo = mix(waterAppearance.color.rgb, vec3f(1.0, 1.0, 1.0), 0.2); // Less blue tint, more white
    var mediumAlbedo = waterAppearance.color.rgb;
    var deepAlbedo = waterAppearance.color.rgb * vec3f(0.8, 0.85, 0.95); // Less darkening

    // Lighter sediment effects
    var turbidityFactor = clamp(velocityMagnitude * 0.3, 0.0, 1.0); // Reduced effect
    var sedimentColor = mix(waterAppearance.color.rgb, vec3f(0.9, 0.85, 0.7), turbidityFactor * 0.2);

    // Combine all albedo effects
    var complexWaterColor = shallowAlbedo * shallowZone + mediumAlbedo * mediumZone + deepAlbedo * deepZone;

    // Apply sediment influence
    complexWaterColor = mix(complexWaterColor, sedimentColor, turbidityFactor * 0.15);

    // Apply brighter lighting
    complexWaterColor *= angleInfluence;

    // Foam effects
    var foamInfluence = clamp(foamIntensity * 2.0, 0.0, 0.6); // Reduced foam intensity
    var baseWaterColor = mix(complexWaterColor, vec3f(1.0), foamInfluence);

    // Brighter subsurface scattering
    var subsurfaceColor: vec3f = baseWaterColor * subsurface * 1.5; // Increased multiplier

    // More balanced depth coloring
    var ambientLight = vec3f(0.3, 0.4, 0.5); // Add ambient lighting
    var depthColoredRefraction = mix(bgColor + ambientLight, baseWaterColor, waterInfluence * 0.8) * transmittance + subsurfaceColor;

    let F0 = 0.04;

    // Physics-based Fresnel
    var surfaceRoughness = clamp(velocityMagnitude * 0.3, 0.0, 0.2); // Reduced roughness
    var adjustedF0 = F0 + surfaceRoughness;
    var fresnel: f32 = clamp(adjustedF0 + (1.0 - adjustedF0) * pow(1.0 - dot(normal, -rayDir), 5.0), 0., 1.0);

    var reflectionDir: vec3f = reflect(rayDir, normal);
    var reflectionDirWorld: vec3f = (uniforms.inv_view_matrix * vec4f(reflectionDir, 0.0)).xyz;
    var reflectionColor: vec3f = textureSampleLevel(envmap_texture, texture_sampler, reflectionDirWorld, 0.).rgb;

    // REAL WATER REFRACTION - bend light rays based on water's refractive index
    var waterRefractiveIndex = 1.33; // Water's refractive index
    var airRefractiveIndex = 1.0;    // Air's refractive index
    var eta = airRefractiveIndex / waterRefractiveIndex; // Ratio for Snell's law

    // Calculate refracted ray direction using Snell's law
    var refractionDir: vec3f = refract(rayDir, normal, eta);

    // Check for total internal reflection
    if length(refractionDir) < 0.1 {
        // Fall back to reflection if total internal reflection occurs
        refractionDir = reflect(rayDir, normal);
    }

    var refractionDirWorld: vec3f = (uniforms.inv_view_matrix * vec4f(refractionDir, 0.0)).xyz;

    // Sample the environment in the refracted direction for realistic light bending
    var refractedBgColor: vec3f = textureSampleLevel(envmap_texture, texture_sampler, refractionDirWorld, 0.).rgb;

    // Much subtler chromatic dispersion - real water dispersion is very small
    var dispersionStrength = 0.003 * thickness; // Reduced from 0.02 - much more realistic
    var redEta = eta * 0.999; // Red light bends slightly less
    var blueEta = eta * 1.001; // Blue light bends slightly more

    var redRefractionDir = refract(rayDir, normal, redEta);
    var blueRefractionDir = refract(rayDir, normal, blueEta);

    // Handle total internal reflection for dispersed rays too
    if length(redRefractionDir) < 0.1 {
        redRefractionDir = refractionDir;
    }
    if length(blueRefractionDir) < 0.1 {
        blueRefractionDir = refractionDir;
    }

    var redRefractedWorld = (uniforms.inv_view_matrix * vec4f(redRefractionDir, 0.0)).xyz;
    var blueRefractedWorld = (uniforms.inv_view_matrix * vec4f(blueRefractionDir, 0.0)).xyz;

    // Only apply subtle dispersion in thick water areas
    var dispersedRefraction = vec3f(
        textureSampleLevel(envmap_texture, texture_sampler, redRefractedWorld, 0.).r,
        refractedBgColor.g,
        textureSampleLevel(envmap_texture, texture_sampler, blueRefractedWorld, 0.).b
    );

    // Use much less dispersion - only visible in very thick water
    var properRefractedColor = mix(refractedBgColor, dispersedRefraction, dispersionStrength * clamp(thickness - 0.5, 0.0, 1.0));

    // Apply water color to the refracted light (absorption/scattering)
    var waterColoredRefraction = mix(properRefractedColor, baseWaterColor, waterInfluence * (1.0 - waterAppearance.transparency));

    // Apply transmittance and subsurface scattering to refracted light
    var finalRefractionColor = waterColoredRefraction * transmittance + subsurfaceColor;

    // Mix refraction and reflection based on Fresnel
    var waterWithEffects = mix(finalRefractionColor, reflectionColor, fresnel);

    // Transparency now controls how much of the water effect vs pure refracted background
    var clearWaterEffect = mix(waterWithEffects, properRefractedColor, waterAppearance.transparency * 0.7);

    // Final composition
    finalColor = specular * 0.8 + clearWaterEffect;
    finalColor = mix(finalColor, reflectionColor, waterAppearance.reflectivity * 0.8);

    // Apply wave height to normal calculation
    normal = normalize(normal + (normal * waterAppearance.waveHeight));

    return vec4f(finalColor, 1.0);

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
