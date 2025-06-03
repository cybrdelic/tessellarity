# WebGPU Ocean Simulation System: Contributing Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Code Standards](#code-standards)
4. [Adding New Simulators](#adding-new-simulators)
5. [Testing Guidelines](#testing-guidelines)
6. [Documentation Requirements](#documentation-requirements)
7. [Performance Optimization](#performance-optimization)
8. [Debugging and Troubleshooting](#debugging-and-troubleshooting)
9. [Submission Guidelines](#submission-guidelines)

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A WebGPU-compatible browser (Chrome 113+, Edge 113+, Firefox Nightly)
- Basic understanding of WebGPU, WGSL, and GPU computing concepts
- TypeScript knowledge

### Environment Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/WebGPU-Ocean.git
   cd WebGPU-Ocean
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run serve
   ```

4. **Enable error streaming (optional):**
   ```bash
   npm run error-server
   ```

### Development Tools

- **Error Monitoring**: The error server streams WebGPU errors to `shader-errors.log`
- **Hot Reload**: Vite provides fast development iteration
- **TypeScript**: Full type checking and IntelliSense support
- **WGSL Support**: Syntax highlighting via `vite-plugin-glsl`

---

## Development Workflow

### Branch Strategy

- **main**: Stable release branch
- **develop**: Integration branch for new features
- **feature/***: Individual feature development
- **hotfix/***: Critical bug fixes

### Standard Workflow

1. **Create feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes** following the code standards below

3. **Test thoroughly** across different devices and browsers

4. **Document changes** in relevant files

5. **Submit pull request** with detailed description

### Commit Message Format

```
type(scope): brief description

Detailed explanation of changes if needed.

- List specific changes
- Include breaking changes
- Reference issues: Fixes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

---

## Code Standards

### TypeScript Style

```typescript
// Use explicit types
interface ParticleData {
    position: [number, number, number];
    velocity: [number, number, number];
    density: number;
}

// Prefer const assertions for immutable data
const CONFIG = {
    maxParticles: 500000,
    defaultRadius: 0.1
} as const;

// Use meaningful names
class AdvancedFluidSimulator implements ISimulator {
    private computePipeline: GPUComputePipeline;
    private readonly particleBuffer: GPUBuffer;

    public async initializeSimulation(): Promise<void> {
        // Implementation
    }
}
```

### WGSL Shader Style

```wgsl
// Use descriptive variable names
@compute @workgroup_size(64, 1, 1)
fn update_particle_positions(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let particle_index = global_id.x;
    if (particle_index >= arrayLength(&particle_data)) {
        return;
    }

    var particle = particle_data[particle_index];

    // Apply physics update
    let acceleration = compute_acceleration(particle);
    particle.velocity += acceleration * time_step;
    particle.position += particle.velocity * time_step;

    // Write back to buffer
    particle_data[particle_index] = particle;
}
```

### File Organization

```
your-simulator/
├── simulator.ts           # Main simulator class
├── compute-shaders/
│   ├── update.wgsl       # Core simulation compute shaders
│   ├── forces.wgsl       # Force computation
│   └── integration.wgsl  # Integration step
├── renderer.ts           # Custom renderer (if needed)
├── config.ts             # Configuration and constants
├── types.ts              # TypeScript type definitions
└── README.md             # Simulator-specific documentation
```

### Error Handling

```typescript
// Always validate GPU resources
private validateBuffers(): void {
    if (!this.particleBuffer) {
        throw new Error('Particle buffer not initialized');
    }

    if (this.particleBuffer.size < this.numParticles * this.particleStructSize) {
        throw new Error(`Buffer too small: expected ${this.numParticles * this.particleStructSize}, got ${this.particleBuffer.size}`);
    }
}

// Graceful degradation for missing features
private createTimestampQuery(): GPUQuerySet | null {
    if (!this.device.features.has('timestamp-query')) {
        console.warn('Timestamp queries not supported, performance monitoring disabled');
        return null;
    }

    return this.device.createQuerySet({
        type: 'timestamp',
        count: 2
    });
}
```

---

## Adding New Simulators

### Step 1: Implement Core Interface

```typescript
export class YourSimulator implements ISimulator {
    public numParticles: number = 0;

    constructor(
        private particleBuffer: GPUBuffer,
        private posvelBuffer: GPUBuffer,
        private particleRadius: number,
        private device: GPUDevice
    ) {
        this.initializePipelines();
    }

    reset(numParticles: number, boxSize: number[]): void {
        this.numParticles = numParticles;
        // Initialize simulation state
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        // Run simulation step
    }

    changeBoxSize(boxSize: number[]): void {
        // Update boundary conditions
    }
}
```

### Step 2: Create Configuration

```typescript
export const YOUR_SIMULATOR_CONFIG: SimulatorConfig = {
    mode: SimulationMode.YOUR_SIM,
    displayName: "Your Simulation",
    particleCounts: [1000, 5000, 10000, 25000],
    particleLabels: [
        "Small (1K entities)",
        "Medium (5K entities)",
        "Large (10K entities)",
        "Huge (25K entities)"
    ],
    boxSizes: [[20, 20, 20], [30, 30, 30], [40, 40, 40], [50, 50, 50]],
    cameraDistances: [40, 50, 60, 70],
    renderSettings: {
        radius: 0.15,
        fov: 60,
        zoomRate: 1.2
    },
    uiSettings: {
        showWaterControls: false,
        sliderLabel: "Simulation Area:",
        particleCountLabel: "Entity Count"
    },
    particleStructSize: yourParticleStructSize
};
```

### Step 3: Register with System

Add to `SimulatorConfig.ts`:

```typescript
export enum SimulationMode {
    // ... existing modes
    YOUR_SIM = "yoursim"
}

export const SIMULATION_CONFIGS: Record<SimulationMode, SimulatorConfig> = {
    // ... existing configs
    [SimulationMode.YOUR_SIM]: YOUR_SIMULATOR_CONFIG
};
```

### Step 4: Integration Testing

Test your simulator with:
- Different particle counts
- Various box sizes
- Parameter changes during runtime
- Browser compatibility
- Error conditions

---

## Testing Guidelines

### Manual Testing Checklist

- [ ] **Initialization**: Simulator loads without errors
- [ ] **Parameter Changes**: Smooth transitions between settings
- [ ] **Performance**: Maintains target framerate across devices
- [ ] **Visual Quality**: Rendered output looks correct
- [ ] **Error Handling**: Graceful failure modes
- [ ] **Browser Compatibility**: Works across WebGPU browsers

### Performance Benchmarks

```typescript
// Example performance test
async function benchmarkSimulator() {
    const startTime = performance.now();

    // Run 100 simulation steps
    for (let i = 0; i < 100; i++) {
        simulator.execute(commandEncoder);
        await device.queue.onSubmittedWorkDone();
    }

    const endTime = performance.now();
    const avgFrameTime = (endTime - startTime) / 100;

    console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`);
    console.log(`Average FPS: ${(1000 / avgFrameTime).toFixed(1)}`);
}
```

### Memory Usage Testing

```typescript
// Monitor GPU memory usage
function checkGPUMemory() {
    if ('memory' in navigator) {
        const memory = (navigator as any).memory;
        console.log(`Used JS Heap: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Total JS Heap: ${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
    }
}
```

---

## Documentation Requirements

### Code Documentation

```typescript
/**
 * Advanced fluid simulator implementing the XYZ algorithm
 *
 * Features:
 * - Real-time particle dynamics
 * - Adaptive time stepping
 * - GPU-optimized spatial hashing
 *
 * @see {@link https://example.com/xyz-paper | Original Paper}
 */
export class XYZSimulator implements ISimulator {
    /**
     * Initialize the simulator with GPU resources
     *
     * @param particleBuffer - GPU buffer for particle data
     * @param posvelBuffer - GPU buffer for position/velocity rendering data
     * @param particleRadius - Physical radius of particles in world units
     * @param device - WebGPU device for GPU operations
     *
     * @throws {Error} If WebGPU features are insufficient
     */
    constructor(
        particleBuffer: GPUBuffer,
        posvelBuffer: GPUBuffer,
        particleRadius: number,
        device: GPUDevice
    ) {
        // Implementation
    }
}
```

### Algorithm Documentation

For complex algorithms, include:

1. **Mathematical foundation** - Key equations and theory
2. **Implementation details** - GPU-specific optimizations
3. **Parameter guidance** - Recommended ranges and effects
4. **Performance characteristics** - Complexity analysis
5. **References** - Academic papers and resources

### Shader Documentation

```wgsl
// Compute density using smoothing kernel
// Based on Müller et al. "Particle-Based Fluid Simulation" (2003)
// Poly6 kernel: W(r,h) = 315/(64π*h^9) * (h² - r²)³ for r < h
fn poly6_kernel(r_squared: f32, h: f32) -> f32 {
    if (r_squared >= h * h) {
        return 0.0;
    }

    let h_squared = h * h;
    let factor = 315.0 / (64.0 * PI * pow(h, 9.0));
    let diff = h_squared - r_squared;

    return factor * diff * diff * diff;
}
```

---

## Performance Optimization

### GPU Performance Guidelines

1. **Workgroup Size Optimization:**
   ```typescript
   // Test different workgroup sizes
   const workgroupSizes = [32, 64, 128, 256];
   let bestSize = 64;
   let bestTime = Infinity;

   for (const size of workgroupSizes) {
       const time = await benchmarkWorkgroupSize(size);
       if (time < bestTime) {
           bestTime = time;
           bestSize = size;
       }
   }
   ```

2. **Memory Access Patterns:**
   ```wgsl
   // GOOD: Coalesced memory access
   let particle_id = global_invocation_id.x;
   let particle = particles[particle_id];

   // BAD: Random memory access
   let random_id = hash(particle_id) % num_particles;
   let other_particle = particles[random_id];
   ```

3. **Reduce Branching:**
   ```wgsl
   // GOOD: Branchless computation
   let is_active = f32(particle_id < num_active_particles);
   particle.force = base_force * is_active;

   // AVOID: Heavy branching in hot loops
   if (particle_id < num_active_particles) {
       // Complex computation
   }
   ```

### CPU Performance Guidelines

1. **Minimize Buffer Copies:**
   ```typescript
   // Update uniform data in-place when possible
   this.uniformValues.timeStep = newTimeStep;
   device.queue.writeBuffer(this.uniformBuffer, 16, new Float32Array([newTimeStep]));
   ```

2. **Batch GPU Operations:**
   ```typescript
   // Bundle multiple compute passes
   const computePass = commandEncoder.beginComputePass();
   computePass.setPipeline(this.densityPipeline);
   computePass.dispatchWorkgroups(workgroups);
   computePass.setPipeline(this.forcePipeline);
   computePass.dispatchWorkgroups(workgroups);
   computePass.end();
   ```

---

## Debugging and Troubleshooting

### Common Issues and Solutions

#### WebGPU Device Creation Fails
```typescript
// Solution: Check for required features
const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) {
    throw new Error('WebGPU not supported');
}

const device = await adapter.requestDevice({
    requiredFeatures: ['timestamp-query'],
    requiredLimits: {
        maxStorageTexturesPerShaderStage: 8
    }
});
```

#### Shader Compilation Errors
```typescript
// Use the error streaming service
try {
    const shaderModule = device.createShaderModule({
        code: shaderSource
    });
} catch (error) {
    console.error('Shader compilation failed:', error);
    // Check shader-errors.log for detailed messages
}
```

#### BindGroup Validation Failures
```typescript
// Ensure layout matches shader expectations
const bindGroupLayout = device.createBindGroupLayout({
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'storage' }
        },
        {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' }
        }
        // Must match all @binding declarations in shader
    ]
});
```

### Debug Tools

1. **GPU Timeline Capture**: Use browser dev tools GPU profiler
2. **Error Streaming**: Monitor `shader-errors.log` in real-time
3. **Performance Monitoring**: Built-in GPU timestamp queries
4. **Visual Debugging**: Render intermediate computational steps

---

## Submission Guidelines

### Pull Request Requirements

1. **Description**: Clear explanation of changes and motivation
2. **Testing**: Evidence of thorough testing across devices
3. **Documentation**: Updated relevant documentation files
4. **Performance**: No significant performance regressions
5. **Compatibility**: Maintained browser compatibility

### Review Process

1. **Automated Checks**: Code style and TypeScript compilation
2. **Manual Review**: Code quality and architectural fit
3. **Testing**: Functionality and performance validation
4. **Documentation Review**: Accuracy and completeness

### Acceptance Criteria

- [ ] Code follows established patterns and standards
- [ ] All tests pass (manual checklist for now)
- [ ] Documentation is updated and accurate
- [ ] Performance meets or exceeds existing benchmarks
- [ ] WebGPU compatibility is maintained
- [ ] No breaking changes to existing APIs

---

## Resources

### Learning Materials

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
- [GPU Computing Fundamentals](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation)
- [Fluid Simulation Techniques](https://matthias-research.github.io/pages/tenMinutePhysics/)

### Development Tools

- [WebGPU Inspector](https://chrome.google.com/webstore/detail/webgpu-inspector/)
- [Spector.js](https://spector.babylonjs.com/) for GPU debugging
- [GPU Profiler](https://developer.chrome.com/docs/devtools/experimental-features/#webgpu)

### Community

- [WebGPU Matrix Chat](https://matrix.to/#/#WebGPU:matrix.org)
- [GPU Programming Discord](https://discord.gg/gpuprogramming)
- [Discussions on GitHub](https://github.com/your-repo/discussions)

---

Thank you for contributing to the WebGPU Ocean Simulation System! Your contributions help advance real-time physics simulation and GPU computing education.
