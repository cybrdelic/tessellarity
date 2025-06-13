// Configuration constants and default values
// This file contains all configurable parameters that were previously hardcoded
// All values are centralized here for easy modification

// === LIGHTING DEFAULTS ===
// Default light directions (normalized)
const DEFAULT_MAIN_LIGHT_DIR = vec3f(0.3, -0.7, -0.6);
const DEFAULT_FILL_LIGHT_DIR = vec3f(-0.5, -0.3, 0.8);
const DEFAULT_RIM_LIGHT_DIR = vec3f(0.8, 0.2, -0.4);

// Default light colors
const DEFAULT_MAIN_LIGHT_COLOR = vec3f(1.0, 1.0, 1.0);
const DEFAULT_FILL_LIGHT_COLOR = vec3f(1.0, 1.0, 1.0);
const DEFAULT_RIM_LIGHT_COLOR = vec3f(1.0, 1.0, 1.0);

// Default light intensities
const DEFAULT_MAIN_LIGHT_INTENSITY = 1.0;
const DEFAULT_FILL_LIGHT_INTENSITY = 0.0;
const DEFAULT_RIM_LIGHT_INTENSITY = 0.0;

// === WATER APPEARANCE DEFAULTS ===
const DEFAULT_WATER_COLOR = vec3f(0.2, 0.6, 0.8);
const DEFAULT_WATER_TRANSPARENCY = 0.8;
const DEFAULT_WATER_REFLECTIVITY = 0.3;

// === ABSORPTION COEFFICIENTS ===
// Scientific water absorption coefficients for different wavelengths
const PURE_WATER_ABSORPTION_RGB = vec3f(0.03, 0.025, 0.02);
const DEEP_WATER_ABSORPTION_RGB = vec3f(0.2, 0.08, 0.03);

// Color mixing coefficients for depth-based absorption
const DEPTH_COLOR_TINT_MULTIPLIER = vec3f(0.3, 0.8, 1.2);
const COOL_WATER_TINT_MULTIPLIER = vec3f(0.9, 0.95, 1.05);

// === PHYSICS CONSTANTS ===
const REYNOLDS_TURBULENCE_ONSET = 4000.0;
const KINEMATIC_VISCOSITY_SCALE = 0.001;
const HYDROSTATIC_PRESSURE_SCALE = 9.81;
const WATER_DENSITY = 1000.0;

// === OPTICAL CONSTANTS ===
const AIR_IOR = 1.0;
const WATER_IOR = 1.33;
const LUMINANCE_WEIGHTS = vec3f(0.299, 0.587, 0.114);

// === SURFACE SMOOTHING PARAMETERS ===
const SURFACE_SMOOTHING_FACTOR = 0.65;
const GRADIENT_SMOOTHING_FACTOR = 0.2;
const THICKNESS_SMOOTHING_FACTOR = 0.85;

// === FOAM PARAMETERS ===
const FOAM_COLOR = vec3f(1.0, 1.0, 1.0);
const FOAM_OPACITY = 0.8;

// === DEPTH SCALING FACTORS ===
const DEPTH_ATTENUATION_SCALE = 0.08;
const THICKNESS_ATTENUATION_SCALE = 0.4;
const VOLUMETRIC_DEPTH_SCALE = 0.5;

// === DEBUG VISUALIZATION SCALING ===
const DEBUG_DEPTH_SCALE = 0.1;
const DEBUG_THICKNESS_SCALE = 0.2;
const DEBUG_DENSITY_SCALE = 0.1;

// Configuration struct for runtime adjustable parameters
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

// Helper functions for safe configuration access
fn getSafeMainLightDir(config: FluidConfig) -> vec3f {
    if config.enableLightingOverrides != 0u && length(config.mainLightOverride.xyz) > 0.0 {
        return normalize(config.mainLightOverride.xyz);
    }
    return DEFAULT_MAIN_LIGHT_DIR;
}

fn getSafeFillLightDir(config: FluidConfig) -> vec3f {
    if config.enableLightingOverrides != 0u && length(config.fillLightOverride.xyz) > 0.0 {
        return normalize(config.fillLightOverride.xyz);
    }
    return DEFAULT_FILL_LIGHT_DIR;
}

fn getSafeRimLightDir(config: FluidConfig) -> vec3f {
    if config.enableLightingOverrides != 0u && length(config.rimLightOverride.xyz) > 0.0 {
        return normalize(config.rimLightOverride.xyz);
    }
    return DEFAULT_RIM_LIGHT_DIR;
}

fn getSafeWaterColor(config: FluidConfig, fallbackColor: vec3f) -> vec3f {
    if config.enableLightingOverrides != 0u && length(config.waterColorOverride.xyz) > 0.0 {
        return config.waterColorOverride.xyz;
    }
    if length(fallbackColor) > 0.01 {
        return fallbackColor;
    }
    return DEFAULT_WATER_COLOR;
}

fn getSafeAbsorptionCoeff(config: FluidConfig, absorptionType: u32) -> vec3f {
    if config.enableLightingOverrides != 0u && length(config.absorptionOverride.xyz) > 0.0 {
        return config.absorptionOverride.xyz;
    }

    switch absorptionType {
        case 0u: { return PURE_WATER_ABSORPTION_RGB; }
        case 1u: { return DEEP_WATER_ABSORPTION_RGB; }
        default: { return PURE_WATER_ABSORPTION_RGB; }
    }
}
