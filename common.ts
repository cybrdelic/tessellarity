export const renderUniformsValues = new ArrayBuffer(272);
export const renderUniformsViews = {
  texel_size: new Float32Array(renderUniformsValues, 0, 2),
  sphere_size: new Float32Array(renderUniformsValues, 8, 2),
  inv_projection_matrix: new Float32Array(renderUniformsValues, 16, 16),
  projection_matrix: new Float32Array(renderUniformsValues, 80, 16),
  view_matrix: new Float32Array(renderUniformsValues, 144, 16),
  inv_view_matrix: new Float32Array(renderUniformsValues, 208, 16),
};

export const numParticlesMax = 200000;

export const waterAppearanceValues = new ArrayBuffer(32);
export const waterAppearanceViews = {
  color: new Float32Array(waterAppearanceValues, 0, 4),  // vec4 for RGBA
  transparency: new Float32Array(waterAppearanceValues, 16, 1),
  reflectivity: new Float32Array(waterAppearanceValues, 20, 1),
  waveHeight: new Float32Array(waterAppearanceValues, 24, 1),
};

// Debug mode buffer for debug visualization system
export const debugModeValues = new ArrayBuffer(16);
export const debugModeViews = {
  mode: new Uint32Array(debugModeValues, 0, 1),      // Debug visualization mode
  layer: new Uint32Array(debugModeValues, 4, 1),     // Sub-layer selection
  intensity: new Float32Array(debugModeValues, 8, 1), // Visualization intensity
  padding: new Float32Array(debugModeValues, 12, 1),  // Alignment padding
};

// Effects toggle buffer - individual effect controls
export const effectsToggleValues = new ArrayBuffer(64); // 16 toggles * 4 bytes each (u32)
export const effectsToggleViews = {
  // Core water effects
  enableReynoldsPhysics: new Uint32Array(effectsToggleValues, 0, 1),    // Reynolds number turbulence
  enableCavitation: new Uint32Array(effectsToggleValues, 4, 1),         // Cavitation physics
  enableFoam: new Uint32Array(effectsToggleValues, 8, 1),               // Foam generation
  enableTurbulentNormals: new Uint32Array(effectsToggleValues, 12, 1),  // Turbulent surface deformation

  // Surface and lighting effects
  enableSpecular: new Uint32Array(effectsToggleValues, 16, 1),          // Specular highlights
  enableSubsurface: new Uint32Array(effectsToggleValues, 20, 1),        // Subsurface scattering
  enableFresnel: new Uint32Array(effectsToggleValues, 24, 1),           // Fresnel reflection
  enableReflection: new Uint32Array(effectsToggleValues, 28, 1),        // Environment reflection

  // Advanced optical effects
  enableRefraction: new Uint32Array(effectsToggleValues, 32, 1),        // Refraction
  enableCaustics: new Uint32Array(effectsToggleValues, 36, 1),          // Caustics patterns
  enableDispersion: new Uint32Array(effectsToggleValues, 40, 1),        // Chromatic dispersion
  enableAbsorption: new Uint32Array(effectsToggleValues, 44, 1),        // Depth-based absorption
  // Color and depth effects
  enableDepthColoring: new Uint32Array(effectsToggleValues, 48, 1),     // Depth-based color variation
  enableVelocityColoring: new Uint32Array(effectsToggleValues, 52, 1),  // Velocity-based color shifts  enableRimLighting: new Uint32Array(effectsToggleValues, 56, 1),       // Rim lighting for edges
  enableColorAbsorption: new Uint32Array(effectsToggleValues, 60, 1),   // Depth-based wavelength color absorption
};

// Comprehensive lighting controls buffer
export const lightingControlsValues = new ArrayBuffer(176); // 44 floats * 4 bytes each (WebGPU requirement)
export const lightingControlsViews = {
  // Main light properties
  mainLightDirection: new Float32Array(lightingControlsValues, 0, 3),   // Main light direction
  mainLightIntensity: new Float32Array(lightingControlsValues, 12, 1),  // Main light intensity
  mainLightColor: new Float32Array(lightingControlsValues, 16, 3),      // Main light color (RGB)
  mainLightEnabled: new Uint32Array(lightingControlsValues, 28, 1),     // Main light enable toggle

  // Fill light properties
  fillLightDirection: new Float32Array(lightingControlsValues, 32, 3),  // Fill light direction
  fillLightIntensity: new Float32Array(lightingControlsValues, 44, 1),  // Fill light intensity
  fillLightColor: new Float32Array(lightingControlsValues, 48, 3),      // Fill light color (RGB)
  fillLightEnabled: new Uint32Array(lightingControlsValues, 60, 1),     // Fill light enable toggle

  // Rim light properties
  rimLightDirection: new Float32Array(lightingControlsValues, 64, 3),   // Rim light direction
  rimLightIntensity: new Float32Array(lightingControlsValues, 76, 1),   // Rim light intensity
  rimLightColor: new Float32Array(lightingControlsValues, 80, 3),       // Rim light color (RGB)
  rimLightEnabled: new Uint32Array(lightingControlsValues, 92, 1),      // Rim light enable toggle

  // Global lighting properties
  ambientIntensity: new Float32Array(lightingControlsValues, 96, 1),    // Ambient light intensity
  ambientColor: new Float32Array(lightingControlsValues, 100, 3),       // Ambient light color (RGB)
  shadowIntensity: new Float32Array(lightingControlsValues, 112, 1),    // Shadow intensity
  lightingMode: new Uint32Array(lightingControlsValues, 116, 1),        // Lighting mode (0=realistic, 1=artistic, 2=dramatic)

  // Advanced lighting properties
  specularIntensityMultiplier: new Float32Array(lightingControlsValues, 120, 1), // Global specular multiplier
  subsurfaceIntensityMultiplier: new Float32Array(lightingControlsValues, 124, 1), // Global subsurface multiplier

  // Additional lighting properties (padding to meet WebGPU 176-byte requirement)
  lightingPower: new Float32Array(lightingControlsValues, 128, 1),      // Global lighting power/gamma
  lightingContrast: new Float32Array(lightingControlsValues, 132, 1),   // Global lighting contrast
  volumetricIntensity: new Float32Array(lightingControlsValues, 136, 1), // Volumetric lighting intensity
  rimLightingPower: new Float32Array(lightingControlsValues, 140, 1),   // Rim lighting power adjustment
  lightingPadding1: new Float32Array(lightingControlsValues, 144, 1),   // Alignment padding 1
  lightingPadding2: new Float32Array(lightingControlsValues, 148, 1),   // Alignment padding 2
  lightingPadding3: new Float32Array(lightingControlsValues, 152, 1),   // Alignment padding 3
  lightingPadding4: new Float32Array(lightingControlsValues, 156, 1),   // Alignment padding 4
  lightingPadding5: new Float32Array(lightingControlsValues, 160, 1),   // Alignment padding 5
  lightingPadding6: new Float32Array(lightingControlsValues, 164, 1),   // Alignment padding 6
  lightingPadding7: new Float32Array(lightingControlsValues, 168, 1),   // Alignment padding 7
  lightingPadding8: new Float32Array(lightingControlsValues, 172, 1),   // Alignment padding 8
};

// Effect parameters buffer - individual parameter controls for each effect
export const effectParametersValues = new ArrayBuffer(256); // 64 parameters * 4 bytes each (f32)
export const effectParametersViews = {
  // Reynolds Physics Parameters
  reynoldsScale: new Float32Array(effectParametersValues, 0, 1),        // Reynolds number scaling factor
  turbulenceStrength: new Float32Array(effectParametersValues, 4, 1),   // Turbulence intensity multiplier
  viscosityFactor: new Float32Array(effectParametersValues, 8, 1),      // Kinematic viscosity adjustment
  cascadeEffect: new Float32Array(effectParametersValues, 12, 1),       // Kolmogorov cascade strength

  // Cavitation Parameters
  cavitationThreshold: new Float32Array(effectParametersValues, 16, 1), // Cavitation pressure threshold
  cavitationStrength: new Float32Array(effectParametersValues, 20, 1),  // Cavitation intensity multiplier
  pressureScale: new Float32Array(effectParametersValues, 24, 1),       // Pressure calculation scaling
  cavitationFalloff: new Float32Array(effectParametersValues, 28, 1),   // Cavitation distance falloff

  // Foam Parameters
  foamIntensity: new Float32Array(effectParametersValues, 32, 1),       // Foam generation intensity
  foamThreshold: new Float32Array(effectParametersValues, 36, 1),       // Foam generation threshold
  foamDecay: new Float32Array(effectParametersValues, 40, 1),           // Foam decay rate
  foamCoverage: new Float32Array(effectParametersValues, 44, 1),        // Foam surface coverage

  // Turbulent Normals Parameters
  normalStrength: new Float32Array(effectParametersValues, 48, 1),      // Normal perturbation strength
  normalScale: new Float32Array(effectParametersValues, 52, 1),         // Normal variation scale
  normalSmoothness: new Float32Array(effectParametersValues, 56, 1),    // Normal smoothing factor
  normalStability: new Float32Array(effectParametersValues, 60, 1),     // Normal stability threshold

  // Specular Parameters
  specularPower: new Float32Array(effectParametersValues, 64, 1),       // Specular highlight power
  specularScale: new Float32Array(effectParametersValues, 68, 1),       // Specular intensity scale
  specularRoughness: new Float32Array(effectParametersValues, 72, 1),   // Surface roughness factor
  specularFresnel: new Float32Array(effectParametersValues, 76, 1),     // Fresnel effect on specular

  // Subsurface Parameters
  subsurfaceDepth: new Float32Array(effectParametersValues, 80, 1),     // Subsurface penetration depth
  subsurfaceScale: new Float32Array(effectParametersValues, 84, 1),     // Subsurface scattering scale
  subsurfaceColor: new Float32Array(effectParametersValues, 88, 1),     // Subsurface color influence
  subsurfaceDistortion: new Float32Array(effectParametersValues, 92, 1), // Light distortion factor

  // Fresnel Parameters
  fresnelPower: new Float32Array(effectParametersValues, 96, 1),        // Fresnel curve power
  fresnelScale: new Float32Array(effectParametersValues, 100, 1),       // Fresnel effect scale
  fresnelBias: new Float32Array(effectParametersValues, 104, 1),        // Fresnel bias adjustment
  fresnelContrast: new Float32Array(effectParametersValues, 108, 1),    // Fresnel contrast enhancement

  // Reflection Parameters
  reflectionStrength: new Float32Array(effectParametersValues, 112, 1), // Environment reflection strength
  reflectionBlur: new Float32Array(effectParametersValues, 116, 1),     // Reflection blur amount
  reflectionDistortion: new Float32Array(effectParametersValues, 120, 1), // Surface distortion on reflections
  reflectionFade: new Float32Array(effectParametersValues, 124, 1),     // Distance-based reflection fade

  // Refraction Parameters
  refractionStrength: new Float32Array(effectParametersValues, 128, 1), // Refraction distortion strength
  refractionIndex: new Float32Array(effectParametersValues, 132, 1),    // Index of refraction
  refractionChromatic: new Float32Array(effectParametersValues, 136, 1), // Chromatic aberration amount
  refractionScale: new Float32Array(effectParametersValues, 140, 1),    // Refraction effect scale

  // Caustics Parameters
  causticsStrength: new Float32Array(effectParametersValues, 144, 1),   // Caustics pattern strength
  causticsScale: new Float32Array(effectParametersValues, 148, 1),      // Caustics pattern scale
  causticsSpeed: new Float32Array(effectParametersValues, 152, 1),      // Caustics animation speed
  causticsContrast: new Float32Array(effectParametersValues, 156, 1),   // Caustics contrast

  // Absorption Parameters
  absorptionStrength: new Float32Array(effectParametersValues, 160, 1), // Light absorption strength
  absorptionDepth: new Float32Array(effectParametersValues, 164, 1),    // Absorption depth scale
  absorptionColor: new Float32Array(effectParametersValues, 168, 1),    // Color absorption influence
  absorptionScattering: new Float32Array(effectParametersValues, 172, 1), // Scattering effect on absorption

  // Depth Coloring Parameters
  depthColorStrength: new Float32Array(effectParametersValues, 176, 1), // Depth color variation strength
  depthColorScale: new Float32Array(effectParametersValues, 180, 1),    // Depth color transition scale
  depthColorContrast: new Float32Array(effectParametersValues, 184, 1), // Depth color contrast
  depthColorSaturation: new Float32Array(effectParametersValues, 188, 1), // Depth color saturation

  // Velocity Coloring Parameters
  velocityColorStrength: new Float32Array(effectParametersValues, 192, 1), // Velocity color intensity
  velocityColorScale: new Float32Array(effectParametersValues, 196, 1),  // Velocity color scaling
  velocityColorContrast: new Float32Array(effectParametersValues, 200, 1), // Velocity color contrast
  velocityColorThreshold: new Float32Array(effectParametersValues, 204, 1), // Velocity threshold for coloring

  // Rim Lighting Parameters
  rimLightStrength: new Float32Array(effectParametersValues, 208, 1),   // Rim light intensity
  rimLightPower: new Float32Array(effectParametersValues, 212, 1),      // Rim light falloff power
  rimLightScale: new Float32Array(effectParametersValues, 216, 1),      // Rim light scale factor
  rimLightContrast: new Float32Array(effectParametersValues, 220, 1),   // Rim light contrast

  // Color Absorption Parameters
  colorAbsorptionRed: new Float32Array(effectParametersValues, 224, 1), // Red wavelength absorption
  colorAbsorptionGreen: new Float32Array(effectParametersValues, 228, 1), // Green wavelength absorption
  colorAbsorptionBlue: new Float32Array(effectParametersValues, 232, 1), // Blue wavelength absorption
  colorAbsorptionDepth: new Float32Array(effectParametersValues, 236, 1), // Color absorption depth scale

  // Padding for alignment
  padding1: new Float32Array(effectParametersValues, 240, 1),
  padding2: new Float32Array(effectParametersValues, 244, 1),
  padding3: new Float32Array(effectParametersValues, 248, 1),
  padding4: new Float32Array(effectParametersValues, 252, 1),
};
