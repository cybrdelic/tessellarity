// Pure lighting calculations - completely independent
// All lighting functions are self-contained and only depend on their inputs
// Constants are defined in config.wgsl

// Create lighting environment with configurable defaults - COMPLETELY INDEPENDENT
fn createLightingEnvironment(lightingControls: LightingControls, uniforms: RenderUniforms,
    envmap_texture: texture_cube<f32>, texture_sampler: sampler) -> LightingEnvironment {
    var lighting: LightingEnvironment;

    // Main light with configurable fallback
    if lightingControls.mainLightEnabled != 0u {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.mainLightDirection, 0.)).xyz);
        lighting.mainLightColor = lightingControls.mainLightColor;
        lighting.mainLightIntensity = lightingControls.mainLightIntensity;
    } else {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(DEFAULT_MAIN_LIGHT_DIR, 0.)).xyz);
        lighting.mainLightColor = DEFAULT_MAIN_LIGHT_COLOR;
        lighting.mainLightIntensity = DEFAULT_MAIN_LIGHT_INTENSITY;
    }

    // Fill light with configurable fallback
    if lightingControls.fillLightEnabled != 0u {
        lighting.fillLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.fillLightDirection, 0.)).xyz);
        lighting.fillLightColor = lightingControls.fillLightColor;
        lighting.fillLightIntensity = lightingControls.fillLightIntensity;
    } else {
        lighting.fillLightDir = normalize((uniforms.view_matrix * vec4f(DEFAULT_FILL_LIGHT_DIR, 0.)).xyz);
        lighting.fillLightColor = DEFAULT_FILL_LIGHT_COLOR;
        lighting.fillLightIntensity = DEFAULT_FILL_LIGHT_INTENSITY;
    }

    // Rim light with configurable fallback
    if lightingControls.rimLightEnabled != 0u {
        lighting.rimLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.rimLightDirection, 0.)).xyz);
        lighting.rimLightColor = lightingControls.rimLightColor;
        lighting.rimLightIntensity = lightingControls.rimLightIntensity;
    } else {
        lighting.rimLightDir = normalize((uniforms.view_matrix * vec4f(DEFAULT_RIM_LIGHT_DIR, 0.)).xyz);
        lighting.rimLightColor = DEFAULT_RIM_LIGHT_COLOR;
        lighting.rimLightIntensity = DEFAULT_RIM_LIGHT_INTENSITY;
    }

    // Ambient and background
    lighting.ambientColor = lightingControls.ambientColor;
    lighting.ambientIntensity = lightingControls.ambientIntensity;

    // Background color from environment - consistent sampling
    var rayDir = normalize(vec3f(0.0, 0.0, -1.0));
    var worldRayDir = (uniforms.inv_view_matrix * vec4f(rayDir, 0.0)).xyz;
    lighting.backgroundColor = textureSampleLevel(envmap_texture, texture_sampler, worldRayDir, 0.0).rgb;

    return lighting;
}

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
