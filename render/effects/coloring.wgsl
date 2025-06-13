// Color modification effects - independent color calculations
// All color effects are self-contained and composable

// Depth-based color modification
fn calculateDepthColoring(surface: SurfaceData, waterColor: vec3f, sphereSize: f32, depthColorStrength: f32) -> vec3f {
    if depthColorStrength <= 0.0 {
        return vec3f(1.0);
    }

    var waterDepthMeters = surface.depth * sphereSize * 0.1;

    // Realistic underwater color progression
    var redFalloff = exp(-waterDepthMeters * 0.5);
    var greenFalloff = exp(-waterDepthMeters * 0.15);
    var blueFalloff = exp(-waterDepthMeters * 0.05);

    var depthColor = vec3f(redFalloff, greenFalloff, blueFalloff);

    // Deep water tint based on actual water color
    var deepWaterTint = mix(
        vec3f(1.0),
        waterColor * vec3f(0.3, 0.8, 1.2),
        clamp(waterDepthMeters * 0.2, 0.0, 0.8)
    );

    return depthColor * deepWaterTint * depthColorStrength + vec3f(1.0 - depthColorStrength);
}

// Velocity-based color modification
fn calculateVelocityColoring(physics: PhysicsData, waterColor: vec3f, velocityColorStrength: f32) -> vec3f {
    if velocityColorStrength <= 0.0 {
        return vec3f(1.0);
    }

    var velocityColorFactor = clamp(physics.velocityMagnitude * 0.5, 0.0, 1.0);
    var velocityTint = mix(vec3f(1.0), waterColor, 0.3);

    return mix(vec3f(1.0), velocityTint, velocityColorFactor * velocityColorStrength);
}

// Color absorption in deep water
fn calculateColorAbsorption(surface: SurfaceData, baseColor: vec3f, waterColor: vec3f,
    colorAbsorptionStrength: f32, sphereSize: f32) -> vec3f {
    if colorAbsorptionStrength <= 0.0 {
        return baseColor;
    }

    var waterDepth = surface.depth;
    var depthFactor = clamp(waterDepth * 0.15, 0.0, 1.0);

    // Wavelength-based absorption
    var absorptionFactors = vec3f(
        exp(-depthFactor * 0.4),
        exp(-depthFactor * 0.2),
        exp(-depthFactor * 0.05)
    );

    var absorptionAffectedColor = baseColor * absorptionFactors;

    // Color shift in deep areas
    var baseColorShift = vec3f(1.0);
    if depthFactor > 0.8 {
        var coolTint = mix(vec3f(1.0), waterColor * vec3f(0.9, 0.95, 1.05), 0.1);
        baseColorShift = mix(vec3f(1.0), coolTint, (depthFactor - 0.8) * 0.25);
    }

    var colorShiftedResult = absorptionAffectedColor * baseColorShift;
    var blendFactor = depthFactor * 0.3 * colorAbsorptionStrength;

    return mix(baseColor, colorShiftedResult, blendFactor);
}

// Foam color blending
fn calculateFoamColor(baseColor: vec3f, foam: f32, foamColor: vec3f) -> vec3f {
    return mix(baseColor, foamColor, foam * 0.8);
}
