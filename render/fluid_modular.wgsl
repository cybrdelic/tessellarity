// MODULAR FLUID SHADER - Clean separation of concerns
// Each effect is independent and can be toggled/modified without affecting others

// (Inlined) Previously included effect modules replaced for standalone validation.
// Minimal shared struct set & helpers will be defined locally below.

// Bindings - same as before for compatibility
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

// Keep the same structs for compatibility with existing code
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

// Core uniform & shared structs (mirrored from fluid_clean)
struct RenderUniforms {
    @align(8) texel_size: vec2f,
    sphere_size: f32,
    padding0: f32,
    @align(16) inv_projection_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_matrix: mat4x4<f32>,
    inv_view_matrix: mat4x4<f32>,
}

struct WaterAppearance { color: vec4f, transparency: f32, reflectivity: f32, waveHeight: f32, padding: f32 }
struct DebugUniforms { mode: u32, layer: u32, intensity: f32, padding: f32 }

struct SurfaceData { position: vec3f, normal: vec3f, thickness: f32, depth: f32, rayDir: vec3f, viewDotNormal: f32, coverage: f32 }
struct LightingEnvironment { mainLightDir: vec3f, mainLightColor: vec3f, mainLightIntensity: f32, fillLightDir: vec3f, fillLightColor: vec3f, fillLightIntensity: f32, rimLightDir: vec3f, rimLightColor: vec3f, rimLightIntensity: f32, ambientColor: vec3f, ambientIntensity: f32, backgroundColor: vec3f }
struct PhysicsData { velocity: vec3f, velocityMagnitude: f32, pressure: f32, density: f32, turbulence: f32, cavitation: f32, vorticity: vec3f }

// Basic math helpers
fn computeViewPosFromUVDepth(tex: texture_2d<f32>, uv: vec2f, depth: f32) -> vec3f {
    var ndc: vec4f = vec4f(uv.x * 2.0 - 1.0, 1.0 - 2.0 * uv.y, 0.0, 1.0);
    ndc.z = -uniforms.projection_matrix[2].z + uniforms.projection_matrix[3].z / depth;
    ndc.w = 1.0;
    let eye_pos: vec4f = uniforms.inv_projection_matrix * ndc;
    return eye_pos.xyz / eye_pos.w;
}

fn getViewPosFromTexCoord(uv: vec2f, iuv: vec2f) -> vec3f {
    let d = abs(textureLoad(texture, vec2u(iuv), 0).x);
    return computeViewPosFromUVDepth(texture, uv, d);
}

fn safeThicknessSample(iuv: vec2f) -> f32 {
    let dims = textureDimensions(thickness_texture);
    let maxC = vec2f(f32(dims.x - 1u), f32(dims.y - 1u));
    let c = clamp(iuv, vec2f(0.0), maxC);
    return textureLoad(thickness_texture, vec2u(c), 0).r;
}

fn createSurfaceData(uv: vec2f, iuv: vec2f) -> SurfaceData {
    var s: SurfaceData;
    let depth = abs(textureLoad(texture, vec2u(iuv), 0).r);
    s.position = computeViewPosFromUVDepth(texture, uv, depth);
    s.depth = abs(s.position.z);
    s.rayDir = normalize(s.position);
    var ddx = getViewPosFromTexCoord(uv + vec2f(uniforms.texel_size.x, 0.0), iuv + vec2f(1.0, 0.0)) - s.position;
    var ddy = getViewPosFromTexCoord(uv + vec2f(0.0, uniforms.texel_size.y), iuv + vec2f(0.0, 1.0)) - s.position;
    var ddx2 = s.position - getViewPosFromTexCoord(uv + vec2f(-uniforms.texel_size.x, 0.0), iuv + vec2f(-1.0, 0.0));
    var ddy2 = s.position - getViewPosFromTexCoord(uv + vec2f(0.0, -uniforms.texel_size.y), iuv + vec2f(0.0, -1.0));
    if abs(ddx.z) > abs(ddx2.z) { ddx = ddx2; }
    if abs(ddy.z) > abs(ddy2.z) { ddy = ddy2; }
    let smoothing = 0.65; ddx *= smoothing; ddy *= smoothing; let avg = (ddx + ddy) * 0.5; ddx = mix(ddx, avg, 0.2); ddy = mix(ddy, avg, 0.2);
    s.normal = -normalize(cross(ddx, ddy));
    let t = textureLoad(thickness_texture, vec2u(iuv), 0).r;
    let tL = safeThicknessSample(iuv + vec2f(-1.0, 0.0));
    let tR = safeThicknessSample(iuv + vec2f(1.0, 0.0));
    let tU = safeThicknessSample(iuv + vec2f(0.0, -1.0));
    let tD = safeThicknessSample(iuv + vec2f(0.0, 1.0));
    let smoothT = (t * 4.0 + tL + tR + tU + tD) / 8.0;
    s.thickness = mix(t, smoothT, 0.8);
    s.viewDotNormal = max(dot(s.normal, -s.rayDir), 0.0);
    s.coverage = 1.0;
    return s;
}

// === EFFECT IMPLEMENTATIONS (inlined minimal subset) ===
fn calculateSpecular(surface: SurfaceData, lighting: LightingEnvironment, specularPower: f32, specularIntensity: f32) -> f32 {
    var specular = 0.0;
    if lighting.mainLightIntensity > 0.0 {
        let H = normalize(lighting.mainLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, surface.normal)), specularPower) * specularIntensity * lighting.mainLightIntensity;
    }
    if lighting.fillLightIntensity > 0.0 {
        let H = normalize(lighting.fillLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, surface.normal)), specularPower * 0.7) * specularIntensity * 0.4 * lighting.fillLightIntensity;
    }
    if lighting.rimLightIntensity > 0.0 {
        let H = normalize(lighting.rimLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, surface.normal)), specularPower * 0.5) * specularIntensity * 0.3 * lighting.rimLightIntensity;
    }
    return specular;
}

fn calculateSubsurface(surface: SurfaceData, lighting: LightingEnvironment, subsurfaceIntensity: f32) -> vec3f {
    let tNorm = 1.0 - exp(-surface.thickness * 0.6);
    let viewAtten = clamp(surface.viewDotNormal * 1.2, 0.25, 1.0);
    var subsurface = vec3f(0.0);
    if lighting.mainLightIntensity > 0.0 {
        let backLighting = max(0.0, dot(-lighting.mainLightDir, surface.normal));
        subsurface += lighting.mainLightColor * backLighting * tNorm * subsurfaceIntensity * lighting.mainLightIntensity;
    }
    if lighting.fillLightIntensity > 0.0 {
        let backLighting = max(0.0, dot(-lighting.fillLightDir, surface.normal));
        subsurface += lighting.fillLightColor * backLighting * tNorm * subsurfaceIntensity * lighting.fillLightIntensity * 0.45;
    }
    if lighting.rimLightIntensity > 0.0 {
        let backLighting = max(0.0, dot(-lighting.rimLightDir, surface.normal));
        subsurface += lighting.rimLightColor * backLighting * tNorm * subsurfaceIntensity * lighting.rimLightIntensity * 0.25;
    }
    subsurface = min(subsurface, vec3f(1.1)) * viewAtten;
    return subsurface;
}

fn calculateFresnel(surface: SurfaceData, fresnelPower: f32, fresnelScale: f32, fresnelBias: f32, reflectivity: f32) -> f32 {
    let fresnelEffect = pow(1.0 - surface.viewDotNormal, fresnelPower);
    let fresnel = fresnelEffect * reflectivity * fresnelScale;
    return clamp(fresnel + fresnelBias, 0.0, 0.5);
}

fn calculateAbsorption(surface: SurfaceData, waterColor: vec3f, absorptionStrength: f32, absorptionDepth: f32) -> vec3f {
    var coeffs = vec3f(0.03, 0.025, 0.02) * absorptionStrength;
    let pathLength = surface.thickness * absorptionDepth * 0.05 / max(surface.viewDotNormal, 0.15);
    let attenuation = exp(-coeffs * pathLength);
    return clamp(attenuation, vec3f(0.6), vec3f(1.0));
}

fn calculateTransmission(surface: SurfaceData, waterColor: vec3f, absorptionStrength: f32) -> vec3f {
    if absorptionStrength <= 0.0 { return vec3f(1.0); }
    let opticalPath = surface.thickness * 0.08 / max(surface.viewDotNormal, 0.15);
    let coeffs = vec3f(0.2, 0.08, 0.03) * absorptionStrength;
    return clamp(exp(-coeffs * opticalPath), vec3f(0.7), vec3f(1.0));
}

fn calculateReflection(surface: SurfaceData, lighting: LightingEnvironment, envmap: texture_cube<f32>, sampler: sampler,
    view_matrix: mat4x4<f32>, inv_view_matrix: mat4x4<f32>, reflectionStrength: f32, fresnel: f32) -> vec3f {
    let reflectDir = reflect(surface.rayDir, surface.normal);
    let worldDir = (inv_view_matrix * vec4f(reflectDir, 0.0)).xyz;
    let env = textureSampleLevel(envmap, sampler, worldDir, 0.0).rgb;
    let baseReflection = reflectionStrength * 0.25;
    let totalReflectivity = clamp(baseReflection + fresnel, 0.0, 0.5);
    return env * totalReflectivity;
}

fn calculateCaustics(surface: SurfaceData, lighting: LightingEnvironment, curvatureX: f32, curvatureY: f32,
    causticsStrength: f32, causticsScale: f32) -> f32 {
    let surfaceCurvature = abs(curvatureX) + abs(curvatureY);
    let focus = clamp(surfaceCurvature * causticsScale, 0.0, 1.0);
    var penetration = 0.0;
    if lighting.mainLightIntensity > 0.0 { penetration += max(0.0, -dot(surface.normal, lighting.mainLightDir)) * lighting.mainLightIntensity; }
    if lighting.fillLightIntensity > 0.0 { penetration += max(0.0, -dot(surface.normal, lighting.fillLightDir)) * lighting.fillLightIntensity * 0.5; }
    if lighting.rimLightIntensity > 0.0 { penetration += max(0.0, -dot(surface.normal, lighting.rimLightDir)) * lighting.rimLightIntensity * 0.3; }
    return focus * penetration * causticsStrength;
}

fn calculateDepthColoring(surface: SurfaceData, waterColor: vec3f, sphereSize: f32, depthColorStrength: f32) -> vec3f {
    if depthColorStrength <= 0.0 { return vec3f(1.0); }
    let depthM = surface.depth * sphereSize * 0.1;
    let depthColor = vec3f(exp(-depthM * 0.5), exp(-depthM * 0.15), exp(-depthM * 0.05));
    let tint = mix(vec3f(1.0), waterColor * vec3f(0.3, 0.8, 1.2), clamp(depthM * 0.2, 0.0, 0.8));
    return mix(vec3f(1.0), depthColor * tint, depthColorStrength);
}

fn calculateVelocityColoring(physics: PhysicsData, waterColor: vec3f, velocityColorStrength: f32) -> vec3f {
    if velocityColorStrength <= 0.0 { return vec3f(1.0); }
    let factor = clamp(physics.velocityMagnitude * 0.5, 0.0, 1.0);
    let tint = mix(vec3f(1.0), waterColor, 0.3);
    return mix(vec3f(1.0), tint, factor * velocityColorStrength);
}

fn calculateColorAbsorption(surface: SurfaceData, baseColor: vec3f, waterColor: vec3f, colorAbsorptionDepth: f32, sphereSize: f32) -> vec3f {
    let depthFactor = clamp(surface.depth * 0.15, 0.0, 1.0);
    let absorptionFactors = vec3f(exp(-depthFactor * 0.4), exp(-depthFactor * 0.2), exp(-depthFactor * 0.05));
    var shifted = baseColor * absorptionFactors;
    if depthFactor > 0.8 {
        let coolTint = mix(vec3f(1.0), waterColor * vec3f(0.9,0.95,1.05), 0.1);
        shifted = mix(shifted, shifted * coolTint, (depthFactor - 0.8) * 0.25);
    }
    return mix(baseColor, shifted, depthFactor * 0.3);
}

fn calculateFoam(physics: PhysicsData, cavitation: f32, foamIntensity: f32, foamThreshold: f32) -> f32 {
    let turbulence = physics.velocityMagnitude * 0.05;
    let foam = cavitation * turbulence * foamIntensity;
    return clamp(foam - foamThreshold, 0.0, 1.0);
}

fn calculateFoamColor(baseColor: vec3f, foam: f32, foamColor: vec3f) -> vec3f {
    return mix(baseColor, vec3f(1.0), foam * 0.8);
}

fn calculateReynoldsPhysics(velocity: vec3f, characteristicLength: f32, viscosity: f32, reynoldsScale: f32, turbulenceStrength: f32) -> PhysicsData {
    var physics: PhysicsData;
    physics.velocity = velocity;
    physics.velocityMagnitude = length(velocity);
    let nu = viscosity * 0.001;
    let Re = physics.velocityMagnitude * characteristicLength / nu;
    let onset = 4000.0;
    physics.turbulence = clamp((Re - onset) / onset, 0.0, 1.0) * turbulenceStrength;
    let kol = pow(pow(nu,3.0)/(physics.velocityMagnitude*physics.velocityMagnitude*physics.velocityMagnitude + 1e-6),0.25);
    let cascade = reynoldsScale / (1.0 + kol * 10.0);
    physics.turbulence *= cascade;
    physics.pressure = physics.velocityMagnitude * 0.1;
    physics.density = 1.0 + physics.pressure * 0.3;
    physics.cavitation = 1.0;
    physics.vorticity = vec3f(0.0);
    return physics;
}

fn calculateCavitation(surface: SurfaceData, physics: PhysicsData, cavitationThreshold: f32, cavitationStrength: f32) -> f32 {
    let hydro = surface.depth * 9.81 * 1000.0;
    let dyn = physics.velocityMagnitude * physics.velocityMagnitude * 500.0;
    let total = hydro + dyn;
    return clamp((cavitationThreshold - total) / cavitationThreshold, 0.0, 1.0) * cavitationStrength;
}

fn calculateVorticity(ddx: vec3f, ddy: vec3f, physics: PhysicsData) -> vec3f { return cross(ddx, ddy); }
fn calculateTurbulentSurfaceOffset(surface: SurfaceData, physics: PhysicsData, vorticity: vec3f, waveHeight: f32, normalStrength: f32) -> vec3f {
    return vorticity * physics.turbulence * waveHeight * normalStrength * 0.02;
}

fn calculateRimLighting(surface: SurfaceData, lighting: LightingEnvironment, rimPower: f32, rimIntensity: f32) -> vec3f {
    let effectivePower = max(rimPower, 1.4);
    let combinedStrength = rimIntensity * lighting.rimLightIntensity;
    if combinedStrength <= 0.0 { return vec3f(0.0); }
    let fres = pow(1.0 - surface.viewDotNormal, effectivePower);
    var rim = vec3f(0.0);
    if lighting.mainLightIntensity > 0.0 {
        let align = max(0.0, dot(surface.normal, -lighting.mainLightDir));
        rim += lighting.mainLightColor * fres * align * combinedStrength * lighting.mainLightIntensity * 0.7;
    }
    if lighting.fillLightIntensity > 0.0 {
        let align = max(0.0, dot(surface.normal, -lighting.fillLightDir));
        rim += lighting.fillLightColor * fres * align * combinedStrength * lighting.fillLightIntensity * 0.4;
    }
    if lighting.rimLightIntensity > 0.0 {
        let align = max(0.0, dot(surface.normal, -lighting.rimLightDir));
        rim += lighting.rimLightColor * fres * align * combinedStrength * 0.5;
    }
    return rim / (vec3f(1.0) + rim);
}

fn calculateVolumetricLighting(surface: SurfaceData, lighting: LightingEnvironment, intensity: f32) -> vec3f {
    return lighting.backgroundColor * intensity * (1.0 - surface.viewDotNormal) * 0.5;
}

fn calculateAmbientLighting(surface: SurfaceData, lighting: LightingEnvironment) -> vec3f {
    return lighting.ambientColor * lighting.ambientIntensity;
}

// Create lighting environment from uniforms
fn createLightingEnvironment() -> LightingEnvironment {
    var lighting: LightingEnvironment;

    // Transform light directions to view space
    if lightingControls.mainLightEnabled != 0u {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.mainLightDirection, 0.)).xyz);
        lighting.mainLightColor = lightingControls.mainLightColor;
        lighting.mainLightIntensity = lightingControls.mainLightIntensity;
    } else {
        lighting.mainLightDir = normalize((uniforms.view_matrix * vec4f(0.3, -0.7, -0.6, 0.)).xyz);
        lighting.mainLightColor = vec3f(1.0);
        lighting.mainLightIntensity = 1.0;
    }

    if lightingControls.fillLightEnabled != 0u {
        lighting.fillLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.fillLightDirection, 0.)).xyz);
        lighting.fillLightColor = lightingControls.fillLightColor;
        lighting.fillLightIntensity = lightingControls.fillLightIntensity;
    } else {
        lighting.fillLightDir = normalize((uniforms.view_matrix * vec4f(-0.5, -0.3, 0.8, 0.)).xyz);
        lighting.fillLightColor = vec3f(1.0);
        lighting.fillLightIntensity = 0.0;
    }

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

    // Background color from environment map
    var rayDir = normalize(computeViewPosFromUVDepth(vec2f(0.5), 1000.0)); // already uses current signature
    var worldRayDir = (uniforms.inv_view_matrix * vec4f(rayDir, 0.0)).xyz;
    lighting.backgroundColor = textureSampleLevel(envmap_texture, texture_sampler, worldRayDir, 0.).rgb;

    return lighting;
}

// Screen-Space ABI migration helpers (derive UV/iUV from builtin position)
struct FSIn { @builtin(position) pos: vec4f };

fn computeViewPosFromUVDepth(tex_coord: vec2f, depth: f32) -> vec3f {
    var ndc: vec4f = vec4f(tex_coord.x * 2.0 - 1.0, 1.0 - 2.0 * tex_coord.y, 0.0, 1.0);
    ndc.z = -uniforms.projection_matrix[2].z + uniforms.projection_matrix[3].z / depth;
    ndc.w = 1.0;
    let eye_pos: vec4f = uniforms.inv_projection_matrix * ndc;
    return eye_pos.xyz / eye_pos.w;
}

fn getViewPosFromTexCoord(tex_coord: vec2f, iuv: vec2f) -> vec3f {
    let depth = abs(textureLoad(texture, vec2u(iuv), 0).x);
    return computeViewPosFromUVDepth(tex_coord, depth);
}

fn safeThicknessSample(coords: vec2f) -> f32 {
    let dims = textureDimensions(thickness_texture);
    let maxCoord = vec2f(f32(dims.x - 1u), f32(dims.y - 1u));
    let clamped = clamp(coords, vec2f(0.0), maxCoord);
    return textureLoad(thickness_texture, vec2u(clamped), 0).r;
}

fn createSurfaceData(uv: vec2f, iuv: vec2f) -> SurfaceData {
    var surface: SurfaceData;
    let depth = abs(textureLoad(texture, vec2u(iuv), 0).r);
    surface.position = computeViewPosFromUVDepth(uv, depth);
    surface.depth = abs(surface.position.z);
    surface.rayDir = normalize(surface.position);

    // Gradients for normal
    var ddx = getViewPosFromTexCoord(uv + vec2f(uniforms.texel_size.x, 0.0), iuv + vec2f(1.0, 0.0)) - surface.position;
    var ddy = getViewPosFromTexCoord(uv + vec2f(0.0, uniforms.texel_size.y), iuv + vec2f(0.0, 1.0)) - surface.position;
    var ddx2 = surface.position - getViewPosFromTexCoord(uv + vec2f(-uniforms.texel_size.x, 0.0), iuv + vec2f(-1.0, 0.0));
    var ddy2 = surface.position - getViewPosFromTexCoord(uv + vec2f(0.0, -uniforms.texel_size.y), iuv + vec2f(0.0, -1.0));
    if abs(ddx.z) > abs(ddx2.z) { ddx = ddx2; }
    if abs(ddy.z) > abs(ddy2.z) { ddy = ddy2; }
    let smoothing = 0.65;
    ddx *= smoothing; ddy *= smoothing;
    let avg = (ddx + ddy) * 0.5;
    ddx = mix(ddx, avg, 0.2); ddy = mix(ddy, avg, 0.2);
    surface.normal = -normalize(cross(ddx, ddy));

    // Thickness & smoothing
    let thickness = textureLoad(thickness_texture, vec2u(iuv), 0).r;
    let tL = safeThicknessSample(iuv + vec2f(-1.0, 0.0));
    let tR = safeThicknessSample(iuv + vec2f(1.0, 0.0));
    let tU = safeThicknessSample(iuv + vec2f(0.0, -1.0));
    let tD = safeThicknessSample(iuv + vec2f(0.0, 1.0));
    let smoothed = (thickness * 4.0 + tL + tR + tU + tD) / 8.0;
    surface.thickness = mix(thickness, smoothed, 0.8);
    surface.viewDotNormal = max(dot(surface.normal, -surface.rayDir), 0.0);
    surface.coverage = 1.0;
    return surface;
}

@fragment
fn fs(input: FSIn) -> @location(0) vec4f {
    let dims = textureDimensions(texture);
    let maxPix = vec2f(f32(dims.x - 1u), f32(dims.y - 1u));
    let pixF = clamp(floor(input.pos.xy), vec2f(0.0), maxPix);
    let pix = vec2u(pixF);
    let iuv = vec2f(pix);
    let uv = (pixF + 0.5) / vec2f(f32(dims.x), f32(dims.y));
    var depth: f32 = abs(textureLoad(texture, pix, 0).r);

    // Early return for non-water pixels
    if depth >= 1e4 || depth <= 0.0 {
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    // === SURFACE COMPUTATION (Independent) ===
    var surface = createSurfaceData(uv, iuv);

    // === LIGHTING ENVIRONMENT (Independent) ===
    var lighting = createLightingEnvironment();

    // === PHYSICS CALCULATIONS (Independent) ===
    var physics: PhysicsData;
    var foam = 0.0;
    var cavitation = 1.0;

    if effectsToggle.enableReynoldsPhysics != 0u {
        // Calculate velocity from surface gradients
    var ddx = getViewPosFromTexCoord(uv + vec2f(uniforms.texel_size.x, 0.0), iuv + vec2f(1.0, 0.0)) - surface.position;
    var ddy = getViewPosFromTexCoord(uv + vec2f(0.0, uniforms.texel_size.y), iuv + vec2f(0.0, 1.0)) - surface.position;

        var velocity = vec3f(length(ddx), length(vec3f(ddx.y, ddy.y, 0.0)), length(ddy));
        physics = calculateReynoldsPhysics(velocity, uniforms.sphere_size, effectParams.viscosityFactor,
                                         effectParams.reynoldsScale, effectParams.turbulenceStrength);

        // Calculate vorticity
        physics.vorticity = calculateVorticity(ddx, ddy, physics);

        // Apply turbulent normal perturbation if enabled
        if effectsToggle.enableTurbulentNormals != 0u {
            var surfaceOffset = calculateTurbulentSurfaceOffset(surface, physics, physics.vorticity,
                                                              waterAppearance.waveHeight, effectParams.normalStrength);
            var perturbedNormal = normalize(surface.normal + surfaceOffset * 0.15);
            if dot(perturbedNormal, surface.normal) >= 0.6 {
                surface.normal = mix(surface.normal, perturbedNormal, 0.08);
                surface.viewDotNormal = max(dot(surface.normal, -surface.rayDir), 0.0);
            }
        }
    }

    if effectsToggle.enableCavitation != 0u {
        cavitation = calculateCavitation(surface, physics, effectParams.cavitationThreshold, effectParams.cavitationStrength);
    }

    if effectsToggle.enableFoam != 0u {
        foam = calculateFoam(physics, cavitation, effectParams.foamIntensity, effectParams.foamThreshold);
    }

    // === OPTICAL EFFECTS (Independent) ===
    var fresnel = 0.0;
    var absorption = vec3f(1.0);
    var transmission = vec3f(1.0);
    var caustics = 0.0;

    if effectsToggle.enableFresnel != 0u {
        fresnel = calculateFresnel(surface, effectParams.fresnelPower, effectParams.fresnelScale,
                                 effectParams.fresnelBias, waterAppearance.reflectivity);
    }

    if effectsToggle.enableAbsorption != 0u {
        absorption = calculateAbsorption(surface, waterAppearance.color.rgb, effectParams.absorptionStrength, effectParams.absorptionDepth);
        transmission = calculateTransmission(surface, waterAppearance.color.rgb, effectParams.absorptionStrength);
    }

    if effectsToggle.enableCaustics != 0u {
        // Calculate surface curvature for caustics
    var thicknessL = safeThicknessSample(iuv + vec2f(-1.0, 0.0));
    var thicknessR = safeThicknessSample(iuv + vec2f(1.0, 0.0));
    var thicknessU = safeThicknessSample(iuv + vec2f(0.0, -1.0));
    var thicknessD = safeThicknessSample(iuv + vec2f(0.0, 1.0));
        var curvatureX = (thicknessR + thicknessL - 2.0 * surface.thickness) * 0.5;
        var curvatureY = (thicknessD + thicknessU - 2.0 * surface.thickness) * 0.5;

        caustics = calculateCaustics(surface, lighting, curvatureX, curvatureY,
                                   effectParams.causticsStrength, effectParams.causticsScale);
    }

    // === LIGHTING CALCULATIONS (Independent) ===
    var specular = 0.0;
    var subsurface = vec3f(0.0);
    var rimLighting = vec3f(0.0);
    var volumetricLighting = vec3f(0.0);
    var reflection = vec3f(0.0);

    if effectsToggle.enableSpecular != 0u {
        specular = calculateSpecular(surface, lighting, effectParams.specularPower,
                                   effectParams.specularScale * lightingControls.specularIntensityMultiplier);
        specular *= (1.0 - foam * 0.7); // Foam reduces specular
    }

    if effectsToggle.enableSubsurface != 0u {
        var subsurfaceIntensity = effectParams.subsurfaceScale * lightingControls.subsurfaceIntensityMultiplier;
    // Exponential thickness normalization for stable subsurface
    let tNorm = 1.0 - exp(-surface.thickness * 0.6);
    var rawSubsurface = calculateSubsurface(surface, lighting, subsurfaceIntensity);
    subsurface = min(rawSubsurface * tNorm, vec3f(1.1));
    }

    if effectsToggle.enableRimLighting != 0u {
    let combinedStrength = min(effectParams.rimLightStrength * lighting.rimLightIntensity, 1.0);
    var rawRim = calculateRimLighting(surface, lighting, max(effectParams.rimLightPower, 1.4), combinedStrength);
    rimLighting = rawRim / (vec3f(1.0) + rawRim); // per-channel soft clamp
    }

    // Always calculate volumetric and ambient
    volumetricLighting = calculateVolumetricLighting(surface, lighting, lightingControls.volumetricIntensity);
    volumetricLighting += caustics * lighting.backgroundColor * 0.3; // Add caustics to volumetric

    var ambientLighting = calculateAmbientLighting(surface, lighting);

    if effectsToggle.enableReflection != 0u {
        reflection = calculateReflection(surface, lighting, envmap_texture, texture_sampler,
                                       uniforms.view_matrix, uniforms.inv_view_matrix,
                                       effectParams.reflectionStrength, fresnel);
    }

    // === COLOR CALCULATIONS (Independent) ===
    var baseColor = waterAppearance.color.rgb * absorption;

    var depthColor = vec3f(1.0);
    if effectsToggle.enableDepthColoring != 0u {
        depthColor = calculateDepthColoring(surface, waterAppearance.color.rgb, uniforms.sphere_size, effectParams.depthColorStrength);
    }

    var velocityColor = vec3f(1.0);
    if effectsToggle.enableVelocityColoring != 0u {
        velocityColor = calculateVelocityColoring(physics, waterAppearance.color.rgb, effectParams.velocityColorStrength);
    }

    // === FINAL COLOR COMPOSITION (Clean combination) ===
    var finalColor = baseColor * depthColor * velocityColor;
    finalColor += subsurface;
    finalColor += reflection;
    finalColor += vec3f(specular);
    finalColor += rimLighting;
    finalColor += volumetricLighting;
    finalColor += ambientLighting;
    // Lightweight tone map
    finalColor = finalColor / (vec3f(1.0) + finalColor);
    finalColor = clamp(finalColor, vec3f(0.0), vec3f(1.0));

    // Apply color absorption if enabled
    if effectsToggle.enableColorAbsorption != 0u {
        finalColor = calculateColorAbsorption(surface, finalColor, waterAppearance.color.rgb,
                                            effectParams.colorAbsorptionDepth, uniforms.sphere_size);
    }

    // Apply foam
    finalColor = calculateFoamColor(finalColor, foam, vec3f(1.0));

    // === TRANSPARENCY CALCULATION (Independent) ===
    var alpha = waterAppearance.transparency;

    // Physics-based alpha
    if effectsToggle.enableAbsorption != 0u {
        var transmissionLuminance = dot(transmission, vec3f(0.299, 0.587, 0.114));
        alpha = mix(alpha, transmissionLuminance, 0.7);
        finalColor *= transmission; // Apply transmission to color
    }

    // Volume and foam opacity
    var volumeOpacity = clamp(surface.thickness * 0.8, 0.0, 0.9);
    alpha = mix(alpha, 1.0, volumeOpacity);
    alpha = mix(alpha, 1.0, foam * 0.6);

    // Depth opacity
    var depthOpacity = clamp(surface.depth * 0.05, 0.0, 0.3);
    alpha = mix(alpha, 1.0, depthOpacity);

    alpha = clamp(alpha, 0.1, 1.0);

    // === DEBUG MODE (Independent) ===
    if debug.mode != 0u {
        return debugVisualization(debug, surface, physics, absorption, fresnel, caustics, finalColor);
    }

    return vec4f(finalColor, alpha);
}

// Debug visualization function
fn debugVisualization(debug: DebugUniforms, surface: SurfaceData, physics: PhysicsData,
                     absorption: vec3f, fresnel: f32, caustics: f32, finalColor: vec3f) -> vec4f {
    switch (debug.mode) {
        case 1u: { // DEPTH
            let normalizedDepth = surface.depth * debug.intensity * 0.1;
            return vec4f(vec3f(normalizedDepth), 1.0);
        }
        case 2u: { // THICKNESS
            let thicknessVis = surface.thickness * physics.density * debug.intensity * 0.2;
            return vec4f(vec3f(thicknessVis), 1.0);
        }
        case 3u: { // NORMALS
            return vec4f(0.5 * surface.normal + 0.5, 1.0);
        }
        case 4u: { // ABSORPTION
            let absorptionVis = (1.0 - length(absorption)) * debug.intensity;
            return vec4f(vec3f(absorptionVis), 1.0);
        }
        case 5u: { // VELOCITY
            let velocityVis = physics.velocityMagnitude * debug.intensity;
            return vec4f(vec3f(velocityVis), 1.0);
        }
        case 6u: { // PRESSURE
            let pressureVis = physics.density * debug.intensity * 0.1;
            return vec4f(vec3f(pressureVis), 1.0);
        }
        case 8u: { // FRESNEL
            return vec4f(vec3f(fresnel), 1.0);
        }
        case 9u: { // CAUSTICS
            let causticsVis = caustics * debug.intensity;
            return vec4f(vec3f(causticsVis), 1.0);
        }
        default: {
            return vec4f(1.0, 0.0, 1.0, 1.0); // Error color
        }
    }
}
