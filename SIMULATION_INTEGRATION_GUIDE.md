# Simulation Integration Guide

This document explains how to integrate new simulation modes into the WebGPU Ocean project. The project is designed with a modular architecture that allows multiple simulation types to share common infrastructure.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Shared Infrastructure](#shared-infrastructure)
3. [Integration Steps](#integration-steps)
4. [Control System](#control-system)
5. [Best Practices](#best-practices)
6. [Example: Boids Integration](#example-boids-integration)

## Architecture Overview

The WebGPU Ocean project uses a **shared infrastructure pattern** where multiple simulation modes can coexist and share common systems:

```
┌─────────────────────────────────────────────────────────────────┐
│                        main.ts (Orchestrator)                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   MLS-MPM       │  │      SPH        │  │     Boids       │  │
│  │   Simulator     │  │   Simulator     │  │   Simulator     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    Shared Infrastructure                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  FluidRenderer  │  │     Camera      │  │   UI Controls   │  │
│  │     System      │  │     System      │  │     System      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Buffer Mgmt    │  │  Environment    │  │  Parameter      │  │
│  │     System      │  │     System      │  │     Arrays      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Shared Infrastructure

### 1. Rendering System

All simulations use the same **FluidRenderer** class, which means they automatically get:
- Camera controls (drag to rotate, scroll to zoom)
- Environment mapping (cubemap reflections)
- Particle/sphere rendering modes
- Depth-based rendering effects

### 2. Buffer Management

Simulations share GPU buffers:
- **particleBuffer**: Main particle data storage
- **posvelBuffer**: Position/velocity data for rendering
- **renderUniformBuffer**: Rendering parameters
- **waterAppearanceBuffer**: Visual appearance settings

### 3. UI Controls

The control system has three levels:

#### Global Controls (Always Available)
- **Particle Checkbox**: Toggles between fluid and sphere rendering
- **Camera Controls**: Mouse drag/scroll for camera movement
- **Environment Selector**: Changes background environment

#### Simulation-Specific Controls
- **Parameter Sliders**: Number of particles/agents
- **Simulation Mode Radio Buttons**: Switch between simulation types

#### Mode-Conditional Controls
- **Water Appearance**: Only visible for fluid simulations (MLS-MPM, SPH)
- **Box Width Slider**: Available for all modes but with different labels

## Integration Steps

### Step 1: Create Simulator Class

Create a new simulator class that implements the standard interface:

```typescript
export class YourSimulator {
    device: GPUDevice;
    numParticles: number = 0;

    // Required methods:
    constructor(particleBuffer: GPUBuffer, posvelBuffer: GPUBuffer, renderDiameter: number, device: GPUDevice)
    reset(numParticles: number, initBoxSize: number[]): void
    execute(commandEncoder: GPUCommandEncoder): void
    changeBoxSize(realBoxSize: number[]): void
}
```

**Key Requirements:**
- Use the provided `particleBuffer` for your particle data
- Copy final positions to `posvelBuffer` for rendering
- Implement proper WebGPU compute pipelines
- Export a `particleStructSize` constant

### Step 2: Define Parameter Arrays

In `main.ts`, add parameter arrays for your simulation:

```typescript
let yourSimNumParticleParams = [1000, 5000, 10000, 20000];
let yourSimInitBoxSizes = [[30, 20, 30], [40, 30, 40], [50, 40, 50], [60, 50, 60]];
let yourSimInitDistances = [60, 80, 100, 120];
```

### Step 3: Update Buffer Size Calculation

Update the maximum particle structure size:

```typescript
const maxParticleStructSize = Math.max(
    mlsmpmParticleStructSize,
    sphParticleStructSize,
    boidsParticleStructSize,
    yourSimParticleStructSize  // Add your size here
);
```

### Step 4: Create Simulator and Renderer Instances

```typescript
const yourSimFov = 45 * Math.PI / 180;
const yourSimRadius = 0.1;
const yourSimDiameter = 2 * yourSimRadius;
const yourSimZoomRate = 0.1;

const yourSimulator = new YourSimulator(particleBuffer, posvelBuffer, yourSimDiameter, device);
const yourSimRenderer = new FluidRenderer(
    device, canvas, presentationFormat, yourSimRadius, yourSimFov,
    posvelBuffer, renderUniformBuffer, cubemapTextureViews[currentEnvironmentIndex],
    waterAppearanceBuffer
);
```

### Step 5: Add Mode Tracking

Add a boolean flag for your simulation mode:

```typescript
let yourSimFl = false;
```

### Step 6: Update HTML UI

Add your simulation mode to the radio buttons in `index.html`:

```html
<form id="simulation-mode" style="display: flex; gap: 10px;">
    <label><input type="radio" name="options" value="mlsmpm" checked>MLS-MPM</label><br>
    <label><input type="radio" name="options" value="sph">SPH</label><br>
    <label><input type="radio" name="options" value="boids">Boids</label><br>
    <label><input type="radio" name="options" value="yoursim">Your Sim</label><br>
</form>
```

### Step 7: Integrate Mode Switching Logic

Update the simulation mode switching in the frame loop:

```typescript
if (simulationModePressed) {
    if (simulationModePressedButton == "mlsmpm") {
        sphFl = false; boidsFl = false; yourSimFl = false;
        // Set UI labels for MLS-MPM
    } else if (simulationModePressedButton == "sph") {
        sphFl = true; boidsFl = false; yourSimFl = false;
        // Set UI labels for SPH
    } else if (simulationModePressedButton == "boids") {
        sphFl = false; boidsFl = true; yourSimFl = false;
        // Set UI labels for Boids
    } else if (simulationModePressedButton == "yoursim") {
        sphFl = false; boidsFl = false; yourSimFl = true;
        // Set UI labels for Your Sim
    }
    simulationModePressed = false;
    numberButtonPressed = true;
}
```

### Step 8: Add Parameter Selection Logic

```typescript
if (numberButtonPressed) {
    const paramsIdx = parseInt(numberButtonPressedButton);
    if (yourSimFl) {
        initBoxSize = yourSimInitBoxSizes[paramsIdx];
        yourSimulator.reset(yourSimNumParticleParams[paramsIdx], initBoxSize);
        camera.reset(canvasElement, yourSimInitDistances[paramsIdx],
                    [initBoxSize[0]/2, initBoxSize[1]/4, initBoxSize[2]/2],
                    yourSimFov, yourSimZoomRate);
    }
    // ... other conditions
}
```

### Step 9: Add Execution Logic

```typescript
// In the render loop
if (yourSimFl) {
    yourSimulator.changeBoxSize(realBoxSize);
    yourSimulator.execute(commandEncoder);
    yourSimRenderer.execute(context, commandEncoder, yourSimulator.numParticles, sphereRenderFl);
}
```

### Step 10: Update Environment Handling

```typescript
// In environment change handler
yourSimRenderer.updateEnvironment(
    currentEnvironmentIndex === -1 ? null : cubemapTextureViews[currentEnvironmentIndex]
);
```

## Control System

### Understanding Global vs Mode-Specific Controls

The control system allows for sophisticated UI management:

#### Global Controls (Always Active)
These controls work across all simulation modes:

```typescript
// Particle rendering mode - works for all simulations
const particle = document.getElementById("particle") as HTMLInputElement;
sphereRenderFl = particle.checked;

// Camera controls - shared by all modes
const camera = new Camera(canvasElement);

// Environment selector - affects all renderers
environmentSelect.addEventListener('change', (e) => {
    // Updates all renderer instances
});
```

#### Mode-Conditional Controls
Controls that only make sense for certain simulation types:

```typescript
// Water appearance - only for fluid simulations
const waterAppearanceContainer = document.getElementById('water-appearance-controls');
if (simulationModePressedButton == "boids" || simulationModePressedButton == "yoursim") {
    waterAppearanceContainer.style.display = 'none';
} else {
    waterAppearanceContainer.style.display = 'block';
}
```

#### Dynamic Labels
UI labels that change based on simulation mode:

```typescript
const particleCountLabel = document.getElementById('particle-count-label');
const sliderLabel = document.getElementById('slider-label');

if (boidsFl) {
    particleCountLabel.textContent = "Flock Size";
    sliderLabel.textContent = "Flight Area Width";
    smallValue.textContent = "2,500";
    // ... etc
}
```

## Best Practices

### 1. Consistent Interface
Always implement the same four methods:
- `constructor()`
- `reset()`
- `execute()`
- `changeBoxSize()`

### 2. Proper Memory Management
- Use the shared particle buffer
- Export your particle structure size
- Copy data to posvelBuffer for rendering

### 3. WebGPU Best Practices
- Use compute shaders for parallel processing
- Minimize buffer copies
- Use appropriate workgroup sizes (typically 64 or 256)

### 4. UI Considerations
- Provide meaningful parameter ranges
- Use appropriate labels for your simulation type
- Hide irrelevant controls

### 5. Camera Setup
- Choose appropriate FOV, radius, and zoom rate for your simulation scale
- Set reasonable initial camera distances
- Position the camera to show your simulation effectively

## Example: Boids Integration

The Boids integration demonstrates all these concepts:

### 1. Simulator Implementation
```typescript
export class BoidsSimulator {
    // Implements flocking behavior with separation, alignment, cohesion
    // Uses compute shaders for parallel processing
    // Exports boidsParticleStructSize = 64
}
```

### 2. Parameter Arrays
```typescript
let boidsNumParticleParams = [2500, 5000, 7500, 10000];  // Flock sizes
let boidsInitBoxSizes = [[40, 30, 40], [50, 40, 50], [60, 50, 60], [70, 60, 70]];
let boidsInitDistances = [80, 100, 120, 140];  // Camera distances
```

### 3. Mode-Specific UI
```typescript
if (boidsFl) {
    particleCountLabel.textContent = "Flock Size";
    sliderLabel.textContent = "Flight Area Width";
    waterAppearanceContainer.style.display = 'none';  // Hide water controls
    smallValue.textContent = "2,500 agents";
    // ... etc
}
```

### 4. Global Control Reuse
- **Particle checkbox**: Toggles between flocking visualization and individual agent spheres
- **Camera controls**: Work seamlessly with Boids
- **Environment mapping**: Provides realistic reflections on agent spheres

## Conclusion

The modular architecture makes it straightforward to add new simulation modes while leveraging existing infrastructure. The key insight is that many controls can be global (camera, rendering mode, environment) while others need to be mode-specific (parameters, labels, certain UI elements).

This design allows for:
- **Code reuse**: Shared rendering, camera, and buffer systems
- **Consistent UX**: Similar interaction patterns across modes
- **Easy expansion**: Clear patterns for adding new simulations
- **Flexible UI**: Dynamic adaptation based on simulation type

When adding a new simulation mode, focus on implementing the core simulation logic while leveraging the existing infrastructure for rendering, interaction, and UI management.
