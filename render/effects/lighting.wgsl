// Pure lighting calculations - completely independent
// All lighting functions are self-contained and only depend on their inputs

// Specular lighting calculation
fn calculateSpecular(surface: SurfaceData, lighting: LightingEnvironment, specularPower: f32, specularIntensity: f32) -> f32 {
    var specular = 0.0;

    // Main light specular
    if lighting.mainLightIntensity > 0.0 {
        var H = normalize(lighting.mainLightDir - surface.rayDir);
        var specularTerm = pow(max(0.0, dot(H, surface.normal)), specularPower);
        specular += specularTerm * specularIntensity * lighting.mainLightIntensity;
    }

    // Fill light specular (softer)
    if lighting.fillLightIntensity > 0.0 {
        var H = normalize(lighting.fillLightDir - surface.rayDir);
        var specularTerm = pow(max(0.0, dot(H, surface.normal)), specularPower * 0.7);
        specular += specularTerm * specularIntensity * 0.4 * lighting.fillLightIntensity;
    }

    // Rim light specular (softest)
    if lighting.rimLightIntensity > 0.0 {
        var H = normalize(lighting.rimLightDir - surface.rayDir);
        var specularTerm = pow(max(0.0, dot(H, surface.normal)), specularPower * 0.5);
        specular += specularTerm * specularIntensity * 0.3 * lighting.rimLightIntensity;
    }

    return specular;
}

// Subsurface scattering calculation
fn calculateSubsurface(surface: SurfaceData, lighting: LightingEnvironment, subsurfaceIntensity: f32) -> vec3f {
    var subsurface = vec3f(0.0);

    // Main light subsurface
    if lighting.mainLightIntensity > 0.0 {
        var backLighting = max(0.0, dot(-lighting.mainLightDir, surface.normal));
        subsurface += lighting.mainLightColor * backLighting * surface.thickness * subsurfaceIntensity * lighting.mainLightIntensity;
    }

    // Fill light subsurface
    if lighting.fillLightIntensity > 0.0 {
        var backLighting = max(0.0, dot(-lighting.fillLightDir, surface.normal));
        subsurface += lighting.fillLightColor * backLighting * surface.thickness * subsurfaceIntensity * lighting.fillLightIntensity * 0.5;
    }

    // Rim light subsurface
    if lighting.rimLightIntensity > 0.0 {
        var backLighting = max(0.0, dot(-lighting.rimLightDir, surface.normal));
        subsurface += lighting.rimLightColor * backLighting * surface.thickness * subsurfaceIntensity * lighting.rimLightIntensity * 0.3;
    }

    return subsurface;
}

// Rim lighting calculation
fn calculateRimLighting(surface: SurfaceData, lighting: LightingEnvironment, rimPower: f32, rimIntensity: f32) -> vec3f {
    var fresnel = pow(1.0 - surface.viewDotNormal, rimPower);
    var rim = vec3f(0.0);

    // Main light rim
    if lighting.mainLightIntensity > 0.0 {
        var lightAlignment = max(0.0, dot(surface.normal, -lighting.mainLightDir));
        rim += lighting.mainLightColor * fresnel * lightAlignment * rimIntensity * lighting.mainLightIntensity;
    }

    // Fill light rim
    if lighting.fillLightIntensity > 0.0 {
        var lightAlignment = max(0.0, dot(surface.normal, -lighting.fillLightDir));
        rim += lighting.fillLightColor * fresnel * lightAlignment * rimIntensity * lighting.fillLightIntensity * 0.6;
    }

    // Rim light rim
    if lighting.rimLightIntensity > 0.0 {
        var lightAlignment = max(0.0, dot(surface.normal, -lighting.rimLightDir));
        rim += lighting.rimLightColor * fresnel * lightAlignment * rimIntensity * lighting.rimLightIntensity * 0.7;
    }

    return rim;
}

// Volumetric lighting calculation
fn calculateVolumetricLighting(surface: SurfaceData, lighting: LightingEnvironment, volumetricIntensity: f32) -> vec3f {
    var volumetric = vec3f(0.0);
    var depthAttenuation = exp(-surface.depth * 0.08);
    var thicknessAttenuation = exp(-surface.thickness * 0.4);

    // Light penetration from each source
    var mainPenetration = 0.0;
    var fillPenetration = 0.0;
    var rimPenetration = 0.0;

    if lighting.mainLightIntensity > 0.0 {
        mainPenetration = max(0.0, -dot(surface.normal, lighting.mainLightDir)) * lighting.mainLightIntensity;
    }
    if lighting.fillLightIntensity > 0.0 {
        fillPenetration = max(0.0, -dot(surface.normal, lighting.fillLightDir)) * lighting.fillLightIntensity * 0.5;
    }
    if lighting.rimLightIntensity > 0.0 {
        rimPenetration = max(0.0, -dot(surface.normal, lighting.rimLightDir)) * lighting.rimLightIntensity * 0.3;
    }

    var totalPenetration = mainPenetration + fillPenetration + rimPenetration;

    // Colored volumetric lighting
    var lightColor = lighting.backgroundColor * 0.7;
    if mainPenetration > 0.0 {
        var weight = mainPenetration / (totalPenetration + 0.001);
        lightColor = mix(lightColor, lighting.mainLightColor, weight);
    }

    volumetric = lightColor * totalPenetration * volumetricIntensity * depthAttenuation * thicknessAttenuation;

    return volumetric;
}

// Ambient lighting calculation
fn calculateAmbientLighting(surface: SurfaceData, lighting: LightingEnvironment) -> vec3f {
    var ambient = lighting.ambientColor * lighting.ambientIntensity;
    var depthFactor = clamp(surface.thickness * 0.5, 0.15, 0.7);
    return ambient * depthFactor;
}
