// Pure optical effects - independent calculations
// All functions are self-contained with clear inputs and outputs

// Fresnel calculation
fn calculateFresnel(surface: SurfaceData, fresnelPower: f32, fresnelScale: f32, fresnelBias: f32, reflectivity: f32) -> f32 {
    var fresnelEffect = pow(1.0 - surface.viewDotNormal, fresnelPower);
    var fresnel = fresnelEffect * reflectivity * fresnelScale;
    return clamp(fresnel + fresnelBias, 0.0, 0.5);
}

// Environment reflection calculation
fn calculateReflection(surface: SurfaceData, lighting: LightingEnvironment, envmap: texture_cube<f32>, sampler: sampler,
    viewMatrix: mat4x4f, invViewMatrix: mat4x4f, reflectionStrength: f32, fresnel: f32) -> vec3f {
    var reflectDir = reflect(surface.rayDir, surface.normal);
    var worldReflectDir = (invViewMatrix * vec4f(reflectDir, 0.0)).xyz;
    var envReflection = textureSampleLevel(envmap, sampler, worldReflectDir, 0.0).rgb;

    // Base reflection with optional Fresnel enhancement
    var baseReflection = reflectionStrength * 0.25;
    var totalReflectivity = clamp(baseReflection + fresnel, 0.0, 0.5);

    return envReflection * totalReflectivity;
}

// Light absorption using Beer-Lambert Law
fn calculateAbsorption(surface: SurfaceData, waterColor: vec3f, absorptionStrength: f32, absorptionDepth: f32) -> vec3f {
    // Realistic water absorption coefficients
    var waterAbsorptionCoeffs = vec3f(0.03, 0.025, 0.02) * absorptionStrength;

    // Modulate by water color saturation
    var colorSaturation = length(waterColor - vec3f(dot(waterColor, vec3f(0.333))));
    var absorptionScale = mix(0.15, 0.6, colorSaturation);
    waterAbsorptionCoeffs *= absorptionScale;

    // Calculate optical path length
    var pathLength = surface.thickness * absorptionDepth * 0.05;
    var opticalPathLength = pathLength / surface.viewDotNormal;

    // Apply Beer-Lambert law
    var attenuation = exp(-waterAbsorptionCoeffs * opticalPathLength);
    return clamp(attenuation, vec3f(0.6), vec3f(1.0));
}

// Transmission coefficient for transparency
fn calculateTransmission(surface: SurfaceData, waterColor: vec3f, absorptionStrength: f32) -> vec3f {
    if absorptionStrength <= 0.0 {
        return vec3f(1.0);
    }

    var waterIOR = 1.333;
    var airIOR = 1.0;

    // Calculate optical path length
    var geometricThickness = surface.thickness * 0.08;
    var opticalPathLength = geometricThickness / surface.viewDotNormal;

    // Pure water absorption
    var pureWaterAbsorption = vec3f(0.2, 0.08, 0.03) * absorptionStrength;
    var colorBasedAbsorption = pureWaterAbsorption * mix(vec3f(1.0), (2.0 - waterColor), 0.3);

    // Apply Beer's Law
    var transmission = exp(-colorBasedAbsorption * opticalPathLength);
    return clamp(transmission, vec3f(0.7), vec3f(1.0));
}

// Caustics calculation based on surface curvature
fn calculateCaustics(surface: SurfaceData, lighting: LightingEnvironment, curvatureX: f32, curvatureY: f32,
    causticsStrength: f32, causticsScale: f32) -> f32 {
    var surfaceCurvature = abs(curvatureX) + abs(curvatureY);
    var curvatureFocus = clamp(surfaceCurvature * causticsScale, 0.0, 1.0);

    // Light penetration for caustics
    var totalLightPenetration = 0.0;
    if lighting.mainLightIntensity > 0.0 {
        totalLightPenetration += max(0.0, -dot(surface.normal, lighting.mainLightDir)) * lighting.mainLightIntensity;
    }
    if lighting.fillLightIntensity > 0.0 {
        totalLightPenetration += max(0.0, -dot(surface.normal, lighting.fillLightDir)) * lighting.fillLightIntensity * 0.5;
    }
    if lighting.rimLightIntensity > 0.0 {
        totalLightPenetration += max(0.0, -dot(surface.normal, lighting.rimLightDir)) * lighting.rimLightIntensity * 0.3;
    }

    return curvatureFocus * totalLightPenetration * causticsStrength;
}
