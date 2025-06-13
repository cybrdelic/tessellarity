# Before vs After: Modular Refactoring Example

## The Problem: Changing Lighting Required Touching Multiple Effects

### Before (Tightly Coupled):
```wgsl
// To change lighting, you had to modify code scattered throughout the shader:

// In specular calculation:
if lightingControls.mainLightEnabled != 0u {
    var mainH = normalize(mainLightDir - rayDir);
    mainSpecular = pow(max(0.0, dot(mainH, normal)), baseSpecularPower) * adjustedSpecularIntensity * fresnelSpecular * lightingControls.mainLightIntensity;
}
// ... similar code for fill and rim lights scattered here

// In subsurface calculation (200 lines later):
if lightingControls.mainLightEnabled != 0u {
    mainSubsurface = max(0.0, dot(-mainLightDir, normal)) * thickness * adjustedSubsurfaceIntensity * lightingControls.mainLightIntensity;
}
// ... more scattered lighting code

// In rim lighting (300 lines later):
if lightingControls.mainLightEnabled != 0u {
    mainRimContribution = (primaryRim + secondaryRim) * max(0.0, dot(normal, -mainLightDir)) * 0.9 * lightingControls.mainLightIntensity;
}
// ... even more scattered code

// In volumetric lighting (400 lines later):
if lightingControls.mainLightEnabled != 0u {
    lightPenetrationMain = max(0.0, -dot(normal, mainLightDir)) * 0.8 * lightingControls.mainLightIntensity;
}
// ... and more scattered references
```

### After (Modular):
```wgsl
// All lighting is centralized and independent:

fn createLightingEnvironment() -> LightingEnvironment {
    // ONE place to set up all lighting
    var lighting: LightingEnvironment;

    if lightingControls.mainLightEnabled != 0u {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.mainLightDirection, 0.)).xyz);
        lighting.mainLightColor = lightingControls.mainLightColor;
        lighting.mainLightIntensity = lightingControls.mainLightIntensity;
    }
    // ... clean setup for all lights

    return lighting;
}

// Each effect gets lighting data independently:
fn calculateSpecular(surface: SurfaceData, lighting: LightingEnvironment, power: f32, intensity: f32) -> f32 {
    // Self-contained - no external dependencies
}

fn calculateSubsurface(surface: SurfaceData, lighting: LightingEnvironment, intensity: f32) -> vec3f {
    // Self-contained - no external dependencies
}

fn calculateRimLighting(surface: SurfaceData, lighting: LightingEnvironment, power: f32, intensity: f32) -> vec3f {
    // Self-contained - no external dependencies
}
```

## Real Example: Adding a New Light Source

### Before (Nightmare):
To add a new light, you would need to:
1. Find and modify the light setup code (scattered across 50+ lines)
2. Hunt down every specular calculation and add the new light
3. Find every subsurface calculation and add the new light
4. Find every rim lighting calculation and add the new light
5. Find every volumetric calculation and add the new light
6. Find every caustics calculation and add the new light
7. Hope you didn't miss any references or break existing code

**Result**: Touching 15+ different locations, high chance of bugs, takes hours

### After (Simple):
```wgsl
// 1. Add to lighting environment (ONE place):
fn createLightingEnvironment() -> LightingEnvironment {
    var lighting: LightingEnvironment;
    // ... existing lights

    // Add new light here
    lighting.newLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.newLightDirection, 0.)).xyz);
    lighting.newLightColor = lightingControls.newLightColor;
    lighting.newLightIntensity = lightingControls.newLightIntensity;

    return lighting;
}

// 2. Each effect automatically gets the new light data:
fn calculateSpecular(surface: SurfaceData, lighting: LightingEnvironment, power: f32, intensity: f32) -> f32 {
    var specular = 0.0;
    // ... existing light calculations

    // Add new light calculation
    if lighting.newLightIntensity > 0.0 {
        var H = normalize(lighting.newLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, surface.normal)), power) * intensity * lighting.newLightIntensity;
    }

    return specular;
}
```

**Result**: Only need to modify the functions you want to support the new light. Takes minutes, not hours.

## Physics Effects Example

### Before (Tangled):
```wgsl
// Physics calculations were mixed with rendering code:
var velocityMagnitude = sqrt(velocityX * velocityX + velocityZ * velocityZ + length(ddx.y) * length(ddy.y));
var pressureDensity = 1.0 + thickness * 3.0;
var depthPressure = abs(viewPos.z) * 0.2;
var compressionFactor = pow(pressureDensity + depthPressure, 0.8);
var density = compressionFactor;

// ... 100 lines later, mixed with lighting code:
var hydrostaticPressure = abs(viewPos.z) * 9.81 * 1000.0;
var dynamicPressure = velocityMagnitude * velocityMagnitude * 500.0;
var totalPressure = hydrostaticPressure + dynamicPressure;
var cavitationThreshold = 2337.0;
cavitationFactor = clamp((cavitationThreshold - totalPressure) / cavitationThreshold, 0.0, 1.0);

// ... 200 lines later, mixed with color code:
var turbulence = velocityMagnitude * 0.05;
foamIntensity = cavitationFactor * turbulence * effectParams.foamIntensity;
```

### After (Clean):
```wgsl
// All physics in one place:
fn calculateReynoldsPhysics(velocity: vec3f, characteristicLength: f32, viscosity: f32, reynoldsScale: f32, turbulenceStrength: f32) -> PhysicsData {
    // Everything physics-related in one function
    var physics: PhysicsData;
    physics.velocity = velocity;
    physics.velocityMagnitude = length(velocity);
    // ... all physics calculations here
    return physics;
}

fn calculateCavitation(surface: SurfaceData, physics: PhysicsData, threshold: f32) -> f32 {
    // Pure cavitation calculation
}

fn calculateFoam(physics: PhysicsData, cavitation: f32, intensity: f32, threshold: f32) -> f32 {
    // Pure foam calculation
}

// Usage is clean:
var physics = calculateReynoldsPhysics(velocity, uniforms.sphere_size, effectParams.viscosityFactor, effectParams.reynoldsScale, effectParams.turbulenceStrength);
var cavitation = calculateCavitation(surface, physics, effectParams.cavitationThreshold);
var foam = calculateFoam(physics, cavitation, effectParams.foamIntensity, effectParams.foamThreshold);
```

## Benefits Summary

| Aspect | Before | After |
|--------|---------|-------|
| **Lines to modify lighting** | 15+ locations | 1-2 functions |
| **Side effects when changing physics** | High - affects lighting, colors | None - isolated |
| **Debugging complexity** | Must trace through entire shader | Debug individual functions |
| **Parameter tuning** | Risk breaking other effects | Safe, isolated changes |
| **Code readability** | 900+ line monolith | Clean, small functions |
| **Maintainability** | Very difficult | Easy |
| **Testing** | Must test entire shader | Can test effects individually |
| **Performance** | Always calculates everything | Only calculates enabled effects |

The new modular system transforms a maintenance nightmare into a clean, manageable codebase where each effect can be developed, tested, and modified independently.
