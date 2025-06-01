struct Particle {
    position: vec3f,
    v: vec3f,
    force: vec3f,
    density: f32,
    nearDensity: f32,
}

struct RealBoxSize {
    xHalf: f32,
    yHalf: f32,
    zHalf: f32,
}

struct SPHParams {
    mass: f32,
    kernelRadius: f32,
    kernelRadiusPow2: f32,
    kernelRadiusPow5: f32,
    kernelRadiusPow6: f32,
    kernelRadiusPow9: f32,
    dt: f32,
    stiffness: f32,
    nearStiffness: f32,
    restDensity: f32,
    viscosity: f32,
    surfaceTension: f32,
    vorticityConfinement: f32,
    xsphViscosity: f32,
    boundaryStiffness: f32,
    boundaryDamping: f32,
    n: u32
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> realBoxSize: RealBoxSize;
@group(0) @binding(2) var<uniform> params: SPHParams;

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) id: vec3<u32>) {
    if id.x < params.n {
    // avoid zero division
        if particles[id.x].density != 0. {
            var a = particles[id.x].force / particles[id.x].density;

      // Adaptive time step based on forces and velocities
            let maxAcceleration = length(a);
            let maxVelocity = length(particles[id.x].v);
            let cfl_condition = 0.1; // Courant-Friedrichs-Lewy condition
            let adaptiveDt = min(params.dt, cfl_condition / max(maxAcceleration, maxVelocity + 1e-6));

            let xPlusDist = realBoxSize.xHalf - particles[id.x].position.x;
            let xMinusDist = realBoxSize.xHalf + particles[id.x].position.x;
            let yPlusDist = realBoxSize.yHalf - particles[id.x].position.y;
            let yMinusDist = realBoxSize.yHalf + particles[id.x].position.y;
            let zPlusDist = realBoxSize.zHalf - particles[id.x].position.z;
            let zMinusDist = realBoxSize.zHalf + particles[id.x].position.z;

            let wallStiffness = params.boundaryStiffness;
            let wallDamping = params.boundaryDamping;

      // Improved boundary forces with velocity damping
            var boundaryForce = vec3f(0.0, 0.0, 0.0);

      // X boundaries
            if xPlusDist < 0.0 {
                let penetration = -xPlusDist;
                let velocityComponent = particles[id.x].v.x;
                boundaryForce.x += wallStiffness * penetration - wallDamping * velocityComponent;
            }
            if xMinusDist < 0.0 {
                let penetration = -xMinusDist;
                let velocityComponent = -particles[id.x].v.x;
                boundaryForce.x -= wallStiffness * penetration - wallDamping * velocityComponent;
            }

      // Y boundaries
            if yPlusDist < 0.0 {
                let penetration = -yPlusDist;
                let velocityComponent = particles[id.x].v.y;
                boundaryForce.y += wallStiffness * penetration - wallDamping * velocityComponent;
            }
            if yMinusDist < 0.0 {
                let penetration = -yMinusDist;
                let velocityComponent = -particles[id.x].v.y;
                boundaryForce.y -= wallStiffness * penetration - wallDamping * velocityComponent;
            }

      // Z boundaries
            if zPlusDist < 0.0 {
                let penetration = -zPlusDist;
                let velocityComponent = particles[id.x].v.z;
                boundaryForce.z += wallStiffness * penetration - wallDamping * velocityComponent;
            }
            if zMinusDist < 0.0 {
                let penetration = -zMinusDist;
                let velocityComponent = -particles[id.x].v.z;
                boundaryForce.z -= wallStiffness * penetration - wallDamping * velocityComponent;
            }

            a += boundaryForce;
            particles[id.x].v += adaptiveDt * a;
            particles[id.x].position += adaptiveDt * particles[id.x].v;
        }
    }
}
