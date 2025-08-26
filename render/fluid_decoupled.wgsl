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
@group(0) @binding(10) var<uniform> composition: CompositionParams;

// Independent effect composition system
fn composeEffects(surface: SurfaceData, physics: PhysicsData, lighting: LightingEnvironment,
    specular: f32, subsurface: vec3f, rimLighting: vec3f, reflection: vec3f,
    volumetric: vec3f, ambient: vec3f, absorption: vec3f, transmission: vec3f,
    fresnel: f32, caustics: f32, foam: f32,
    depthColor: vec3f, velocityColor: vec3f, baseColor: vec3f) -> vec4f {

    // === PHASE 1: BASE COLOR COMPUTATION ===
    var safeBaseColor = baseColor;
    if length(baseColor) < 0.01 {
        safeBaseColor = DEFAULT_WATER_COLOR;
    }
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

    // === PHASE 6: CLEAN COMPOSITION (coverage-weighted) ===
    var finalColor = finalBaseColor * composition.baseColorWeight;
    let cov = surface.coverage;
    let covLight = cov * cov; // Quadratic falloff in sparse regions for smoother blending
    finalColor += lightingContribution * composition.lightingGlobalMultiplier * covLight;
    finalColor += opticalContribution * composition.opticalGlobalMultiplier * covLight;

    // === PHASE 7: FOAM APPLICATION (Independent) ===
    if effectsToggle.enableFoam != 0u {
        finalColor = calculateFoamColor(finalColor, foam, FOAM_COLOR);
    }

    // === PHASE 8: TRANSPARENCY CALCULATION (Independent) ===
    var alpha = waterAppearance.transparency;
    // Optical depth derived alpha with coverage influence
    var opticalDepth = surface.thickness * (0.8 + 0.5 * cov);
    var tau = opticalDepth * 1.2; // scale factor
    var transmittance = exp(-tau);
    var odAlpha = 1.0 - transmittance;
    alpha = mix(alpha, odAlpha, 0.9);
    if effectsToggle.enableFoam != 0u {
        alpha = mix(alpha, 1.0, foam * 0.5);
    }
    // Depth based contribution
    var depthOpacity = clamp(surface.depth * 0.045, 0.0, 0.35);
    alpha = mix(alpha, 1.0, depthOpacity);
    // Ensure sparse regions still contribute
    alpha = max(alpha, cov * 0.85);
    alpha = clamp(alpha, 0.15, 1.0);

    return vec4f(finalColor, alpha);
}

// Debug visualization - completely independent
fn debugVisualization(mode: u32, surface: SurfaceData, physics: PhysicsData,
    absorption: vec3f, transmission: vec3f, fresnel: f32,
    caustics: f32, varianceTransport: vec3f, finalColor: vec3f, intensity: f32) -> vec4f {
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
        }        case 9u: { // CAUSTICS
            var causticsVis = caustics * intensity;
            return vec4f(vec3f(causticsVis), 1.0);
        }
        case 10u: { // VARIANCE LIGHT TRANSPORT
            var varianceVis = length(varianceTransport - vec3f(1.0)) * intensity * 2.0;
            return vec4f(vec3f(varianceVis), 1.0);
        }
        default: {
            return vec4f(finalColor, 1.0);
        }
    }
}

// Screen-Space ABI: fragment input only position; derive pixel, uv, iuv locally.
struct FSIn { @builtin(position) pos: vec4f };

fn computeViewPosFromUVDepth(tex_coord: vec2f, depth: f32) -> vec3f {
    var ndc: vec4f = vec4f(tex_coord.x * 2.0 - 1.0, 1.0 - 2.0 * tex_coord.y, 0.0, 1.0);
    ndc.z = -uniforms.projection_matrix[2].z + uniforms.projection_matrix[3].z / depth;
    ndc.w = 1.0;
    let eye_pos: vec4f = uniforms.inv_projection_matrix * ndc;
    return eye_pos.xyz / eye_pos.w;
}

fn getViewPosFromTexCoord(tex_coord: vec2f, iuv: vec2f) -> vec3f {
    let d = abs(textureLoad(texture, vec2u(iuv), 0).x);
    return computeViewPosFromUVDepth(tex_coord, d);
}

fn safeThicknessSample(coords: vec2f) -> f32 {
    let dims = textureDimensions(thickness_texture);
    let maxC = vec2f(f32(dims.x - 1u), f32(dims.y - 1u));
    let c = clamp(coords, vec2f(0.0), maxC);
    return textureLoad(thickness_texture, vec2u(c), 0).r;
}

fn createSurfaceData(uv: vec2f, iuv: vec2f) -> SurfaceData {
    var surface: SurfaceData;
    let depth = abs(textureLoad(texture, vec2u(iuv), 0).r);
    surface.position = computeViewPosFromUVDepth(uv, depth);
    surface.depth = abs(surface.position.z);
    surface.rayDir = normalize(surface.position);
    var ddx = getViewPosFromTexCoord(uv + vec2f(uniforms.texel_size.x, 0.0), iuv + vec2f(1.0, 0.0)) - surface.position;
    var ddy = getViewPosFromTexCoord(uv + vec2f(0.0, uniforms.texel_size.y), iuv + vec2f(0.0, 1.0)) - surface.position;
    var ddx2 = surface.position - getViewPosFromTexCoord(uv + vec2f(-uniforms.texel_size.x, 0.0), iuv + vec2f(-1.0, 0.0));
    var ddy2 = surface.position - getViewPosFromTexCoord(uv + vec2f(0.0, -uniforms.texel_size.y), iuv + vec2f(0.0, -1.0));
    if abs(ddx.z) > abs(ddx2.z) { ddx = ddx2; }
    if abs(ddy.z) > abs(ddy2.z) { ddy = ddy2; }
    let smoothing = 0.65;
    ddx *= smoothing; ddy *= smoothing;
    let avg = (ddx + ddy) * 0.5; ddx = mix(ddx, avg, 0.2); ddy = mix(ddy, avg, 0.2);
    surface.normal = -normalize(cross(ddx, ddy));
    let thickness = textureLoad(thickness_texture, vec2u(iuv), 0).r;
    let tL = safeThicknessSample(iuv + vec2f(-1.0, 0.0));
    let tR = safeThicknessSample(iuv + vec2f(1.0, 0.0));
    let tU = safeThicknessSample(iuv + vec2f(0.0, -1.0));
    let tD = safeThicknessSample(iuv + vec2f(0.0, 1.0));
    let smoothT = (thickness * 4.0 + tL + tR + tU + tD) / 8.0;
    surface.thickness = mix(thickness, smoothT, 0.8);
    surface.viewDotNormal = max(dot(surface.normal, -surface.rayDir), 0.0);
    surface.coverage = 1.0;
    return surface;
}

@fragment
fn fs(input: FSIn) -> @location(0) vec4f {
    let dims = textureDimensions(texture);
    let maxPix = vec2f(f32(dims.x - 1u), f32(dims.y - 1u));
    let pixF = clamp(floor(input.pos.xy), vec2f(0.0), maxPix);
    let pix = vec2u(pixF);
    let iuv = vec2f(pix);
    let uv = (pixF + 0.5) / vec2f(f32(dims.x), f32(dims.y));
    var depth: f32 = abs(textureLoad(texture, pix, 0).r);

    // Early exit for non-water pixels
    if depth >= 1e4 || depth <= 0.0 {
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    // ===== PHASE 1: SURFACE CALCULATION (Independent) =====
    var surface = createSurfaceData(uv, iuv);    // ===== PHASE 2: LIGHTING ENVIRONMENT (Independent) =====
    var lighting = createLightingEnvironment(lightingControls, uniforms,
        envmap_texture, texture_sampler);

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
    var ddx = getViewPosFromTexCoord(uv + vec2f(uniforms.texel_size.x, 0.0), iuv + vec2f(1.0, 0.0)) - surface.position;
    var ddy = getViewPosFromTexCoord(uv + vec2f(0.0, uniforms.texel_size.y), iuv + vec2f(0.0, 1.0)) - surface.position;

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
    }    // ===== PHASE 4: OPTICAL EFFECTS (Independent) =====
    var fresnel = 0.0;
    var absorption = vec3f(1.0);
    var transmission = vec3f(1.0);
    var caustics = 0.0;
    var varianceTransport = vec3f(1.0);    // Variance Light Transport - reduces lighting noise
    if effectsToggle.enableVarianceLightTransport != 0u {
        varianceTransport = calculateVarianceLightTransport(surface, lighting,
            texture, uv, uniforms.texel_size,
            effectParams.varianceSamples, effectParams.varianceStrength,
            effectParams.varianceRadius, effectParams.varianceThreshold);
    }

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
    var thicknessL = safeThicknessSample(iuv + vec2f(-1.0, 0.0));
    var thicknessR = safeThicknessSample(iuv + vec2f(1.0, 0.0));
    var thicknessU = safeThicknessSample(iuv + vec2f(0.0, -1.0));
    var thicknessD = safeThicknessSample(iuv + vec2f(0.0, 1.0));

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
    let tNorm = 1.0 - exp(-surface.thickness * 0.6);
    subsurface = min(calculateSubsurface(surface, lighting, subsurfaceIntensity) * tNorm, vec3f(1.1));
    }

    if effectsToggle.enableRimLighting != 0u {
    let combinedStrength = min(effectParams.rimLightStrength * lighting.rimLightIntensity, 1.0);
    var rawRim = calculateRimLighting(surface, lighting, max(effectParams.rimLightPower, 1.4), combinedStrength);
    rimLighting = rawRim / (vec3f(1.0) + rawRim);
    }

    if effectsToggle.enableReflection != 0u {
        reflection = calculateReflection(surface, lighting, envmap_texture, texture_sampler,
            uniforms.view_matrix, uniforms.inv_view_matrix,
            effectParams.reflectionStrength, fresnel);
    }    // Calculate volumetric and ambient lighting
    var volumetricLighting = calculateVolumetricLighting(surface, lighting,
        lightingControls.volumetricIntensity);
    var ambientLighting = calculateAmbientLighting(surface, lighting);    // Apply variance light transport to reduce lighting noise - Enhanced for visibility
    if effectsToggle.enableVarianceLightTransport != 0u {
        volumetricLighting *= varianceTransport;
        ambientLighting *= varianceTransport;
        // Also apply to specular and subsurface for more visible effect
        specular *= dot(varianceTransport, vec3f(0.333));
        subsurface *= varianceTransport * 0.8;
    }    // ===== PHASE 6: COLOR CALCULATIONS (Independent) =====
    var baseColor = waterAppearance.color.rgb;
    var depthColor = vec3f(1.0);
    var velocityColor = vec3f(1.0);

    // Apply variance light transport to base color for more visible effect
    if effectsToggle.enableVarianceLightTransport != 0u {
        baseColor *= varianceTransport;
    }

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
    }    // ===== PHASE 8: DEBUG VISUALIZATION (Independent) =====
    if debug.mode != 0u {
        return debugVisualization(debug.mode, surface, physics, absorption, transmission,
            fresnel, caustics, varianceTransport, finalResult.rgb, debug.intensity);
    }

    return finalResult;
}
