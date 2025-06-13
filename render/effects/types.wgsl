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
