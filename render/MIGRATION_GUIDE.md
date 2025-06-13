# Migration Guide: From Coupled to Modular Fluid Rendering

## Quick Start: 5 Minutes to Modular Rendering

### Step 1: Update Your Shader Reference
```typescript
// OLD: Using the monolithic shader
const shaderModule = device.createShaderModule({
  code: await fetch('./render/fluid.wgsl').then(r => r.text())
});

// NEW: Using the modular shader
const shaderModule = device.createShaderModule({
  code: await fetch('./render/fluid_decoupled.wgsl').then(r => r.text())
});
```

### Step 2: Initialize the New Configuration System
```typescript
import {
  initializeFluidConfigDefaults,
  initializeCompositionDefaults,
  fluidConfigValues,
  compositionParamsValues
} from './common.js';

// Initialize safe defaults
initializeFluidConfigDefaults();
initializeCompositionDefaults();
```

### Step 3: Add New Buffer Bindings
```typescript
// Add these new uniform buffers to your existing setup:

// Group 2: Configuration and composition
const fluidConfigBuffer = device.createBuffer({
  size: fluidConfigValues.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const compositionBuffer = device.createBuffer({
  size: compositionParamsValues.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
```

### Step 4: Update Bind Group Layout
```typescript
const bindGroupLayout2 = device.createBindGroupLayout({
  entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // FluidConfig
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // CompositionParams
  ],
});

// Add to your existing pipeline layout
const pipelineLayout = device.createPipelineLayout({
  bindGroupLayouts: [bindGroupLayout0, bindGroupLayout1, bindGroupLayout2], // Add new group
});
```

### Step 5: Create Bind Groups
```typescript
const bindGroup2 = device.createBindGroup({
  layout: bindGroupLayout2,
  entries: [
    { binding: 0, resource: { buffer: fluidConfigBuffer } },
    { binding: 1, resource: { buffer: compositionBuffer } },
  ],
});
```

### Step 6: Update Render Pass
```typescript
// In your render loop, add the new bind group:
passEncoder.setBindGroup(0, bindGroup0);
passEncoder.setBindGroup(1, bindGroup1);
passEncoder.setBindGroup(2, bindGroup2); // NEW: Add modular configuration
passEncoder.draw(6);
```

**That's it! You're now using the modular system!** 🎉

---

## Advanced Configuration

### Custom Lighting Presets
```typescript
// Dramatic lighting preset
function applyDramaticLighting() {
  lightingControlsViews.mainLightEnabled[0] = 1;
  lightingControlsViews.mainLightDirection.set([0.8, -0.9, -0.2], 0);
  lightingControlsViews.mainLightColor.set([1.0, 0.9, 0.7], 0);
  lightingControlsViews.mainLightIntensity[0] = 1.8;

  lightingControlsViews.fillLightEnabled[0] = 1;
  lightingControlsViews.fillLightDirection.set([-0.6, -0.3, 0.8], 0);
  lightingControlsViews.fillLightColor.set([0.6, 0.8, 1.0], 0);
  lightingControlsViews.fillLightIntensity[0] = 0.4;

  // Enhanced composition for drama
  compositionParamsViews.lightingGlobalMultiplier[0] = 1.3;
  compositionParamsViews.specularWeight[0] = 1.5;
}

// Underwater lighting preset
function applyUnderwaterLighting() {
  lightingControlsViews.mainLightColor.set([0.7, 0.9, 1.0], 0);
  lightingControlsViews.ambientColor.set([0.3, 0.6, 0.8], 0);
  lightingControlsViews.ambientIntensity[0] = 0.6;

  // Enhance subsurface for underwater feel
  compositionParamsViews.subsurfaceWeight[0] = 1.4;
  lightingControlsViews.subsurfaceIntensityMultiplier[0] = 1.2;
}
```

### Physics Presets
```typescript
// Calm water preset
function applyCalmWater() {
  effectsToggleViews.enableReynoldsPhysics[0] = 1;
  effectParametersViews.turbulenceStrength[0] = 0.2;
  effectParametersViews.viscosityFactor[0] = 1.4;

  effectsToggleViews.enableFoam[0] = 0; // No foam for calm water
  effectsToggleViews.enableTurbulentNormals[0] = 0;
}

// Turbulent water preset
function applyTurbulentWater() {
  effectsToggleViews.enableReynoldsPhysics[0] = 1;
  effectParametersViews.turbulenceStrength[0] = 1.2;
  effectParametersViews.reynoldsScale[0] = 1.3;

  effectsToggleViews.enableCavitation[0] = 1;
  effectParametersViews.cavitationStrength[0] = 1.1;

  effectsToggleViews.enableFoam[0] = 1;
  effectParametersViews.foamIntensity[0] = 0.8;

  effectsToggleViews.enableTurbulentNormals[0] = 1;
  effectParametersViews.normalStrength[0] = 0.12;
}
```

### Safe Fallback Configuration
```typescript
// Configure safe fallbacks for when main systems fail
function configureSafeFallbacks() {
  fluidConfigViews.enableLightingOverrides[0] = 1;

  // Safe lighting fallbacks
  fluidConfigViews.mainLightOverride.set([0.3, -0.7, -0.6, 1.0], 0);
  fluidConfigViews.fillLightOverride.set([-0.5, -0.3, 0.8, 0.0], 0);
  fluidConfigViews.rimLightOverride.set([0.8, 0.2, -0.4, 0.0], 0);

  // Safe water appearance fallbacks
  fluidConfigViews.waterColorOverride.set([0.2, 0.6, 0.8, 0.8], 0);
  fluidConfigViews.reflectivityOverride[0] = 0.3;

  // Safe absorption fallbacks
  fluidConfigViews.absorptionOverride.set([0.03, 0.025, 0.02, 1.0], 0);
}
```

---

## Debugging with the Modular System

### Isolate Specific Effects
```typescript
// Function to disable all effects for clean debugging
function disableAllEffects() {
  Object.values(effectsToggleViews).forEach(view => {
    if (view instanceof Uint32Array) {
      view[0] = 0;
    }
  });
}

// Enable effects one by one for debugging
function debugLightingOnly() {
  disableAllEffects();
  effectsToggleViews.enableSpecular[0] = 1;
  console.log('Only specular lighting enabled');
}

function debugPhysicsOnly() {
  disableAllEffects();
  effectsToggleViews.enableReynoldsPhysics[0] = 1;
  effectsToggleViews.enableCavitation[0] = 1;
  console.log('Only physics effects enabled');
}

function debugOpticalOnly() {
  disableAllEffects();
  effectsToggleViews.enableFresnel[0] = 1;
  effectsToggleViews.enableReflection[0] = 1;
  effectsToggleViews.enableAbsorption[0] = 1;
  console.log('Only optical effects enabled');
}
```

### Performance Profiling
```typescript
// Profile individual effect performance
function profileEffects() {
  const effects = [
    { name: 'Reynolds Physics', toggle: () => { effectsToggleViews.enableReynoldsPhysics[0] = 1; } },
    { name: 'Specular', toggle: () => { effectsToggleViews.enableSpecular[0] = 1; } },
    { name: 'Subsurface', toggle: () => { effectsToggleViews.enableSubsurface[0] = 1; } },
    { name: 'Fresnel', toggle: () => { effectsToggleViews.enableFresnel[0] = 1; } },
    { name: 'Caustics', toggle: () => { effectsToggleViews.enableCaustics[0] = 1; } },
  ];

  effects.forEach(effect => {
    disableAllEffects();
    effect.toggle();
    console.log(`Profiling: ${effect.name}`);
    // Measure frame time here
  });
}
```

---

## Common Migration Issues & Solutions

### Issue 1: Missing Include Statements
**Problem**: Shader compilation errors about missing functions
**Solution**: Ensure your build system supports `#include` directives, or manually concatenate files

### Issue 2: Buffer Size Mismatches
**Problem**: WebGPU validation errors about buffer sizes
**Solution**: Check that your buffer sizes match the TypeScript array buffer sizes:
```typescript
console.log('FluidConfig buffer size:', fluidConfigValues.byteLength);  // Should be 104
console.log('Composition buffer size:', compositionParamsValues.byteLength);  // Should be 64
```

### Issue 3: Bind Group Layout Mismatches
**Problem**: Pipeline creation fails due to bind group layout mismatches
**Solution**: Ensure your bind group layouts match the shader `@group` annotations:
```wgsl
@group(2) @binding(0) var<uniform> fluidConfig: FluidConfig;
@group(2) @binding(1) var<uniform> composition: CompositionParams;
```

### Issue 4: Configuration Not Applied
**Problem**: Changes to configuration don't appear in rendering
**Solution**: Make sure to copy data to GPU buffers in your render loop:
```typescript
device.queue.writeBuffer(fluidConfigBuffer, 0, fluidConfigValues);
device.queue.writeBuffer(compositionBuffer, 0, compositionParamsValues);
```

---

## Benefits You'll Immediately Notice

### ✅ Independent Effect Development
- Change lighting without worrying about breaking physics
- Modify colors without affecting optical calculations
- Add new effects without touching existing code

### ✅ Easy Debugging
- Toggle individual effects on/off for isolation
- Debug specific effect combinations
- Profile individual effect performance

### ✅ Runtime Configuration
- Adjust effects without recompiling shaders
- Create presets for different scenarios
- Safe fallbacks when main systems fail

### ✅ Better Performance
- Disabled effects have minimal overhead
- Clear branching optimized for GPU
- No unnecessary calculations

### ✅ Maintainable Code
- Each effect in its own file
- Clear separation of concerns
- Easy to understand and extend

---

## Next Steps

1. **Start with the basic migration** (Steps 1-6 above)
2. **Test with your existing scenes** to ensure compatibility
3. **Experiment with effect presets** to see the flexibility
4. **Use debugging tools** to understand effect interactions
5. **Create custom configurations** for your specific needs

The modular system gives you the same visual quality with much better maintainability and configurability. Welcome to truly independent fluid effects! 🌊✨
