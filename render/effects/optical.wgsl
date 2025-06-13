// Pure optical effects - independent calculations
// All functions are self-contained with clear inputs and outputs
// Constants are defined in config.wgsl

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
    // Use centralized absorption coefficients
    var waterAbsorptionCoeffs = PURE_WATER_ABSORPTION_RGB * absorptionStrength;

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

    // Calculate optical path length
    var geometricThickness = surface.thickness * 0.08;
    var opticalPathLength = geometricThickness / surface.viewDotNormal;

    // Use centralized absorption coefficients
    var pureWaterAbsorption = DEEP_WATER_ABSORPTION_RGB * absorptionStrength;
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
    }    return curvatureFocus * totalLightPenetration * causticsStrength;
}

// Variance Light Transport - reduces noise in light distribution
fn calculateVarianceLightTransport(surface: SurfaceData, lighting: LightingEnvironment,
    texture: texture_2d<f32>, uv: vec2f, texelSize: vec2f,
    samples: f32, strength: f32, radius: f32, threshold: f32) -> vec3f {

    if strength <= 0.0 || samples <= 1.0 {
        return vec3f(1.0);
    }

    // Get texture dimensions for safe sampling
    var textureDims = textureDimensions(texture);
    var invTextureDims = vec2f(1.0) / vec2f(textureDims);

    // Sample neighboring pixels to calculate variance
    var lightVariance = vec3f(0.0);
    var meanLight = vec3f(0.0);
    var validSamples = 0.0;

    // 3x3 sampling pattern - use textureLoad for depth textures
    for (var x = -1; x <= 1; x += 1) {
        for (var y = -1; y <= 1; y += 1) {
            var sampleCoord = vec2i(uv * vec2f(textureDims)) + vec2i(x, y) * i32(radius);
            sampleCoord = clamp(sampleCoord, vec2i(0), vec2i(textureDims) - vec2i(1));

            var sampleDepth = textureLoad(texture, sampleCoord, 0).r;

            // Use conditional expressions for uniform control flow
            var isValid = f32(sampleDepth < 1e4 && sampleDepth > 0.0);
            var lightContrib = calculateSampleLightContribution(sampleDepth, lighting);
            meanLight += lightContrib * isValid;
            validSamples += isValid;
        }
    }

    if validSamples < 2.0 {
        return vec3f(1.0);
    }

    meanLight /= validSamples;

    // Calculate variance using the same sampling pattern
    for (var x = -1; x <= 1; x += 1) {
        for (var y = -1; y <= 1; y += 1) {
            var sampleCoord = vec2i(uv * vec2f(textureDims)) + vec2i(x, y) * i32(radius);
            sampleCoord = clamp(sampleCoord, vec2i(0), vec2i(textureDims) - vec2i(1));

            var sampleDepth = textureLoad(texture, sampleCoord, 0).r;

            var isValid = f32(sampleDepth < 1e4 && sampleDepth > 0.0);
            var lightContrib = calculateSampleLightContribution(sampleDepth, lighting);
            var diff = (lightContrib - meanLight) * isValid;
            lightVariance += diff * diff;
        }
    }

    lightVariance /= validSamples;    // Convert variance to a smoothing factor with enhanced sensitivity
    var varianceAmount = length(lightVariance);
    var smoothingFactor = clamp(varianceAmount * strength * 2.0, 0.0, 1.0);

    // Apply variance-based light transport correction with enhanced visibility
    var correctionFactor = mix(1.0, 1.0 - smoothingFactor * 0.8,
        step(threshold, varianceAmount));

    // Enhanced mixing for more visible effect with stronger color variation
    var colorCorrection = mix(vec3f(1.0), meanLight * 1.5, smoothingFactor * 0.9);
    return vec3f(correctionFactor) * colorCorrection;
}

// Helper function to calculate light contribution for a depth sample
fn calculateSampleLightContribution(depth: f32, lighting: LightingEnvironment) -> vec3f {
    // Simple light falloff based on depth
    var lightPenetration = exp(-depth * 0.1);
    var contribution = lighting.mainLightColor * lighting.mainLightIntensity * lightPenetration;
    contribution += lighting.ambientColor * lighting.ambientIntensity * 0.5;
    return clamp(contribution, vec3f(0.0), vec3f(2.0));
}
