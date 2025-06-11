# Radiance Transport System for MPM

This directory contains a modular radiance transport system that couples with the Material Point Method (MPM) fluid simulation to handle volumetric light transport. The system treats light as a separate phase-layer, independent of particle attributes, and implements physically-based light-matter interactions.

## System Overview

The radiance transport system consists of several interconnected components:

### Core Components

1. **SDF Generation** (`sdf-generation.wgsl`)
   - Converts MPM density field to a signed distance field (SDF)
   - Enables efficient raymarching through the fluid volume
   - Uses trilinear interpolation for smooth density sampling

2. **Raymarching Transport** (`raymarch-transport.wgsl`)
   - Implements volumetric light transport using raymarching
   - Supports absorption, scattering, and emission
   - Uses spherical harmonics for directional radiance representation
   - Includes Henyey-Greenstein phase function for scattering

3. **Optical Properties** (`optical-properties-update.wgsl`)
   - Calculates per-cell optical properties from MPM state
   - Derives absorption, scattering, and emission coefficients
   - Temperature calculation from kinetic energy and density
   - Wavelength-dependent absorption modeling

4. **Heat Back-projection** (`heat-back-projection.wgsl`)
   - Transfers absorbed radiance back to MPM as thermal energy
   - Implements heat diffusion between neighboring cells
   - Encodes temperature in unused bits of MPM mass field
   - Supports radiative heating and cooling

5. **Integration Layer** (`mpm-radiance-integration.ts`)
   - Couples radiance transport with MPM simulation
   - Provides unified interface for both systems
   - Manages execution order and data flow
   - Maintains compatibility with existing MPM API

6. **Visualization** (`radiance-visualization.wgsl`)
   - Provides visual debugging of radiance data
   - Multiple visualization modes (radiance, temperature, absorption, etc.)
   - Temperature-to-color mapping
   - SDF visualization for debugging

## Technical Details

### Grid Structure
- Uses the same 64³ grid as MPM simulation
- Each cell stores:
  - SDF value (4 bytes)
  - Optical properties (48 bytes): absorption, scattering, emission, temperature
  - Radiance field (64 bytes): spherical harmonics coefficients

### Light Transport Physics
- **Beer-Lambert Law**: Exponential attenuation for absorption
- **Volume Scattering**: Henyey-Greenstein phase function
- **Blackbody Emission**: Temperature-dependent emission spectrum
- **Heat Transfer**: Radiative heating with thermal diffusion

### Coupling with MPM
- **Density → Optical Properties**: Fluid density affects absorption/scattering
- **Velocity → Turbulence**: Velocity affects scattering coefficients
- **Radiance → Heat**: Absorbed light heats the fluid
- **Temperature → Emission**: Hot fluid emits light

## Usage

### Basic Setup

```typescript
import { MPMWithRadianceTransport } from './radiance-transport';

// Create enhanced MPM simulator with radiance transport
const simulator = new MPMWithRadianceTransport(
    particleBuffer,
    posvelBuffer,
    renderDiameter,
    device
);

// Configure radiance parameters
simulator.updateRadianceParameters({
    lightDirection: [0.3, -0.7, -0.6],
    lightIntensity: 1.5,
    lightColor: [1.0, 0.9, 0.8],
    ambientRadiance: 0.1,
    extinctionScale: 1.2,
    heatTransferRate: 0.02
});

// Execute simulation step
simulator.execute(commandEncoder, [64, 64, 64]);
```

### Visualization

```typescript
// Get radiance data for visualization
const radianceBuffer = simulator.getRadianceBuffer();
const sdfBuffer = simulator.getSDFBuffer();
const opticalPropsBuffer = simulator.getOpticalPropertiesBuffer();

// Configure visualization
const visualizationParams = {
    mode: VISUALIZATION_MODES.TEMPERATURE,
    intensity: 1.0,
    colorScale: [1.0, 1.0, 1.0],
    temperatureRange: [300.0, 800.0]
};
```

## Parameters

### Radiance Transport Parameters

- `lightDirection`: Primary light source direction (vec3)
- `lightIntensity`: Light source intensity (0-10)
- `lightColor`: Light source color (RGB)
- `ambientRadiance`: Ambient light level (0-1)
- `scatteringPhase`: Phase function asymmetry (-1 to 1)
- `extinctionScale`: Global extinction scaling (0-10)
- `emissionTemperatureScale`: Temperature scaling for emission
- `heatTransferRate`: Heat transfer coupling strength (0-1)

### Visualization Modes

- `RADIANCE`: Shows radiance distribution
- `TEMPERATURE`: Temperature-based color mapping
- `ABSORPTION`: Absorption coefficients
- `SCATTERING`: Scattering coefficients
- `SDF`: Signed distance field values
- `EMISSION`: Emission coefficients

## Performance Considerations

### Computational Cost
- SDF Generation: O(N) where N = grid cells
- Optical Properties: O(N)
- Raymarching: O(N × R) where R = rays per cell
- Heat Back-projection: O(N)
- Total: ~4-8x cost of base MPM step

### Memory Usage
- SDF Field: 1 MB (64³ × 4 bytes)
- Radiance Field: 16 MB (64³ × 64 bytes)
- Optical Properties: 12 MB (64³ × 48 bytes)
- Total: ~29 MB additional memory

### Optimization Strategies
- Adaptive raymarching step size
- Early ray termination
- Sparse grid representation for empty regions
- Level-of-detail for distant regions
- Temporal coherence for stable frames

## Integration with Existing Systems

### MPM Compatibility
- Maintains full compatibility with existing MPM API
- Zero overhead when radiance transport is disabled
- Pass-through access to underlying MPM simulator

### Rendering Integration
- Radiance data can enhance existing fluid rendering
- Temperature affects material appearance
- Emission creates self-illuminating effects
- SDF enables efficient volume rendering

### UI Controls
The system exposes parameters suitable for real-time adjustment:
- Light direction and intensity
- Scattering properties
- Heat transfer coupling
- Visualization modes

## Future Enhancements

### Short Term
- Multiple light sources
- Volumetric shadows
- Chromatic dispersion
- Improved temperature model

### Long Term
- Spectral radiance transport
- Participating media (smoke, particles)
- Caustics from refractive interfaces
- GPU-accelerated denoising

## File Structure

```
radiance-transport/
├── index.ts                        # Main exports and utilities
├── radiance-transport.ts            # Core system implementation
├── mpm-radiance-integration.ts      # MPM integration layer
├── sdf-generation.wgsl             # SDF generation shader
├── raymarch-transport.wgsl         # Radiance transport shader
├── optical-properties-update.wgsl  # Optical properties shader
├── heat-back-projection.wgsl       # Heat back-projection shader
├── radiance-visualization.wgsl     # Visualization shader
└── README.md                       # This documentation
```

## Mathematical Foundation

### Radiative Transfer Equation
The system solves a simplified form of the radiative transfer equation:

```
dL/ds = -σₜL + σₛ∫L(ω')p(ω'→ω)dω' + σₑLₑ
```

Where:
- L: Radiance
- σₜ: Extinction coefficient (absorption + scattering)
- σₛ: Scattering coefficient
- σₑ: Emission coefficient
- p: Phase function
- Lₑ: Emission term

### Heat Transfer
Absorbed radiance is converted to thermal energy:

```
∂T/∂t = α∇²T + (1/ρcₚ)∫σₐL dω
```

Where:
- T: Temperature
- α: Thermal diffusivity
- ρ: Density
- cₚ: Specific heat capacity
- σₐ: Absorption coefficient

This creates a two-way coupling between light transport and fluid thermodynamics.
