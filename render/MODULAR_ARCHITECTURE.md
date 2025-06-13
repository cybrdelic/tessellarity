# Modular Fluid Shader Architecture

## Overview

The fluid shader has been completely refactored from a monolithic, tightly-coupled system into a clean, modular architecture where each effect is independent and self-contained.

## Key Improvements

### 1. **Separation of Concerns**
- **Surface Calculations**: Pure geometric functions for normals, thickness, depth
- **Lighting System**: Independent lighting calculations for each light type
- **Physics Effects**: Self-contained physics simulations (Reynolds, cavitation, foam)
- **Optical Effects**: Independent Fresnel, reflection, absorption calculations
- **Color Effects**: Separate depth coloring, velocity coloring, color absorption

### 2. **Independent Effects**
Each effect can now be:
- **Toggled** on/off without affecting others
- **Modified** without touching other effects
- **Parameters changed** without side effects
- **Debugged** in isolation

### 3. **Clean Data Flow**
```
Input → Surface Data → Physics Data → Lighting Environment
                    ↓
Optical Effects ← Color Effects ← Lighting Effects
                    ↓
            Final Composition
```

## Modular Functions

### Surface Calculations
- `createSurfaceData()` - Calculates position, normal, thickness, depth
- `computeViewPosFromUVDepth()` - Pure coordinate transformation
- `safeThicknessSample()` - Safe texture sampling with bounds checking

### Lighting System
- `createLightingEnvironment()` - Sets up all light sources independently
- `calculateSpecular()` - Pure specular reflection calculation
- `calculateSubsurface()` - Independent subsurface scattering
- `calculateRimLighting()` - Self-contained rim lighting

### Physics Effects
- `calculateReynoldsPhysics()` - Turbulence and Reynolds number calculations
- `calculateCavitation()` - Pressure-based cavitation effects
- `calculateFoam()` - Foam generation from cavitation and turbulence

### Optical Effects
- `calculateFresnel()` - Pure Fresnel calculations
- `calculateReflection()` - Environment reflection with optional Fresnel
- `calculateAbsorption()` - Beer-Lambert law absorption
- `calculateCaustics()` - Surface curvature-based caustics

### Color Effects
- `calculateDepthColoring()` - Wavelength-dependent depth coloring
- `calculateVelocityColoring()` - Velocity-based color variation
- `calculateColorAbsorption()` - Deep water color absorption

## Benefits

### 1. **Easy Modification**
Want to change lighting? Only modify the lighting functions.
Want to adjust physics? Only touch the physics functions.
No more hunting through 900+ lines of intertwined code.

### 2. **No Side Effects**
Changing one effect doesn't break others because they're completely independent.

### 3. **Clear Parameters**
Each function has a clear, minimal set of inputs and produces predictable outputs.

### 4. **Debugging**
Debug modes can now focus on specific effects without interference from others.

### 5. **Performance**
Effects that are disabled have minimal computational overhead.

## Usage Examples

### Adding a New Lighting Effect
```wgsl
fn calculateNewLighting(surface: SurfaceData, lighting: LightingEnvironment, intensity: f32) -> vec3f {
    // Pure function - only depends on inputs
    // No global state or side effects
    return lighting.mainLightColor * intensity;
}
```

### Modifying Existing Effects
```wgsl
// Want to change specular behavior? Just modify this function:
fn calculateSpecular(surface: SurfaceData, lighting: LightingEnvironment, specularPower: f32, specularIntensity: f32) -> f32 {
    // Change only what you need here
    // Everything else remains unaffected
}
```

### Toggling Effects
Effects are controlled by simple toggles in the main fragment shader:
```wgsl
if effectsToggle.enableSpecular != 0u {
    specular = calculateSpecular(surface, lighting, effectParams.specularPower, effectParams.specularScale);
}
```

## Data Structures

### SurfaceData
Contains all surface-related information:
- `position`: 3D position in view space
- `normal`: Surface normal vector
- `thickness`: Fluid thickness at this point
- `depth`: Distance from camera
- `rayDir`: View ray direction
- `viewDotNormal`: Dot product for common calculations

### LightingEnvironment
Contains all lighting information:
- Light directions, colors, and intensities for main, fill, and rim lights
- Ambient lighting properties
- Background environment color

### PhysicsData
Contains all physics simulation results:
- Velocity vectors and magnitude
- Pressure and density values
- Turbulence intensity
- Cavitation factors
- Vorticity information

## Migration from Old System

The new system maintains full compatibility with existing parameters and uniforms. The main differences:

1. **Effects are now functions** instead of inline code blocks
2. **Data is passed explicitly** instead of relying on global variables
3. **Each effect is toggleable** without affecting others
4. **Debug modes are cleaner** and more focused

## Performance Impact

The modular system is actually **more efficient** because:
- Disabled effects have minimal overhead
- No redundant calculations between effects
- Better GPU branching with clean conditionals
- Reduced register pressure due to smaller function scopes
