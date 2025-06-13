// Pure physics calculations - independent of rendering
// All physics effects are self-contained and can be calculated independently
// Constants are defined in config.wgsl

// Calculate Reynolds number and turbulence
fn calculateReynoldsPhysics(velocity: vec3f, characteristicLength: f32, viscosity: f32,
    reynoldsScale: f32, turbulenceStrength: f32) -> PhysicsData {
    var physics: PhysicsData;

    physics.velocity = velocity;
    physics.velocityMagnitude = length(velocity);

    var kinematicViscosity = viscosity * KINEMATIC_VISCOSITY_SCALE;
    var reynoldsNumber = physics.velocityMagnitude * characteristicLength / kinematicViscosity;
    var turbulenceOnset = REYNOLDS_TURBULENCE_ONSET;

    physics.turbulence = clamp((reynoldsNumber - turbulenceOnset) / turbulenceOnset, 0.0, 1.0) * turbulenceStrength;

    // Kolmogorov cascade
    var kolmogorovScale = pow(pow(kinematicViscosity, 3.0) / (physics.velocityMagnitude * physics.velocityMagnitude * physics.velocityMagnitude + 1e-6), 0.25);
    var cascadeEffect = reynoldsScale / (1.0 + kolmogorovScale * 10.0);
    physics.turbulence *= cascadeEffect;

    return physics;
}

// Calculate cavitation effects
fn calculateCavitation(surface: SurfaceData, physics: PhysicsData, cavitationThreshold: f32, cavitationStrength: f32) -> f32 {
    var hydrostaticPressure = surface.depth * HYDROSTATIC_PRESSURE_SCALE * WATER_DENSITY;
    var dynamicPressure = physics.velocityMagnitude * physics.velocityMagnitude * 500.0;
    var totalPressure = hydrostaticPressure + dynamicPressure;

    var cavitationFactor = clamp((cavitationThreshold - totalPressure) / cavitationThreshold, 0.0, 1.0);
    return cavitationFactor * cavitationStrength;
}

// Calculate foam generation
fn calculateFoam(physics: PhysicsData, cavitation: f32, foamIntensity: f32, foamThreshold: f32) -> f32 {
    var turbulence = physics.velocityMagnitude * 0.05;
    var foam = cavitation * turbulence * foamIntensity;
    return clamp(foam - foamThreshold, 0.0, 1.0);
}

// Calculate surface pressure and density
fn calculatePressureDensity(surface: SurfaceData, physics: PhysicsData) -> vec2f {
    var pressureDensity = 1.0 + surface.thickness * 3.0;
    var depthPressure = surface.depth * 0.2;
    var compressionFactor = pow(pressureDensity + depthPressure, 0.8);

    return vec2f(depthPressure + physics.velocityMagnitude * 0.1, compressionFactor);
}

// Calculate vorticity from velocity gradients
fn calculateVorticity(ddx: vec3f, ddy: vec3f, physics: PhysicsData) -> vec3f {
    var vorticity = cross(ddx, ddy);
    return vorticity * physics.turbulence;
}

// Apply turbulent surface perturbations
fn calculateTurbulentSurfaceOffset(surface: SurfaceData, physics: PhysicsData, vorticity: vec3f,
    waveHeight: f32, normalStrength: f32) -> vec3f {
    if physics.turbulence <= 0.25 || physics.velocityMagnitude <= 0.05 {
        return vec3f(0.0);
    }

    var turbulentStrength = physics.turbulence * waveHeight * 0.2;
    var thicknessVariation = (surface.thickness - 1.0) * 0.1;
    var densityVariation = (physics.density - 1.0) * 0.1;

    var surfaceOffset = vec3f(
        thicknessVariation * turbulentStrength * 0.3,
        0.0,
        densityVariation * turbulentStrength * 0.3
    );

    // Add vorticity effect
    var vorticityMagnitude = length(vorticity);
    if vorticityMagnitude > 0.5 {
        var vorticityEffect = normalize(vorticity) * vorticityMagnitude * turbulentStrength * 0.1;
        surfaceOffset += vorticityEffect;
    }

    return surfaceOffset * normalStrength;
}
