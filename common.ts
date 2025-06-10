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
