# WebGPU Ocean Simulation System: API Reference

## Table of Contents

1. [Core Interfaces](#core-interfaces)
2. [Simulator Classes](#simulator-classes)
3. [Configuration System](#configuration-system)
4. [Rendering System](#rendering-system)
5. [Error Handling](#error-handling)
6. [Utility Functions](#utility-functions)

---

## Core Interfaces

### ISimulator

The base interface that all simulation implementations must follow.

```typescript
interface ISimulator {
    numParticles: number;

    /**
     * Initialize or reset the simulation with new parameters
     * @param numParticles - Number of particles/agents to simulate
     * @param boxSize - [width, height, depth] of simulation domain
     */
    reset(numParticles: number, boxSize: number[]): void;

    /**
     * Execute one simulation step
     * @param commandEncoder - WebGPU command encoder for compute passes
     */
    execute(commandEncoder: GPUCommandEncoder): void;

    /**
     * Update simulation boundary size
     * @param boxSize - New [width, height, depth] dimensions
     */
    changeBoxSize(boxSize: number[]): void;
}
```

### SimulatorConfig

Configuration interface for simulation parameters and UI settings.

```typescript
interface SimulatorConfig {
    mode: SimulationMode;
    displayName: string;
    particleCounts: number[];
    particleLabels: string[];
    boxSizes: number[][];
    cameraDistances: number[];
    renderSettings: {
        radius: number;
        fov: number;
        zoomRate: number;
    };
    uiSettings: {
        showWaterControls: boolean;
        sliderLabel: string;
        particleCountLabel: string;
    };
    particleStructSize: number;
}
```

---

## Simulator Classes

### MLSMPMSimulator

Material Point Method implementation for fluid simulation.

```typescript
class MLSMPMSimulator implements ISimulator {
    constructor(
        particleBuffer: GPUBuffer,
        posvelBuffer: GPUBuffer,
        particleRadius: number,
        device: GPUDevice
    );

    // Inherited from ISimulator
    reset(numParticles: number, boxSize: number[]): void;
    execute(commandEncoder: GPUCommandEncoder): void;
    changeBoxSize(boxSize: number[]): void;

    // MLS-MPM specific methods
    private clearGrid(commandEncoder: GPUCommandEncoder): void;
    private particleToGrid(commandEncoder: GPUCommandEncoder): void;
    private updateGrid(commandEncoder: GPUCommandEncoder): void;
    private gridToParticle(commandEncoder: GPUCommandEncoder): void;
}
```

### SPHSimulator

Smoothed Particle Hydrodynamics implementation.

```typescript
class SPHSimulator implements ISimulator {
    constructor(
        particleBuffer: GPUBuffer,
        posvelBuffer: GPUBuffer,
        particleRadius: number,
        device: GPUDevice
    );

    // Inherited from ISimulator
    reset(numParticles: number, boxSize: number[]): void;
    execute(commandEncoder: GPUCommandEncoder): void;
    changeBoxSize(boxSize: number[]): void;

    // SPH specific methods
    private buildSpatialGrid(commandEncoder: GPUCommandEncoder): void;
    private computeDensity(commandEncoder: GPUCommandEncoder): void;
    private computeForces(commandEncoder: GPUCommandEncoder): void;
    private integrate(commandEncoder: GPUCommandEncoder): void;
}
```

### BoidsSimulator

Flocking behavior simulation using Craig Reynolds' boids algorithm.

```typescript
class BoidsSimulator implements ISimulator {
    constructor(
        particleBuffer: GPUBuffer,
        posvelBuffer: GPUBuffer,
        particleRadius: number,
        device: GPUDevice
    );

    // Inherited from ISimulator
    reset(numParticles: number, boxSize: number[]): void;
    execute(commandEncoder: GPUCommandEncoder): void;
    changeBoxSize(boxSize: number[]): void;

    // Boids specific methods
    private updateMouseInteraction(mousePos: [number, number], active: boolean): void;
}
```

---

## Configuration System

### ConfigManager

Utility class for managing simulator configurations.

```typescript
class ConfigManager {
    /**
     * Get configuration for a specific simulation mode
     * @param mode - The simulation mode
     * @returns Configuration object for the mode
     * @throws Error if mode is not found
     */
    static getConfig(mode: SimulationMode): SimulatorConfig;

    /**
     * Get the maximum particle structure size across all simulators
     * @returns Maximum size in bytes
     */
    static getMaxParticleStructSize(): number;

    /**
     * Get all available configurations
     * @returns Array of all simulator configurations
     */
    static getAllConfigs(): SimulatorConfig[];
}
```

### SimulationMode

Enumeration of available simulation types.

```typescript
enum SimulationMode {
    MLSMPM = "mlsmpm",
    SPH = "sph",
    BOIDS = "boids",
    WAVE = "wave"
}
```

---

## Rendering System

### FluidRenderer

Main rendering class for particle-based visualizations.

```typescript
class FluidRenderer {
    constructor(
        device: GPUDevice,
        canvas: HTMLCanvasElement,
        format: GPUTextureFormat,
        particleRadius: number,
        fov: number,
        posvelBuffer: GPUBuffer,
        renderUniformBuffer: GPUBuffer,
        cubemapTextureView: GPUTextureView | null,
        waterAppearanceBuffer: GPUBuffer
    );

    /**
     * Execute rendering pipeline
     * @param context - Canvas rendering context
     * @param commandEncoder - WebGPU command encoder
     * @param numParticles - Number of particles to render
     * @param sphereMode - Whether to render as spheres or fluid surface
     */
    execute(
        context: GPUCanvasContext,
        commandEncoder: GPUCommandEncoder,
        numParticles: number,
        sphereMode: boolean
    ): void;

    /**
     * Update environment cubemap
     * @param cubemapView - New cubemap texture view (null for no environment)
     */
    updateEnvironment(cubemapView: GPUTextureView | null): void;

    /**
     * Clean up GPU resources
     */
    destroy(): void;
}
```

---

## Error Handling

### ShaderErrorReporter

System for capturing and reporting WebGPU shader compilation errors.

```typescript
class ShaderErrorReporter {
    /**
     * Report a shader compilation error
     * @param error - The WebGPU error
     * @param context - Additional context about where the error occurred
     */
    reportError(error: Error, context?: string): void;

    /**
     * Check if shader error reporting is enabled
     */
    isEnabled(): boolean;

    /**
     * Enable or disable error reporting
     */
    setEnabled(enabled: boolean): void;
}
```

### ErrorStreamingService

Service for streaming errors to external debugging tools.

```typescript
class ErrorStreamingService {
    constructor(port?: number);

    /**
     * Start the error streaming server
     */
    start(): void;

    /**
     * Stop the error streaming server
     */
    stop(): void;

    /**
     * Send an error to connected clients
     */
    sendError(error: any): void;
}
```

---

## Utility Functions

### Buffer Management

```typescript
/**
 * Create a GPU buffer with proper alignment
 * @param device - WebGPU device
 * @param size - Buffer size in bytes
 * @param usage - Buffer usage flags
 * @param label - Debug label for the buffer
 */
function createAlignedBuffer(
    device: GPUDevice,
    size: number,
    usage: GPUBufferUsageFlags,
    label?: string
): GPUBuffer;

/**
 * Copy data to a GPU buffer
 * @param device - WebGPU device
 * @param buffer - Target buffer
 * @param data - Source data (ArrayBuffer or typed array)
 * @param offset - Offset in bytes (default: 0)
 */
function writeToBuffer(
    device: GPUDevice,
    buffer: GPUBuffer,
    data: ArrayBuffer | ArrayBufferView,
    offset?: number
): void;
```

### Shader Utilities

```typescript
/**
 * Load and compile a compute shader
 * @param device - WebGPU device
 * @param source - WGSL shader source code
 * @param label - Debug label for the shader module
 * @returns Compiled shader module
 */
function createComputeShader(
    device: GPUDevice,
    source: string,
    label?: string
): GPUShaderModule;

/**
 * Create a compute pipeline with automatic layout
 * @param device - WebGPU device
 * @param shader - Compiled shader module
 * @param entryPoint - Entry point function name (default: "main")
 * @param label - Debug label for the pipeline
 */
function createComputePipeline(
    device: GPUDevice,
    shader: GPUShaderModule,
    entryPoint?: string,
    label?: string
): GPUComputePipeline;
```

### Performance Utilities

```typescript
/**
 * Measure GPU execution time for a compute pass
 * @param device - WebGPU device
 * @param commandEncoder - Command encoder
 * @param callback - Function to execute and measure
 * @returns Promise resolving to execution time in nanoseconds
 */
async function measureGPUTime(
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    callback: () => void
): Promise<number>;

/**
 * Calculate optimal workgroup size for given problem size
 * @param problemSize - Total number of work items
 * @param maxWorkgroupSize - Maximum workgroup size supported
 * @returns Optimal workgroup size
 */
function calculateWorkgroupSize(
    problemSize: number,
    maxWorkgroupSize: number
): number;
```

---

## Constants and Limits

### Default Values

```typescript
const DEFAULT_PARTICLE_COUNT = 70000;
const DEFAULT_BOX_SIZE = [40, 30, 60];
const DEFAULT_CAMERA_DISTANCE = 70;
const DEFAULT_FOV = 75;
const DEFAULT_ZOOM_RATE = 1.0;

const MAX_PARTICLES = 500000;
const MIN_PARTICLES = 1000;
const MAX_BOX_DIMENSION = 200;
const MIN_BOX_DIMENSION = 10;
```

### WebGPU Limits

```typescript
const REQUIRED_LIMITS = {
    maxStorageTexturesPerShaderStage: 8,
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupSizeY: 256,
    maxComputeWorkgroupSizeZ: 64,
    maxComputeInvocationsPerWorkgroup: 256
};
```

---

## Usage Examples

### Basic Simulator Setup

```typescript
// Initialize WebGPU device
const device = await adapter.requestDevice({
    requiredLimits: REQUIRED_LIMITS
});

// Create buffers
const particleBuffer = createAlignedBuffer(
    device,
    MAX_PARTICLES * 64, // 64 bytes per particle
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    'particle-buffer'
);

// Create simulator
const simulator = new MLSMPMSimulator(
    particleBuffer,
    posvelBuffer,
    0.1, // particle radius
    device
);

// Reset with initial parameters
simulator.reset(70000, [40, 30, 60]);
```

### Custom Configuration

```typescript
const customConfig: SimulatorConfig = {
    mode: SimulationMode.CUSTOM,
    displayName: "Custom Simulator",
    particleCounts: [1000, 5000, 10000, 25000],
    particleLabels: [
        "Small (1K)",
        "Medium (5K)",
        "Large (10K)",
        "Huge (25K)"
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
    particleStructSize: 32
};
```

### Error Handling

```typescript
try {
    const pipeline = createComputePipeline(device, shader);
} catch (error) {
    shaderErrorReporter.reportError(error, 'Pipeline creation failed');
    // Fallback to default behavior
    console.warn('Using fallback pipeline');
}
```

---

This API reference provides a comprehensive overview of all public interfaces, classes, and functions in the WebGPU Ocean Simulation System. For implementation details and architectural decisions, refer to the Core Architecture Whitepaper and Simulator Implementations Reference.
