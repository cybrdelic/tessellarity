// Common types and structures used across all effects
// This file contains only the shared data structures - no logic

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

// Core surface data that effects can use
struct SurfaceData {
    position: vec3f,
    normal: vec3f,
    thickness: f32,
    depth: f32,
    rayDir: vec3f,
    viewDotNormal: f32,
}

// Lighting environment data
struct LightingEnvironment {
    mainLightDir: vec3f,
    mainLightColor: vec3f,
    mainLightIntensity: f32,
    fillLightDir: vec3f,
    fillLightColor: vec3f,
    fillLightIntensity: f32,
    rimLightDir: vec3f,
    rimLightColor: vec3f,
    rimLightIntensity: f32,
    ambientColor: vec3f,
    ambientIntensity: f32,
    backgroundColor: vec3f,
}

// Physics data for effects that need it
struct PhysicsData {
    velocity: vec3f,
    velocityMagnitude: f32,
    pressure: f32,
    density: f32,
    turbulence: f32,
    cavitation: f32,
    vorticity: vec3f,
}

// Effects toggle controls
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
    enableVarianceLightTransport: u32,
}



// Lighting control parameters
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

// Effect parameters for fine-tuning
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
    varianceSamples: f32,
    varianceStrength: f32,
    varianceRadius: f32,
    varianceThreshold: f32,
    padding1: f32,
    padding2: f32,
    padding3: f32,
    padding4: f32,
}

// Configuration for runtime parameter overrides defined in config.wgsl

// Effect composition parameters for independent effect mixing
struct CompositionParams {
    // Effect blend modes
    lightingBlendMode: u32,        // How to blend different lighting effects
    opticalBlendMode: u32,         // How to blend optical effects
    colorBlendMode: u32,           // How to blend color effects

    // Global effect multipliers
    lightingGlobalMultiplier: f32,
    opticalGlobalMultiplier: f32,
    colorGlobalMultiplier: f32,
    physicsGlobalMultiplier: f32,

    // Composition weights
    baseColorWeight: f32,
    specularWeight: f32,
    subsurfaceWeight: f32,
    reflectionWeight: f32,

    // Padding
    padding1: f32,
    padding2: f32,
    padding3: f32,
    padding4: f32,
}
