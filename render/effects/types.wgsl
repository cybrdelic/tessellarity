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

// Configuration for runtime parameter overrides
struct FluidConfig {
    // Lighting overrides
    enableLightingOverrides: u32,
    mainLightOverride: vec4f,      // xyz = direction, w = intensity
    fillLightOverride: vec4f,      // xyz = direction, w = intensity
    rimLightOverride: vec4f,       // xyz = direction, w = intensity

    // Water appearance overrides
    waterColorOverride: vec4f,     // xyz = color, w = transparency
    reflectivityOverride: f32,

    // Absorption overrides
    absorptionOverride: vec4f,     // xyz = RGB coefficients, w = strength

    // Physics overrides
    viscosityScale: f32,
    turbulenceScale: f32,

    // Padding for alignment
    padding1: f32,
    padding2: f32,
}

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
