// Surface-based fluid composition shader: now integrates full effect toggle system
// Consumes reconstructed surface texture (normals/thickness/coverage) and applies
// physically-inspired shading (GGX microfacet + optional effects) under toggles.

// -----------------------------------------------------------------------------
// Constants & shaping parameters
const MIN_COV: f32 = 0.05;      // allow very low coverage without force-thick fringe
const COV_GAMMA: f32 = 0.8;     // closer to linear to avoid hazy lift
const COV_POWER: f32 = 1.0;     // linear gate (remove rim dark band)
const K_TAU: f32 = 26.0;        // Optical density constant for alpha
const TURBIDITY_K: f32 = 1.9;   // Exponential scattering coefficient for in-water fog
const TURBIDITY_COLOR: vec3f = vec3f(0.08, 0.18, 0.28); // More neutral deep water tint to reduce global blue cast
// (Deprecated) TRANSMISSION_GRAZE_FALLOFF replaced by physically-driven Fresnel + path attenuation
// Physically-plausible water parameters (approximate)
const BASE_WATER_F0: f32 = 0.02;    // dielectric F0 for water (2%)
const MAX_USER_F0_SCALE: f32 = 2.0; // allow user reflectivity scaling up to ~4% (still non-metallic)
const MIN_ROUGHNESS: f32 = 0.02;
const DEBUG_MODE_OVERRIDE: u32 = 0u; // >0 forces debug mode

// -----------------------------------------------------------------------------
// Mirror of shared structures (subset) (duplicated to avoid include system)
struct WaterAppearance { color: vec4f, transparency: f32, reflectivity: f32, waveHeight: f32, padding: f32 }
struct DebugUniforms { mode: u32, layer: u32, intensity: f32, padding: f32 }
// Camera / transform uniforms (subset of RenderUniforms used elsewhere)
struct RenderUniforms {
  @align(8) texel_size: vec2f,
  sphere_size: f32,
  padding0: f32,
  @align(16) inv_projection_matrix: mat4x4<f32>,
  projection_matrix: mat4x4<f32>,
  view_matrix: mat4x4<f32>,
  inv_view_matrix: mat4x4<f32>,
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
  enableVarianceLightTransport: u32,
}
struct LightingControls {
  mainLightDirection: vec3f, mainLightIntensity: f32,
  mainLightColor: vec3f,     mainLightEnabled: u32,
  fillLightDirection: vec3f, fillLightIntensity: f32,
  fillLightColor: vec3f,     fillLightEnabled: u32,
  rimLightDirection: vec3f,  rimLightIntensity: f32,
  rimLightColor: vec3f,      rimLightEnabled: u32,
  ambientIntensity: f32, ambientColor: vec3f,
  shadowIntensity: f32, lightingMode: u32,
  specularIntensityMultiplier: f32, subsurfaceIntensityMultiplier: f32,
  lightingPower: f32, lightingContrast: f32,
  volumetricIntensity: f32, rimLightingPower: f32,
  lightingPadding1: f32, lightingPadding2: f32,
  lightingPadding3: f32, lightingPadding4: f32,
}
struct EffectParameters {
  reynoldsScale: f32, turbulenceStrength: f32, viscosityFactor: f32, cascadeEffect: f32,
  cavitationThreshold: f32, cavitationStrength: f32, pressureScale: f32, cavitationFalloff: f32,
  foamIntensity: f32, foamThreshold: f32, foamDecay: f32, foamCoverage: f32,
  normalStrength: f32, normalScale: f32, normalSmoothness: f32, normalStability: f32,
  specularPower: f32, specularScale: f32, specularRoughness: f32, specularFresnel: f32,
  subsurfaceDepth: f32, subsurfaceScale: f32, subsurfaceColor: f32, subsurfaceDistortion: f32,
  fresnelPower: f32, fresnelScale: f32, fresnelBias: f32, fresnelContrast: f32,
  reflectionStrength: f32, reflectionBlur: f32, reflectionDistortion: f32, reflectionFade: f32,
  refractionStrength: f32, refractionIndex: f32, refractionChromatic: f32, refractionScale: f32,
  causticsStrength: f32, causticsScale: f32, causticsSpeed: f32, causticsContrast: f32,
  absorptionStrength: f32, absorptionDepth: f32, absorptionColor: f32, absorptionScattering: f32,
  depthColorStrength: f32, depthColorScale: f32, depthColorContrast: f32, depthColorSaturation: f32,
  velocityColorStrength: f32, velocityColorScale: f32, velocityColorContrast: f32, velocityColorThreshold: f32,
  rimLightStrength: f32, rimLightPower: f32, rimLightScale: f32, rimLightContrast: f32,
  colorAbsorptionRed: f32, colorAbsorptionGreen: f32, colorAbsorptionBlue: f32, colorAbsorptionDepth: f32,
  varianceSamples: f32, varianceStrength: f32, varianceRadius: f32, varianceThreshold: f32,
  padding1: f32, padding2: f32, padding3: f32, padding4: f32,
}
struct CompositionParams {
  lightingBlendMode: u32, opticalBlendMode: u32, colorBlendMode: u32,
  lightingGlobalMultiplier: f32, opticalGlobalMultiplier: f32, colorGlobalMultiplier: f32, physicsGlobalMultiplier: f32,
  baseColorWeight: f32, specularWeight: f32, subsurfaceWeight: f32, reflectionWeight: f32,
  padding1: f32, padding2: f32, padding3: f32, padding4: f32,
}
// Additional transmission weighting (separate from reflection weight) kept in a small uniform for minimal risk.
struct TransmissionParams { transmissionWeight: f32, paddingA: f32, paddingB: f32, paddingC: f32 }
// Sphere containment parameters (center.xyz, radius, enabled flag packed in w of center)
struct SphereContain { center: vec3f, radius: f32, enabled: u32, paddingA: u32, paddingB: u32, paddingC: u32 }

// Optional wind parameters (fallback to main light dir if no dedicated uniform yet)
const DEFAULT_WIND_DIR: vec3f = vec3f(0.8, 0.0, 0.2);

// -----------------------------------------------------------------------------
// Bindings
@group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms; // newly added for world normal reconstruction
@group(0) @binding(2) var height_texture: texture_2d<f32>; // height + dH/dx + dH/dy + coverage
@group(0) @binding(3) var surface_texture: texture_2d<f32>; // reconstructed
@group(0) @binding(4) var envmap_texture: texture_cube<f32>;
@group(0) @binding(5) var<uniform> waterAppearance: WaterAppearance;
@group(0) @binding(6) var<uniform> debug: DebugUniforms;
@group(0) @binding(7) var<uniform> effectsToggle: EffectsToggle;
@group(0) @binding(8) var<uniform> lightingControls: LightingControls;
@group(0) @binding(9) var<uniform> effectParameters: EffectParameters;
@group(0) @binding(10) var<uniform> compositionParams: CompositionParams;
@group(0) @binding(11) var physicalTex: texture_2d<f32>; // slope, curvature, foam candidate, cov
@group(0) @binding(12) var foamAccumTex: texture_2d<f32>; // temporally accumulated foam (R in .r)
@group(0) @binding(13) var velocityTex: texture_2d<f32>; // xy velocity (screen/world projected) for stabilization
@group(0) @binding(14) var backgroundTex: texture_2d<f32>; // scene color buffer pre-water
@group(0) @binding(15) var<uniform> transmissionParams: TransmissionParams;
@group(0) @binding(16) var<uniform> sphereContain: SphereContain;

struct FragmentInput {
  @location(0) uv: vec2f,
  @location(1) iuv: vec2f, // legacy (not used for primary pixel address anymore)
  @builtin(position) pos: vec4f,
}

fn unpackOctahedral(p: vec2f) -> vec3f {
  var f = p * 2.0 - 1.0;
  var n = vec3f(f, 1.0 - abs(f.x) - abs(f.y));
  let t = clamp(-n.z, 0.0, 1.0);
  n.x += select(0.0, -sign(n.x), n.z < 0.0) * t;
  n.y += select(0.0, -sign(n.y), n.z < 0.0) * t;
  n = normalize(n);
  // Guard against NaNs / degeneracy
  // WGSL does not yet expose isFinite() in all environments; emulate by rejecting NaNs/Infs via comparisons
  if (any(n != n) || any(abs(n) > vec3f(1e6)) || length(n) < 1e-4) {
    return vec3f(0.0, 0.0, 1.0);
  }
  return n;
}

// GGX helpers ----------------------------------------------------------------
fn saturate(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn D_GGX(NoH: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = (NoH * NoH) * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d + 1e-6);
}
fn G_Smith(NoV: f32, NoL: f32, a: f32) -> f32 {
  let k = (a + 1.0);
  let k2 = (k*k) / 8.0; // UE style approx
  let gV = NoV / (NoV * (1.0 - k2) + k2);
  let gL = NoL / (NoL * (1.0 - k2) + k2);
  return gV * gL;
}
fn Fresnel_Schlick(cosTheta: f32, F0: vec3f, power: f32, scale: f32, bias: f32, contrast: f32) -> vec3f {
  let fres = F0 + (1.0 - F0) * pow(1.0 - cosTheta, power);
  let adj = clamp(fres * scale + vec3f(bias), vec3f(0.0), vec3f(1.0));
  let centered = adj - vec3f(0.5);
  let contrasted = centered * contrast + vec3f(0.5);
  return clamp(contrasted, vec3f(0.0), vec3f(1.0));
}

// Exact unpolarized Fresnel for dielectric interface (air -> medium) using Snell.
fn fresnel_dielectric(cosThetaI: f32, eta: f32) -> f32 {
  let ct = clamp(cosThetaI, -1.0, 1.0);
  var ei = 1.0;
  var et = eta;
  var cosI = ct;
  var entering = cosI > 0.0;
  if (!entering) { // swap if viewing from below surface
    cosI = abs(cosI);
    let tmp = ei; ei = et; et = tmp;
  }
  let etaRel = ei / et;
  let sin2T = etaRel * etaRel * max(0.0, 1.0 - cosI * cosI);
  if (sin2T > 1.0) { return 1.0; } // total internal reflection
  let cosT = sqrt(max(0.0, 1.0 - sin2T));
  let Rs_num = (et * cosI) - (ei * cosT);
  let Rs_den = (et * cosI) + (ei * cosT) + 1e-6;
  let Rp_num = (ei * cosI) - (et * cosT);
  let Rp_den = (ei * cosI) + (et * cosT) + 1e-6;
  let Rs = (Rs_num * Rs_num) / (Rs_den * Rs_den);
  let Rp = (Rp_num * Rp_num) / (Rp_den * Rp_den);
  return clamp(0.5 * (Rs + Rp), 0.0, 1.0);
}

// Multi-layer dielectric Fresnel helper: computes effective F for air->(optional foam)->water
fn layered_fresnel(cosTheta: f32, etaWater: f32, foamProb: f32) -> f32 {
  let F_air_water = fresnel_dielectric(cosTheta, etaWater);
  if (foamProb < 0.001) { return F_air_water; }
  // Approximate foam as thin high-scatter layer: treat its interface reflectance ~0.06 (effective)
  let F_air_foam = 0.06; // empirical microbubble surface reflectance
  // Foam->water interface (foam mostly water + air pockets) approximated similar to base water F0
  let F_foam_water = F_air_water * 0.5 + 0.01; // softened energy at second interface
  // Two interfaces with transmission in between: F_eff = F_af + (1-F_af)^2 * F_fw (ignore multiple higher orders)
  let F_two = F_air_foam + (1.0 - F_air_foam) * (1.0 - F_air_foam) * F_foam_water;
  // Mix by foam probability
  return mix(F_air_water, F_two, clamp(foamProb, 0.0, 1.0));
}

// March result struct
struct MarchResult { uv: vec2f, path: f32, hit: f32 }

// Refraction march with pixel-stable jitter (previous viewPos-based jitter created a camera-aligned band)
fn marchRefraction(viewPos: vec3f, V_view: vec3f, N_world: vec3f, eta: f32, fx: f32, fy: f32, dimsF: vec2f, hStart: f32, pixCoord: vec2u) -> MarchResult {
  // Refracted direction (world) then to view space once.
  var NrefW = N_world;
  var etaRel = 1.0 / eta; // air -> water
  let V_world = normalize((uniforms.inv_view_matrix * vec4f(V_view,0.0)).xyz);
  if (dot(NrefW, V_world) > 0.0) { NrefW = -NrefW; etaRel = eta; }
  let Tw = refract(-V_world, NrefW, etaRel);
  if (all(abs(Tw) < vec3f(1e-6))) { return MarchResult(vec2f(0.5), 0.0, 0.0); }
  let Tv = (uniforms.view_matrix * vec4f(Tw,0.0)).xyz;
  // Pixel-stable deterministic jitter (removes camera-following dark line artifact)
  var seed = fract(sin(dot(vec2f(pixCoord), vec2f(12.9898,78.233))) * 43758.5453);
  let jitter = (seed - 0.5) * 0.012; // slightly reduced amplitude for smoother transition
  var t = jitter; // start with jitter
  var lastUV = vec2f(0.5);
  var path = 0.0;
  var hit = 0.0;
  var prev_t = t;
  var prevDiff = 0.0;
  var prevUV = lastUV;
  let dims = dimsF;
  // 14 adaptive steps (slightly more for smoother path) + linear refinement
  for (var i=0; i<14; i=i+1) {
    let stepSize = 0.008 + t * 0.11; // gentle growth
    t = t + stepSize;
    let P = viewPos + Tv * t;
    if (P.z > 0.0) { break; }
    let ndcX = (P.x * fx)/(-P.z);
    let ndcY = (P.y * fy)/(-P.z);
    // Fix vertical mirroring: use consistent Y direction (no flip)
    let uv = vec2f(ndcX * 0.5 + 0.5, ndcY * 0.5 + 0.5);
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { break; }
    let uvPixels = uv * dims;
    let maxCoord = dims - vec2f(1.0);
    let clampedPixels = clamp(uvPixels, vec2f(0.0), maxCoord);
    let hs = textureLoad(height_texture, vec2u(clampedPixels), 0).r;
    let rayHeight = -P.z;
    let diff = hs - rayHeight; // positive -> surface above ray
    // Intersection when diff crosses small positive threshold
    if (diff > 0.0013) {
      hit = 1.0;
      // Linear refinement using previous sample (prevDiff <=0 assumed)
      if (i > 0 && prevDiff <= 0.0) {
        let w = diff / (diff - prevDiff + 1e-6); // fraction toward previous point
        let tRefine = mix(t, prev_t, clamp(w,0.0,1.0));
        t = tRefine;
        // Recompute refined uv
        let Pref = viewPos + Tv * t;
        let ndcXr = (Pref.x * fx)/(-Pref.z);
        let ndcYr = (Pref.y * fy)/(-Pref.z);
        // Fix vertical mirroring: use consistent Y direction (no flip)
        lastUV = vec2f(ndcXr * 0.5 + 0.5, ndcYr * 0.5 + 0.5);
      } else {
        lastUV = uv;
      }
      path = t;
      break;
    }
    prevDiff = diff;
    prev_t = t;
    prevUV = uv;
    lastUV = uv;
    path = t;
  }
  return MarchResult(lastUV, path, hit);
}

// Micro surface noise helpers (fbm-style) placed at module scope (WGSL disallows nested fn definitions)
fn hash2D(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}
fn noise2D(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash2D(i);
  let b = hash2D(i + vec2f(1.0, 0.0));
  let c = hash2D(i + vec2f(0.0, 1.0));
  let d = hash2D(i + vec2f(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Clamped height fetch for curvature evaluation (module scope; cannot define inside fragment)
fn heightSampleClamped(x: i32, y: i32, dims: vec2u) -> f32 {
  let cx = clamp(x, 0, i32(dims.x) - 1);
  let cy = clamp(y, 0, i32(dims.y) - 1);
  return textureLoad(height_texture, vec2u(u32(cx), u32(cy)), 0).r;
}

// -----------------------------------------------------------------------------
@fragment
fn fs(input: FragmentInput) -> @location(0) vec4f {
  // Legacy surface texture (particle-accumulated then blurred) still carries residual particle footprint.
  // We only use its packed normal as a fallback. Thickness & coverage from this texture are NOT used for shading.
  // Pixel coordinate: previously rounded (floor+0.5) introduced a subtle diagonal transition line.
  // Use direct integer truncation + clamp to eliminate half-pixel decision boundary.
  // Use integer UV coordinates for pixel-perfect addressing, eliminating diagonal seams
  // consistent with all compute passes that use vec2i(gid.xy)
  let dimsPix = textureDimensions(height_texture);
  let fragPx = vec2i(clamp(vec2i(input.iuv), vec2i(0), vec2i(dimsPix) - vec2i(1)));
  let pix = vec2u(fragPx);
  let surf = textureLoad(surface_texture, pix, 0);
  var N_view = unpackOctahedral(surf.xy);
  // Legacy thickness & coverage retained only for debug modes
  let legacyThickness = max(0.0, surf.z);
  let legacyCoverage = clamp(surf.w, 0.0, 1.0);
  if (any(N_view != N_view) || any(abs(N_view) > vec3f(1e6))) { N_view = vec3f(0.0,0.0,1.0); }
  // Height-based normal reconstruction (initially in view space)
  let hSample = textureLoad(height_texture, pix, 0);
  let hVal = hSample.r;
  let dhdx = hSample.g;
  let dhdy = hSample.b;
  let phys = textureLoad(physicalTex, pix, 0);
  let slope = phys.r;
  // Mean curvature from height field (central differences) to reduce directional bias & diagonal artifact.
  // Unified curvature computation with clamped neighborhood sampling (removes border band where fallback differed)
  var curvatureDir = 0.0;
  {
    let dimsC = textureDimensions(height_texture);
    let bx = i32(pix.x); let by = i32(pix.y);
    let hC  = heightSampleClamped(bx,   by,   dimsC);
    let hL  = heightSampleClamped(bx-1, by,   dimsC);
    let hR  = heightSampleClamped(bx+1, by,   dimsC);
    let hD  = heightSampleClamped(bx,   by-1, dimsC);
    let hU  = heightSampleClamped(bx,   by+1, dimsC);
    let hUL = heightSampleClamped(bx-1, by+1, dimsC);
    let hUR = heightSampleClamped(bx+1, by+1, dimsC);
    let hDL = heightSampleClamped(bx-1, by-1, dimsC);
    let hDR = heightSampleClamped(bx+1, by-1, dimsC);
    let hx = (hR - hL) * 0.5;
    let hy = (hU - hD) * 0.5;
    let hxx = hL - 2.0 * hC + hR;
    let hyy = hD - 2.0 * hC + hU;
    let hxy = (hUR - hUL - hDR + hDL) * 0.25;
    let denom = 2.0 * pow(1.0 + hx*hx + hy*hy, 1.5) + 1e-6;
    let numer = (1.0 + hy*hy) * hxx - 2.0 * hx * hy * hxy + (1.0 + hx*hx) * hyy;
    curvatureDir = numer / denom;
  }
  let crestCand = phys.b;    // raw crest candidate (un-thresholded)
  let covRaw = clamp(phys.a, 0.0, 1.0); // use physically-derived multi-scale coverage only
  // Optional sphere containment: zero coverage outside sphere to clip water volume
  if (sphereContain.enabled != 0u) {
    // Project worldPos later; for now approximate using reconstructed worldPos after it is computed
  }
  // Convert crest candidate into instantaneous foam candidate via shaping (narrower now after metric change)
  // Foam candidate shaping: previous thresholds too conservative -> almost no visible foam.
  // Incorporate curvature & slope energy to raise crest probability in dynamically energetic regions.
  let slopeNorm_local = saturate(abs(slope) * 0.6);
  let curvatureBoost = abs(curvatureDir) * 0.85; // curvature magnitude acts as additional trigger
  let crestEnhanced = crestCand + curvatureBoost * 0.35 + slopeNorm_local * 0.25;
  // Lowered thresholds expose early formation then ramp quickly to avoid blanket white.
  var foamMask = smoothstep(0.008, 0.045, crestEnhanced);
  // Use temporal accumulation if available (sample channel r)
  let foamAccum = textureLoad(foamAccumTex, pix, 0).r;
  foamMask = max(foamMask, foamAccum);
  // Tangent-space vectors (assuming screen x->+x, y->+y, view forward -z)
  // Base reconstructed normal
  var Nh = normalize(vec3f(-dhdx, -dhdy, 1.0));
  // (Initial) micro-normal scaffolding removed; we'll add physically flavored micro surface later once world position known.
  // Blend thickness-derived and height-derived normals for stability (pre micro detail)
  let blendW = 0.6; // weight towards smoother height normal
  // Dynamic blend weight: reduce legacy normal influence when slope energy high (removes diagonal imprint)
  let slopeEnergy = saturate(abs(slope) * 2.5);
  let blendDynamic = mix(0.85, 0.5, slopeEnergy); // calmer water relies more on smoothed height normal
  var N_view_blended = normalize(mix(N_view, Nh, blendDynamic));
  // Transform to world space using inverse view matrix (ignore translation)
  var N_world = normalize( (uniforms.inv_view_matrix * vec4f(N_view_blended, 0.0)).xyz );
  if (any(N_world != N_world) || length(N_world) < 1e-4) { N_world = vec3f(0.0,1.0,0.0); }

  // --- View direction & world position reconstruction for correct Fresnel/refraction ---
  // Reconstruct world position from height (treat hVal as view-space height with viewZ = -hVal)
  let dims = textureDimensions(height_texture);
  let dimsF = vec2f(f32(dims.x), f32(dims.y));
  let px = vec2f(pix); // integer pixel coords as float
  let uvN = (px + vec2f(0.5)) / dimsF; // 0..1
  let ndc = vec2f(uvN.x * 2.0 - 1.0, 1.0 - uvN.y * 2.0);
  // Inverse projection using known fx, fy from projection matrix
  let fx = uniforms.projection_matrix[0][0];
  let fy = uniforms.projection_matrix[1][1];
  let viewZ = -hVal; // consistent with other passes
  let x_view = ndc.x * (-viewZ) / fx;
  let y_view = ndc.y * (-viewZ) / fy;
  let viewPos = vec4f(x_view, y_view, viewZ, 1.0);
  let worldPos = (uniforms.inv_view_matrix * viewPos).xyz;
  let cameraPos = (uniforms.inv_view_matrix * vec4f(0.0,0.0,0.0,1.0)).xyz;
  var V = normalize(cameraPos - worldPos); // surface -> camera
  if (length(V) < 1e-5 || any(V != V)) { V = vec3f(0.0,0.0,1.0); }

  // (Moved) thickness & coverage gating computed after sphere containment once coverage is finalized.
  var alpha = 0.0; // deferred until march

  // Opacity slider interpreted as bulk attenuation coefficient strength (0 clear, 1 highly absorbing)
  let userOpacity = clamp(waterAppearance.transparency, 0.0, 1.0);
  let oCurve = pow(userOpacity, 1.05);
  // Reflectivity slider only scales physical F0 mildly (no artificial spec multiplier)
  let reflectivityUser = clamp(waterAppearance.reflectivity, 0.0, 1.0);
  // Base roughness constant (calm water) – further variation comes from slope energy below
  let baseRoughness = 0.12;

  // Base color fallback
  var base = waterAppearance.color.rgb;
  // Neutral fallback (avoid bright cyan slab if user passes near-black color)
  if (all(base < vec3f(0.0001))) { base = vec3f(0.04,0.08,0.12); }

  // View direction in world already computed; lighting vectors will be derived after micro surface perturbation.

  // Apply sphere containment now that worldPos known
  var sphereMask = 1.0;
  if (sphereContain.enabled != 0u) {
    let d = distance(worldPos, sphereContain.center);
    sphereMask = saturate( (sphereContain.radius - d) / sphereContain.radius );
    // Sharpen edge slightly
    sphereMask = smoothstep(0.0, 0.08, sphereMask);
  }
  // Neighborhood coverage smoothing to reduce particle speckle
  var coverage = covRaw;
  if (sphereMask > 0.0) {
  let dimsS = textureDimensions(physicalTex);
  // Use consistent position-derived pixel coordinate (pix) instead of interpolated iuv to avoid seams
  let baseCoord = pix;
    var accum = covRaw;
    var wSum = 1.0;
  // Manually unrolled neighbor sampling (WGSL requires constant indices for fixed-size arrays)
  let o0 = vec2i(1,0);  let nc0 = vec2i(baseCoord) + o0;
  if (nc0.x >= 0 && nc0.y >= 0 && nc0.x < i32(dimsS.x) && nc0.y < i32(dimsS.y)) { let c = textureLoad(physicalTex, vec2u(nc0), 0).a; accum += c * 0.5; wSum += 0.5; }
  let o1 = vec2i(-1,0); let nc1 = vec2i(baseCoord) + o1;
  if (nc1.x >= 0 && nc1.y >= 0 && nc1.x < i32(dimsS.x) && nc1.y < i32(dimsS.y)) { let c = textureLoad(physicalTex, vec2u(nc1), 0).a; accum += c * 0.5; wSum += 0.5; }
  let o2 = vec2i(0,1);  let nc2 = vec2i(baseCoord) + o2;
  if (nc2.x >= 0 && nc2.y >= 0 && nc2.x < i32(dimsS.x) && nc2.y < i32(dimsS.y)) { let c = textureLoad(physicalTex, vec2u(nc2), 0).a; accum += c * 0.5; wSum += 0.5; }
  let o3 = vec2i(0,-1); let nc3 = vec2i(baseCoord) + o3;
  if (nc3.x >= 0 && nc3.y >= 0 && nc3.x < i32(dimsS.x) && nc3.y < i32(dimsS.y)) { let c = textureLoad(physicalTex, vec2u(nc3), 0).a; accum += c * 0.5; wSum += 0.5; }
    coverage = (accum / wSum) * sphereMask;
  }
  // Avoid early fragment return so that downstream derivative ops (fwidth) remain in uniform control flow.
  // Defer discard logic by marking a skip flag and collapsing shading at the end.
  let skipShading = (coverage < 0.004 || sphereMask <= 0.0001);

  // Synthetic thickness baseline (used if march disabled / fallback)
  let syntheticThickness = (0.26 * pow(coverage, 0.62) * (1.0 + 0.28 * clamp(slope,0.0,2.5)));
  let filmMinBase = 0.42 * pow(coverage, 0.5); // legacy floor reused in new model
  // Coverage gating for diffuse only (specular reflection governed by Fresnel)
  let covSoft = pow(coverage, COV_GAMMA);
  let covGate = smoothstep(MIN_COV, 1.0, covSoft);

  // --- Physically-inspired micro surface perturbation (capillary / ripples) ---
  // We add sub-pixel scale isotropic fBm noise in world XZ to avoid repetitive "curvy line" artifacts from earlier sin() pattern.
  // Reconstruct a temporary tangent basis (view space) for perturbation
  var T = normalize(cross(vec3f(0.0,1.0,0.0), N_world));
  if (length(T) < 1e-3) { T = vec3f(1.0,0.0,0.0); }
  let B = normalize(cross(N_world, T));
  let worldXZ = worldPos.xz; // stable with camera motion
  let n1 = noise2D(worldXZ * 0.35);
  let n2 = noise2D(worldXZ * 1.1 + vec2f(10.37, 4.71));
  let n3 = noise2D(worldXZ * 3.3 + vec2f(2.2, 7.7));
  let fBm = (n1 * 0.55 + n2 * 0.3 + n3 * 0.15) - 0.5;
  // Reduced capillary amplitude (previous values caused excessive grazing normals -> Fresnel ~1 everywhere)
  let capillary = clamp(slope * 0.05 + abs(curvatureDir) * 0.12, 0.0, 0.07); // scaled for mean curvature magnitude
  N_world = normalize(N_world + (T * fBm + B * fBm) * capillary);

  // Spectral slope influenced dynamic microfacet roughness (Phillips/JONSWAP inspired approximation).
  // We modulate effective roughness based on local slope energy and add a secondary small-scale lobe.
  let slopeNorm = clamp(slope / (slope + 1.5), 0.0, 1.0);
  var roughPrimary = clamp(baseRoughness + slopeNorm * 0.28, MIN_ROUGHNESS, 0.9);
  let roughCapillary = clamp(0.06 + slopeNorm * 0.15, MIN_ROUGHNESS, 0.6);
  // Capture wind direction (using mainLightDirection as placeholder if enabled)
  var windDir = normalize(select(DEFAULT_WIND_DIR, lightingControls.mainLightDirection, lightingControls.mainLightEnabled != 0u));
  // Anisotropy: bias micro facet orientation along wind direction projected onto surface plane.
  let windT = normalize(windDir - N_world * dot(N_world, windDir));
  let anisotropy = 0.5 * slopeNorm; // amount of directional stretch
  // Apply a subtle anisotropic normal tweak to hint elongated facets in wind direction.
  N_world = normalize(N_world + windT * fBm * anisotropy * 0.15);

  // Recompute lighting vectors with perturbed normal
  let L = normalize(select(vec3f(0.4,0.8,0.5), lightingControls.mainLightDirection, lightingControls.mainLightEnabled != 0u));
  let NoL = max(dot(N_world,L), 0.0);
  let H = normalize(V+L);
  let NoV = max(dot(N_world,V), 0.0);
  let NoH = max(dot(N_world,H), 0.0);
  let VoH = max(dot(V,H), 0.0);

  // --- Angle-correct alpha (after final N_world & NoV) ---
  // Physical intuition: apparent optical depth increases ~ 1 / cos(theta) so transmission diminishes at grazing.
  // We convert syntheticThickness to an angle-correct path length, derive transmittance T = exp(-K_TAU * d_eff),
  // then opacity alpha = 1 - T. Coverage modulates perceived continuity for very thin sheets.
  // Grazing handling: previous hard clamp at cosTheta=0.05 produced a visible horizontal band (horizon seam).
  // Replace with a soft regularization that asymptotically increases path length without a piecewise derivative break.
  // Previous derivative based approach (fwidth) caused validation error due to non-uniform control flow.
  // Use purely analytic soft floor without derivatives to keep horizon band suppressed.
  let NoV_raw = max(NoV, 0.0);
  let softMin = 0.02;
  // Two-region smooth approximation: blend logistic curve near horizon.
  let k = 28.0; // steepness of logistic lift
  let liftBlend = 1.0 / (1.0 + exp(-k * (NoV_raw - softMin)));
  let lifted = mix(softMin, NoV_raw, liftBlend);
  let pathAmplifier = 1.0 / max(lifted, 0.005);
  let effectiveDepth = syntheticThickness * pathAmplifier;
  let transmittance = exp(-K_TAU * effectiveDepth);
  let alphaPhys = 1.0 - transmittance;
  // Coverage shaping: low coverage reduces alpha so isolated droplets remain partially see-through.
  let covSoft2 = pow(coverage, 0.5);
  alpha = mix(alphaPhys * covSoft2, alphaPhys, covSoft2);
  // Removed prior forced silhouette opacity hack; Fresnel + path length handle edge darkening/brightening naturally
  // Preserve minimum film thickness continuity
  alpha = max(alpha, filmMinBase * 0.85);
  alpha = clamp(alpha, 0.04, 0.995);
  if (skipShading) {
    // Allow angle diagnostic modes to still visualize NoV when coverage culled
    let debugMode = select(debug.mode, DEBUG_MODE_OVERRIDE, DEBUG_MODE_OVERRIDE > 0u);
    if debugMode == 23u { return vec4f(vec3f(NoV_raw), 1.0); }
    if debugMode == 24u { return vec4f(vec3f(lifted), 1.0); }
    if debugMode == 25u { let d = clamp(lifted - NoV_raw, 0.0, 1.0); return vec4f(d, d*0.5, 0.0, 1.0); }
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  // Compute foam probability (temporal accumulation already folded into foamMask)
  let foamProb = clamp(pow(foamMask, 0.7), 0.0, 1.0);

  // Directional light specular (microfacet) ---------------------------------
  var specCol = vec3f(0.0);
  // Physical base reflectance from IOR: F0_phys = ((eta-1)/(eta+1))^2, allow mild user scaling.
  let etaBase = max(1.0001, effectParameters.refractionIndex);
  let F0_phys_scalar = pow((etaBase - 1.0) / (etaBase + 1.0), 2.0);
  let userScale = 1.0 + reflectivityUser * (MAX_USER_F0_SCALE - 1.0);
  let F0_base = vec3f(clamp(F0_phys_scalar * userScale, 0.0, 0.08));
  // Foam thin-film / microbubble layer raises effective F0 due to multiple interfaces; approximate with boosted F0.
  let foamLayer = clamp(pow(foamMask, 0.65), 0.0, 1.0);
  let F0_foam = clamp(F0_base + vec3f(0.02) * foamLayer, vec3f(0.0), vec3f(0.12));
  var F0 = mix(F0_base, F0_foam, foamLayer);
  // Dynamic roughness (primary + capillary layered GGX) derived above.
  let rough = clamp(roughPrimary, MIN_ROUGHNESS, 1.0);
  let a = rough * rough;
  // Physically-based Fresnel using dielectric equations with optional slight dispersion.
  var Fview = F0;
  var F_untempered = F0; // store pre-temper Fresnel for debug visualization
  var F_layer_debug = 0.0; // expose for debug modes
  if (effectsToggle.enableFresnel != 0u) {
    // Layered Fresnel scalar applied to each channel's base F0 proportionally
    let F_layer = layered_fresnel(NoV, etaBase, foamProb);
    F_layer_debug = F_layer;
    // Scale per channel around base F0 ratio to preserve subtle dispersion path later
    let ratio = F0 / max(vec3f(1e-4), vec3f((F0.x+F0.y+F0.z)/3.0));
    var Ftemp = clamp(vec3f(F_layer) * ratio, vec3f(0.0), vec3f(1.0));
    F_untempered = Ftemp;
    // Fresnel tempering: prevent full dominance when water has strong bulk absorption (high oCurve)
    let viewAngle = NoV; // already in [0,1]
    let normalCap = mix(0.06, 0.12, foamProb); // allow foam to raise cap
    let angleFactor = pow(1.0 - viewAngle, 1.5);
    let temperStrength = mix(0.55, 0.15, angleFactor); // less temper at extreme grazing
    let capped = clamp(Ftemp, vec3f(0.0), vec3f(normalCap));
    Fview = mix(Ftemp, capped, temperStrength * (0.35 + 0.65 * oCurve));
    // Additional absorption coupling: if high opacity (oCurve) ensure some transmission by reducing mid-angle F proportionally
    let absorptionBias = oCurve * 0.35;
    Fview = Fview * (1.0 - absorptionBias * saturate(1.0 - angleFactor*0.4));
  }
  if (effectsToggle.enableSpecular != 0u) {
    // Primary lobe
    let Dp = D_GGX(NoH, a);
    let Gp = G_Smith(NoV, NoL, a);
    // Secondary tighter capillary lobe (higher frequency facets) blending with foam & slope energy
    let a2c = roughCapillary * roughCapillary;
    let Dc = D_GGX(NoH, a2c);
    let Gc = G_Smith(NoV, NoL, a2c);
    let denom = 4.0 * max(NoV, 1e-4) * max(NoL, 1e-4) + 1e-5;
    let specPrimary = (Dp * Gp) / denom;
    let specCap = (Dc * Gc) / denom;
    let capWeight = 0.35 + 0.4 * foamLayer + 0.25 * slopeNorm; // more capillary sparkle with foam & slope
  let specCombined = mix(specPrimary, specCap, clamp(capWeight,0.0,0.85));
  // Grazing attenuation to prevent glowing outline (physical reflection already high via Fresnel, remove microfacet spike)
  // Remove sharp spec fade-in (previous smoothstep still created horizon contrast); use gentle shaping.
  let grazeSpecAtten = pow(NoV, 0.35); // continuous, no flat region at horizon
  specCol = vec3f(specCombined * NoL) * effectParameters.specularScale * compositionParams.specularWeight * grazeSpecAtten;
  }

  // Diffuse / subsurface (energy conservation later subtract Fresnel average) ----
  var diffuse = base * NoL * covGate;
  if (effectsToggle.enableSubsurface != 0u) {
    let wrapN = 0.5 + effectParameters.subsurfaceDepth * 0.5; // wrap diffuse
    let wrap = saturate((NoL + wrapN) / (1.0 + wrapN));
    let subsurfColor = mix(base, vec3f(effectParameters.subsurfaceColor), 0.5);
    diffuse = mix(diffuse, subsurfColor * wrap, effectParameters.subsurfaceScale) * compositionParams.subsurfaceWeight;
  }

  // Ambient (Lambertian, coverage-weighted) ---------------------------------
  var ambient = base * (0.12 + lightingControls.ambientIntensity * 0.15) * compositionParams.baseColorWeight * covGate;

  // Rim ----------------------------------------------------------------------
  var rim = 0.0;
  if (effectsToggle.enableRimLighting != 0u) {
    rim = pow(1.0 - NoV, effectParameters.rimLightPower) * effectParameters.rimLightStrength;
  }

  // Reflection ---------------------------------------------------------------
  var reflection = vec3f(0.0);
  var transmission = vec3f(0.0);
  var marchedPath = 0.0;
  if (effectsToggle.enableReflection != 0u || effectsToggle.enableRefraction != 0u) {
    // Reflection direction
    let R = reflect(-V, N_world);
    let envSpec = textureSampleLevel(envmap_texture, texture_sampler, R, rough * 5.0).rgb;
  reflection = envSpec * effectParameters.reflectionStrength * compositionParams.reflectionWeight;
    if (effectsToggle.enableRefraction != 0u) {
      // Inside/outside handling
      var Nref = N_world;
      var eta = 1.0 / max(1.0001, effectParameters.refractionIndex); // air -> water
      let NoVsign = dot(Nref, V);
      if (NoVsign < 0.0) {
        // View inside water: flip normal & invert indices
        Nref = -Nref;
        eta = max(1.0001, effectParameters.refractionIndex);
      }
      // Base refraction vector
      let baseT = refract(-V, Nref, eta);
      if (!all(baseT == vec3f(0.0))) {
        var Tn = normalize(baseT);
        // Chromatic dispersion: compute per-channel directions (lightly) & energy normalize
        if (effectsToggle.enableDispersion != 0u && effectParameters.refractionChromatic > 0.00001) {
          let shift = effectParameters.refractionChromatic * 0.0015;
          let iorR = max(1.0001, effectParameters.refractionIndex + shift);
          let iorB = max(1.0001, effectParameters.refractionIndex - shift);
          let Tr = refract(-V, Nref, select(1.0/iorR, iorR, NoVsign < 0.0));
          let Tg = baseT;
          let Tb = refract(-V, Nref, select(1.0/iorB, iorB, NoVsign < 0.0));
          if (!all(Tr == vec3f(0.0)) && !all(Tb == vec3f(0.0))) {
            // Sample env per channel for physically coherent separation
            let lodT = rough * 2.5;
            let cR = textureSampleLevel(envmap_texture, texture_sampler, normalize(Tr), lodT).r;
            let cG = textureSampleLevel(envmap_texture, texture_sampler, normalize(Tg), lodT).g;
            let cB = textureSampleLevel(envmap_texture, texture_sampler, normalize(Tb), lodT).b;
            transmission = vec3f(cR, cG, cB);
          }
        }
        if (all(transmission == vec3f(0.0))) {
          // Screen-space parallax refraction: two-sample march through height field for shoreline compression
          let V_view = (uniforms.view_matrix * vec4f(V,0.0)).xyz;
          let marchRes = marchRefraction(viewPos.xyz, V_view, N_world, effectParameters.refractionIndex, fx, fy, dimsF, hVal, pix);
          marchedPath = marchRes.path;
          let parallaxUV = marchRes.uv;
          // Sample background first (if available); if dark fallback to env
          var bgTrace = textureSampleLevel(backgroundTex, texture_sampler, parallaxUV, 0.0).rgb;
          if (all(bgTrace < vec3f(0.001))) { bgTrace = vec3f(0.0); }
          let lodT = rough * 2.0 + slope * 2.0 + syntheticThickness * 6.0;
          let envBase = textureSampleLevel(envmap_texture, texture_sampler, Tn, lodT).rgb;
          let bgWeight2 = saturate(length(bgTrace));
          transmission = mix(envBase, bgTrace, bgWeight2);
        }
        // Screen-space parallax sampling of background color (approx): offset UV by projected normal & slope
  let normalView = N_view_blended;
  // Add multi-factor distortion: base normal + slope + curvature -> richer optical bending.
  let curvatureEnergy = clamp(abs(curvatureDir) * 3.0, 0.0, 1.5);
  let slopeEnergy2 = clamp(slope * 0.8, 0.0, 1.2);
  let multiScaleDistort = (normalView.xy * 0.6 + vec2f(slopeEnergy2, curvatureEnergy) * 0.4);
  let refrOffset = multiScaleDistort * effectParameters.refractionScale * 0.55;
        // Velocity-based stabilization factor
  let vel = textureLoad(velocityTex, pix, 0).xy; // unified coordinate source
        let velMag = length(vel);
        let velDamp = 1.0 / (1.0 + velMag * 4.0);
        let uvBG = clamp(input.uv + refrOffset * velDamp, vec2f(0.0), vec2f(1.0));
  var bgCol = textureSampleLevel(backgroundTex, texture_sampler, uvBG, 0.0).rgb;
  // If background looks like an empty/placeholder texture (very dark), fallback to neutral black explicitly
  if (all(bgCol < vec3f(0.001))) { bgCol = vec3f(0.0); }
        // Blend background sample with environment refraction (bg prioritized if non-black)
        let bgWeight = saturate(length(bgCol));
  transmission = mix(transmission, bgCol, bgWeight);
        // Apply coverage modulation to transmission (avoid halos in sparse zones)
  transmission *= covGate;
  // Scattering / clarity attenuation: thicker, steeper, more curved water diffuses background
  let slopeN = slope / (1.0 + slope);
  let curvA = abs(curvatureDir);
  let clarity = exp(- (syntheticThickness * 12.0 + slopeN * 2.4 + curvA * 1.3));
  // Blend toward turbidity tint as clarity drops
  transmission = mix(transmission, TURBIDITY_COLOR, 1.0 - clarity);
  // Additional desaturation in low clarity
  let avg = dot(transmission, vec3f(0.3333));
  transmission = mix(transmission, vec3f(avg), (1.0-clarity)*0.25);
  // Fresnel + absorption already reduce transmission at grazing; additional manual graze attenuation removed.
  // Introduce subtle path blur scaling: thicker & shallower angle => higher blur (already partly in lodT) to soften side profile.
  transmission *= pow(NoV, 0.3);
  // Removed additional edge fade that stacked with Fresnel/absorption to create a horizon band.
      }
    }
  }

  // Absorption / color attenuation (apply ONLY to transmitted components) -----
  var absorptionAtten = vec3f(1.0);
  if (effectsToggle.enableAbsorption != 0u) {
    let absorbK = max(1e-5, effectParameters.absorptionStrength);
    let depthScale = effectParameters.absorptionDepth;
    // Angle-corrected optical path length approximation: divide by cos incidence of transmission dir if available
    let Tdir = normalize(reflect(-V, N_world)); // fallback if transmission not computed
    // Estimate using current transmission color presence (if non-zero) use previous Tn logic replaced by baseT if accessible
    // Since Tn may be out of scope here, approximate with V bent by normal
    let cosInc = max(0.15, abs(dot(N_world, V)));
  let pathLength = syntheticThickness / cosInc;
    absorptionAtten *= exp(-absorbK * pathLength * depthScale);
  }
  if (effectsToggle.enableColorAbsorption != 0u) {
    let depthK = effectParameters.colorAbsorptionDepth;
    absorptionAtten *= vec3f(
  exp(-effectParameters.colorAbsorptionRed   * syntheticThickness * depthK),
  exp(-effectParameters.colorAbsorptionGreen * syntheticThickness * depthK),
  exp(-effectParameters.colorAbsorptionBlue  * syntheticThickness * depthK));
  }

  // Depth coloring (approx: thickness based) ---------------------------------
  if (effectsToggle.enableDepthColoring != 0u) {
  let t = saturate(syntheticThickness * effectParameters.depthColorScale);
    let depthTint = vec3f(t, t*t, t*t*t);
    base = mix(base, depthTint, effectParameters.depthColorStrength);
  }

  // Energy partition using Fview: specular gets F, remainder splits into diffuse + transmission.
  let Favg = (Fview.x + Fview.y + Fview.z) / 3.0;
  // Limit Fresnel-driven specular dominance when user opacity indicates strong absorption
  var specEnergy = (specCol + reflection) * Fview;
  let fresnelLimiter = mix(1.0, 0.55, oCurve); // higher opacity reduces specular share
  specEnergy *= fresnelLimiter;
  let transmissionWeight = transmissionParams.transmissionWeight;
  // Initial (pre user-opacity) energies
  var transEnergy = transmission * (1.0 - Fview) * transmissionWeight;
  var diffuseEnergy = (ambient + diffuse) * (1.0 - Fview);
  // Apply physical absorption to transmitted (diffuse+transmission) light: already have base absorptionAtten; reinforce with a slider-derived sigmaA.
  // Interpret user opacity as desired transmission over reference depth for water (normal incidence)
  let refDepth = 0.5; // reference world depth units
  let minTrans = 0.02; // lower physical clamp ~98% absorbed
  let targetTrans = mix(1.0, minTrans, oCurve);
  let sigmaUser = -log(max(0.001, targetTrans)) / refDepth;
  // Estimate mean interior path for diffuse scattering and transmission
  let diffPath = syntheticThickness * 0.8;
  let transPath = select(syntheticThickness / max(NoV,0.05), marchedPath, marchedPath > 0.0);
  // Water color -> channel-wise absorption: interpret user color as transmittance at reference depth
  let userCol = clamp(waterAppearance.color.rgb, vec3f(0.0001), vec3f(0.999));

  // SIMPLIFIED COLOR SYSTEM: Direct color control from clear to opaque
  // Use transparency as opacity control: 0.0 = clear, 1.0 = completely opaque
  let opacity = clamp(userOpacity, 0.0, 1.0);

  // For milky/blood effects: high opacity makes color more dominant
  let colorStrength = mix(0.1, 1.0, opacity); // At low opacity: subtle tint, high opacity: full color
  let transmissionFactor = 1.0 - opacity; // Higher opacity = less transmission

  // Apply color directly without complex absorption math
  diffuseEnergy *= mix(vec3f(1.0), userCol, colorStrength);

  // For high opacity (milk/blood effects), add direct base color influence
  if (opacity > 0.5) {
    let opaqueInfluence = (opacity - 0.5) * 2.0; // 0.5->1.0 maps to 0.0->1.0
    diffuseEnergy = mix(diffuseEnergy, userCol * 0.8, opaqueInfluence * 0.6);
  }

  transEnergy *= mix(vec3f(1.0), userCol, colorStrength * 0.8) * transmissionFactor;
  // High opacity also suppresses internal contrast a bit (simulate forward scatter loss)
  let contrastLoss = mix(1.0, 0.65, oCurve);
  diffuseEnergy *= contrastLoss;
  // Volumetric turbidity / in-scattering: approximate as (1 - exp(-k * path)) * tint
  let optPath = syntheticThickness * 1.0; // could angle-correct; already partially encoded
  let scatterFactor = 1.0 - exp(-TURBIDITY_K * optPath);
  // Tone down turbidity: modulate by absorption attenuation so clear water doesn't turn blue globally
  let turbidityFog = TURBIDITY_COLOR * scatterFactor * (0.2 + 0.5 * covGate) * (absorptionAtten.r + absorptionAtten.g + absorptionAtten.b) * 0.3333;
  var litCore = specEnergy + diffuseEnergy + transEnergy + turbidityFog * (1.0 - Fview);
  // Foam contribution: physically separate layer approximation (modulates Fresnel & roughness implicitly earlier)
  var foamSpecPortion = vec3f(0.0);
  if (effectsToggle.enableFoam != 0u) {
    // Instantaneous + temporal accumulation combined mask already in foamMask
  // Enhanced shaping: raise early visibility and dynamic range of mature foam.
  // We treat crest foam as highly reflective diffuse micro-bubble layer + a subsurface scattering halo.
  let foamIntensityRaw = pow(foamMask, 0.65) * effectParameters.foamIntensity;
  // Curvature & slope boost (promotes bright foam on breaking crests per typical PDF references)
  let slopeBoost = clamp(slope * 0.9, 0.0, 1.2);
  let curvBoost = clamp(abs(curvatureDir) * 4.5, 0.0, 2.0);
  let dynamicBoost = 0.35 * slopeBoost + 0.45 * curvBoost;
  let foamIntensity = clamp(foamIntensityRaw + dynamicBoost * 0.6, 0.0, 3.5);
  // Base albedo (near white) with faint warm shift to avoid cold bleach; allow water color to tint deep foam slightly.
  let waterTint = mix(vec3f(1.0), waterAppearance.color.rgb, 0.15);
  let foamAlbedo = mix(vec3f(0.94,0.96,0.97), vec3f(1.0), 0.55) * waterTint;
  // Subsurface (light wrap) component: forward scattered, slightly tinted by turbidity.
  let subsurfaceWrap = 0.85; // strong wrap for foam translucency
  let wrapTerm = saturate((NoL + subsurfaceWrap) / (1.0 + subsurfaceWrap));
  let subsurfaceTint = mix(foamAlbedo, mix(TURBIDITY_COLOR, waterAppearance.color.rgb, 0.35), 0.25);
  // Roughness: higher than base water to spread specular & reduce mirror spikes.
  let foamRough = clamp(rough * 2.2 + 0.15, 0.05, 1.0);
  let aFoam = foamRough * foamRough;
  let Df = D_GGX(NoH, aFoam);
  let Gf = G_Smith(NoV, NoL, aFoam);
  let denomF = max(4.0 * NoV * NoL + 1e-5, 1e-5);
  let fresFoam = Fview * (0.55 + 0.45 * clamp(curvBoost,0.0,1.0)); // foam micro-bubbles raise effective Fresnel
  let foamSpecBRDF = vec3f((Df * Gf) / denomF) * fresFoam;
  // Subsurface diffuse & base diffuse
  let foamDiffuseLambert = foamAlbedo * NoL;
  let foamSubsurface = subsurfaceTint * wrapTerm * 0.7; // always lit somewhat (wrap)
  // Combine and tone map locally before mixing into scene to avoid blowing highlights
  let foamDiffuseCombined = foamDiffuseLambert + foamSubsurface;
  // Apply intensity & clamp to avoid NaNs
  let w = clamp(foamIntensity, 0.0, 1.0);
  let wHi = clamp((foamIntensity - 1.0) * 0.5, 0.0, 1.0); // extra brightening for very strong crests
  // Attenuate existing lit core (water layer) beneath foam; keep some specular glints
  let occlusion = mix(0.55, 0.25, wHi); // stronger occlusion for explosive foam
  litCore *= (1.0 - w * occlusion);
  // Specular portion scaled down (broad white sheen) + highlight retention
  foamSpecPortion = foamSpecBRDF * (0.25 + 0.35 * wHi);
  // High-frequency sparkle modulation using combined curvature & noise (reuse fBm earlier via dynamicBoost proxy)
  let sparkle = clamp(dynamicBoost * 0.9, 0.0, 1.0);
  foamSpecPortion *= (0.7 + 0.3 * sparkle);
  var foamEnergy = (foamDiffuseCombined * (0.85 + 0.5 * wHi) + foamSpecPortion) * w;
  // Local tone mapping for foam to prevent hard clipping while maintaining brightness
  let foamTone = foamEnergy / (foamEnergy + vec3f(1.0));
  litCore += foamTone;
  // Edge amplification: enhance grazing foam brightness (thin film forward scatter)
  let graze = pow(1.0 - NoV, 3.0);
  litCore += foamAlbedo * graze * w * 0.25;
  }
  // Apply absorption at end (acts on transmitted + reflected for our simplified model)
  // (Absorption already applied to appropriate components)
  // Rim adds to specular energy (small)
  litCore += rim * Fview;
  // Separate specular from diffuse/trans before tone mapping to preserve highlights
  let nonSpecRaw = diffuseEnergy + transEnergy + turbidityFog * (1.0 - Fview) + rim * Fview * 0.2;
  let nonSpec = max(nonSpecRaw, vec3f(0.0));
  let specPart = max(specEnergy + foamSpecPortion * 0.5, vec3f(0.0));
  let mapped = nonSpec / (nonSpec + vec3f(1.0));
  var lit = mapped + specPart; // restore sparkle
  lit = vec3f(
    clamp(lit.r, 0.0, 8.0),
    clamp(lit.g, 0.0, 8.0),
    clamp(lit.b, 0.0, 8.0)
  );

  // Low coverage diagnostic tint
  // Optional low coverage diagnostic tint disabled (comment out)
  // if (coverage < 0.2 && thickness > 0.0) {
  //     lit = mix(lit, vec3f(0.2,0.8,1.0), 0.4);
  // }

  // Debug overlays (enum-aligned 0..10) --------------------------------------
  // 0 NONE (normal)
  // 1 DEPTH          -> visualize height/depth
  // 2 THICKNESS      -> syntheticThickness
  // 3 NORMALS        -> surface normal
  // 4 ABSORPTION     -> absorption attenuation
  // 5 VELOCITY       -> velocity magnitude
  // 6 PRESSURE       -> (placeholder) coverage proxy
  // 7 CURVATURE      -> curvatureDir magnitude
  // 8 FRESNEL        -> Fview (tempered)
  // 9 CAUSTICS       -> turbidity / clarity proxy
  // 10 REFRACTION    -> marched path length
  // 11 NOV           -> raw NoV angle factor
  // 12 F_LAYER       -> untempered layered Fresnel scalar
  // 13 FOAM_PROB     -> foam probability mask
  let debugMode = select(debug.mode, DEBUG_MODE_OVERRIDE, DEBUG_MODE_OVERRIDE > 0u);
  if debugMode == 1u {
    // Depth visualization: use camera-distance with logarithmic compression for range stability
    let camDist = length(cameraPos - worldPos);
    let depthRange = select(60.0, sphereContain.radius * 2.0, sphereContain.enabled != 0u);
    let depthNorm = clamp( log(1.0 + camDist) / log(1.0 + depthRange), 0.0, 1.0 );
    // Multi-channel encoding: R linear, G quadratic, B sqrt for quick shape reading
    let depthRGB = vec3f(depthNorm, depthNorm * depthNorm, sqrt(depthNorm));
    return vec4f(depthRGB, 1.0);
  }
  if debugMode == 2u {
    let thickVis = clamp(syntheticThickness * 2.0, 0.0, 1.0);
    return vec4f(vec3f(thickVis), 1.0);
  }
  if debugMode == 3u { return vec4f(0.5 * N_world + 0.5, 1.0); }
  if debugMode == 4u {
    // Absorption visibility: show 1 - attenuation (how much was absorbed). Brighter = more absorbed.
    let absorbed = clamp(vec3f(1.0) - absorptionAtten, vec3f(0.0), vec3f(1.0));
    // If absorption disabled or negligible, subtle gray
    let strength = max(absorbed.r, max(absorbed.g, absorbed.b));
    let vis = mix(vec3f(0.15), absorbed, step(0.02, strength));
    return vec4f(vis, 1.0);
  }
  if debugMode == 5u {
  let vel = textureLoad(velocityTex, pix, 0).xy;
    let mag = length(vel);
    let magN = clamp(mag * 12.0, 0.0, 1.0);
    // Direction angle mapping
    let angle = atan2(vel.y, vel.x) / 3.14159265; // -1..1
    let angN = (angle * 0.5) + 0.5; // 0..1
    // Simple HSV->RGB approximation: hue=angN, sat=1, val=magN
    let h = angN;
    let s = 1.0;
    let v = magN;
    let k = vec4f(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    let p = abs(fract(vec3f(h) + k.xyz) * 6.0 - k.www);
    let rgb = v * mix(vec3f(1.0), clamp(p - vec3f(1.0), vec3f(0.0), vec3f(1.0)), s);
    return vec4f(rgb, 1.0);
  }
  if debugMode == 6u { return vec4f(vec3f(coverage), 1.0); }
  if debugMode == 7u {
    // Curvature visualization: normalized magnitude (white = high), avoids directional bias.
    let cm = abs(curvatureDir);
    let vis = cm / (cm + 0.02); // compress
    return vec4f(vec3f(vis), 1.0);
  }
  if debugMode == 8u {
    // Fresnel debug: show untempered Fresnel scalar variation (to diagnose flat F due to tempering/cap)
    let angle = clamp(NoV,0.0,1.0);
    let Fu = F_untempered;
    let Favg = (Fu.r + Fu.g + Fu.b) / 3.0;
    // Edge tint indicates grazing angle; green channel encodes difference between tempered and untempered
    let edge = pow(1.0 - angle, 2.2);
    let diff = ( (Fview.r+Fview.g+Fview.b) - (Fu.r+Fu.g+Fu.b) ) * 0.7; // positive if tempered lowered value
    let base = vec3f(Favg);
    let col = base + vec3f(0.05, diff, 0.4*edge);
    return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
  }
  if debugMode == 9u {
    // Caustics placeholder: show clarity vs turbidityFog balance
    let clarityProxy = exp(-syntheticThickness * 12.0);
    return vec4f(vec3f(clarityProxy), 1.0);
  }
  if debugMode == 10u {
    let pathLen = select(syntheticThickness / max(NoV,0.1), marchedPath, marchedPath > 0.0);
    let vis = clamp(pathLen * 0.3, 0.0, 1.0);
    return vec4f(vec3f(vis), 1.0);
  }
  if debugMode == 11u {
    // NoV visualization
    return vec4f(vec3f(NoV), 1.0);
  }
  // Note: Debug modes 23u, 24u, 25u handled early in skipShading section to avoid coordinate inconsistencies
  if debugMode == 12u {
    // Layered Fresnel scalar before tempering
    return vec4f(vec3f(F_layer_debug), 1.0);
  }
  if debugMode == 13u {
    return vec4f(vec3f(foamProb), 1.0);
  }
  if debugMode == 16u {
    // Height field raw (normalized by simple global heuristic); white blocks may indicate uninitialized areas (near zero variance)
    let h = hVal;
    // Approx heuristic normalization: assume typical |h| < 4
    let normH = clamp((h * 0.125) + 0.5, 0.0, 1.0);
    return vec4f(vec3f(normH), 1.0);
  }
  if debugMode == 17u {
    // F_layer hotspot mask: highlight areas where layered fresnel almost fully reflective
    let mask = step(0.98, F_layer_debug);
    // Show NoV in green channel for context
    return vec4f(mask, NoV, 0.0, 1.0);
  }
  if debugMode == 18u {
    // Curvature magnitude visualization (post-processing) to inspect dot/patch origins
    let cm = abs(curvatureDir);
    let vis = cm / (cm + 0.05);
    return vec4f(vec3f(vis), 1.0);
  }
  if debugMode == 19u {
    // Slope energy & micro-normal amplitude proxy
    let slopeEnergyN = slopeEnergy;
    let cap = clamp(capillary * 14.0, 0.0, 1.0);
    return vec4f(slopeEnergyN, cap, foamMask, 1.0);
  }
  if debugMode == 20u {
    // Height neighborhood variance (5x5). Low variance + high F_layer can cause flat reflective patch.
    var sum = 0.0; var sum2 = 0.0; var count = 0.0;
    let dimsH = textureDimensions(height_texture);
    for (var oy: i32 = -2; oy <= 2; oy++) {
      let sy = clamp(i32(pix.y)+oy, 0, i32(dimsH.y)-1);
      for (var ox: i32 = -2; ox <= 2; ox++) {
        let sx = clamp(i32(pix.x)+ox, 0, i32(dimsH.x)-1);
        let hv = textureLoad(height_texture, vec2u(u32(sx), u32(sy)), 0).r;
        sum += hv; sum2 += hv*hv; count += 1.0;
      }
    }
    let mean = sum / max(count,1.0);
    let varH = max(0.0, sum2 / max(count,1.0) - mean*mean);
    let varN = varH / (varH + 0.02);
    return vec4f(varN, F_layer_debug, NoV, 1.0);
  }
  if debugMode == 21u {
    // Vertical mirror difference: compare height(y) with height(H-1-y)
    let dimsH = textureDimensions(height_texture);
    let mirrorY = dimsH.y - 1u - pix.y;
    let hA = textureLoad(height_texture, pix, 0).r;
    let hB = textureLoad(height_texture, vec2u(pix.x, mirrorY), 0).r;
    let d = abs(hA - hB);
    // Amplify difference for visibility
    let vis = clamp(d * 4.0, 0.0, 1.0);
    // Encode which half we are in: top half green bias, bottom half blue bias
    let halfMaskTop = select(0.0, 1.0, pix.y < dimsH.y / 2u);
    return vec4f(vis, vis * halfMaskTop, vis * (1.0 - halfMaskTop), 1.0);
  }
  if debugMode == 22u {
    // Half split mask + subtle gradient to inspect if seam aligns exactly with midpoint
    let dimsH = textureDimensions(height_texture);
    let half = f32(dimsH.y) * 0.5;
    let yF = f32(pix.y);
    let edge = abs(yF - half);
    let edgeVis = 1.0 - clamp(edge * 0.05, 0.0, 1.0); // bright at midpoint line
    let top = step(yF, half - 0.5);
    return vec4f(top, 1.0 - top, edgeVis, 1.0);
  }
  if debugMode == 14u {
    // Adaptive local height visualization: gather a 5x5 window to find local min/max
    let dimsH = textureDimensions(height_texture);
    let base = vec2i(pix);
    var hMin =  1e30;
    var hMax = -1e30;
    // Sample stride 1 inside 5x5 (can be optimized later)
    for (var oy: i32 = -2; oy <= 2; oy = oy + 1) {
      let sy = clamp(base.y + oy, 0, i32(dimsH.y) - 1);
      for (var ox: i32 = -2; ox <= 2; ox = ox + 1) {
        let sx = clamp(base.x + ox, 0, i32(dimsH.x) - 1);
        let hS = textureLoad(height_texture, vec2u(u32(sx), u32(sy)), 0).r;
        hMin = min(hMin, hS);
        hMax = max(hMax, hS);
      }
    }
    let hCenter = textureLoad(height_texture, pix, 0).r;
    let range = max(1e-5, hMax - hMin);
    var norm = (hCenter - hMin) / range; // 0..1 relative to local window
    // Subtle contrast curve
    norm = pow(clamp(norm, 0.0, 1.0), 0.75);
    return vec4f(vec3f(norm), 1.0);
  }
  if debugMode == 15u {
    let hSamp = textureLoad(height_texture, pix, 0);
    let dhdx = hSamp.g; let dhdy = hSamp.b;
    let slope = sqrt(dhdx*dhdx + dhdy*dhdy);
    let slopeN = slope / (slope + 0.15);
    return vec4f(vec3f(slopeN), 1.0);
  }

  // Remove magenta fallback; just output fully transparent (alpha governs blending)
  if (coverage < 0.002 && syntheticThickness < 0.0005) { return vec4f(vec3f(0.0), 0.0); }

  // Final alpha & transmission blending
  // Base geometric film contribution (coverage * synthetic thickness)
  let baseAlpha = clamp(coverage * syntheticThickness * 2.2, 0.0, 1.0);
  // Baseline physical attenuation (prevents perfectly clear sheet even at low user opacity)
  let pathAlpha = 1.0 - exp(-syntheticThickness * 6.5);
  // Angle–adjusted augmentation: longer apparent path at grazing -> more opacity
  let grazingBoost = pow(1.0 - NoV, 0.85) * 0.5 * (syntheticThickness * 3.0);
  let baselineOpacity = clamp(pathAlpha + grazingBoost, 0.0, 1.0);
  // User control: 0 = emphasize transmission, 1 = near-opaque medium
  let userOpacityEffect = clamp(userOpacity, 0.0, 1.0);
  // Blend user intent with physically suggested baseline (never go below a subtle baseline to keep refraction visible)
  let userBlend = mix( max(baseAlpha * 0.25, baselineOpacity * 0.35), 0.97, userOpacityEffect);
  alpha = clamp(userBlend, 0.05, 0.985);
  // Strengthen foam influence on alpha without fully overpowering (gives whitewater body)
  let foamAlphaBoost = clamp(pow(foamMask, 1.2) * 0.35, 0.0, 0.35);
  alpha = clamp(alpha + foamAlphaBoost * (1.0 - userOpacityEffect * 0.6), 0.05, 0.995);

  let baseTone = lit - specPart;
  let premulColor = max(baseTone, vec3f(0.0)) * alpha + specPart;
  return vec4f(premulColor, alpha);
}
