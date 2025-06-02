import { numParticlesMax, renderUniformsViews } from '../common';
import { ISimulator } from '../src/core/SimulatorRegistry';

export const boidsParticleStructSize = 64; // position(16) + velocity(16) + padding(32)

export class BoidsSimulator implements ISimulator {
    device: GPUDevice;
    renderDiameter: number;
    numParticles = 0;

    updatePipeline: GPUComputePipeline;
    copyPositionPipeline: GPUComputePipeline;

    updateBindGroup: GPUBindGroup;
    copyPositionBindGroup: GPUBindGroup;

    particleBuffer: GPUBuffer;
    boidsParamsBuffer: GPUBuffer;

    constructor(particleBuffer: GPUBuffer, posvelBuffer: GPUBuffer, renderDiameter: number, device: GPUDevice) {
        this.device = device;
        this.renderDiameter = renderDiameter;

        // WGSL compute shader for boids behavior
        const boidsUpdateModule = device.createShaderModule({
            code: `
                struct Particle {
                    position: vec3f,
                    velocity: vec3f,
                }

                struct BoidsParams {
                    separation_distance: f32,
                    alignment_distance: f32,
                    cohesion_distance: f32,
                    max_speed: f32,
                    separation_strength: f32,
                    alignment_strength: f32,
                    cohesion_strength: f32,
                    dt: f32,
                    box_size: vec3f,
                    n: u32,
                }

                @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
                @group(0) @binding(1) var<uniform> params: BoidsParams;

                @compute @workgroup_size(64)
                fn update_boids(@builtin(global_invocation_id) id: vec3<u32>) {
                    if (id.x >= params.n) { return; }

                    let self_pos = particles[id.x].position;
                    let self_vel = particles[id.x].velocity;

                    var separation = vec3f(0.0);
                    var alignment = vec3f(0.0);
                    var cohesion = vec3f(0.0);
                    var neighbor_count = 0u;

                    // Check all other particles
                    for (var i = 0u; i < params.n; i++) {
                        if (i == id.x) { continue; }

                        let other_pos = particles[i].position;
                        let other_vel = particles[i].velocity;
                        let distance = length(other_pos - self_pos);

                        // Separation
                        if (distance < params.separation_distance && distance > 0.0) {
                            separation += normalize(self_pos - other_pos) / distance;
                        }

                        // Alignment and Cohesion
                        if (distance < params.alignment_distance) {
                            alignment += other_vel;
                            cohesion += other_pos;
                            neighbor_count++;
                        }
                    }

                    // Average alignment and cohesion
                    if (neighbor_count > 0) {
                        alignment = alignment / f32(neighbor_count) - self_vel;
                        cohesion = (cohesion / f32(neighbor_count) - self_pos);
                    }

                    // Apply forces
                    var new_velocity = self_vel +
                        separation * params.separation_strength * params.dt +
                        alignment * params.alignment_strength * params.dt +
                        cohesion * params.cohesion_strength * params.dt;

                    // Limit speed
                    let speed = length(new_velocity);
                    if (speed > params.max_speed) {
                        new_velocity = normalize(new_velocity) * params.max_speed;
                    }

                    // Update position
                    var new_position = self_pos + new_velocity * params.dt;

                    // Boundary conditions (bounce off walls)
                    if (new_position.x < 2.0 || new_position.x > params.box_size.x - 2.0) {
                        new_velocity.x = -new_velocity.x;
                        new_position.x = clamp(new_position.x, 2.0, params.box_size.x - 2.0);
                    }
                    if (new_position.y < 2.0 || new_position.y > params.box_size.y - 2.0) {
                        new_velocity.y = -new_velocity.y;
                        new_position.y = clamp(new_position.y, 2.0, params.box_size.y - 2.0);
                    }
                    if (new_position.z < 2.0 || new_position.z > params.box_size.z - 2.0) {
                        new_velocity.z = -new_velocity.z;
                        new_position.z = clamp(new_position.z, 2.0, params.box_size.z - 2.0);
                    }

                    particles[id.x].position = new_position;
                    particles[id.x].velocity = new_velocity;
                }
            `
        });

        // Copy position shader (similar to existing simulators)
        const copyPositionModule = device.createShaderModule({
            code: `
                struct Particle {
                    position: vec3f,
                    velocity: vec3f,
                }

                struct PosVel {
                    position: vec3f,
                    velocity: vec3f,
                }

                @group(0) @binding(0) var<storage, read> particles: array<Particle>;
                @group(0) @binding(1) var<storage, read_write> posvel: array<PosVel>;

                @compute @workgroup_size(64)
                fn copy_position(@builtin(global_invocation_id) id: vec3<u32>) {
                    if (id.x < arrayLength(&particles)) {
                        posvel[id.x].position = particles[id.x].position;
                        posvel[id.x].velocity = particles[id.x].velocity;
                    }
                }
            `
        });

        this.updatePipeline = device.createComputePipeline({
            label: "boids update pipeline",
            layout: 'auto',
            compute: { module: boidsUpdateModule }
        });

        this.copyPositionPipeline = device.createComputePipeline({
            label: "boids copy position pipeline",
            layout: 'auto',
            compute: { module: copyPositionModule }
        });

        // Create parameters buffer
        const paramsData = new ArrayBuffer(64);
        this.boidsParamsBuffer = device.createBuffer({
            label: 'boids params buffer',
            size: paramsData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Set default parameters
        this.updateBoidsParams([50, 50, 50]); // Default box size

        this.updateBindGroup = device.createBindGroup({
            layout: this.updatePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: particleBuffer } },
                { binding: 1, resource: { buffer: this.boidsParamsBuffer } },
            ],
        });

        this.copyPositionBindGroup = device.createBindGroup({
            layout: this.copyPositionPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: particleBuffer } },
                { binding: 1, resource: { buffer: posvelBuffer } },
            ],
        });

        this.particleBuffer = particleBuffer;
    } updateBoidsParams(boxSize: number[]) {
        const paramsData = new ArrayBuffer(64);
        const paramsView = new Float32Array(paramsData);
        paramsView[0] = 4.0;   // separation_distance - slightly larger for better spacing
        paramsView[1] = 12.0;  // alignment_distance - larger for more cohesive flocks
        paramsView[2] = 12.0;  // cohesion_distance - same as alignment
        paramsView[3] = 20.0;  // max_speed - faster for more dynamic movement
        paramsView[4] = 3.0;   // separation_strength - stronger to avoid collisions
        paramsView[5] = 1.5;   // alignment_strength - stronger alignment
        paramsView[6] = 1.2;   // cohesion_strength - good cohesion
        paramsView[7] = 0.016; // dt (60 FPS)
        paramsView[8] = boxSize[0];  // box_size.x
        paramsView[9] = boxSize[1];  // box_size.y
        paramsView[10] = boxSize[2]; // box_size.z

        const nParticles = new Uint32Array(paramsData, 44, 1);
        nParticles[0] = this.numParticles;

        this.device.queue.writeBuffer(this.boidsParamsBuffer, 0, paramsData);
    }

    reset(numParticles: number, initBoxSize: number[]) {
        renderUniformsViews.sphere_size.set([this.renderDiameter]);

        const particleData = this.initializeBoids(initBoxSize, numParticles);
        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);
        this.updateBoidsParams(initBoxSize);

        console.log("Boids initialized with", this.numParticles, "agents");
    }

    execute(commandEncoder: GPUCommandEncoder) {
        const computePass = commandEncoder.beginComputePass();

        // Update boids behavior
        computePass.setBindGroup(0, this.updateBindGroup);
        computePass.setPipeline(this.updatePipeline);
        computePass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));

        // Copy positions for rendering
        computePass.setBindGroup(0, this.copyPositionBindGroup);
        computePass.setPipeline(this.copyPositionPipeline);
        computePass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));

        computePass.end();
    }

    initializeBoids(initBoxSize: number[], numParticles: number): ArrayBuffer {
        const particlesBuf = new ArrayBuffer(boidsParticleStructSize * numParticles);
        this.numParticles = Math.min(numParticles, numParticlesMax);

        for (let i = 0; i < this.numParticles; i++) {
            const offset = boidsParticleStructSize * i;

            // Position (random within box, avoiding edges)
            const position = new Float32Array(particlesBuf, offset, 3);
            position[0] = 5 + Math.random() * (initBoxSize[0] - 10);
            position[1] = 5 + Math.random() * (initBoxSize[1] - 10);
            position[2] = 5 + Math.random() * (initBoxSize[2] - 10);

            // Velocity (random direction, limited speed)
            const velocity = new Float32Array(particlesBuf, offset + 16, 3);
            const angle1 = Math.random() * Math.PI * 2;
            const angle2 = Math.random() * Math.PI;
            const speed = 5.0 + Math.random() * 5.0;
            velocity[0] = Math.sin(angle2) * Math.cos(angle1) * speed;
            velocity[1] = Math.sin(angle2) * Math.sin(angle1) * speed;
            velocity[2] = Math.cos(angle2) * speed;
        }

        return particlesBuf;
    }

    changeBoxSize(realBoxSize: number[]) {
        this.updateBoidsParams(realBoxSize);
    }
}
