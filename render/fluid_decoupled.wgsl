// Completely modular fluid shader - ZERO coupling between effects
// Each effect is calculated independently and composited cleanly
// Changing lighting won't affect physics, changing physics won't affect coloring, etc.

#include "effects/types.wgsl"
#include "effects/config.wgsl"
#include "effects/surface.wgsl"
#include "effects/physics.wgsl"
#include "effects/optical.wgsl"
#include "effects/lighting.wgsl"
#include "effects/coloring.wgsl"

// Uniform bindings - clearly separated concerns
@group(0) @binding(0) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var thickness_texture: texture_2d<f32>;
@group(0) @binding(3) var envmap_texture: texture_cube<f32>;
@group(0) @binding(4) var texture_sampler: sampler;

// Effect control - independent toggles
@group(1) @binding(0) var<uniform> effectsToggle: EffectsToggle;
@group(1) @binding(1) var<uniform> effectParams: EffectParameters;
@group(1) @binding(2) var<uniform> lightingControls: LightingControls;
@group(1) @binding(3) var<uniform> waterAppearance: WaterAppearance;
@group(1) @binding(4) var<uniform> debug: DebugUniforms;

// Optional configuration override
@group(2) @binding(0) var<uniform> fluidConfig: FluidConfig;
@group(2) @binding(1) var<uniform> composition: CompositionParams;

struct FragmentInput {
    @location(0) uv: vec2f,
    @location(1) iuv: vec2f,
}

// Independent effect composition system
fn composeEffects(surface: SurfaceData, physics: PhysicsData, lighting: LightingEnvironment,
    specular: f32, subsurface: vec3f, rimLighting: vec3f, reflection: vec3f,
    volumetric: vec3f, ambient: vec3f, absorption: vec3f, transmission: vec3f,
    fresnel: f32, caustics: f32, foam: f32,
    depthColor: vec3f, velocityColor: vec3f,
    baseColor: vec3f) -> vec4f {

    // === PHASE 1: BASE COLOR COMPUTATION ===
    var safeBaseColor = getSafeWaterColor(baseColor);
    var colorModifiedBase = safeBaseColor * absorption * transmission;

    // === PHASE 2: COLOR EFFECTS (Independent) ===
    var finalBaseColor = colorModifiedBase;
    if effectsToggle.enableDepthColoring != 0u {
        finalBaseColor *= depthColor;
    }
    if effectsToggle.enableVelocityColoring != 0u {
        finalBaseColor *= velocityColor;
    }

    // === PHASE 3: LIGHTING EFFECTS (Independent) ===
    var lightingContribution = vec3f(0.0);
    if effectsToggle.enableSpecular != 0u {
        lightingContribution += vec3f(specular) * composition.specularWeight;
    }
    if effectsToggle.enableSubsurface != 0u {
        lightingContribution += subsurface * composition.subsurfaceWeight;
    }
    if effectsToggle.enableRimLighting != 0u {
        lightingContribution += rimLighting;
    }

    // === PHASE 4: OPTICAL EFFECTS (Independent) ===
    var opticalContribution = vec3f(0.0);
    if effectsToggle.enableReflection != 0u {
        opticalContribution += reflection * composition.reflectionWeight;
    }
    opticalContribution += volumetric + ambient;

    // === PHASE 5: SURFACE EFFECTS (Independent) ===
    if effectsToggle.enableCaustics != 0u {
        opticalContribution += caustics * lighting.backgroundColor * 0.3;
    }

    // === PHASE 6: CLEAN COMPOSITION ===
    var finalColor = finalBaseColor * composition.baseColorWeight;
    finalColor += lightingContribution * composition.lightingGlobalMultiplier;
    finalColor += opticalContribution * composition.opticalGlobalMultiplier;

    // === PHASE 7: FOAM APPLICATION (Independent) ===
    if effectsToggle.enableFoam != 0u {
        finalColor = calculateFoamColor(finalColor, foam, FOAM_COLOR);
    }

    // === PHASE 8: TRANSPARENCY CALCULATION (Independent) ===
    var alpha = waterAppearance.transparency;

    // Physics-based opacity modifications
    if effectsToggle.enableReynoldsPhysics != 0u {
        var volumeOpacity = clamp(surface.thickness * 0.8, 0.0, 0.9);
        alpha = mix(alpha, 1.0, volumeOpacity);
        alpha = mix(alpha, 1.0, foam * 0.6);
    }

    // Optical opacity modifications
    if effectsToggle.enableAbsorption != 0u {
        var transmissionLuminance = dot(transmission, LUMINANCE_WEIGHTS);
        alpha = mix(alpha, transmissionLuminance, 0.7);
    }

    // Depth opacity
    var depthOpacity = clamp(surface.depth * 0.05, 0.0, 0.3);
    alpha = mix(alpha, 1.0, depthOpacity);
    alpha = clamp(alpha, 0.1, 1.0);

    return vec4f(finalColor, alpha);
}

// Debug visualization - completely independent
fn debugVisualization(mode: u32, surface: SurfaceData, physics: PhysicsData,
    absorption: vec3f, transmission: vec3f, fresnel: f32,
    caustics: f32, finalColor: vec3f, intensity: f32) -> vec4f {
    switch (mode) {
        case 1u: { // DEPTH
            var normalizedDepth = surface.depth * intensity * DEBUG_DEPTH_SCALE;
            return vec4f(vec3f(normalizedDepth), 1.0);
        }
        case 2u: { // THICKNESS
            var thicknessVis = surface.thickness * physics.density * intensity * DEBUG_THICKNESS_SCALE;
            return vec4f(vec3f(thicknessVis), 1.0);
        }
        case 3u: { // NORMALS
            return vec4f(0.5 * surface.normal + 0.5, 1.0);
        }
        case 4u: { // ABSORPTION
            var absorptionVis = (1.0 - length(absorption)) * intensity;
            return vec4f(vec3f(absorptionVis), 1.0);
        }
        case 5u: { // VELOCITY
            var velocityVis = physics.velocityMagnitude * intensity;
            return vec4f(vec3f(velocityVis), 1.0);
        }
        case 6u: { // PRESSURE/DENSITY
            var pressureVis = physics.density * intensity * DEBUG_DENSITY_SCALE;
            return vec4f(vec3f(pressureVis), 1.0);
        }
        case 8u: { // FRESNEL
            return vec4f(vec3f(fresnel), 1.0);
        }
        case 9u: { // CAUSTICS
            var causticsVis = caustics * intensity;
            return vec4f(vec3f(causticsVis), 1.0);
        }
        default: {
            return vec4f(finalColor, 1.0);
        }
    }
}

@fragment
fn fs(input: FragmentInput) -> @location(0) vec4f {
    var depth: f32 = abs(textureLoad(texture, vec2u(input.iuv), 0).r);

    // Early exit for non-water pixels
    if depth >= 1e4 || depth <= 0.0 {
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    // ===== PHASE 1: SURFACE CALCULATION (Independent) =====
    var surface = createSurfaceData(input, uniforms, texture, thickness_texture);

    // ===== PHASE 2: LIGHTING ENVIRONMENT (Independent) =====
    var lighting = createLightingEnvironment(lightingControls, uniforms,
        fluidConfig, envmap_texture, texture_sampler);

    // ===== PHASE 3: PHYSICS CALCULATION (Independent) =====
    var physics: PhysicsData;
    var foam = 0.0;
    var cavitation = 1.0;

    // Initialize with safe defaults
    physics.velocity = vec3f(0.0);
    physics.velocityMagnitude = 0.0;
    physics.pressure = 0.0;
    physics.density = 1.0;
    physics.turbulence = 0.0;
    physics.cavitation = 1.0;
    physics.vorticity = vec3f(0.0);

    if effectsToggle.enableReynoldsPhysics != 0u {
        // Calculate velocity from surface gradients (independent calculation)
        var ddx = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texel_size.x, 0.),
            input.iuv + vec2f(1.0, 0.0), texture,
            uniforms.projection_matrix, uniforms.inv_projection_matrix) - surface.position;
        var ddy = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texel_size.y),
            input.iuv + vec2f(0.0, 1.0), texture,
            uniforms.projection_matrix, uniforms.inv_projection_matrix) - surface.position;

        var velocity = (ddx + ddy) * 0.5 * uniforms.sphere_size;
        physics = calculateReynoldsPhysics(velocity, uniforms.sphere_size,
            effectParams.viscosityFactor, effectParams.reynoldsScale,
            effectParams.turbulenceStrength);

        // Calculate pressure/density
        var pressureDensity = calculatePressureDensity(surface, physics);
        physics.pressure = pressureDensity.x;
        physics.density = pressureDensity.y;
        physics.vorticity = calculateVorticity(ddx, ddy, physics);
    }

    if effectsToggle.enableCavitation != 0u {
        cavitation = calculateCavitation(surface, physics, effectParams.cavitationThreshold,
            effectParams.cavitationStrength);
        physics.cavitation = cavitation;
    }

    if effectsToggle.enableFoam != 0u {
        foam = calculateFoam(physics, cavitation, effectParams.foamIntensity,
            effectParams.foamThreshold);
    }

    // Apply turbulent surface effects if enabled
    if effectsToggle.enableTurbulentNormals != 0u && physics.turbulence > 0.25 {
        var surfaceOffset = calculateTurbulentSurfaceOffset(surface, physics, physics.vorticity,
            waterAppearance.waveHeight, 0.15);
        if length(surfaceOffset) > 0.01 {
            var perturbedNormal = normalize(surface.normal + surfaceOffset);
            if dot(perturbedNormal, surface.normal) >= 0.6 {
                surface.normal = mix(surface.normal, perturbedNormal, 0.08);
                surface.viewDotNormal = max(dot(surface.normal, -surface.rayDir), 0.0);
            }
        }
    }

    // ===== PHASE 4: OPTICAL EFFECTS (Independent) =====
    var fresnel = 0.0;
    var absorption = vec3f(1.0);
    var transmission = vec3f(1.0);
    var caustics = 0.0;

    if effectsToggle.enableFresnel != 0u {
        fresnel = calculateFresnel(surface, effectParams.fresnelPower, effectParams.fresnelScale,
            effectParams.fresnelBias, waterAppearance.reflectivity);
    }

    if effectsToggle.enableAbsorption != 0u {
        absorption = calculateAbsorption(surface, waterAppearance.color.rgb,
            effectParams.absorptionStrength, effectParams.absorptionDepth);
        transmission = calculateTransmission(surface, waterAppearance.color.rgb,
            effectParams.absorptionStrength);
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

    // ===== PHASE 5: LIGHTING CALCULATIONS (Independent) =====
    var specular = 0.0;
    var subsurface = vec3f(0.0);
    var rimLighting = vec3f(0.0);
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
        rimLighting = calculateRimLighting(surface, lighting, effectParams.rimLightPower,
            effectParams.rimLightStrength);
    }

    if effectsToggle.enableReflection != 0u {
        reflection = calculateReflection(surface, lighting, envmap_texture, texture_sampler,
            uniforms.view_matrix, uniforms.inv_view_matrix,
            effectParams.reflectionStrength, fresnel);
    }

    // Calculate volumetric and ambient lighting
    var volumetricLighting = calculateVolumetricLighting(surface, lighting,
        lightingControls.volumetricIntensity);
    var ambientLighting = calculateAmbientLighting(surface, lighting);

    // ===== PHASE 6: COLOR CALCULATIONS (Independent) =====
    var baseColor = waterAppearance.color.rgb;
    var depthColor = vec3f(1.0);
    var velocityColor = vec3f(1.0);

    if effectsToggle.enableDepthColoring != 0u {
        depthColor = calculateDepthColoring(surface, waterAppearance.color.rgb,
            uniforms.sphere_size, effectParams.depthColorStrength);
    }

    if effectsToggle.enableVelocityColoring != 0u {
        velocityColor = calculateVelocityColoring(physics, waterAppearance.color.rgb,
            effectParams.velocityColorStrength);
    }

    // ===== PHASE 7: COMPOSITION (Clean and Independent) =====
    var finalResult = composeEffects(surface, physics, lighting,
        specular, subsurface, rimLighting, reflection,
        volumetricLighting, ambientLighting, absorption, transmission,
        fresnel, caustics, foam,
        depthColor, velocityColor, baseColor);

    // Apply color absorption if enabled (final color modification)
    if effectsToggle.enableColorAbsorption != 0u {
        var colorAbsorbedResult = calculateColorAbsorption(surface, finalResult.rgb,
            waterAppearance.color.rgb,
            effectParams.colorAbsorptionDepth,
            uniforms.sphere_size);
        finalResult = vec4f(colorAbsorbedResult, finalResult.a);
    }

    // ===== PHASE 8: DEBUG VISUALIZATION (Independent) =====
    if debug.mode != 0u {
        return debugVisualization(debug.mode, surface, physics, absorption, transmission,
            fresnel, caustics, finalResult.rgb, debug.intensity);
    }

    return finalResult;
}
