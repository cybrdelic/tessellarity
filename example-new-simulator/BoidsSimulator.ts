// Example: Boids flocking simulation
import { numParticlesMax, renderUniformsViews } from '../common';

export const boidsParticleStructSize = 48; // position(12) + velocity(12) + padding(24)

export class BoidsSimulator {
    device: GPUDevice;
    renderDiameter: number;
    numParticles = 0;

    updatePipeline: GPUComputePipeline;
    updateBindGroup: GPUBindGroup;

    particleBuffer: GPUBuffer;
    boidsParamsBuffer: GPUBuffer;

    constructor(particleBuffer: GPUBuffer, posvelBuffer: GPUBuffer, renderDiameter: number, device: GPUDevice) {
        this.device = device;
        this.renderDiameter = renderDiameter;

        // WGSL compute shader for boids behavior
        const boidsShader = device.createShaderModule({
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
                @group(0) @binding(1) var<storage, read_write> posvel: array<vec4f>; // position + velocity
                @group(0) @binding(2) var<uniform> params: BoidsParams;

                @compute @workgroup_size(64)
                fn main(@builtin(global_invocation_id) id: vec3<u32>) {
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

                    // Boundary conditions (wrap around)
                    new_position = vec3f(
                        (new_position.x + params.box_size.x) % params.box_size.x,
                        (new_position.y + params.box_size.y) % params.box_size.y,
                        (new_position.z + params.box_size.z) % params.box_size.z
                    );

                    particles[id.x].position = new_position;
                    particles[id.x].velocity = new_velocity;

                    // Update posvel buffer for rendering
                    posvel[id.x * 2] = vec4f(new_position, 1.0);
                    posvel[id.x * 2 + 1] = vec4f(new_velocity, 0.0);
                }
            `
        });

        this.updatePipeline = device.createComputePipeline({
            label: "boids update pipeline",
            layout: 'auto',
            compute: { module: boidsShader }
        });

        // Create parameters buffer
        const paramsData = new ArrayBuffer(64);
        const paramsView = new Float32Array(paramsData);
        paramsView[0] = 2.0;  // separation_distance
        paramsView[1] = 5.0;  // alignment_distance
        paramsView[2] = 5.0;  // cohesion_distance
        paramsView[3] = 10.0; // max_speed
        paramsView[4] = 1.5;  // separation_strength
        paramsView[5] = 1.0;  // alignment_strength
        paramsView[6] = 1.0;  // cohesion_strength
        paramsView[7] = 0.016; // dt (60 FPS)

        this.boidsParamsBuffer = device.createBuffer({
            label: 'boids params buffer',
            size: paramsData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.boidsParamsBuffer, 0, paramsData);

        this.updateBindGroup = device.createBindGroup({
            layout: this.updatePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: particleBuffer } },
                { binding: 1, resource: { buffer: posvelBuffer } },
                { binding: 2, resource: { buffer: this.boidsParamsBuffer } },
            ],
        });

        this.particleBuffer = particleBuffer;
    }

    reset(numParticles: number, initBoxSize: number[]) {
        renderUniformsViews.sphere_size.set([this.renderDiameter]);

        const particleData = this.initializeBoids(initBoxSize, numParticles);
        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);

        // Update box size in parameters
        const boxSizeData = new Float32Array([initBoxSize[0], initBoxSize[1], initBoxSize[2], this.numParticles]);
        this.device.queue.writeBuffer(this.boidsParamsBuffer, 32, boxSizeData);

        console.log("Boids initialized with", this.numParticles, "agents");
    }

    execute(commandEncoder: GPUCommandEncoder) {
        const computePass = commandEncoder.beginComputePass();
        computePass.setBindGroup(0, this.updateBindGroup);
        computePass.setPipeline(this.updatePipeline);
        computePass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));
        computePass.end();
    }

    initializeBoids(initBoxSize: number[], numParticles: number): ArrayBuffer {
        const particlesBuf = new ArrayBuffer(boidsParticleStructSize * numParticles);
        this.numParticles = Math.min(numParticles, numParticlesMax);

        for (let i = 0; i < this.numParticles; i++) {
            const offset = boidsParticleStructSize * i;

            // Position (random within box)
            const position = new Float32Array(particlesBuf, offset, 3);
            position[0] = Math.random() * initBoxSize[0];
            position[1] = Math.random() * initBoxSize[1];
            position[2] = Math.random() * initBoxSize[2];

            // Velocity (random direction, limited speed)
            const velocity = new Float32Array(particlesBuf, offset + 16, 3);
            const angle1 = Math.random() * Math.PI * 2;
            const angle2 = Math.random() * Math.PI;
            const speed = 2.0 + Math.random() * 3.0;
            velocity[0] = Math.sin(angle2) * Math.cos(angle1) * speed;
            velocity[1] = Math.sin(angle2) * Math.sin(angle1) * speed;
            velocity[2] = Math.cos(angle2) * speed;
        }

        return particlesBuf;
    }

    changeBoxSize(realBoxSize: number[]) {
        const boxSizeData = new Float32Array([realBoxSize[0], realBoxSize[1], realBoxSize[2], this.numParticles]);
        this.device.queue.writeBuffer(this.boidsParamsBuffer, 32, boxSizeData);
    }
}
