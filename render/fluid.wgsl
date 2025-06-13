// MODULAR FLUID SHADER - Clean separation of concerns
// Each effect is independent and can be toggled/modified without affecting others

@group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(3) var thickness_texture: texture_2d<f32>;
@group(0) @binding(4) var envmap_texture: texture_cube<f32>;
@group(0) @binding(5) var<uniform> waterAppearance: WaterAppearance;
@group(0) @binding(6) var<uniform> debug: DebugUniforms;
@group(0) @binding(7) var<uniform> effectsToggle: EffectsToggle;
@group(0) @binding(8) var<uniform> lightingControls: LightingControls;
@group(0) @binding(9) var<uniform> effectParams: EffectParameters;

// === SHARED DATA STRUCTURES ===
struct RenderUniforms {
    texel_size: vec2f,
    sphere_size: f32,
    inv_projection_matrix: mat4x4f,
    projection_matrix: mat4x4f,
    view_matrix: mat4x4f,
    inv_view_matrix: mat4x4f,
}

struct WaterAppearance {
    color: vec4<f32>,
    transparency: f32,
    reflectivity: f32,
    waveHeight: f32,
    padding: f32,
}

struct DebugUniforms {
    mode: u32,
    layer: u32,
    intensity: f32,
    padding: f32,
}

struct EffectsToggle {
    enableReynoldsPhysics: u32,
    enableCavitation: u32,
    enableFoam: u32,
    enableTurbulentNormals: u32,
    enableSpecular: u32,
    enableSubsurface: u32,
    enableFresnel: u32,
    enableReflection: u32,
    enableRefraction: u32,
    enableCaustics: u32,
    enableDispersion: u32,
    enableAbsorption: u32,
    enableDepthColoring: u32,
    enableVelocityColoring: u32,
    enableRimLighting: u32,
    enableColorAbsorption: u32,
}

struct LightingControls {
    mainLightDirection: vec3f,
    mainLightIntensity: f32,
    mainLightColor: vec3f,
    mainLightEnabled: u32,
    fillLightDirection: vec3f,
    fillLightIntensity: f32,
    fillLightColor: vec3f,
    fillLightEnabled: u32,
    rimLightDirection: vec3f,
    rimLightIntensity: f32,
    rimLightColor: vec3f,
    rimLightEnabled: u32,
    ambientIntensity: f32,
    ambientColor: vec3f,
    shadowIntensity: f32,
    lightingMode: u32,
    specularIntensityMultiplier: f32,
    subsurfaceIntensityMultiplier: f32,
    lightingPower: f32,
    lightingContrast: f32,
    volumetricIntensity: f32,
    rimLightingPower: f32,
    lightingPadding1: f32,
    lightingPadding2: f32,
    lightingPadding3: f32,
    lightingPadding4: f32,
}

struct EffectParameters {
    reynoldsScale: f32,
    turbulenceStrength: f32,
    viscosityFactor: f32,
    cascadeEffect: f32,
    cavitationThreshold: f32,
    cavitationStrength: f32,
    pressureScale: f32,
    cavitationFalloff: f32,
    foamIntensity: f32,
    foamThreshold: f32,
    foamDecay: f32,
    foamCoverage: f32,
    normalStrength: f32,
    normalScale: f32,
    normalSmoothness: f32,
    normalStability: f32,
    specularPower: f32,
    specularScale: f32,
    specularRoughness: f32,
    specularFresnel: f32,
    subsurfaceDepth: f32,
    subsurfaceScale: f32,
    subsurfaceColor: f32,
    subsurfaceDistortion: f32,
    fresnelPower: f32,
    fresnelScale: f32,
    fresnelBias: f32,
    fresnelContrast: f32,
    reflectionStrength: f32,
    reflectionBlur: f32,
    reflectionDistortion: f32,
    reflectionFade: f32,
    refractionStrength: f32,
    refractionIndex: f32,
    refractionChromatic: f32,
    refractionScale: f32,
    causticsStrength: f32,
    causticsScale: f32,
    causticsSpeed: f32,
    causticsContrast: f32,
    absorptionStrength: f32,
    absorptionDepth: f32,
    absorptionColor: f32,
    absorptionScattering: f32,
    depthColorStrength: f32,
    depthColorScale: f32,
    depthColorContrast: f32,
    depthColorSaturation: f32,
    velocityColorStrength: f32,
    velocityColorScale: f32,
    velocityColorContrast: f32,
    velocityColorThreshold: f32,
    rimLightStrength: f32,
    rimLightPower: f32,
    rimLightScale: f32,
    rimLightContrast: f32,
    colorAbsorptionRed: f32,
    colorAbsorptionGreen: f32,
    colorAbsorptionBlue: f32,
    colorAbsorptionDepth: f32,
    padding1: f32,
    padding2: f32,
    padding3: f32,
    padding4: f32,
}

struct FluidFragmentInput {
    @location(0) uv: vec2f,
    @location(1) iuv: vec2f,
}

// === MODULAR DATA STRUCTURES ===
struct SurfaceData {
    position: vec3f,
    normal: vec3f,
    thickness: f32,
    depth: f32,
    rayDir: vec3f,
    viewDotNormal: f32,
}

struct LightingEnvironment {
    mainLightDir: vec3f,
    mainLightColor: vec3f,
    mainLightIntensity: f32,
    fillLightDir: vec3f,
    fillLightColor: vec3f,
    fillLightIntensity: f32,
    rimLightDir: vec3f,
    rimLightColor: vec3f,
    rimLightIntensity: f32,
    ambientColor: vec3f,
    ambientIntensity: f32,
    backgroundColor: vec3f,
}

struct PhysicsData {
    velocity: vec3f,
    velocityMagnitude: f32,
    pressure: f32,
    density: f32,
    turbulence: f32,
    cavitation: f32,
    vorticity: vec3f,
}

// === SURFACE CALCULATIONS (Independent) ===
fn computeViewPosFromUVDepth(tex_coord: vec2f, depth: f32) -> vec3f {
    var ndc: vec4f = vec4f(tex_coord.x * 2.0 - 1.0, 1.0 - 2.0 * tex_coord.y, 0.0, 1.0);
    ndc.z = -uniforms.projection_matrix[2].z + uniforms.projection_matrix[3].z / depth;
    ndc.w = 1.0;
    var eye_pos: vec4f = uniforms.inv_projection_matrix * ndc;
    return eye_pos.xyz / eye_pos.w;
}

fn getViewPosFromTexCoord(tex_coord: vec2f, iuv: vec2f) -> vec3f {
    var depth: f32 = abs(textureLoad(texture, vec2u(iuv), 0).x);
    return computeViewPosFromUVDepth(tex_coord, depth);
}

fn safeThicknessSample(coords: vec2f) -> f32 {
    var texture_dims = textureDimensions(thickness_texture);
    var clamped_coords = clamp(coords, vec2f(0.0), vec2f(f32(texture_dims.x - 1), f32(texture_dims.y - 1)));
    return textureLoad(thickness_texture, vec2u(clamped_coords), 0).r;
}

fn createSurfaceData(input: FluidFragmentInput) -> SurfaceData {
    var surface: SurfaceData;

    var depth = abs(textureLoad(texture, vec2u(input.iuv), 0).r);
    surface.position = computeViewPosFromUVDepth(input.uv, depth);
    surface.depth = abs(surface.position.z);
    surface.rayDir = normalize(surface.position);

    // Calculate smooth surface normal
    var ddx = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texel_size.x, 0.), input.iuv + vec2f(1.0, 0.0)) - surface.position;
    var ddy = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texel_size.y), input.iuv + vec2f(0.0, 1.0)) - surface.position;
    var ddx2 = surface.position - getViewPosFromTexCoord(input.uv + vec2f(-uniforms.texel_size.x, 0.), input.iuv + vec2f(-1.0, 0.0));
    var ddy2 = surface.position - getViewPosFromTexCoord(input.uv + vec2f(0., -uniforms.texel_size.y), input.iuv + vec2f(0.0, -1.0));

    // Choose smoothest gradients
    if abs(ddx.z) > abs(ddx2.z) { ddx = ddx2; }
    if abs(ddy.z) > abs(ddy2.z) { ddy = ddy2; }

    // Apply smoothing
    var smoothingFactor = 0.65;
    ddx *= smoothingFactor;
    ddy *= smoothingFactor;
    var avgGradient = (ddx + ddy) * 0.5;
    ddx = mix(ddx, avgGradient, 0.2);
    ddy = mix(ddy, avgGradient, 0.2);

    surface.normal = -normalize(cross(ddx, ddy));

    // Calculate smooth thickness
    var thickness = textureLoad(thickness_texture, vec2u(input.iuv), 0).r;
    var thicknessL = safeThicknessSample(input.iuv + vec2f(-1.0, 0.0));
    var thicknessR = safeThicknessSample(input.iuv + vec2f(1.0, 0.0));
    var thicknessU = safeThicknessSample(input.iuv + vec2f(0.0, -1.0));
    var thicknessD = safeThicknessSample(input.iuv + vec2f(0.0, 1.0));

    var smoothedThickness = (thickness * 4.0 + thicknessL + thicknessR + thicknessU + thicknessD) / 8.0;
    surface.thickness = mix(thickness, smoothedThickness, 0.8);

    surface.viewDotNormal = max(dot(surface.normal, -surface.rayDir), 0.0);

    return surface;
}

// === LIGHTING CALCULATIONS (Independent) ===
fn createLightingEnvironment() -> LightingEnvironment {
    var lighting: LightingEnvironment;

    // Main light
    if lightingControls.mainLightEnabled != 0u {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.mainLightDirection, 0.)).xyz);
        lighting.mainLightColor = lightingControls.mainLightColor;
        lighting.mainLightIntensity = lightingControls.mainLightIntensity;
    } else {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(0.3, -0.7, -0.6, 0.)).xyz);
        lighting.mainLightColor = vec3f(1.0);
        lighting.mainLightIntensity = 1.0;
    }

    // Fill light
    if lightingControls.fillLightEnabled != 0u {
        lighting.fillLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.fillLightDirection, 0.)).xyz);
        lighting.fillLightColor = lightingControls.fillLightColor;
        lighting.fillLightIntensity = lightingControls.fillLightIntensity;
    } else {
        lighting.fillLightDir = normalize((uniforms.view_matrix * vec4f(-0.5, -0.3, 0.8, 0.)).xyz);
        lighting.fillLightColor = vec3f(1.0);
        lighting.fillLightIntensity = 0.0;
    }

    // Rim light
    if lightingControls.rimLightEnabled != 0u {
        lighting.rimLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.rimLightDirection, 0.)).xyz);
        lighting.rimLightColor = lightingControls.rimLightColor;
        lighting.rimLightIntensity = lightingControls.rimLightIntensity;
    } else {
        lighting.rimLightDir = normalize((uniforms.view_matrix * vec4f(0.8, 0.2, -0.4, 0.)).xyz);
        lighting.rimLightColor = vec3f(1.0);
        lighting.rimLightIntensity = 0.0;
    }

    lighting.ambientColor = lightingControls.ambientColor;
    lighting.ambientIntensity = lightingControls.ambientIntensity;

    // Background color
    var rayDir = normalize(computeViewPosFromUVDepth(vec2f(0.5), 1000.0));
    var worldRayDir = (uniforms.inv_view_matrix * vec4f(rayDir, 0.0)).xyz;
    lighting.backgroundColor = textureSampleLevel(envmap_texture, texture_sampler, worldRayDir, 0.).rgb;

    return lighting;
}

fn calculateSpecular(surface: SurfaceData, lighting: LightingEnvironment, specularPower: f32, specularIntensity: f32) -> f32 {
    var specular = 0.0;

    if lighting.mainLightIntensity > 0.0 {
        var H = normalize(lighting.mainLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, surface.normal)), specularPower) * specularIntensity * lighting.mainLightIntensity;
    }

    if lighting.fillLightIntensity > 0.0 {
        var H = normalize(lighting.fillLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, surface.normal)), specularPower * 0.7) * specularIntensity * 0.4 * lighting.fillLightIntensity;
    }

    if lighting.rimLightIntensity > 0.0 {
        var H = normalize(lighting.rimLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, surface.normal)), specularPower * 0.5) * specularIntensity * 0.3 * lighting.rimLightIntensity;
    }

    return specular;
}

fn calculateSubsurface(surface: SurfaceData, lighting: LightingEnvironment, subsurfaceIntensity: f32) -> vec3f {
    var subsurface = vec3f(0.0);

    if lighting.mainLightIntensity > 0.0 {
        var backLighting = max(0.0, dot(-lighting.mainLightDir, surface.normal));
        subsurface += lighting.mainLightColor * backLighting * surface.thickness * subsurfaceIntensity * lighting.mainLightIntensity;
    }

    if lighting.fillLightIntensity > 0.0 {
        var backLighting = max(0.0, dot(-lighting.fillLightDir, surface.normal));
        subsurface += lighting.fillLightColor * backLighting * surface.thickness * subsurfaceIntensity * lighting.fillLightIntensity * 0.5;
    }

    if lighting.rimLightIntensity > 0.0 {
        var backLighting = max(0.0, dot(-lighting.rimLightDir, surface.normal));
        subsurface += lighting.rimLightColor * backLighting * surface.thickness * subsurfaceIntensity * lighting.rimLightIntensity * 0.3;
    }

    return subsurface;
}

fn calculateRimLighting(surface: SurfaceData, lighting: LightingEnvironment, rimPower: f32, rimIntensity: f32) -> vec3f {
    var fresnel = pow(1.0 - surface.viewDotNormal, rimPower);
    var rim = vec3f(0.0);

    if lighting.mainLightIntensity > 0.0 {
        var lightAlignment = max(0.0, dot(surface.normal, -lighting.mainLightDir));
        rim += lighting.mainLightColor * fresnel * lightAlignment * rimIntensity * lighting.mainLightIntensity;
    }

    if lighting.fillLightIntensity > 0.0 {
        var lightAlignment = max(0.0, dot(surface.normal, -lighting.fillLightDir));
        rim += lighting.fillLightColor * fresnel * lightAlignment * rimIntensity * lighting.fillLightIntensity * 0.6;
    }

    if lighting.rimLightIntensity > 0.0 {
        var lightAlignment = max(0.0, dot(surface.normal, -lighting.rimLightDir));
        rim += lighting.rimLightColor * fresnel * lightAlignment * rimIntensity * lighting.rimLightIntensity * 0.7;
    }

    return rim;
}

// === PHYSICS CALCULATIONS (Independent) ===
fn calculateReynoldsPhysics(velocity: vec3f, characteristicLength: f32, viscosity: f32, reynoldsScale: f32, turbulenceStrength: f32) -> PhysicsData {
    var physics: PhysicsData;

    physics.velocity = velocity;
    physics.velocityMagnitude = length(velocity);

    var kinematicViscosity = viscosity * 0.001;
    var reynoldsNumber = physics.velocityMagnitude * characteristicLength / kinematicViscosity;
    var turbulenceOnset = 4000.0;

    physics.turbulence = clamp((reynoldsNumber - turbulenceOnset) / turbulenceOnset, 0.0, 1.0) * turbulenceStrength;

    var kolmogorovScale = pow(pow(kinematicViscosity, 3.0) / (physics.velocityMagnitude * physics.velocityMagnitude * physics.velocityMagnitude + 1e-6), 0.25);
    var cascadeEffect = reynoldsScale / (1.0 + kolmogorovScale * 10.0);
    physics.turbulence *= cascadeEffect;

    physics.pressure = physics.velocityMagnitude * 0.1;
    physics.density = 1.0 + physics.pressure * 0.3;
    physics.cavitation = 1.0; // Initialize cavitation
    physics.vorticity = vec3f(0.0); // Initialize vorticity

    return physics;
}

fn calculateCavitation(surface: SurfaceData, physics: PhysicsData, cavitationThreshold: f32) -> f32 {
    var hydrostaticPressure = surface.depth * 9.81 * 1000.0;
    var dynamicPressure = physics.velocityMagnitude * physics.velocityMagnitude * 500.0;
    var totalPressure = hydrostaticPressure + dynamicPressure;
    return clamp((cavitationThreshold - totalPressure) / cavitationThreshold, 0.0, 1.0);
}

fn calculateFoam(physics: PhysicsData, cavitation: f32, foamIntensity: f32, foamThreshold: f32) -> f32 {
    var turbulence = physics.velocityMagnitude * 0.05;
    var foam = cavitation * turbulence * foamIntensity;
    return clamp(foam - foamThreshold, 0.0, 1.0);
}

// === OPTICAL EFFECTS (Independent) ===
fn calculateFresnel(surface: SurfaceData, fresnelPower: f32, fresnelScale: f32, fresnelBias: f32, reflectivity: f32) -> f32 {
    var fresnelEffect = pow(1.0 - surface.viewDotNormal, fresnelPower);
    var fresnel = fresnelEffect * reflectivity * fresnelScale;
    return clamp(fresnel + fresnelBias, 0.0, 0.5);
}

fn calculateReflection(surface: SurfaceData, lighting: LightingEnvironment, reflectionStrength: f32, fresnel: f32) -> vec3f {
    var reflectDir = reflect(surface.rayDir, surface.normal);
    var worldReflectDir = (uniforms.inv_view_matrix * vec4f(reflectDir, 0.0)).xyz;
    var envReflection = textureSampleLevel(envmap_texture, texture_sampler, worldReflectDir, 0.0).rgb;

    var baseReflection = reflectionStrength * 0.25;
    var totalReflectivity = clamp(baseReflection + fresnel, 0.0, 0.5);

    return envReflection * totalReflectivity;
}

fn calculateAbsorption(surface: SurfaceData, waterColor: vec3f, absorptionStrength: f32) -> vec3f {
    if absorptionStrength <= 0.0 { return vec3f(1.0); }

    var waterAbsorptionCoeffs = vec3f(0.03, 0.025, 0.02) * absorptionStrength;
    var colorSaturation = length(waterColor - vec3f(dot(waterColor, vec3f(0.333))));
    var absorptionScale = mix(0.15, 0.6, colorSaturation);
    waterAbsorptionCoeffs *= absorptionScale;

    var pathLength = surface.thickness * 0.05;
    var opticalPathLength = pathLength / surface.viewDotNormal;

    var attenuation = exp(-waterAbsorptionCoeffs * opticalPathLength);
    return clamp(attenuation, vec3f(0.6), vec3f(1.0));
}

fn calculateCaustics(surface: SurfaceData, lighting: LightingEnvironment, input: FluidFragmentInput, causticsStrength: f32, causticsScale: f32) -> f32 {
    if causticsStrength <= 0.0 { return 0.0; }

    var thicknessL = safeThicknessSample(input.iuv + vec2f(-1.0, 0.0));
    var thicknessR = safeThicknessSample(input.iuv + vec2f(1.0, 0.0));
    var thicknessU = safeThicknessSample(input.iuv + vec2f(0.0, -1.0));
    var thicknessD = safeThicknessSample(input.iuv + vec2f(0.0, 1.0));
    var curvatureX = (thicknessR + thicknessL - 2.0 * surface.thickness) * 0.5;
    var curvatureY = (thicknessD + thicknessU - 2.0 * surface.thickness) * 0.5;

    var surfaceCurvature = abs(curvatureX) + abs(curvatureY);
    var curvatureFocus = clamp(surfaceCurvature * causticsScale, 0.0, 1.0);

    var totalLightPenetration = 0.0;
    if lighting.mainLightIntensity > 0.0 {
        totalLightPenetration += max(0.0, -dot(surface.normal, lighting.mainLightDir)) * lighting.mainLightIntensity;
    }
    if lighting.fillLightIntensity > 0.0 {
        totalLightPenetration += max(0.0, -dot(surface.normal, lighting.fillLightDir)) * lighting.fillLightIntensity * 0.5;
    }

    return curvatureFocus * totalLightPenetration * causticsStrength;
}

// === COLOR EFFECTS (Independent) ===
fn calculateDepthColoring(surface: SurfaceData, waterColor: vec3f, sphereSize: f32, depthColorStrength: f32) -> vec3f {
    if depthColorStrength <= 0.0 { return vec3f(1.0); }

    var waterDepthMeters = surface.depth * sphereSize * 0.1;
    var redFalloff = exp(-waterDepthMeters * 0.5);
    var greenFalloff = exp(-waterDepthMeters * 0.15);
    var blueFalloff = exp(-waterDepthMeters * 0.05);

    var depthColor = vec3f(redFalloff, greenFalloff, blueFalloff);
    var deepWaterTint = mix(vec3f(1.0), waterColor * vec3f(0.3, 0.8, 1.2), clamp(waterDepthMeters * 0.2, 0.0, 0.8));

    return mix(vec3f(1.0), depthColor * deepWaterTint, depthColorStrength);
}

fn calculateVelocityColoring(physics: PhysicsData, waterColor: vec3f, velocityColorStrength: f32) -> vec3f {
    if velocityColorStrength <= 0.0 { return vec3f(1.0); }

    var velocityColorFactor = clamp(physics.velocityMagnitude * 0.5, 0.0, 1.0);
    var velocityTint = mix(vec3f(1.0), waterColor, 0.3);

    return mix(vec3f(1.0), velocityTint, velocityColorFactor * velocityColorStrength);
}

fn calculateColorAbsorption(surface: SurfaceData, baseColor: vec3f, waterColor: vec3f, colorAbsorptionStrength: f32) -> vec3f {
    if colorAbsorptionStrength <= 0.0 { return baseColor; }

    var depthFactor = clamp(surface.depth * 0.15, 0.0, 1.0);
    var absorptionFactors = vec3f(exp(-depthFactor * 0.4), exp(-depthFactor * 0.2), exp(-depthFactor * 0.05));
    var absorptionAffectedColor = baseColor * absorptionFactors;

    var baseColorShift = vec3f(1.0);
    if depthFactor > 0.8 {
        var coolTint = mix(vec3f(1.0), waterColor * vec3f(0.9, 0.95, 1.05), 0.1);
        baseColorShift = mix(vec3f(1.0), coolTint, (depthFactor - 0.8) * 0.25);
    }

    var colorShiftedResult = absorptionAffectedColor * baseColorShift;
    var blendFactor = depthFactor * 0.3 * colorAbsorptionStrength;

    return mix(baseColor, colorShiftedResult, blendFactor);
}

// === MAIN FRAGMENT SHADER ===
@fragment
fn fs(input: FluidFragmentInput) -> @location(0) vec4f {
    var depth: f32 = abs(textureLoad(texture, vec2u(input.iuv), 0).r);

    // Early return for non-water pixels
    if depth >= 1e4 || depth <= 0.0 {
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    // === INDEPENDENT CALCULATIONS ===
    var surface = createSurfaceData(input);
    var lighting = createLightingEnvironment();    // Physics calculations (independent)
    var physics: PhysicsData;
    // Initialize physics data with defaults
    physics.velocity = vec3f(0.0);
    physics.velocityMagnitude = 0.0;
    physics.pressure = 0.0;
    physics.density = 1.0;
    physics.turbulence = 0.0;
    physics.cavitation = 1.0;
    physics.vorticity = vec3f(0.0);

    var foam = 0.0;
    var cavitation = 1.0;

    if effectsToggle.enableReynoldsPhysics != 0u {
        var ddx = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texel_size.x, 0.), input.iuv + vec2f(1.0, 0.0)) - surface.position;
        var ddy = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texel_size.y), input.iuv + vec2f(0.0, 1.0)) - surface.position;
        var velocity = vec3f(length(ddx), length(vec3f(ddx.y, ddy.y, 0.0)), length(ddy));

        physics = calculateReynoldsPhysics(velocity, uniforms.sphere_size, effectParams.viscosityFactor,
            effectParams.reynoldsScale, effectParams.turbulenceStrength);

        if effectsToggle.enableTurbulentNormals != 0u && physics.turbulence > 0.25 {
            var surfaceOffset = vec3f(
                (surface.thickness - 1.0) * physics.turbulence * waterAppearance.waveHeight * 0.1,
                0.0,
                (physics.density - 1.0) * physics.turbulence * waterAppearance.waveHeight * 0.1
            );
            var perturbedNormal = normalize(surface.normal + surfaceOffset * effectParams.normalStrength * 0.05);
            if dot(perturbedNormal, surface.normal) >= 0.6 {
                surface.normal = mix(surface.normal, perturbedNormal, 0.08);
                surface.viewDotNormal = max(dot(surface.normal, -surface.rayDir), 0.0);
            }
        }
    }

    if effectsToggle.enableCavitation != 0u {
        cavitation = calculateCavitation(surface, physics, effectParams.cavitationThreshold);
    }

    if effectsToggle.enableFoam != 0u {
        foam = calculateFoam(physics, cavitation, effectParams.foamIntensity, effectParams.foamThreshold);
    }

    // Optical effects (independent)
    var fresnel = 0.0;
    var absorption = vec3f(1.0);
    var caustics = 0.0;

    if effectsToggle.enableFresnel != 0u {
        fresnel = calculateFresnel(surface, effectParams.fresnelPower, effectParams.fresnelScale,
            effectParams.fresnelBias, waterAppearance.reflectivity);
    }

    if effectsToggle.enableAbsorption != 0u {
        absorption = calculateAbsorption(surface, waterAppearance.color.rgb, effectParams.absorptionStrength);
    }

    if effectsToggle.enableCaustics != 0u {
        caustics = calculateCaustics(surface, lighting, input, effectParams.causticsStrength, effectParams.causticsScale);
    }

    // Lighting effects (independent)
    var specular = 0.0;
    var subsurface = vec3f(0.0);
    var rimLighting = vec3f(0.0);
    var reflection = vec3f(0.0);

    if effectsToggle.enableSpecular != 0u {
        specular = calculateSpecular(surface, lighting, effectParams.specularPower,
            effectParams.specularScale * lightingControls.specularIntensityMultiplier);
        specular *= (1.0 - foam * 0.7);
    }

    if effectsToggle.enableSubsurface != 0u {
        var subsurfaceIntensity = effectParams.subsurfaceScale * lightingControls.subsurfaceIntensityMultiplier;
        subsurface = calculateSubsurface(surface, lighting, subsurfaceIntensity);
    }

    if effectsToggle.enableRimLighting != 0u {
        rimLighting = calculateRimLighting(surface, lighting, effectParams.rimLightPower, effectParams.rimLightStrength);
    }

    if effectsToggle.enableReflection != 0u {
        reflection = calculateReflection(surface, lighting, effectParams.reflectionStrength, fresnel);
    }

    // Volumetric and ambient lighting
    var volumetric = vec3f(0.0);
    var depthAttenuation = exp(-surface.depth * 0.08);
    var lightPenetration = 0.0;

    if lighting.mainLightIntensity > 0.0 {
        lightPenetration += max(0.0, -dot(surface.normal, lighting.mainLightDir)) * lighting.mainLightIntensity;
    }
    if lighting.fillLightIntensity > 0.0 {
        lightPenetration += max(0.0, -dot(surface.normal, lighting.fillLightDir)) * lighting.fillLightIntensity * 0.5;
    }

    volumetric = lighting.backgroundColor * lightPenetration * lightingControls.volumetricIntensity * depthAttenuation;
    volumetric += caustics * lighting.backgroundColor * 0.3;

    var ambient = lighting.ambientColor * lighting.ambientIntensity * clamp(surface.thickness * 0.5, 0.15, 0.7);    // Color calculations (independent)
    var baseColor = waterAppearance.color.rgb * absorption;

    // Safety check: ensure we have a reasonable base color
    if length(baseColor) < 0.01 {
        baseColor = vec3f(0.2, 0.6, 0.8); // Default blue water color
    }

    var depthColor = vec3f(1.0);
    if effectsToggle.enableDepthColoring != 0u {
        depthColor = calculateDepthColoring(surface, waterAppearance.color.rgb, uniforms.sphere_size, effectParams.depthColorStrength);
    }

    var velocityColor = vec3f(1.0);
    if effectsToggle.enableVelocityColoring != 0u {
        velocityColor = calculateVelocityColoring(physics, waterAppearance.color.rgb, effectParams.velocityColorStrength);
    }

    // === CLEAN COLOR COMPOSITION ===
    var finalColor = baseColor * depthColor * velocityColor;
    finalColor += subsurface;
    finalColor += reflection;
    finalColor += vec3f(specular);
    finalColor += rimLighting;
    finalColor += volumetric;
    finalColor += ambient;

    // Apply color absorption if enabled
    if effectsToggle.enableColorAbsorption != 0u {
        finalColor = calculateColorAbsorption(surface, finalColor, waterAppearance.color.rgb, effectParams.colorAbsorptionDepth);
    }

    // Apply foam
    finalColor = mix(finalColor, vec3f(1.0), foam * 0.8);

    // === TRANSPARENCY CALCULATION ===
    var alpha = waterAppearance.transparency;
    var volumeOpacity = clamp(surface.thickness * 0.8, 0.0, 0.9);
    alpha = mix(alpha, 1.0, volumeOpacity);
    alpha = mix(alpha, 1.0, foam * 0.6);
    var depthOpacity = clamp(surface.depth * 0.05, 0.0, 0.3);
    alpha = mix(alpha, 1.0, depthOpacity);
    alpha = clamp(alpha, 0.1, 1.0);

    // === DEBUG MODE ===
    if debug.mode != 0u {
        switch (debug.mode) {
            case 1u: { return vec4f(vec3f(surface.depth * debug.intensity * 0.1), 1.0); }
            case 2u: { return vec4f(vec3f(surface.thickness * debug.intensity * 0.2), 1.0); }
            case 3u: { return vec4f(0.5 * surface.normal + 0.5, 1.0); }
            case 4u: { return vec4f(vec3f((1.0 - length(absorption)) * debug.intensity), 1.0); }
            case 5u: { return vec4f(vec3f(physics.velocityMagnitude * debug.intensity), 1.0); }
            case 6u: { return vec4f(vec3f(physics.density * debug.intensity * 0.1), 1.0); }            case 8u: { return vec4f(vec3f(fresnel), 1.0); }
            case 9u: { return vec4f(vec3f(caustics * debug.intensity), 1.0); }
            default: {
                // Return normal final color instead of error color
                return vec4f(finalColor, alpha);
            }
        }
    }

    return vec4f(finalColor, alpha);
}
