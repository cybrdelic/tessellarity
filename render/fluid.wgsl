// MODULAR FLUID SHADER - Clean separation of concerns
// Each effect is independent and can be toggled/modified without affecting others

// --- Brightness Control Additions ---
// Added attenuation & normalization constants to prevent rim lighting and subsurface scattering blowout.
// SUBSURFACE_THICKNESS_SCALE controls how quickly thickness saturates (exp falloff). Adjust to tune translucency.
// MAX_SUBSURFACE_CONTRIB clamps per-light subsurface accumulation before summing other channels.
// RIM_COMBINED_MAX limits combined (effect * control) rim intensity.
// SIMPLE_TONEMAP toggles a lightweight Reinhard tone map at end of composition.
const SUBSURFACE_THICKNESS_SCALE : f32 = 0.6;
const MAX_SUBSURFACE_CONTRIB : f32 = 1.1;
const RIM_COMBINED_MAX : f32 = 1.0;
const SIMPLE_TONEMAP : bool = true;
// Coverage & energy management additions
const COVERAGE_SMOOTHING_STRENGTH : f32 = 0.6; // How strongly to smooth shading in sparse regions
const COVERAGE_SPECULAR_SCALE_MIN : f32 = 0.4; // Minimum specular scaling under low coverage
const COVERAGE_RIM_SCALE_MIN : f32 = 0.5;      // Minimum rim scaling under low coverage
const LUM_KNEE_START : f32 = 0.9;              // Luminance knee start for energy budget
const LUM_KNEE_SLOPE : f32 = 2.5;              // Knee softness / slope control
// Hole fill & continuity controls
const HOLE_FILL_STRENGTH : f32 = 0.55;         // Base strength for color infill in sparse regions
const HOLE_FILL_THICKNESS_BIAS : f32 = 0.35;   // Bias added to thickness when reconstructing in sparse areas
const EDGE_SOFTEN_THRESHOLD : f32 = 0.18;      // Threshold for enhancing thin edge continuity
const PURPLE_HUE_SUPPRESS : f32 = 0.2;         // Intensity for neutralizing overstated purple tint

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
    @align(8) texel_size: vec2f,
    sphere_size: f32,
    padding0: f32,
    @align(16) inv_projection_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_matrix: mat4x4<f32>,
    inv_view_matrix: mat4x4<f32>,
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
    @builtin(position) pos: vec4f }

// Derive clamped integer pixel coords & normalized uv
fn deriveCoords(pos: vec4f, dims: vec2u) -> vec2u {
    let maxF = vec2f(f32(dims.x - 1u), f32(dims.y - 1u));
    let clamped = clamp(pos.xy, vec2f(0.0), maxF);
    return vec2u(clamped);
}

// === MODULAR DATA STRUCTURES ===
struct SurfaceData {
    position: vec3f,
    normal: vec3f,
    thickness: f32,
    depth: f32,
    rayDir: vec3f,
    viewDotNormal: f32,
    coverage: f32,
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
    let maxCoord = vec2f(f32(texture_dims.x - 1u), f32(texture_dims.y - 1u));
    var clamped_coords = clamp(coords, vec2f(0.0), maxCoord);
    return textureLoad(thickness_texture, vec2u(clamped_coords), 0).r;
}

fn createSurfaceData(uv: vec2f, iuv: vec2f) -> SurfaceData {
    var surface: SurfaceData;

    var depth = abs(textureLoad(texture, vec2u(iuv), 0).r);
    surface.position = computeViewPosFromUVDepth(uv, depth);
    surface.depth = abs(surface.position.z);
    surface.rayDir = normalize(surface.position);

    // Calculate smooth surface normal
    var ddx = getViewPosFromTexCoord(uv + vec2f(uniforms.texel_size.x, 0.), iuv + vec2f(1.0, 0.0)) - surface.position;
    var ddy = getViewPosFromTexCoord(uv + vec2f(0., uniforms.texel_size.y), iuv + vec2f(0.0, 1.0)) - surface.position;
    var ddx2 = surface.position - getViewPosFromTexCoord(uv + vec2f(-uniforms.texel_size.x, 0.), iuv + vec2f(-1.0, 0.0));
    var ddy2 = surface.position - getViewPosFromTexCoord(uv + vec2f(0., -uniforms.texel_size.y), iuv + vec2f(0.0, -1.0));

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

    // Extended neighborhood sampling for continuity (9-tap + diagonals)
    let center = textureLoad(thickness_texture, vec2u(iuv), 0).r;
    let L  = safeThicknessSample(iuv + vec2f(-1.0, 0.0));
    let R  = safeThicknessSample(iuv + vec2f(1.0, 0.0));
    let U  = safeThicknessSample(iuv + vec2f(0.0, -1.0));
    let D  = safeThicknessSample(iuv + vec2f(0.0, 1.0));
    let UL = safeThicknessSample(iuv + vec2f(-1.0, -1.0));
    let UR = safeThicknessSample(iuv + vec2f(1.0, -1.0));
    let DL = safeThicknessSample(iuv + vec2f(-1.0, 1.0));
    let DR = safeThicknessSample(iuv + vec2f(1.0, 1.0));

    var weightedSum = center * 4.0 + (L + R + U + D) * 2.0 + (UL + UR + DL + DR) * 1.0;
    var weightTotal = 4.0 + 4.0 * 2.0 + 4.0 * 1.0; // 4 + 8 + 4 = 16
    var neighborhoodAvg = weightedSum / weightTotal;

    // Compute occupancy coverage across all 9 + center taps (counts > threshold)
    var occ = 0.0;
    occ += step(0.02, center);
    occ += step(0.02, L);
    occ += step(0.02, R);
    occ += step(0.02, U);
    occ += step(0.02, D);
    occ += step(0.02, UL);
    occ += step(0.02, UR);
    occ += step(0.02, DL);
    occ += step(0.02, DR);
    surface.coverage = occ / 9.0;

    // Adaptive smoothing: stronger in sparse regions (prevents speckle)
    let sparse = 1.0 - surface.coverage;
    let adaptiveBlend = mix(0.65, 0.9, sparse); // more smoothing when sparse
    var smoothedThickness = mix(center, neighborhoodAvg, adaptiveBlend);
    // Edge softening: if center thin but surrounded -> bias upward
    if (center < EDGE_SOFTEN_THRESHOLD && surface.coverage > 0.5) {
        smoothedThickness = mix(smoothedThickness, smoothedThickness + HOLE_FILL_THICKNESS_BIAS, 0.5 * (surface.coverage - 0.5));
    }
    surface.thickness = smoothedThickness;

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
    // Exponential thickness normalization: approaches 1.0 as physical thickness grows
    let tNorm = 1.0 - exp(-surface.thickness * SUBSURFACE_THICKNESS_SCALE);
    // Mild view-angle weighting to avoid front-face blowout
    let viewAtten = clamp(surface.viewDotNormal * 1.2, 0.25, 1.0);
    var subsurface = vec3f(0.0);

    if lighting.mainLightIntensity > 0.0 {
        let backLighting = max(0.0, dot(-lighting.mainLightDir, surface.normal));
        subsurface += lighting.mainLightColor * backLighting * tNorm * subsurfaceIntensity * lighting.mainLightIntensity;
    }
    if lighting.fillLightIntensity > 0.0 {
        let backLighting = max(0.0, dot(-lighting.fillLightDir, surface.normal));
        subsurface += lighting.fillLightColor * backLighting * tNorm * subsurfaceIntensity * lighting.fillLightIntensity * 0.45; // slight reduction
    }
    if lighting.rimLightIntensity > 0.0 {
        let backLighting = max(0.0, dot(-lighting.rimLightDir, surface.normal));
        subsurface += lighting.rimLightColor * backLighting * tNorm * subsurfaceIntensity * lighting.rimLightIntensity * 0.25;
    }
    // Clamp to avoid runaway HDR prior to composition
    subsurface = min(subsurface, vec3f(MAX_SUBSURFACE_CONTRIB)) * viewAtten;
    return subsurface;
}

fn calculateRimLighting(surface: SurfaceData, lighting: LightingEnvironment, rimPower: f32, rimIntensity: f32) -> vec3f {
    // Increase rimPower minimum to keep highlight thinner and dimmer
    let effectivePower = max(rimPower, 1.4);
    var fresnel = pow(1.0 - surface.viewDotNormal, effectivePower);
    // Combine user strength & lighting control; clamp overall
    let combinedStrength = min(rimIntensity * lighting.rimLightIntensity, RIM_COMBINED_MAX);
    if combinedStrength <= 0.0 { return vec3f(0.0); }
    var rim = vec3f(0.0);

    if lighting.mainLightIntensity > 0.0 {
        let lightAlignment = max(0.0, dot(surface.normal, -lighting.mainLightDir));
        rim += lighting.mainLightColor * fresnel * lightAlignment * combinedStrength * lighting.mainLightIntensity * 0.7; // reduced from 1.0
    }
    if lighting.fillLightIntensity > 0.0 {
        let lightAlignment = max(0.0, dot(surface.normal, -lighting.fillLightDir));
        rim += lighting.fillLightColor * fresnel * lightAlignment * combinedStrength * lighting.fillLightIntensity * 0.4; // reduced from 0.6
    }
    if lighting.rimLightIntensity > 0.0 {
        let lightAlignment = max(0.0, dot(surface.normal, -lighting.rimLightDir));
        rim += lighting.rimLightColor * fresnel * lightAlignment * combinedStrength * 0.5; // was 0.7 and double-counted intensity
    }

    // Soft clamp: Reinhard-like per-channel before returning
    rim = rim / (vec3f(1.0) + rim);
    return rim;
}

// Energy budget knee to gently compress extreme HDR before tone mapping
fn applyEnergyBudget(color: vec3f) -> vec3f {
    let lum = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    if lum <= LUM_KNEE_START { return color; }
    let excess = lum - LUM_KNEE_START;
    let compressed = LUM_KNEE_START + excess / (1.0 + excess / LUM_KNEE_SLOPE);
    let scale = compressed / lum;
    return color * scale;
}

// --- ADDITIONAL CONTINUITY HELPERS ------------------------------------------------------------
// Heavier neighborhood sampling (5x5 approximate using two radii) for low coverage regions.
fn continuityEnhancedThickness(centerCoord: vec2f, centerValue: f32, coverage: f32) -> f32 {
    // If already dense, keep original.
    if coverage > 0.9 { return centerValue; }
    // Gather 1-ring & 2-ring samples (Manhattan & diagonals) with diminishing weights.
    var sum = centerValue * 8.0;
    var weight = 8.0;
    // 1-ring (weight 4)
    for (var ox: i32 = -1; ox <= 1; ox = ox + 1) {
        for (var oy: i32 = -1; oy <= 1; oy = oy + 1) {
            if !(ox == 0 && oy == 0) {
                let w = 4.0;
                sum += safeThicknessSample(centerCoord + vec2f(f32(ox), f32(oy))) * w;
                weight += w;
            }
        }
    }
    // 2-ring (weight 1)
    for (var ox2: i32 = -2; ox2 <= 2; ox2 = ox2 + 1) {
        for (var oy2: i32 = -2; oy2 <= 2; oy2 = oy2 + 1) {
            if (abs(ox2) == 2 || abs(oy2) == 2) { // perimeter of 5x5
                let w2 = 1.0;
                sum += safeThicknessSample(centerCoord + vec2f(f32(ox2), f32(oy2))) * w2;
                weight += w2;
            }
        }
    }
    let avg = sum / weight;
    // Blend more aggressively when coverage is low.
    let blend = (1.0 - coverage);
    return mix(centerValue, avg, blend);
}

// Compute a blurred normal for specular/rim lighting decoupled from silhouette normal.
fn computeBlurredNormal(uv: vec2f, iuv: vec2f, basePos: vec3f) -> vec3f {
    // Larger smoothing factor & wider taps reduce per-particle faceting.
    var accum = vec3f(0.0);
    var count = 0.0;
    // Manually unrolled to satisfy WGSL constant index requirements.
    {
        let off = vec2f(1.0, 0.0);
    let pos = getViewPosFromTexCoord(uv + off * uniforms.texel_size, iuv + off);
    let pos2 = getViewPosFromTexCoord(uv - off * uniforms.texel_size, iuv - off);
        let grad = pos - pos2;
        accum += normalize(vec3f(-grad.x, -grad.y, grad.z));
        count += 1.0;
    }
    {
        let off = vec2f(-1.0, 0.0);
    let pos = getViewPosFromTexCoord(uv + off * uniforms.texel_size, iuv + off);
    let pos2 = getViewPosFromTexCoord(uv - off * uniforms.texel_size, iuv - off);
        let grad = pos - pos2;
        accum += normalize(vec3f(-grad.x, -grad.y, grad.z));
        count += 1.0;
    }
    {
        let off = vec2f(0.0, 1.0);
    let pos = getViewPosFromTexCoord(uv + off * uniforms.texel_size, iuv + off);
    let pos2 = getViewPosFromTexCoord(uv - off * uniforms.texel_size, iuv - off);
        let grad = pos - pos2;
        accum += normalize(vec3f(-grad.x, -grad.y, grad.z));
        count += 1.0;
    }
    {
        let off = vec2f(0.0, -1.0);
    let pos = getViewPosFromTexCoord(uv + off * uniforms.texel_size, iuv + off);
    let pos2 = getViewPosFromTexCoord(uv - off * uniforms.texel_size, iuv - off);
        let grad = pos - pos2;
        accum += normalize(vec3f(-grad.x, -grad.y, grad.z));
        count += 1.0;
    }
    {
        let off = vec2f(1.0, 1.0);
    let pos = getViewPosFromTexCoord(uv + off * uniforms.texel_size, iuv + off);
    let pos2 = getViewPosFromTexCoord(uv - off * uniforms.texel_size, iuv - off);
        let grad = pos - pos2;
        accum += normalize(vec3f(-grad.x, -grad.y, grad.z));
        count += 1.0;
    }
    {
        let off = vec2f(-1.0, 1.0);
    let pos = getViewPosFromTexCoord(uv + off * uniforms.texel_size, iuv + off);
    let pos2 = getViewPosFromTexCoord(uv - off * uniforms.texel_size, iuv - off);
        let grad = pos - pos2;
        accum += normalize(vec3f(-grad.x, -grad.y, grad.z));
        count += 1.0;
    }
    {
        let off = vec2f(1.0, -1.0);
    let pos = getViewPosFromTexCoord(uv + off * uniforms.texel_size, iuv + off);
    let pos2 = getViewPosFromTexCoord(uv - off * uniforms.texel_size, iuv - off);
        let grad = pos - pos2;
        accum += normalize(vec3f(-grad.x, -grad.y, grad.z));
        count += 1.0;
    }
    {
        let off = vec2f(-1.0, -1.0);
    let pos = getViewPosFromTexCoord(uv + off * uniforms.texel_size, iuv + off);
    let pos2 = getViewPosFromTexCoord(uv - off * uniforms.texel_size, iuv - off);
        let grad = pos - pos2;
        accum += normalize(vec3f(-grad.x, -grad.y, grad.z));
        count += 1.0;
    }
    var blurred = normalize(accum / max(count, 1.0));
    // Ensure we don't flip vs base view direction
    if (blurred.z * basePos.z < 0.0) { blurred = -blurred; }
    return blurred;
}

fn calculateSpecularWithNormal(surface: SurfaceData, lighting: LightingEnvironment, customNormal: vec3f, specularPower: f32, specularIntensity: f32) -> f32 {
    var specular = 0.0;
    if lighting.mainLightIntensity > 0.0 {
        var H = normalize(lighting.mainLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, customNormal)), specularPower) * specularIntensity * lighting.mainLightIntensity;
    }
    if lighting.fillLightIntensity > 0.0 {
        var H = normalize(lighting.fillLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, customNormal)), specularPower * 0.7) * specularIntensity * 0.4 * lighting.fillLightIntensity;
    }
    if lighting.rimLightIntensity > 0.0 {
        var H = normalize(lighting.rimLightDir - surface.rayDir);
        specular += pow(max(0.0, dot(H, customNormal)), specularPower * 0.5) * specularIntensity * 0.3 * lighting.rimLightIntensity;
    }
    return specular;
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

fn calculateCaustics(surface: SurfaceData, lighting: LightingEnvironment, iuv: vec2f, causticsStrength: f32, causticsScale: f32) -> f32 {
    if causticsStrength <= 0.0 { return 0.0; }

    var thicknessL = safeThicknessSample(iuv + vec2f(-1.0, 0.0));
    var thicknessR = safeThicknessSample(iuv + vec2f(1.0, 0.0));
    var thicknessU = safeThicknessSample(iuv + vec2f(0.0, -1.0));
    var thicknessD = safeThicknessSample(iuv + vec2f(0.0, 1.0));
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
    let dims = textureDimensions(texture);
    let pix = deriveCoords(input.pos, dims);
    let uv = (vec2f(pix) + 0.5) / vec2f(f32(dims.x), f32(dims.y));
    let iuv = vec2f(pix);
    var depth: f32 = abs(textureLoad(texture, pix, 0).r);

    // Early return for non-water pixels
    if depth >= 1e4 || depth <= 0.0 {
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    // === INDEPENDENT CALCULATIONS ===
    var surface = createSurfaceData(uv, iuv);
    // Continuity enhancement: heavier smoothing of thickness for low coverage before lighting.
    let enhancedThickness = continuityEnhancedThickness(iuv, surface.thickness, surface.coverage);
    surface.thickness = enhancedThickness;
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
    var ddx = getViewPosFromTexCoord(uv + vec2f(uniforms.texel_size.x, 0.), iuv + vec2f(1.0, 0.0)) - surface.position;
    var ddy = getViewPosFromTexCoord(uv + vec2f(0., uniforms.texel_size.y), iuv + vec2f(0.0, 1.0)) - surface.position;
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
    caustics = calculateCaustics(surface, lighting, iuv, effectParams.causticsStrength, effectParams.causticsScale);
    }

    // Lighting effects (independent)
    var specular = 0.0;
    var subsurface = vec3f(0.0);
    var rimLighting = vec3f(0.0);
    var reflection = vec3f(0.0);
    // Blurred normal for highlight continuity (keeps silhouettes from blurring)
    let blurredNormal = computeBlurredNormal(uv, iuv, surface.position);

    if effectsToggle.enableSpecular != 0u {
        let specNormal = mix(surface.normal, blurredNormal, 0.6); // stronger smoothing for specular only
        specular = calculateSpecularWithNormal(surface, lighting, specNormal, effectParams.specularPower,
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

    // === CLEAN COLOR COMPOSITION (EARLY INFILL) ===
    let cov = surface.coverage;
    var composedBase = baseColor * depthColor * velocityColor;
    if cov < 0.95 {
        let voidness = 1.0 - cov;
        let fillColor = mix(waterAppearance.color.rgb, lighting.backgroundColor, 0.4);
        // Pre-lighting infill reduces per-particle contrast.
        composedBase = mix(composedBase, fillColor, voidness * HOLE_FILL_STRENGTH);
    }
    var finalColor = composedBase;
    // Coverage-weighted lighting (squared to attenuate more in sparse regions)
    let covLight = cov * cov;
    finalColor += subsurface * covLight;
    finalColor += reflection * covLight;
    let specScale = mix(COVERAGE_SPECULAR_SCALE_MIN, 1.0, cov);
    let rimScale  = mix(COVERAGE_RIM_SCALE_MIN, 1.0, cov);
    finalColor += vec3f(specular * specScale * covLight);
    finalColor += rimLighting * rimScale * covLight;
    finalColor += volumetric;
    finalColor += ambient * cov;

    // Purple hue suppression (empirical neutralization of magenta bias)
    // Detect imbalance where R & B dominate over G leading to purple cast
    let purpleExcess = clamp((finalColor.r + finalColor.b) * 0.5 - finalColor.g, 0.0, 1.0);
    if purpleExcess > 0.0 {
        let neutral = vec3f((finalColor.r + finalColor.g + finalColor.b) / 3.0);
        // Slight push toward teal by boosting green & dampening red/blue equally
        let tealish = neutral * vec3f(0.95, 1.08, 1.02);
        finalColor = mix(finalColor, tealish, purpleExcess * PURPLE_HUE_SUPPRESS);
    }

    // Optional lightweight global tone mapping to tame residual HDR spikes
    finalColor = applyEnergyBudget(finalColor);
    if SIMPLE_TONEMAP {
        finalColor = finalColor / (vec3f(1.0) + finalColor);
    }
    finalColor = clamp(finalColor, vec3f(0.0), vec3f(1.0));

    // Apply color absorption if enabled
    if effectsToggle.enableColorAbsorption != 0u {
        finalColor = calculateColorAbsorption(surface, finalColor, waterAppearance.color.rgb, effectParams.colorAbsorptionDepth);
    }

    // Apply foam
    finalColor = mix(finalColor, vec3f(1.0), foam * 0.8);

    // === TRANSPARENCY CALCULATION ===
    var alpha = waterAppearance.transparency;
    // Use enhanced (smoothed) thickness for more continuous opacity build-up.
    var volumeOpacity = clamp(surface.thickness * 0.9, 0.0, 0.95);
    alpha = mix(alpha, 1.0, volumeOpacity);
    alpha = mix(alpha, 1.0, foam * 0.6);
    var depthOpacity = clamp(surface.depth * 0.05, 0.0, 0.35);
    alpha = mix(alpha, 1.0, depthOpacity);
    // Additional coverage-based lift so sparse regions don't show holes.
    alpha = mix(alpha, 1.0, (1.0 - cov) * 0.5);
    alpha = clamp(alpha, 0.2, 1.0);

    // === DEBUG MODE ===
    if debug.mode != 0u {
        switch (debug.mode) {
            case 1u: { return vec4f(vec3f(surface.depth * debug.intensity * 0.1), 1.0); }
            case 2u: { return vec4f(vec3f(surface.thickness * debug.intensity * 0.2), 1.0); }
            case 3u: { return vec4f(0.5 * surface.normal + 0.5, 1.0); }
            case 4u: { return vec4f(vec3f((1.0 - length(absorption)) * debug.intensity), 1.0); }
            case 5u: { return vec4f(vec3f(physics.velocityMagnitude * debug.intensity), 1.0); }
            case 6u: { return vec4f(vec3f(physics.density * debug.intensity * 0.1), 1.0); }
            case 8u: { return vec4f(vec3f(fresnel), 1.0); }
            case 10u: { // tNorm visualization
                let tNorm = 1.0 - exp(-surface.thickness * SUBSURFACE_THICKNESS_SCALE);
                return vec4f(vec3f(tNorm), 1.0);
            }
            case 11u: { // Rim lighting contribution
                return vec4f(rimLighting, 1.0);
            }
            case 12u: { // Coverage visualization
                return vec4f(vec3f(surface.coverage), 1.0);
            }
            case 13u: { // Hole fill contribution debug (difference visualization)
                let center = finalColor; // already infilled
                // approximate original (remove infill & suppression heuristics) - reuse coverage to scale
                let estOrig = finalColor / (1.0 + (1.0 - cov) * HOLE_FILL_STRENGTH);
                let diff = clamp(center - estOrig, vec3f(0.0), vec3f(1.0));
                return vec4f(diff, 1.0);
            }
            case 9u: { return vec4f(vec3f(caustics * debug.intensity), 1.0); }
            default: {
                // Return normal final color instead of error color
                return vec4f(finalColor, alpha);
            }
        }
    }

    return vec4f(finalColor, alpha);
}
