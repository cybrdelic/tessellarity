// MODULAR FLUID SHADER - Clean separation of concerns
// Each effect is independent and can be toggled/modified without affecting others

// Include all effect modules
#include "effects/types.wgsl"
#include "effects/surface.wgsl"
#include "effects/physics.wgsl"
#include "effects/lighting.wgsl"
#include "effects/optical.wgsl"
#include "effects/coloring.wgsl"

// Bindings - same as before for compatibility
@group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(3) var thickness_texture: texture_2d<f32>;
@group(0) @binding(4) var envmap_texture: texture_cube<f32>;
@group(0) @binding(5) var<uniform> waterAppearance: WaterAppearance;
@group(0) @binding(6) var<uniform> debug: DebugUniforms;
@group(0) @binding(7) var<uniform> effectsToggle: EffectsToggle;
@group(0) @binding(8) var<uniform> lightingControls: LightingControls;
@group(0) @binding(9) var<uniform> effectParams: EffectParameters;

// Keep the same structs for compatibility with existing code
struct EffectsToggle {
    enableReynoldsPhysics: u32,
    enableCavitation: u32,
    enableFoam: u32,
    enableTurbulentNormals: u32,
    enableSpecular: u32,
    enableSubsurface: u32,
    enableFresnel: u32,
    enableReflection: u32,
    enableRefraction: u32,
    enableCaustics: u32,
    enableDispersion: u32,
    enableAbsorption: u32,
    enableDepthColoring: u32,
    enableVelocityColoring: u32,
    enableRimLighting: u32,
    enableColorAbsorption: u32,
}

struct LightingControls {
    mainLightDirection: vec3f,
    mainLightIntensity: f32,
    mainLightColor: vec3f,
    mainLightEnabled: u32,
    fillLightDirection: vec3f,
    fillLightIntensity: f32,
    fillLightColor: vec3f,
    fillLightEnabled: u32,
    rimLightDirection: vec3f,
    rimLightIntensity: f32,
    rimLightColor: vec3f,
    rimLightEnabled: u32,
    ambientIntensity: f32,
    ambientColor: vec3f,
    shadowIntensity: f32,
    lightingMode: u32,
    specularIntensityMultiplier: f32,
    subsurfaceIntensityMultiplier: f32,
    lightingPower: f32,
    lightingContrast: f32,
    volumetricIntensity: f32,
    rimLightingPower: f32,
    lightingPadding1: f32,
    lightingPadding2: f32,
    lightingPadding3: f32,
    lightingPadding4: f32,
}

struct EffectParameters {
    reynoldsScale: f32,
    turbulenceStrength: f32,
    viscosityFactor: f32,
    cascadeEffect: f32,
    cavitationThreshold: f32,
    cavitationStrength: f32,
    pressureScale: f32,
    cavitationFalloff: f32,
    foamIntensity: f32,
    foamThreshold: f32,
    foamDecay: f32,
    foamCoverage: f32,
    normalStrength: f32,
    normalScale: f32,
    normalSmoothness: f32,
    normalStability: f32,
    specularPower: f32,
    specularScale: f32,
    specularRoughness: f32,
    specularFresnel: f32,
    subsurfaceDepth: f32,
    subsurfaceScale: f32,
    subsurfaceColor: f32,
    subsurfaceDistortion: f32,
    fresnelPower: f32,
    fresnelScale: f32,
    fresnelBias: f32,
    fresnelContrast: f32,
    reflectionStrength: f32,
    reflectionBlur: f32,
    reflectionDistortion: f32,
    reflectionFade: f32,
    refractionStrength: f32,
    refractionIndex: f32,
    refractionChromatic: f32,
    refractionScale: f32,
    causticsStrength: f32,
    causticsScale: f32,
    causticsSpeed: f32,
    causticsContrast: f32,
    absorptionStrength: f32,
    absorptionDepth: f32,
    absorptionColor: f32,
    absorptionScattering: f32,
    depthColorStrength: f32,
    depthColorScale: f32,
    depthColorContrast: f32,
    depthColorSaturation: f32,
    velocityColorStrength: f32,
    velocityColorScale: f32,
    velocityColorContrast: f32,
    velocityColorThreshold: f32,
    rimLightStrength: f32,
    rimLightPower: f32,
    rimLightScale: f32,
    rimLightContrast: f32,
    colorAbsorptionRed: f32,
    colorAbsorptionGreen: f32,
    colorAbsorptionBlue: f32,
    colorAbsorptionDepth: f32,
    padding1: f32,
    padding2: f32,
    padding3: f32,
    padding4: f32,
}

// Create lighting environment from uniforms
fn createLightingEnvironment() -> LightingEnvironment {
    var lighting: LightingEnvironment;

    // Transform light directions to view space
    if lightingControls.mainLightEnabled != 0u {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.mainLightDirection, 0.)).xyz);
        lighting.mainLightColor = lightingControls.mainLightColor;
        lighting.mainLightIntensity = lightingControls.mainLightIntensity;
    } else {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(0.3, -0.7, -0.6, 0.)).xyz);
        lighting.mainLightColor = vec3f(1.0);
        lighting.mainLightIntensity = 1.0;
    }

    if lightingControls.fillLightEnabled != 0u {
        lighting.fillLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.fillLightDirection, 0.)).xyz);
        lighting.fillLightColor = lightingControls.fillLightColor;
        lighting.fillLightIntensity = lightingControls.fillLightIntensity;
    } else {
        lighting.fillLightDir = normalize((uniforms.view_matrix * vec4f(-0.5, -0.3, 0.8, 0.)).xyz);
        lighting.fillLightColor = vec3f(1.0);
        lighting.fillLightIntensity = 0.0;
    }

    if lightingControls.rimLightEnabled != 0u {
        lighting.rimLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.rimLightDirection, 0.)).xyz);
        lighting.rimLightColor = lightingControls.rimLightColor;
        lighting.rimLightIntensity = lightingControls.rimLightIntensity;
    } else {
        lighting.rimLightDir = normalize((uniforms.view_matrix * vec4f(0.8, 0.2, -0.4, 0.)).xyz);
        lighting.rimLightColor = vec3f(1.0);
        lighting.rimLightIntensity = 0.0;
    }

    lighting.ambientColor = lightingControls.ambientColor;
    lighting.ambientIntensity = lightingControls.ambientIntensity;

    // Background color from environment map
    var rayDir = normalize(computeViewPosFromUVDepth(vec2f(0.5), 1000.0, uniforms.projection_matrix, uniforms.inv_projection_matrix));
    var worldRayDir = (uniforms.inv_view_matrix * vec4f(rayDir, 0.0)).xyz;
    lighting.backgroundColor = textureSampleLevel(envmap_texture, texture_sampler, worldRayDir, 0.).rgb;

    return lighting;
}

@fragment
fn fs(input: FragmentInput) -> @location(0) vec4f {
    var depth: f32 = abs(textureLoad(texture, vec2u(input.iuv), 0).r);

    // Early return for non-water pixels
    if depth >= 1e4 || depth <= 0.0 {
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    // === SURFACE COMPUTATION (Independent) ===
    var surface = createSurfaceData(input, uniforms, texture, thickness_texture);

    // === LIGHTING ENVIRONMENT (Independent) ===
    var lighting = createLightingEnvironment();

    // === PHYSICS CALCULATIONS (Independent) ===
    var physics: PhysicsData;
    var foam = 0.0;
    var cavitation = 1.0;

    if effectsToggle.enableReynoldsPhysics != 0u {
        // Calculate velocity from surface gradients
        var ddx = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texel_size.x, 0.), input.iuv + vec2f(1.0, 0.0),
                                        texture, uniforms.projection_matrix, uniforms.inv_projection_matrix) - surface.position;
        var ddy = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texel_size.y), input.iuv + vec2f(0.0, 1.0),
                                        texture, uniforms.projection_matrix, uniforms.inv_projection_matrix) - surface.position;

        var velocity = vec3f(length(ddx), length(vec3f(ddx.y, ddy.y, 0.0)), length(ddy));
        physics = calculateReynoldsPhysics(velocity, uniforms.sphere_size, effectParams.viscosityFactor,
                                         effectParams.reynoldsScale, effectParams.turbulenceStrength);

        // Calculate vorticity
        physics.vorticity = calculateVorticity(ddx, ddy, physics);

        // Apply turbulent normal perturbation if enabled
        if effectsToggle.enableTurbulentNormals != 0u {
            var surfaceOffset = calculateTurbulentSurfaceOffset(surface, physics, physics.vorticity,
                                                              waterAppearance.waveHeight, effectParams.normalStrength);
            var perturbedNormal = normalize(surface.normal + surfaceOffset * 0.15);
            if dot(perturbedNormal, surface.normal) >= 0.6 {
                surface.normal = mix(surface.normal, perturbedNormal, 0.08);
                surface.viewDotNormal = max(dot(surface.normal, -surface.rayDir), 0.0);
            }
        }
    }

    if effectsToggle.enableCavitation != 0u {
        cavitation = calculateCavitation(surface, physics, effectParams.cavitationThreshold, effectParams.cavitationStrength);
    }

    if effectsToggle.enableFoam != 0u {
        foam = calculateFoam(physics, cavitation, effectParams.foamIntensity, effectParams.foamThreshold);
    }

    // === OPTICAL EFFECTS (Independent) ===
    var fresnel = 0.0;
    var absorption = vec3f(1.0);
    var transmission = vec3f(1.0);
    var caustics = 0.0;

    if effectsToggle.enableFresnel != 0u {
        fresnel = calculateFresnel(surface, effectParams.fresnelPower, effectParams.fresnelScale,
                                 effectParams.fresnelBias, waterAppearance.reflectivity);
    }

    if effectsToggle.enableAbsorption != 0u {
        absorption = calculateAbsorption(surface, waterAppearance.color.rgb, effectParams.absorptionStrength, effectParams.absorptionDepth);
        transmission = calculateTransmission(surface, waterAppearance.color.rgb, effectParams.absorptionStrength);
    }

    if effectsToggle.enableCaustics != 0u {
        // Calculate surface curvature for caustics
        var thicknessL = safeThicknessSample(input.iuv + vec2f(-1.0, 0.0), thickness_texture);
        var thicknessR = safeThicknessSample(input.iuv + vec2f(1.0, 0.0), thickness_texture);
        var thicknessU = safeThicknessSample(input.iuv + vec2f(0.0, -1.0), thickness_texture);
        var thicknessD = safeThicknessSample(input.iuv + vec2f(0.0, 1.0), thickness_texture);
        var curvatureX = (thicknessR + thicknessL - 2.0 * surface.thickness) * 0.5;
        var curvatureY = (thicknessD + thicknessU - 2.0 * surface.thickness) * 0.5;

        caustics = calculateCaustics(surface, lighting, curvatureX, curvatureY,
                                   effectParams.causticsStrength, effectParams.causticsScale);
    }

    // === LIGHTING CALCULATIONS (Independent) ===
    var specular = 0.0;
    var subsurface = vec3f(0.0);
    var rimLighting = vec3f(0.0);
    var volumetricLighting = vec3f(0.0);
    var reflection = vec3f(0.0);

    if effectsToggle.enableSpecular != 0u {
        specular = calculateSpecular(surface, lighting, effectParams.specularPower,
                                   effectParams.specularScale * lightingControls.specularIntensityMultiplier);
        specular *= (1.0 - foam * 0.7); // Foam reduces specular
    }

    if effectsToggle.enableSubsurface != 0u {
        var subsurfaceIntensity = effectParams.subsurfaceScale * lightingControls.subsurfaceIntensityMultiplier;
        subsurface = calculateSubsurface(surface, lighting, subsurfaceIntensity);
    }

    if effectsToggle.enableRimLighting != 0u {
        rimLighting = calculateRimLighting(surface, lighting, effectParams.rimLightPower, effectParams.rimLightStrength);
    }

    // Always calculate volumetric and ambient
    volumetricLighting = calculateVolumetricLighting(surface, lighting, lightingControls.volumetricIntensity);
    volumetricLighting += caustics * lighting.backgroundColor * 0.3; // Add caustics to volumetric

    var ambientLighting = calculateAmbientLighting(surface, lighting);

    if effectsToggle.enableReflection != 0u {
        reflection = calculateReflection(surface, lighting, envmap_texture, texture_sampler,
                                       uniforms.view_matrix, uniforms.inv_view_matrix,
                                       effectParams.reflectionStrength, fresnel);
    }

    // === COLOR CALCULATIONS (Independent) ===
    var baseColor = waterAppearance.color.rgb * absorption;

    var depthColor = vec3f(1.0);
    if effectsToggle.enableDepthColoring != 0u {
        depthColor = calculateDepthColoring(surface, waterAppearance.color.rgb, uniforms.sphere_size, effectParams.depthColorStrength);
    }

    var velocityColor = vec3f(1.0);
    if effectsToggle.enableVelocityColoring != 0u {
        velocityColor = calculateVelocityColoring(physics, waterAppearance.color.rgb, effectParams.velocityColorStrength);
    }

    // === FINAL COLOR COMPOSITION (Clean combination) ===
    var finalColor = baseColor * depthColor * velocityColor;
    finalColor += subsurface;
    finalColor += reflection;
    finalColor += vec3f(specular);
    finalColor += rimLighting;
    finalColor += volumetricLighting;
    finalColor += ambientLighting;

    // Apply color absorption if enabled
    if effectsToggle.enableColorAbsorption != 0u {
        finalColor = calculateColorAbsorption(surface, finalColor, waterAppearance.color.rgb,
                                            effectParams.colorAbsorptionDepth, uniforms.sphere_size);
    }

    // Apply foam
    finalColor = calculateFoamColor(finalColor, foam, vec3f(1.0));

    // === TRANSPARENCY CALCULATION (Independent) ===
    var alpha = waterAppearance.transparency;

    // Physics-based alpha
    if effectsToggle.enableAbsorption != 0u {
        var transmissionLuminance = dot(transmission, vec3f(0.299, 0.587, 0.114));
        alpha = mix(alpha, transmissionLuminance, 0.7);
        finalColor *= transmission; // Apply transmission to color
    }

    // Volume and foam opacity
    var volumeOpacity = clamp(surface.thickness * 0.8, 0.0, 0.9);
    alpha = mix(alpha, 1.0, volumeOpacity);
    alpha = mix(alpha, 1.0, foam * 0.6);

    // Depth opacity
    var depthOpacity = clamp(surface.depth * 0.05, 0.0, 0.3);
    alpha = mix(alpha, 1.0, depthOpacity);

    alpha = clamp(alpha, 0.1, 1.0);

    // === DEBUG MODE (Independent) ===
    if debug.mode != 0u {
        return debugVisualization(debug, surface, physics, absorption, fresnel, caustics, finalColor);
    }

    return vec4f(finalColor, alpha);
}

// Debug visualization function
fn debugVisualization(debug: DebugUniforms, surface: SurfaceData, physics: PhysicsData,
                     absorption: vec3f, fresnel: f32, caustics: f32, finalColor: vec3f) -> vec4f {
    switch (debug.mode) {
        case 1u: { // DEPTH
            let normalizedDepth = surface.depth * debug.intensity * 0.1;
            return vec4f(vec3f(normalizedDepth), 1.0);
        }
        case 2u: { // THICKNESS
            let thicknessVis = surface.thickness * physics.density * debug.intensity * 0.2;
            return vec4f(vec3f(thicknessVis), 1.0);
        }
        case 3u: { // NORMALS
            return vec4f(0.5 * surface.normal + 0.5, 1.0);
        }
        case 4u: { // ABSORPTION
            let absorptionVis = (1.0 - length(absorption)) * debug.intensity;
            return vec4f(vec3f(absorptionVis), 1.0);
        }
        case 5u: { // VELOCITY
            let velocityVis = physics.velocityMagnitude * debug.intensity;
            return vec4f(vec3f(velocityVis), 1.0);
        }
        case 6u: { // PRESSURE
            let pressureVis = physics.density * debug.intensity * 0.1;
            return vec4f(vec3f(pressureVis), 1.0);
        }
        case 8u: { // FRESNEL
            return vec4f(vec3f(fresnel), 1.0);
        }
        case 9u: { // CAUSTICS
            let causticsVis = caustics * debug.intensity;
            return vec4f(vec3f(causticsVis), 1.0);
        }
        default: {
            return vec4f(1.0, 0.0, 1.0, 1.0); // Error color
        }
    }
}
