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
  enableVelocityColoring: new Uint32Array(effectsToggleValues, 52, 1),  // Velocity-based color shifts
  enableRimLighting: new Uint32Array(effectsToggleValues, 56, 1),       // Rim lighting for edges
  padding: new Uint32Array(effectsToggleValues, 60, 1),                 // Alignment padding
};
