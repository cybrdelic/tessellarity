# WebGPU Ocean Simulation System: Simulator Implementations Technical Reference

## Abstract

This technical reference provides comprehensive documentation for the four primary simulation algorithms implemented within the WebGPU Ocean system: Material Point Method with Moving Least Squares (MLS-MPM), Smoothed Particle Hydrodynamics (SPH), Boids flocking simulation, and interactive wave dynamics. Each implementation demonstrates sophisticated GPU compute techniques while maintaining the plugin architecture's extensibility requirements.

## Table of Contents

1. [MLS-MPM Fluid Simulation](#1-mls-mpm-fluid-simulation)
2. [Smoothed Particle Hydrodynamics (SPH)](#2-smoothed-particle-hydrodynamics-sph)
3. [Boids Flocking Simulation](#3-boids-flocking-simulation)
4. [Interactive Wave Simulation](#4-interactive-wave-simulation)
5. [Shared Rendering Infrastructure](#5-shared-rendering-infrastructure)
6. [Performance Analysis and Optimization](#6-performance-analysis-and-optimization)
7. [GPU Compute Pipeline Architecture](#7-gpu-compute-pipeline-architecture)

---

## 1. MLS-MPM Fluid Simulation

### 1.1 Theoretical Foundation

The Material Point Method with Moving Least Squares (MLS-MPM) represents a hybrid Eulerian-Lagrangian approach to fluid simulation, combining the advantages of particle methods with grid-based computations. This implementation follows the formulation presented in "A Moving Least Squares Material Point Method with Displacement Discontinuity and Two-Way Rigid Body Coupling" by Hu et al.

#### 1.1.1 Mathematical Framework

The MLS-MPM algorithm operates through a series of transformations between particle and grid representations:

1. **Particle-to-Grid Transfer**: Particle mass, momentum, and velocity are transferred to grid nodes
2. **Grid-based Force Computation**: Forces and velocity updates are computed on the Eulerian grid
3. **Grid-to-Particle Transfer**: Updated velocities and positions are transferred back to particles
4. **Particle Advection**: Particle positions are updated using the new velocities

#### 1.1.2 Implementation Architecture

```typescript
export class MLSMPM implements ISimulator {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;

    // GPU Compute Resources
    private clearGridPipeline: GPUComputePipeline;
    private p2gPipeline: GPUComputePipeline;
    private gridNormalizePipeline: GPUComputePipeline;
    private gridOpPipeline: GPUComputePipeline;
    private g2pPipeline: GPUComputePipeline;

    // GPU Buffer Management
    private particleDataBuffer: GPUBuffer;
    private gridDataBuffer: GPUBuffer;
    private uniformBuffer: GPUBuffer;

    // Bind Group Configuration
    private bindGroup: GPUBindGroup;

    public numParticles: number = 0;
}
```

### 1.2 GPU Pipeline Implementation

#### 1.2.1 Clear Grid Pipeline

The clear grid phase initializes the Eulerian grid for each simulation timestep:

```wgsl
// Compute shader for grid clearing
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let grid_pos = vec2<i32>(global_id.xy);
    if (grid_pos.x >= grid_res || grid_pos.y >= grid_res) {
        return;
    }

    let grid_index = grid_pos.y * grid_res + grid_pos.x;

    // Initialize grid cell with zero values
    grid_data[grid_index].mass = 0.0;
    grid_data[grid_index].velocity = vec2<f32>(0.0, 0.0);
    grid_data[grid_index].new_velocity = vec2<f32>(0.0, 0.0);
}
```

**Performance Analysis**: The 8x8 workgroup size optimizes GPU occupancy while maintaining cache coherence for grid-based operations.

#### 1.2.2 Particle-to-Grid Transfer (P2G)

The P2G phase transfers particle properties to the grid using quadratic B-spline interpolation:

```wgsl
// Quadratic B-spline weight function
fn quadratic_weight(x: f32) -> f32 {
    if (x < 0.5) {
        return 0.75 - x * x;
    } else if (x < 1.5) {
        let tmp = 1.5 - x;
        return 0.5 * tmp * tmp;
    } else {
        return 0.0;
    }
}

@compute @workgroup_size(64, 1, 1)
fn p2g_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let particle_id = global_id.x;
    if (particle_id >= arrayLength(&particle_data)) {
        return;
    }

    let particle = particle_data[particle_id];
    let grid_pos = particle.position * f32(grid_res);
    let grid_index = vec2<i32>(floor(grid_pos));

    // Compute affine momentum matrix
    let affine = particle.C;

    // Transfer to 3x3 grid neighborhood
    for (var i: i32 = 0; i < 3; i++) {
        for (var j: i32 = 0; j < 3; j++) {
            let offset = vec2<f32>(f32(i) - 1.0, f32(j) - 1.0);
            let grid_node = grid_index + vec2<i32>(i - 1, j - 1);

            if (grid_node.x >= 0 && grid_node.x < grid_res &&
                grid_node.y >= 0 && grid_node.y < grid_res) {

                let weight = quadratic_weight(offset.x) * quadratic_weight(offset.y);
                let node_index = grid_node.y * grid_res + grid_node.x;

                // Atomic operations for thread safety
                atomicAdd(&grid_data[node_index].mass, weight * particle.mass);

                let velocity_contribution = particle.velocity + affine * offset;
                atomicAdd(&grid_data[node_index].velocity.x,
                         weight * particle.mass * velocity_contribution.x);
                atomicAdd(&grid_data[node_index].velocity.y,
                         weight * particle.mass * velocity_contribution.y);
            }
        }
    }
}
```

**Technical Deep-dive**: The atomic operations ensure thread safety during concurrent particle contributions to grid nodes, critical for maintaining simulation accuracy with high particle counts.

#### 1.2.3 Grid Operations and Force Application

```wgsl
@compute @workgroup_size(8, 8, 1)
fn grid_op_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let grid_pos = vec2<i32>(global_id.xy);
    if (grid_pos.x >= grid_res || grid_pos.y >= grid_res) {
        return;
    }

    let grid_index = grid_pos.y * grid_res + grid_pos.x;
    var cell = grid_data[grid_index];

    if (cell.mass > 0.0) {
        // Normalize velocity by mass
        cell.velocity = cell.velocity / cell.mass;

        // Apply gravity
        cell.velocity.y += dt * gravity;

        // Boundary conditions
        let boundary_margin = 4.0;
        let boundary_scale = f32(grid_res) - boundary_margin;

        if (f32(grid_pos.x) < boundary_margin && cell.velocity.x < 0.0) {
            cell.velocity.x = 0.0;
        }
        if (f32(grid_pos.x) > boundary_scale && cell.velocity.x > 0.0) {
            cell.velocity.x = 0.0;
        }
        if (f32(grid_pos.y) < boundary_margin && cell.velocity.y < 0.0) {
            cell.velocity.y = 0.0;
        }
        if (f32(grid_pos.y) > boundary_scale && cell.velocity.y > 0.0) {
            cell.velocity.y = 0.0;
        }

        cell.new_velocity = cell.velocity;
    }

    grid_data[grid_index] = cell;
}
```

#### 1.2.4 Grid-to-Particle Transfer (G2P)

The G2P phase updates particle properties using grid information:

```wgsl
@compute @workgroup_size(64, 1, 1)
fn g2p_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let particle_id = global_id.x;
    if (particle_id >= arrayLength(&particle_data)) {
        return;
    }

    var particle = particle_data[particle_id];
    let grid_pos = particle.position * f32(grid_res);
    let grid_index = vec2<i32>(floor(grid_pos));

    var new_velocity = vec2<f32>(0.0, 0.0);
    var new_C = mat2x2<f32>(0.0, 0.0, 0.0, 0.0);

    // Sample from 3x3 grid neighborhood
    for (var i: i32 = 0; i < 3; i++) {
        for (var j: i32 = 0; j < 3; j++) {
            let offset = vec2<f32>(f32(i) - 1.0, f32(j) - 1.0);
            let grid_node = grid_index + vec2<i32>(i - 1, j - 1);

            if (grid_node.x >= 0 && grid_node.x < grid_res &&
                grid_node.y >= 0 && grid_node.y < grid_res) {

                let weight = quadratic_weight(offset.x) * quadratic_weight(offset.y);
                let node_index = grid_node.y * grid_res + grid_node.x;
                let grid_velocity = grid_data[node_index].new_velocity;

                new_velocity += weight * grid_velocity;

                // APIC (Affine Particle-in-Cell) update
                let weighted_velocity = weight * grid_velocity;
                new_C[0][0] += weighted_velocity.x * offset.x;
                new_C[0][1] += weighted_velocity.x * offset.y;
                new_C[1][0] += weighted_velocity.y * offset.x;
                new_C[1][1] += weighted_velocity.y * offset.y;
            }
        }
    }

    // Update particle state
    particle.velocity = new_velocity;
    particle.C = new_C * 4.0; // Scale factor for grid resolution
    particle.position += dt * new_velocity / f32(grid_res);

    particle_data[particle_id] = particle;
}
```

### 1.3 Performance Optimization Strategies

#### 1.3.1 Memory Access Patterns

The implementation optimizes GPU memory access through:

- **Coalesced Memory Access**: Particle data structured for efficient GPU access
- **Shared Memory Utilization**: Grid operations use local memory for frequently accessed data
- **Atomic Operation Minimization**: Reducing contention in P2G transfer phase

#### 1.3.2 Computational Efficiency

```typescript
// Adaptive grid resolution based on particle count
private calculateOptimalGridResolution(numParticles: number): number {
    const baseResolution = 64;
    const scaleFactor = Math.sqrt(numParticles / 10000);
    return Math.min(256, Math.max(baseResolution, Math.floor(baseResolution * scaleFactor)));
}
```

---

## 2. Smoothed Particle Hydrodynamics (SPH)

### 2.1 SPH Theoretical Framework

Smoothed Particle Hydrodynamics discretizes fluid into particles, each carrying physical properties (mass, velocity, density). The method evaluates fluid properties at any point by weighted summation over neighboring particles using smoothing kernels.

#### 2.1.1 Fundamental SPH Equations

The SPH method approximates field quantities using:

```
A(r) = Σ (m_j / ρ_j) * A_j * W(r - r_j, h)
```

Where:
- `A(r)` is the field quantity at position r
- `m_j`, `ρ_j`, `A_j` are mass, density, and field value of particle j
- `W(r - r_j, h)` is the smoothing kernel with support radius h

#### 2.1.2 Implementation Architecture

```typescript
export class SPH implements ISimulator {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;

    // SPH-specific parameters
    private readonly restDensity = 1000.0;
    private readonly gasConstant = 2000.0;
    private readonly viscosity = 250.0;
    private readonly surfaceTension = 0.0728;

    // GPU Compute Pipelines
    private densityPipeline: GPUComputePipeline;
    private forcePipeline: GPUComputePipeline;
    private integrationPipeline: GPUComputePipeline;

    // Spatial Acceleration Structure
    private spatialHashBuffer: GPUBuffer;
    private neighborListBuffer: GPUBuffer;

    public numParticles: number = 0;
}
```

### 2.2 SPH Computational Phases

#### 2.2.1 Spatial Hashing for Neighbor Finding

Efficient neighbor finding is critical for SPH performance. The implementation uses spatial hashing:

```wgsl
// Spatial hash function
fn spatial_hash(position: vec2<f32>) -> u32 {
    let grid_pos = vec2<u32>(floor(position / smoothing_radius));
    let p1 = 73856093u;
    let p2 = 19349663u;
    return (grid_pos.x * p1 + grid_pos.y * p2) % spatial_hash_size;
}

@compute @workgroup_size(64, 1, 1)
fn build_spatial_hash(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let particle_id = global_id.x;
    if (particle_id >= arrayLength(&particle_data)) {
        return;
    }

    let particle = particle_data[particle_id];
    let hash = spatial_hash(particle.position);

    // Store particle ID in hash table
    let hash_entry = SpatialHashEntry(particle_id, hash);
    spatial_hash[particle_id] = hash_entry;
}
```

#### 2.2.2 Density Computation

```wgsl
// Poly6 smoothing kernel
fn poly6_kernel(r_squared: f32, h: f32) -> f32 {
    if (r_squared >= h * h) {
        return 0.0;
    }
    let h_squared = h * h;
    let factor = 315.0 / (64.0 * PI * pow(h, 9.0));
    let diff = h_squared - r_squared;
    return factor * diff * diff * diff;
}

@compute @workgroup_size(64, 1, 1)
fn compute_density(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let particle_id = global_id.x;
    if (particle_id >= arrayLength(&particle_data)) {
        return;
    }

    var particle = particle_data[particle_id];
    var density = 0.0;

    // Find neighbors using spatial hash
    let neighbors = find_neighbors(particle.position, smoothing_radius);

    for (var i = 0u; i < neighbors.count; i++) {
        let neighbor_id = neighbors.indices[i];
        let neighbor = particle_data[neighbor_id];

        let distance_squared = dot(particle.position - neighbor.position,
                                  particle.position - neighbor.position);

        if (distance_squared < smoothing_radius * smoothing_radius) {
            density += particle_mass * poly6_kernel(distance_squared, smoothing_radius);
        }
    }

    particle.density = max(density, rest_density * 0.1); // Prevent division by zero
    particle_data[particle_id] = particle;
}
```

#### 2.2.3 Force Computation

SPH forces include pressure, viscosity, and surface tension components:

```wgsl
// Spiky kernel gradient for pressure forces
fn spiky_gradient(r_vec: vec2<f32>, h: f32) -> vec2<f32> {
    let r = length(r_vec);
    if (r >= h || r == 0.0) {
        return vec2<f32>(0.0, 0.0);
    }

    let factor = -45.0 / (PI * pow(h, 6.0));
    let gradient_magnitude = factor * (h - r) * (h - r);
    return gradient_magnitude * (r_vec / r);
}

// Viscosity kernel Laplacian
fn viscosity_laplacian(r: f32, h: f32) -> f32 {
    if (r >= h) {
        return 0.0;
    }
    let factor = 45.0 / (PI * pow(h, 6.0));
    return factor * (h - r);
}

@compute @workgroup_size(64, 1, 1)
fn compute_forces(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let particle_id = global_id.x;
    if (particle_id >= arrayLength(&particle_data)) {
        return;
    }

    var particle = particle_data[particle_id];
    var pressure_force = vec2<f32>(0.0, 0.0);
    var viscosity_force = vec2<f32>(0.0, 0.0);

    let neighbors = find_neighbors(particle.position, smoothing_radius);

    for (var i = 0u; i < neighbors.count; i++) {
        let neighbor_id = neighbors.indices[i];
        if (neighbor_id == particle_id) {
            continue;
        }

        let neighbor = particle_data[neighbor_id];
        let r_vec = particle.position - neighbor.position;
        let r = length(r_vec);

        if (r < smoothing_radius && r > 0.0) {
            // Pressure force
            let pressure_i = gas_constant * (particle.density - rest_density);
            let pressure_j = gas_constant * (neighbor.density - rest_density);
            let pressure_gradient = spiky_gradient(r_vec, smoothing_radius);

            pressure_force += -particle_mass * (pressure_i + pressure_j) /
                             (2.0 * neighbor.density) * pressure_gradient;

            // Viscosity force
            let velocity_diff = neighbor.velocity - particle.velocity;
            let viscosity_laplacian_val = viscosity_laplacian(r, smoothing_radius);

            viscosity_force += viscosity * particle_mass * velocity_diff /
                              neighbor.density * viscosity_laplacian_val;
        }
    }

    // Apply external forces (gravity)
    let external_force = vec2<f32>(0.0, -9.81 * particle.density);

    particle.force = pressure_force + viscosity_force + external_force;
    particle_data[particle_id] = particle;
}
```

#### 2.2.4 Integration and Boundary Handling

```wgsl
@compute @workgroup_size(64, 1, 1)
fn integrate(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let particle_id = global_id.x;
    if (particle_id >= arrayLength(&particle_data)) {
        return;
    }

    var particle = particle_data[particle_id];

    // Leapfrog integration
    let acceleration = particle.force / particle.density;
    particle.velocity += dt * acceleration;
    particle.position += dt * particle.velocity;

    // Boundary conditions with damping
    let damping = 0.5;
    let boundary_margin = 0.1;

    if (particle.position.x < boundary_margin) {
        particle.position.x = boundary_margin;
        particle.velocity.x *= -damping;
    }
    if (particle.position.x > box_size.x - boundary_margin) {
        particle.position.x = box_size.x - boundary_margin;
        particle.velocity.x *= -damping;
    }
    if (particle.position.y < boundary_margin) {
        particle.position.y = boundary_margin;
        particle.velocity.y *= -damping;
    }
    if (particle.position.y > box_size.y - boundary_margin) {
        particle.position.y = box_size.y - boundary_margin;
        particle.velocity.y *= -damping;
    }

    particle_data[particle_id] = particle;
}
```

---

## 3. Boids Flocking Simulation

### 3.1 Boids Algorithm Foundation

The Boids algorithm, developed by Craig Reynolds, simulates flocking behavior through three fundamental steering behaviors: separation, alignment, and cohesion. Each boid adjusts its movement based on the behavior of nearby boids within its perception radius.

#### 3.1.1 Implementation Architecture

```typescript
export class Boids implements ISimulator {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;

    // Boids-specific parameters
    private readonly maxSpeed = 2.0;
    private readonly maxForce = 0.03;
    private readonly separationRadius = 25.0;
    private readonly alignmentRadius = 50.0;
    private readonly cohesionRadius = 50.0;

    // GPU Compute Pipeline
    private boidsComputePipeline: GPUComputePipeline;

    public numParticles: number = 0;
}
```

### 3.2 Flocking Behavior Implementation

#### 3.2.1 Separation Behavior

```wgsl
fn separation(boid_id: u32, position: vec2<f32>) -> vec2<f32> {
    var steer = vec2<f32>(0.0, 0.0);
    var count = 0u;

    for (var i = 0u; i < arrayLength(&boid_data); i++) {
        if (i == boid_id) {
            continue;
        }

        let other_boid = boid_data[i];
        let distance = length(position - other_boid.position);

        if (distance > 0.0 && distance < separation_radius) {
            // Calculate vector pointing away from neighbor
            var diff = position - other_boid.position;
            diff = normalize(diff) / distance; // Weight by distance
            steer += diff;
            count++;
        }
    }

    if (count > 0u) {
        steer = steer / f32(count);
        steer = normalize(steer) * max_speed;
        steer = steer - boid_data[boid_id].velocity;
        steer = limit_force(steer, max_force);
    }

    return steer;
}
```

#### 3.2.2 Alignment Behavior

```wgsl
fn alignment(boid_id: u32, position: vec2<f32>) -> vec2<f32> {
    var sum_velocity = vec2<f32>(0.0, 0.0);
    var count = 0u;

    for (var i = 0u; i < arrayLength(&boid_data); i++) {
        if (i == boid_id) {
            continue;
        }

        let other_boid = boid_data[i];
        let distance = length(position - other_boid.position);

        if (distance > 0.0 && distance < alignment_radius) {
            sum_velocity += other_boid.velocity;
            count++;
        }
    }

    if (count > 0u) {
        sum_velocity = sum_velocity / f32(count);
        sum_velocity = normalize(sum_velocity) * max_speed;
        let steer = sum_velocity - boid_data[boid_id].velocity;
        return limit_force(steer, max_force);
    }

    return vec2<f32>(0.0, 0.0);
}
```

#### 3.2.3 Cohesion Behavior

```wgsl
fn cohesion(boid_id: u32, position: vec2<f32>) -> vec2<f32> {
    var sum_position = vec2<f32>(0.0, 0.0);
    var count = 0u;

    for (var i = 0u; i < arrayLength(&boid_data); i++) {
        if (i == boid_id) {
            continue;
        }

        let other_boid = boid_data[i];
        let distance = length(position - other_boid.position);

        if (distance > 0.0 && distance < cohesion_radius) {
            sum_position += other_boid.position;
            count++;
        }
    }

    if (count > 0u) {
        sum_position = sum_position / f32(count);
        return seek(boid_id, sum_position);
    }

    return vec2<f32>(0.0, 0.0);
}

fn seek(boid_id: u32, target: vec2<f32>) -> vec2<f32> {
    let desired = normalize(target - boid_data[boid_id].position) * max_speed;
    let steer = desired - boid_data[boid_id].velocity;
    return limit_force(steer, max_force);
}
```

#### 3.2.4 Main Boids Compute Kernel

```wgsl
@compute @workgroup_size(64, 1, 1)
fn boids_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let boid_id = global_id.x;
    if (boid_id >= arrayLength(&boid_data)) {
        return;
    }

    var boid = boid_data[boid_id];

    // Calculate steering forces
    let sep = separation(boid_id, boid.position) * separation_weight;
    let ali = alignment(boid_id, boid.position) * alignment_weight;
    let coh = cohesion(boid_id, boid.position) * cohesion_weight;

    // Mouse interaction force
    let mouse_force = mouse_interaction(boid.position);

    // Combine all forces
    let total_force = sep + ali + coh + mouse_force;

    // Update velocity and position
    boid.velocity += total_force;
    boid.velocity = limit_velocity(boid.velocity, max_speed);
    boid.position += boid.velocity * dt;

    // Wrap around boundaries
    if (boid.position.x < 0.0) {
        boid.position.x = box_size.x;
    } else if (boid.position.x > box_size.x) {
        boid.position.x = 0.0;
    }

    if (boid.position.y < 0.0) {
        boid.position.y = box_size.y;
    } else if (boid.position.y > box_size.y) {
        boid.position.y = 0.0;
    }

    boid_data[boid_id] = boid;
}
```

### 3.3 Mouse Interaction Integration

```wgsl
fn mouse_interaction(position: vec2<f32>) -> vec2<f32> {
    if (!mouse_active) {
        return vec2<f32>(0.0, 0.0);
    }

    let mouse_world_pos = screen_to_world(mouse_position);
    let distance = length(position - mouse_world_pos);

    if (distance < mouse_influence_radius) {
        // Repulsion force that decreases with distance
        let direction = normalize(position - mouse_world_pos);
        let force_magnitude = mouse_force_strength * (1.0 - distance / mouse_influence_radius);
        return direction * force_magnitude;
    }

    return vec2<f32>(0.0, 0.0);
}
```

---

## 4. Interactive Wave Simulation

### 4.1 Wave Equation Foundation

The wave simulation implements the 2D wave equation using finite difference methods on a regular grid. The system supports interactive wave generation through mouse/cursor input.

#### 4.1.1 Mathematical Framework

The 2D wave equation:
```
∂²u/∂t² = c²(∂²u/∂x² + ∂²u/∂y²)
```

Discretized using finite differences:
```
u(i,j,t+1) = 2u(i,j,t) - u(i,j,t-1) + c²Δt²/Δx²(u(i±1,j,t) + u(i,j±1,t) - 4u(i,j,t))
```

#### 4.1.2 Implementation Architecture

```typescript
export class Waves implements ISimulator {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;

    // Wave simulation parameters
    private readonly waveSpeed = 0.5;
    private readonly damping = 0.995;
    private readonly gridResolution = 256;

    // Double-buffered wave height fields
    private currentWaveBuffer: GPUBuffer;
    private previousWaveBuffer: GPUBuffer;
    private nextWaveBuffer: GPUBuffer;

    // GPU Compute Pipeline
    private waveComputePipeline: GPUComputePipeline;

    public numParticles: number = 0; // Grid points
}
```

### 4.2 Wave Propagation Implementation

#### 4.2.1 Wave Update Kernel

```wgsl
@compute @workgroup_size(16, 16, 1)
fn wave_update(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let grid_pos = vec2<i32>(global_id.xy);
    if (grid_pos.x >= grid_resolution || grid_pos.y >= grid_resolution ||
        grid_pos.x < 1 || grid_pos.y < 1 ||
        grid_pos.x >= grid_resolution - 1 || grid_pos.y >= grid_resolution - 1) {
        return;
    }

    let index = grid_pos.y * grid_resolution + grid_pos.x;

    // Current and previous wave heights
    let current = current_wave[index];
    let previous = previous_wave[index];

    // Laplacian operator (5-point stencil)
    let left = current_wave[index - 1];
    let right = current_wave[index + 1];
    let up = current_wave[index - grid_resolution];
    let down = current_wave[index + grid_resolution];

    let laplacian = left + right + up + down - 4.0 * current;

    // Wave equation update
    let wave_speed_squared = wave_speed * wave_speed;
    let dt_squared = dt * dt;
    let dx_squared = (1.0 / f32(grid_resolution)) * (1.0 / f32(grid_resolution));

    let next_height = 2.0 * current - previous +
                     (wave_speed_squared * dt_squared / dx_squared) * laplacian;

    // Apply damping
    next_wave[index] = next_height * damping;
}
```

#### 4.2.2 Interactive Wave Generation

```wgsl
@compute @workgroup_size(16, 16, 1)
fn apply_interaction(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let grid_pos = vec2<i32>(global_id.xy);
    if (grid_pos.x >= grid_resolution || grid_pos.y >= grid_resolution) {
        return;
    }

    let index = grid_pos.y * grid_resolution + grid_pos.x;

    if (interaction_active) {
        let world_pos = vec2<f32>(f32(grid_pos.x) / f32(grid_resolution),
                                 f32(grid_pos.y) / f32(grid_resolution));
        let interaction_pos = interaction_position;

        let distance = length(world_pos - interaction_pos);
        let interaction_radius = 0.05; // 5% of domain

        if (distance < interaction_radius) {
            // Gaussian-shaped interaction force
            let force_magnitude = interaction_strength *
                                 exp(-distance * distance / (2.0 * interaction_radius * interaction_radius * 0.1));

            current_wave[index] += force_magnitude * dt;
        }
    }
}
```

### 4.3 Buffer Management and Synchronization

```typescript
private updateWaveField(commandEncoder: GPUCommandEncoder): void {
    // Dispatch wave update compute pass
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.waveComputePipeline);
    computePass.setBindGroup(0, this.waveBindGroup);

    const workgroupsX = Math.ceil(this.gridResolution / 16);
    const workgroupsY = Math.ceil(this.gridResolution / 16);

    computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
    computePass.end();

    // Rotate buffers for next frame
    [this.previousWaveBuffer, this.currentWaveBuffer, this.nextWaveBuffer] =
    [this.currentWaveBuffer, this.nextWaveBuffer, this.previousWaveBuffer];
}
```

---

## 5. Shared Rendering Infrastructure

### 5.1 FluidRenderer Architecture

The shared rendering system provides consistent visualization across all simulation types while supporting specialized rendering modes for each algorithm.

#### 5.1.1 Rendering Pipeline Structure

```typescript
export class FluidRenderer {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;

    // Rendering pipelines
    private particleRenderPipeline: GPURenderPipeline;
    private screenSpaceRenderPipeline: GPURenderPipeline;

    // Render passes and configurations
    private readonly multiSampleCount = 4;
    private colorTexture: GPUTexture;
    private depthTexture: GPUTexture;

    // Uniform buffer for rendering parameters
    private renderUniformBuffer: GPUBuffer;
}
```

#### 5.1.2 Particle Rendering Vertex Shader

```wgsl
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) velocity: vec2<f32>,
    @builtin(instance_index) instance_index: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_position: vec2<f32>,
    @location(1) velocity: vec2<f32>,
    @location(2) particle_size: f32,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Transform particle position to clip space
    let world_pos = vec4<f32>(input.position, 0.0, 1.0);
    let view_pos = view_matrix * world_pos;
    let clip_pos = projection_matrix * view_pos;

    output.position = clip_pos;
    output.world_position = input.position;
    output.velocity = input.velocity;

    // Adaptive particle sizing based on velocity
    let speed = length(input.velocity);
    output.particle_size = mix(base_particle_size, max_particle_size,
                              min(speed / max_velocity, 1.0));

    return output;
}
```

#### 5.1.3 Particle Rendering Fragment Shader

```wgsl
@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Calculate distance from particle center
    let center_offset = input.world_position - particle_center;
    let distance = length(center_offset);

    // Smooth circular particles using distance field
    let radius = input.particle_size * 0.5;
    let alpha = 1.0 - smoothstep(radius * 0.8, radius, distance);

    if (alpha < 0.01) {
        discard;
    }

    // Velocity-based coloring
    let speed = length(input.velocity);
    let normalized_speed = min(speed / max_velocity, 1.0);

    // Color ramp: blue (slow) -> cyan -> yellow -> red (fast)
    var color: vec3<f32>;
    if (normalized_speed < 0.33) {
        color = mix(vec3<f32>(0.0, 0.2, 1.0), vec3<f32>(0.0, 1.0, 1.0),
                   normalized_speed * 3.0);
    } else if (normalized_speed < 0.66) {
        color = mix(vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(1.0, 1.0, 0.0),
                   (normalized_speed - 0.33) * 3.0);
    } else {
        color = mix(vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0),
                   (normalized_speed - 0.66) * 3.0);
    }

    return vec4<f32>(color, alpha);
}
```

---

## 6. Performance Analysis and Optimization

### 6.1 Computational Complexity Analysis

| Simulation Type | Time Complexity | Space Complexity | GPU Utilization |
|----------------|-----------------|------------------|-----------------|
| MLS-MPM        | O(n + g²)       | O(n + g²)        | High            |
| SPH            | O(n²) naive     | O(n)             | Medium          |
| SPH (optimized)| O(n log n)      | O(n + h)         | High            |
| Boids          | O(n²)           | O(n)             | Medium          |
| Waves          | O(g²)           | O(3g²)           | High            |

Where: n = particle count, g = grid resolution, h = spatial hash table size

### 6.2 Memory Access Optimization

#### 6.2.1 Buffer Layout Optimization

```typescript
// Structure of Arrays (SoA) layout for better GPU access patterns
interface ParticleDataSoA {
    positions: Float32Array;    // [x0, y0, x1, y1, ...]
    velocities: Float32Array;   // [vx0, vy0, vx1, vy1, ...]
    densities: Float32Array;    // [ρ0, ρ1, ρ2, ...]
    forces: Float32Array;       // [fx0, fy0, fx1, fy1, ...]
}
```

**Rationale**: SoA layout improves memory coalescing and enables vectorized operations on GPU compute units.

#### 6.2.2 Adaptive Work Group Sizing

```typescript
private calculateOptimalWorkGroupSize(numParticles: number): number {
    const maxWorkGroupSize = this.device.limits.maxComputeWorkgroupSizeX;
    const targetOccupancy = 0.75; // 75% GPU occupancy target

    // Find largest power-of-2 divisor that maintains good occupancy
    for (let size = maxWorkGroupSize; size >= 32; size /= 2) {
        if (numParticles % size === 0 || numParticles / size >= targetOccupancy * 100) {
            return size;
        }
    }

    return 64; // Default fallback
}
```

### 6.3 Performance Monitoring Integration

```typescript
export class PerformanceProfiler {
    private gpuTimestamps: Map<string, number> = new Map();
    private cpuTimings: Map<string, number> = new Map();

    async profileGPUOperation(name: string, commandEncoder: GPUCommandEncoder): Promise<void> {
        if (this.device.features.has('timestamp-query')) {
            const querySet = this.device.createQuerySet({
                type: 'timestamp',
                count: 2,
            });

            commandEncoder.writeTimestamp(querySet, 0);
            // ... GPU operations ...
            commandEncoder.writeTimestamp(querySet, 1);

            // Read back timing results
            const timingResults = await this.readTimestampQuery(querySet);
            this.gpuTimestamps.set(name, timingResults[1] - timingResults[0]);
        }
    }
}
```

---

## 7. GPU Compute Pipeline Architecture

### 7.1 Pipeline State Management

```typescript
export class ComputePipelineManager {
    private pipelineCache: Map<string, GPUComputePipeline> = new Map();

    createPipeline(
        key: string,
        shaderCode: string,
        entryPoint: string,
        bindGroupLayout: GPUBindGroupLayout
    ): GPUComputePipeline {
        if (this.pipelineCache.has(key)) {
            return this.pipelineCache.get(key)!;
        }

        const shaderModule = this.device.createShaderModule({
            code: shaderCode,
            label: `${key}-compute-shader`
        });

        const pipeline = this.device.createComputePipeline({
            label: `${key}-compute-pipeline`,
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            compute: {
                module: shaderModule,
                entryPoint: entryPoint,
            }
        });

        this.pipelineCache.set(key, pipeline);
        return pipeline;
    }
}
```

### 7.2 Resource Binding Optimization

```typescript
export class BindGroupManager {
    private bindGroupCache: Map<string, GPUBindGroup> = new Map();

    createBindGroup(
        key: string,
        layout: GPUBindGroupLayout,
        resources: GPUBindingResource[]
    ): GPUBindGroup {
        const cacheKey = `${key}-${this.hashResources(resources)}`;

        if (this.bindGroupCache.has(cacheKey)) {
            return this.bindGroupCache.get(cacheKey)!;
        }

        const entries: GPUBindGroupEntry[] = resources.map((resource, index) => ({
            binding: index,
            resource: resource
        }));

        const bindGroup = this.device.createBindGroup({
            label: `${key}-bind-group`,
            layout: layout,
            entries: entries
        });

        this.bindGroupCache.set(cacheKey, bindGroup);
        return bindGroup;
    }
}
```

---

## Conclusion

The WebGPU Ocean Simulation System demonstrates sophisticated implementation of multiple fluid dynamics and particle simulation algorithms, each optimized for GPU execution while maintaining the flexibility of the plugin architecture. The comprehensive error handling, performance monitoring, and shared infrastructure enable rapid development and deployment of new simulation techniques.

The technical implementations showcase advanced GPU computing concepts including spatial acceleration structures, memory coalescing optimization, and multi-pass rendering techniques. The modular design facilitates continued expansion with additional simulation algorithms and rendering approaches.

This technical reference serves as the definitive implementation guide for understanding and extending the WebGPU Ocean Simulation System's computational capabilities.

---

## Technical Appendices

### Appendix A: Shader Code Listings
[Complete WGSL shader implementations for each simulation type]

### Appendix B: Performance Benchmarks
[Detailed performance analysis across different hardware configurations]

### Appendix C: Memory Layout Specifications
[GPU buffer structure definitions and alignment requirements]

### Appendix D: Algorithm Parameter Tuning Guidelines
[Recommended parameter ranges and stability analysis for each simulation method]
