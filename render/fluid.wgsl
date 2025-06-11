@group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(3) var thickness_texture: texture_2d<f32>;
@group(0) @binding(4) var envmap_texture: texture_cube<f32>;
@group(0) @binding(5) var<uniform> waterAppearance: WaterAppearance;
@group(0) @binding(6) var<uniform> debug: DebugUniforms;
@group(0) @binding(7) var<uniform> effectsToggle: EffectsToggle;
@group(0) @binding(8) var<uniform> lightingControls: LightingControls;

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
    // Core water effects
    enableReynoldsPhysics: u32,
    enableCavitation: u32,
    enableFoam: u32,
    enableTurbulentNormals: u32,

    // Surface and lighting effects
    enableSpecular: u32,
    enableSubsurface: u32,
    enableFresnel: u32,
    enableReflection: u32,

    // Advanced optical effects
    enableRefraction: u32,
    enableCaustics: u32,
    enableDispersion: u32,
    enableAbsorption: u32,

    // Color and depth effects
    enableDepthColoring: u32,
    enableVelocityColoring: u32,
    enableRimLighting: u32,
    padding: u32,
}

struct LightingControls {
    // Main light properties
    mainLightDirection: vec3f,
    mainLightIntensity: f32,
    mainLightColor: vec3f,
    mainLightEnabled: u32,

    // Fill light properties
    fillLightDirection: vec3f,
    fillLightIntensity: f32,
    fillLightColor: vec3f,
    fillLightEnabled: u32,

    // Rim light properties
    rimLightDirection: vec3f,
    rimLightIntensity: f32,
    rimLightColor: vec3f,
    rimLightEnabled: u32,

    // Global lighting properties
    ambientIntensity: f32,
    ambientColor: vec3f,
    shadowIntensity: f32,
    lightingMode: u32,

    // Advanced lighting properties
    specularIntensityMultiplier: f32,
    subsurfaceIntensityMultiplier: f32,

    // Additional lighting properties (for WebGPU 160-byte alignment)
    lightingPower: f32,
    lightingContrast: f32,
    volumetricIntensity: f32,
    rimLightingPower: f32,
    lightingPadding1: f32,
    lightingPadding2: f32,
    lightingPadding3: f32,
    lightingPadding4: f32,
}

struct FragmentInput {
    @location(0) uv: vec2f,
    @location(1) iuv: vec2f,
}

fn computeViewPosFromUVDepth(tex_coord: vec2f, depth: f32) -> vec3f {
    var ndc: vec4f = vec4f(tex_coord.x * 2.0 - 1.0, 1.0 - 2.0 * tex_coord.y, 0.0, 1.0);
    // なんかこれで合う
    ndc.z = -uniforms.projection_matrix[2].z + uniforms.projection_matrix[3].z / depth;
    ndc.w = 1.0;

    var eye_pos: vec4f = uniforms.inv_projection_matrix * ndc;

    return eye_pos.xyz / eye_pos.w;
}

fn getViewPosFromTexCoord(tex_coord: vec2f, iuv: vec2f) -> vec3f {
    var depth: f32 = abs(textureLoad(texture, vec2u(iuv), 0).x);
    return computeViewPosFromUVDepth(tex_coord, depth);
}

@fragment
fn fs(input: FragmentInput) -> @location(0) vec4f {
    var depth: f32 = abs(textureLoad(texture, vec2u(input.iuv), 0).r);

    // Calculate background color for both early return and later use
    var rayDir = normalize(computeViewPosFromUVDepth(input.uv, 1000.0));
    var worldRayDir = (uniforms.inv_view_matrix * vec4f(rayDir, 0.0)).xyz;
    var bgColor = textureSampleLevel(envmap_texture, texture_sampler, worldRayDir, 0.).rgb;

    // Make background transparent, only render water
    if depth >= 1e4 || depth <= 0.0 {
        // Return fully transparent for non-water pixels
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    var viewPos: vec3f = computeViewPosFromUVDepth(input.uv, depth);
    var thickness = textureLoad(thickness_texture, vec2u(input.iuv), 0).r;

    var ddx: vec3f = getViewPosFromTexCoord(input.uv + vec2f(uniforms.texel_size.x, 0.), input.iuv + vec2f(1.0, 0.0)) - viewPos;
    var ddy: vec3f = getViewPosFromTexCoord(input.uv + vec2f(0., uniforms.texel_size.y), input.iuv + vec2f(0.0, 1.0)) - viewPos;
    var ddx2: vec3f = viewPos - getViewPosFromTexCoord(input.uv + vec2f(-uniforms.texel_size.x, 0.), input.iuv + vec2f(-1.0, 0.0));
    var ddy2: vec3f = viewPos - getViewPosFromTexCoord(input.uv + vec2f(0., -uniforms.texel_size.y), input.iuv + vec2f(0.0, -1.0));

    if abs(ddx.z) > abs(ddx2.z) {
        ddx = ddx2;
    }
    if abs(ddy.z) > abs(ddy2.z) {
        ddy = ddy2;
    }

    var normal: vec3f = -normalize(cross(ddx, ddy));

    // Edge enhancement for better definition against white background
    var edgeFactor = 1.0;
    var depthGradient = length(vec2f(
        abs(ddx.z),
        abs(ddy.z)
    ));
    edgeFactor = mix(1.0, 2.0, clamp(depthGradient * 10.0, 0.0, 1.0));    rayDir = normalize(viewPos);

    // COMPREHENSIVE CONTROLLABLE LIGHTING SYSTEM
    // Initialize light directions with defaults or user-controlled values
    var mainLightDir: vec3f;
    var fillLightDir: vec3f;
    var rimLightDir: vec3f;

    if lightingControls.mainLightEnabled != 0u {
        mainLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.mainLightDirection, 0.)).xyz);
    } else {
        mainLightDir = normalize((uniforms.view_matrix * vec4f(0.3, -0.7, -0.6, 0.)).xyz);
    }

    if lightingControls.fillLightEnabled != 0u {
        fillLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.fillLightDirection, 0.)).xyz);
    } else {
        fillLightDir = normalize((uniforms.view_matrix * vec4f(-0.5, -0.3, 0.8, 0.)).xyz);
    }

    if lightingControls.rimLightEnabled != 0u {
        rimLightDir = normalize((uniforms.view_matrix * vec4f(lightingControls.rimLightDirection, 0.)).xyz);
    } else {
        rimLightDir = normalize((uniforms.view_matrix * vec4f(0.8, 0.2, -0.4, 0.)).xyz);
    }

    // Use main light for primary calculations
    var lightDir = mainLightDir;
    var H: vec3f = normalize(lightDir - rayDir);

    // Calculate controllable ambient lighting
    var baseAmbientFromEnv = dot(bgColor, vec3f(0.299, 0.587, 0.114));
    var ambientLight = baseAmbientFromEnv * lightingControls.ambientIntensity * 0.5; // Increased from 0.15 to 0.5
    var ambientContribution = lightingControls.ambientColor * ambientLight * 2.0; // Added 2.0 multiplier

    // Calculate velocity magnitude and physics variables ONCE
    // Use separate X and Z velocity components for better variation
    var velocityX = length(vec3f(ddx.x, 0.0, 0.0));
    var velocityZ = length(vec3f(0.0, 0.0, ddy.z));
    var velocityMagnitude = sqrt(velocityX * velocityX + velocityZ * velocityZ + length(ddx.y) * length(ddy.y));
    var pressureDensity = 1.0 + thickness * 3.0;
    var depthPressure = abs(viewPos.z) * 0.2;
    var compressionFactor = pow(pressureDensity + depthPressure, 0.8);
    var density = compressionFactor;

    // Cavitation physics calculation (Toggleable)
    var cavitationFactor = 1.0;
    if effectsToggle.enableCavitation != 0u {
        var hydrostaticPressure = abs(viewPos.z) * 9.81 * 1000.0;
        var dynamicPressure = velocityMagnitude * velocityMagnitude * 500.0;
        var totalPressure = hydrostaticPressure + dynamicPressure;
        var cavitationThreshold = 2337.0;
        cavitationFactor = clamp((cavitationThreshold - totalPressure) / cavitationThreshold, 0.0, 1.0);
    }

    // Foam and surface calculations (Toggleable)
    var foamIntensity = 0.0;
    var foamInfluence = 0.0;
    if effectsToggle.enableFoam != 0u {
        var turbulence = velocityMagnitude * 0.1;
        foamIntensity = cavitationFactor * turbulence * 2.0;
        foamInfluence = foamIntensity;
    }

    // === REYNOLDS NUMBER TURBULENCE PHYSICS === (Toggleable)
    var turbulenceIntensity = 0.0;
    var vorticity = vec3f(0.0);
    var vorticityMagnitude = 0.0;
    var cascadeEffect = 1.0;

    if effectsToggle.enableReynoldsPhysics != 0u {
        var kinematicViscosity = 0.001;
        var characteristicLength = uniforms.sphere_size;
        var reynoldsNumber = velocityMagnitude * characteristicLength / kinematicViscosity;
        var turbulenceOnset = 4000.0;
        turbulenceIntensity = clamp((reynoldsNumber - turbulenceOnset) / turbulenceOnset, 0.0, 1.0);

        // Create turbulent vorticity from velocity gradients
        var velocityGradient = ddx + ddy;
        vorticity = cross(ddx, ddy);
        vorticityMagnitude = length(vorticity) * turbulenceIntensity;

        // Kolmogorov cascade
        var kolmogorovScale = pow(pow(kinematicViscosity, 3.0) / (velocityMagnitude * velocityMagnitude * velocityMagnitude + 1e-6), 0.25);
        cascadeEffect = 1.0 / (1.0 + kolmogorovScale * 10.0);
    }

    // Calculate surface variation data that multiple effects can use
    var thicknessL = textureLoad(thickness_texture, vec2u(input.iuv + vec2f(-1.0, 0.0)), 0).r;
    var thicknessR = textureLoad(thickness_texture, vec2u(input.iuv + vec2f(1.0, 0.0)), 0).r;
    var thicknessU = textureLoad(thickness_texture, vec2u(input.iuv + vec2f(0.0, -1.0)), 0).r;
    var thicknessD = textureLoad(thickness_texture, vec2u(input.iuv + vec2f(0.0, 1.0)), 0).r;

    // Calculate surface gradients and curvature for multiple effects
    var thicknessGradX = (thicknessR - thicknessL) * 0.5;
    var thicknessGradY = (thicknessD - thicknessU) * 0.5;
    var thicknessCurvatureX = thicknessR + thicknessL - 2.0 * thickness;
    var thicknessCurvatureY = thicknessD + thicknessU - 2.0 * thickness;

    // Initialize surface offset for debug visualization
    var surfaceOffset = vec3f(0.0);

    // Apply turbulent surface deformation (Toggleable)
    var turbulentNormal = normal;
    if effectsToggle.enableTurbulentNormals != 0u {
        // Use REAL fluid simulation data, not simplified patterns
        var turbulentStrength = max(turbulenceIntensity, 0.1) * waterAppearance.waveHeight; // Use wave height parameter

        // Only apply effects where there's actual variation in the simulation
        if turbulenceIntensity > 0.1 && velocityMagnitude > 0.01 {

            // Use only the natural variation in thickness and density
            var thicknessVariation = thickness - 1.0; // Natural thickness variation
            var densityVariation = density - 1.0;     // Natural density variation

            // Create surface perturbations only from real fluid properties
            var realFluidOffset = vec3f(
                thicknessVariation * turbulentStrength,  // Surface height varies with thickness
                0.0,                                     // Keep Y minimal
                densityVariation * turbulentStrength     // Surface responds to density changes
            );

            // Scale by actual turbulence and velocity with proper physics scaling
            var reynoldsScaling = 1.0;
            if effectsToggle.enableReynoldsPhysics != 0u {
                reynoldsScaling = 1.0 + turbulenceIntensity * cascadeEffect;
            }
            realFluidOffset *= reynoldsScaling * velocityMagnitude * lightingControls.volumetricIntensity;

            // Add vorticity effect only if significant
            if vorticityMagnitude > 0.1 {
                var vorticityEffect = normalize(vorticity) * vorticityMagnitude * turbulentStrength;
                realFluidOffset += vorticityEffect;
            }

            surfaceOffset = realFluidOffset;

            // Apply the fluid-based perturbation
            turbulentNormal = normalize(normal + surfaceOffset);

            // Physics-based stability check using actual flow conditions
            var stabilityThreshold = clamp(0.2 + velocityMagnitude * 0.3, 0.1, 0.8);
            if dot(turbulentNormal, normal) < stabilityThreshold {
                var mixFactor = clamp(turbulenceIntensity + velocityMagnitude, 0.3, 0.9);
                turbulentNormal = mix(normal, turbulentNormal, mixFactor);
            }
        }
    }

    normal = turbulentNormal;

    // Surface properties based on turbulence - enhanced for more shine
    var surfaceRoughness = clamp(velocityMagnitude * 0.2 + foamIntensity * 0.15 + turbulenceIntensity * 0.1, 0.0, 0.4); // Reduced roughness values
    var baseSpecularPower = mix(1024.0, 96.0, surfaceRoughness); // Increased specular power range
    var specularIntensity = mix(1.5, 0.6, surfaceRoughness); // Increased specular intensity range

    // Specular calculations with controllable lighting (Toggleable)
    var specular: f32 = 0.0;
    if effectsToggle.enableSpecular != 0u {
        var viewDotNormal = abs(dot(normal, -rayDir));
        var fresnelSpecular = pow(1.0 - viewDotNormal, 2.0);

        // Apply global specular intensity multiplier
        var adjustedSpecularIntensity = specularIntensity * lightingControls.specularIntensityMultiplier;

        // Multi-light specular calculations with controllable lights
        var mainSpecular = 0.0;
        var fillSpecular = 0.0;
        var rimSpecular = 0.0;

        if lightingControls.mainLightEnabled != 0u {
            var mainH = normalize(mainLightDir - rayDir);
            mainSpecular = pow(max(0.0, dot(mainH, normal)), baseSpecularPower) * adjustedSpecularIntensity * fresnelSpecular * lightingControls.mainLightIntensity;
        }

        if lightingControls.fillLightEnabled != 0u {
            var fillH = normalize(fillLightDir - rayDir);
            fillSpecular = pow(max(0.0, dot(fillH, normal)), baseSpecularPower * 0.7) * adjustedSpecularIntensity * 0.4 * lightingControls.fillLightIntensity;
        }

        if lightingControls.rimLightEnabled != 0u {
            var rimH = normalize(rimLightDir - rayDir);
            rimSpecular = pow(max(0.0, dot(rimH, normal)), baseSpecularPower * 0.5) * adjustedSpecularIntensity * 0.3 * lightingControls.rimLightIntensity;
        }

        specular = (mainSpecular + fillSpecular + rimSpecular) * (1.0 - foamInfluence * 0.7);
    }    // Enhanced subsurface scattering with controllable lighting (Toggleable)
    var subsurface: f32 = 0.0;
    if effectsToggle.enableSubsurface != 0u {
        var depthFactor = clamp(abs(viewPos.z) * 0.12, 0.0, 1.0);
        var baseSubsurfaceIntensity = mix(0.4, 0.15, depthFactor);
        var adjustedSubsurfaceIntensity = baseSubsurfaceIntensity * lightingControls.subsurfaceIntensityMultiplier;

        // Calculate subsurface contribution from each light source
        var mainSubsurface = 0.0;
        var fillSubsurface = 0.0;
        var rimSubsurface = 0.0;

        if lightingControls.mainLightEnabled != 0u {
            mainSubsurface = max(0.0, dot(-mainLightDir, normal)) * thickness * adjustedSubsurfaceIntensity * lightingControls.mainLightIntensity;
        }

        if lightingControls.fillLightEnabled != 0u {
            fillSubsurface = max(0.0, dot(-fillLightDir, normal)) * thickness * adjustedSubsurfaceIntensity * lightingControls.fillLightIntensity * 0.5;
        }

        if lightingControls.rimLightEnabled != 0u {
            rimSubsurface = max(0.0, dot(-rimLightDir, normal)) * thickness * adjustedSubsurfaceIntensity * lightingControls.rimLightIntensity * 0.3;
        }

        subsurface = mainSubsurface + fillSubsurface + rimSubsurface;
    }

    // PHYSICS-BASED LIGHT ABSORPTION using Beer-Lambert Law (Toggleable) - IMPROVED WITH WAVELENGTH DEPENDENCE
    var lightAttenuation: vec3f = vec3f(1.0);
    if effectsToggle.enableAbsorption != 0u {
        // Use much milder realistic absorption that works with any water color
        var baseWaterRGB = waterAppearance.color.rgb;

        // Very subtle absorption that preserves water color character
        var waterAbsorptionCoeffs = vec3f(0.05, 0.04, 0.03); // Reduced from 0.1, 0.08, 0.06

        // Modulate absorption by water color saturation, not brightness
        var colorSaturation = length(baseWaterRGB - vec3f(dot(baseWaterRGB, vec3f(0.333))));
        var absorptionScale = mix(0.2, 0.8, colorSaturation); // Reduced from 0.3-1.0 to 0.2-0.8
        waterAbsorptionCoeffs *= absorptionScale;

        // Calculate actual path length through water volume
        var waterPathLength = thickness * uniforms.sphere_size * 0.1; // Reduced from 0.2 to 0.1

        // Account for density variations affecting optical path
        var opticalDensity = density;
        var scatteringInfluence = velocityMagnitude * 0.02; // Reduced from 0.05 to 0.02
        var effectivePathLength = waterPathLength * opticalDensity * (1.0 + scatteringInfluence);

        // Add suspended particle absorption (turbidity effects)
        var particleConcentration = clamp(velocityMagnitude * 0.08 + turbulenceIntensity * 0.05, 0.0, 0.3); // Reduced values
        var particleAbsorptionCoeffs = vec3f(0.015, 0.015, 0.015) * particleConcentration; // Reduced from 0.03

        // Total absorption includes water + particles
        var totalAbsorptionCoeffs = waterAbsorptionCoeffs + particleAbsorptionCoeffs;

        // Apply Beer-Lambert law: I = I₀ * e^(-α * d)
        lightAttenuation = exp(-totalAbsorptionCoeffs * effectivePathLength);

        // Ensure reasonable bounds for light attenuation
        lightAttenuation = clamp(lightAttenuation, vec3f(0.4), vec3f(1.0)); // Increased minimum from 0.2 to 0.4
    }    // PHYSICS-BASED TRANSPARENCY using Beer's Law and Fresnel Transmission
    var physicsBasedAlpha = 1.0;
    var transmissionCoeff = vec3f(1.0);

    // Calculate viewing angle for optical path length
    var viewDotNormal = abs(dot(normal, -rayDir));
    var cosTheta = max(viewDotNormal, 0.01); // Prevent division by zero

    // Real water optical properties
    var waterIOR = 1.333; // Index of refraction for water
    var airIOR = 1.0;     // Index of refraction for air

    // Fresnel transmission coefficient (energy transmitted, not reflected)
    var fresnelTransmission = 1.0;
    if effectsToggle.enableFresnel != 0u {
        // Schlick's approximation for transmission
        var F0 = pow((airIOR - waterIOR) / (airIOR + waterIOR), 2.0);
        var oneMinusCosTheta = 1.0 - cosTheta;
        var fresnelReflectance = F0 + (1.0 - F0) * pow(oneMinusCosTheta, 5.0);
        fresnelTransmission = 1.0 - fresnelReflectance;
    }

    // Apply transmission coefficient calculation only if absorption is enabled
    if effectsToggle.enableAbsorption != 0u {
        // Calculate optical path length through water volume
        // Path length depends on viewing angle (Beer's Law with geometric correction)
        var geometricThickness = thickness * uniforms.sphere_size * 0.15;
        var opticalPathLength = geometricThickness / cosTheta; // Longer path at grazing angles

        // Wavelength-dependent absorption coefficients for pure water (per meter)
        // These are realistic values scaled for our simulation
        var pureWaterAbsorption = vec3f(
            0.45,  // Red absorption (strongest)
            0.15,  // Green absorption (moderate)
            0.05   // Blue absorption (weakest)
        );

        // Modulate absorption by water color characteristics
        var waterColorInfluence = waterAppearance.color.rgb;
        var colorBasedAbsorption = pureWaterAbsorption * (2.0 - waterColorInfluence);

        // Add turbidity effects from suspended particles
        var turbidityFactor = clamp(
            velocityMagnitude * 0.2 + turbulenceIntensity * 0.15 + (1.0 - cavitationFactor) * 0.1, // Cavitation creates bubbles/particles
            0.0, 0.8
        );

        var turbidityAbsorption = vec3f(0.1) * turbidityFactor;
        var totalAbsorption = colorBasedAbsorption + turbidityAbsorption;

        // Account for density variations affecting light scattering
        var densityScattering = clamp((density - 1.0) * 0.3, 0.0, 0.4);
        totalAbsorption += vec3f(densityScattering);

        // Apply Beer's Law: T = e^(-α * d)
        transmissionCoeff = exp(-totalAbsorption * opticalPathLength);
    }    // Calculate physics-based alpha from transmission
    if effectsToggle.enableAbsorption != 0u {
        // Use luminance-weighted average for alpha calculation
        var transmissionLuminance = dot(transmissionCoeff, vec3f(0.299, 0.587, 0.114));
        physicsBasedAlpha = transmissionLuminance * fresnelTransmission;
    } else {
        // Without absorption, use simple Fresnel-based transparency
        physicsBasedAlpha = fresnelTransmission;
    }

    // Add thickness-based opacity for volume rendering
    var volumeOpacity = clamp(thickness * 0.8, 0.0, 0.9);
    physicsBasedAlpha = mix(physicsBasedAlpha, 1.0, volumeOpacity);

    // Foam increases opacity
    physicsBasedAlpha = mix(physicsBasedAlpha, 1.0, foamInfluence * 0.6);

    // Apply depth-based opacity increase (deeper water appears more opaque)
    var depthOpacity = clamp(abs(viewPos.z) * 0.05, 0.0, 0.3);
    physicsBasedAlpha = mix(physicsBasedAlpha, 1.0, depthOpacity);

    // Ensure minimum visibility and apply user transparency control
    physicsBasedAlpha = clamp(physicsBasedAlpha, 0.1, 1.0);
    physicsBasedAlpha = mix(waterAppearance.transparency, physicsBasedAlpha, 0.7); // Blend with user control

    // Apply base water color with proper mixing ratios
    var baseWaterColor: vec3f = waterAppearance.color.rgb;

    // Apply light absorption to the base color (darkens with depth)
    baseWaterColor *= lightAttenuation;

    // Calculate subsurface color after baseWaterColor is defined
    var subsurfaceColor: vec3f = baseWaterColor * subsurface * mix(1.0, 0.6, waterAppearance.transparency); // Increased from 0.5-0.25 to 0.5-0.6

    // Fresnel calculations (Toggleable) - IMPROVED WITH SCHLICK'S APPROXIMATION
    var fresnel: f32 = 1.0;
    if effectsToggle.enableFresnel != 0u {
        var viewDotNormal = abs(dot(normal, -rayDir));

        // Schlick's approximation with proper IOR for water (1.33)
        // Pre-calculated F0 for water: ((1.0 - 1.33) / (1.0 + 1.33))^2 = 0.02037
        var F0 = 0.02037; // F0 for water at normal incidence
        var oneMinusCosTheta = 1.0 - viewDotNormal;
        var fresnelSchlick = F0 + (1.0 - F0) * pow(oneMinusCosTheta, 5.0);

        fresnel = fresnelSchlick * waterAppearance.reflectivity;
    }

    // Environment reflection (Toggleable)
    var reflectionColor: vec3f = vec3f(0.0);
    if effectsToggle.enableReflection != 0u {
        var reflectDir = reflect(rayDir, normal);
        var worldReflectDir = (uniforms.inv_view_matrix * vec4f(reflectDir, 0.0)).xyz;
        reflectionColor = textureSampleLevel(envmap_texture, texture_sampler, worldReflectDir, 0.0).rgb;
        reflectionColor *= fresnel * edgeFactor;
    }

    // Depth-based coloring (Toggleable) - IMPROVED WITH REALISTIC UNDERWATER COLOR PROGRESSION
    var depthColor: vec3f = vec3f(1.0);
    if effectsToggle.enableDepthColoring != 0u {
        var waterDepthMeters = abs(viewPos.z) * uniforms.sphere_size * 0.1;

        // Realistic underwater color progression - wavelength-dependent attenuation
        var redFalloff = exp(-waterDepthMeters * 0.5);    // Red disappears quickly (5-10m)
        var greenFalloff = exp(-waterDepthMeters * 0.15); // Green fades moderately (20-30m)
        var blueFalloff = exp(-waterDepthMeters * 0.05);  // Blue persists longest (50-100m+)

        depthColor = vec3f(redFalloff, greenFalloff, blueFalloff);

        // Derive deep water tint from actual water color, not hardcoded blue
        var baseWaterRGB = waterAppearance.color.rgb;
        var deepWaterTint = mix(
            vec3f(1.0),
            baseWaterRGB * vec3f(0.3, 0.8, 1.2), // Emphasize cooler tones of actual water color
            clamp(waterDepthMeters * 0.2, 0.0, 0.8)
        );
        depthColor *= deepWaterTint;
    }

    // Velocity-based coloring (Toggleable)
    var velocityColor: vec3f = vec3f(1.0);
    if effectsToggle.enableVelocityColoring != 0u {
        var velocityColorFactor = clamp(velocityMagnitude * 0.5, 0.0, 1.0);        // Use a more neutral variation of the water color for velocity effects
        var velocityTint = mix(vec3f(1.0), waterAppearance.color.rgb * vec3f(1.0, 1.0, 1.0), 0.3);
        velocityColor = mix(vec3f(1.0), velocityTint, velocityColorFactor);
    }

    // COMPREHENSIVE RIM LIGHTING SYSTEM (Toggleable)
    var rimLighting: vec3f = vec3f(0.0);
    if effectsToggle.enableRimLighting != 0u {
        var viewDotNormal = abs(dot(normal, -rayDir));
        var fresnel_rim = 1.0 - viewDotNormal;

        // Multi-layered rim lighting for different edge conditions
        // Primary rim - sharp edge detection
        var primaryRim = pow(fresnel_rim, 1.2) * 0.8; // Increased intensity and reduced power

        // Secondary rim - softer glow for volume edges
        var secondaryRim = pow(fresnel_rim, 2.5) * 1.0; // Increased intensity

        // Tertiary rim - subtle atmospheric glow
        var tertiaryRim = pow(fresnel_rim, 4.0) * 1.2; // Increased intensity

        // Thickness-based rim variation
        var thicknessRim = pow(fresnel_rim, 1.8) * clamp(1.0 - thickness * 0.2, 0.4, 1.0) * 0.6; // Brighter

        // Velocity-influenced rim lighting (moving water catches more light)
        var velocityRim = pow(fresnel_rim, 2.0) * clamp(velocityMagnitude * 1.2, 0.0, 0.8) * 0.5; // Brighter

        // Depth-influenced rim (deeper water has darker rims)
        var depthRimFactor = clamp(1.0 - abs(viewPos.z) * 0.08, 0.3, 1.0);        // Multi-light rim contributions with controllable lighting
        var mainRimContribution = 0.0;
        var fillRimContribution = 0.0;
        var rimRimContribution = 0.0;

        if lightingControls.mainLightEnabled != 0u {
            mainRimContribution = (primaryRim + secondaryRim) * max(0.0, dot(normal, -mainLightDir)) * 1.0 * lightingControls.mainLightIntensity; // Increased from 0.7
        }

        if lightingControls.fillLightEnabled != 0u {
            fillRimContribution = thicknessRim * max(0.0, dot(normal, -fillLightDir)) * 0.7 * lightingControls.fillLightIntensity; // Increased from 0.4
        }

        if lightingControls.rimLightEnabled != 0u {
            rimRimContribution = (tertiaryRim + velocityRim) * max(0.0, dot(normal, -rimLightDir)) * 0.8 * lightingControls.rimLightIntensity; // Increased from 0.5
        }

        // Combine all rim components with environmental influence
        var combinedRim = (mainRimContribution + fillRimContribution + rimRimContribution) * depthRimFactor;

        // Color the rim lighting with controllable light colors
        var rimColor = mix(
            bgColor * 0.3,
            waterAppearance.color.rgb * 1.2,
            clamp(thickness * 0.5, 0.2, 0.8)
        );

        // Apply light colors to rim lighting
        var coloredRimLighting = vec3f(0.0);
        if lightingControls.mainLightEnabled != 0u {
            coloredRimLighting += rimColor * mainRimContribution * lightingControls.mainLightColor;
        }
        if lightingControls.fillLightEnabled != 0u {
            coloredRimLighting += rimColor * fillRimContribution * lightingControls.fillLightColor;
        }
        if lightingControls.rimLightEnabled != 0u {
            coloredRimLighting += rimColor * rimRimContribution * lightingControls.rimLightColor;
        }

        rimLighting = coloredRimLighting;
    }

    // VOLUMETRIC INTERIOR LIGHTING SYSTEM
    var interiorLighting: vec3f = vec3f(0.0);

    // Calculate light penetration into water volume
    var waterDepth = abs(viewPos.z);
    var volumeThickness = thickness * uniforms.sphere_size * 0.5;    // Multi-directional light penetration with controllable lighting
    var lightPenetrationMain = 0.0;
    var lightPenetrationFill = 0.0;
    var lightPenetrationRim = 0.0;

    if lightingControls.mainLightEnabled != 0u {
        lightPenetrationMain = max(0.0, -dot(normal, mainLightDir)) * 1.0 * lightingControls.mainLightIntensity; // Increased from 0.6
    }
    if lightingControls.fillLightEnabled != 0u {
        lightPenetrationFill = max(0.0, -dot(normal, fillLightDir)) * 0.6 * lightingControls.fillLightIntensity; // Increased from 0.3
    }
    if lightingControls.rimLightEnabled != 0u {
        lightPenetrationRim = max(0.0, -dot(normal, rimLightDir)) * 0.4 * lightingControls.rimLightIntensity; // Increased from 0.2
    }

    var totalLightPenetration = lightPenetrationMain + lightPenetrationFill + lightPenetrationRim;

    // Depth-based light attenuation (exponential falloff)
    var depthAttenuation = exp(-waterDepth * 0.08); // Reduced from 0.15
    var thicknessAttenuation = exp(-volumeThickness * 0.4); // Reduced from 0.8

    // Scattering-based interior illumination
    var scatteringFactor = clamp(velocityMagnitude * 0.5 + turbulenceIntensity * 0.6, 0.2, 1.5); // Increased values
    var scatteredLight = totalLightPenetration * scatteringFactor * 0.5; // Increased from 0.25

    // REAL caustics based on surface variation (no artificial patterns)
    var causticIntensity = 0.0;
    if effectsToggle.enableCaustics != 0u {
        // Use actual surface curvature for caustic focusing effects
        var surfaceCurvature = abs(thicknessCurvatureX) + abs(thicknessCurvatureY);
        var curvatureFocus = clamp(surfaceCurvature * 10.0, 0.0, 1.0);
        causticIntensity = curvatureFocus * totalLightPenetration * 0.2;
    } else {
        // Fallback: use surface roughness variation
        var roughnessVariation = clamp(surfaceRoughness * 2.0, 0.0, 1.0);
        causticIntensity = roughnessVariation * totalLightPenetration * 0.1;
    }

    // Deep water ambient illumination with controllable ambient
    var deepAmbient = ambientLight * clamp(thickness * 0.6, 0.2, 0.8) * depthAttenuation; // Increased values

    // Color the interior lighting with controllable light colors
    var baseInteriorLightColor = mix(
        bgColor * 0.7,                     // Environmental color influence
        waterAppearance.color.rgb * 0.4,   // Water color influence
        clamp(waterDepth * 0.05, 0.0, 0.5) // Depth-based color mixing
    );

    // Apply light colors based on contribution
    var interiorLightColor = baseInteriorLightColor;
    if lightingControls.mainLightEnabled != 0u && lightPenetrationMain > 0.0 {
        interiorLightColor = mix(interiorLightColor,
            interiorLightColor * lightingControls.mainLightColor,
            lightPenetrationMain / (lightPenetrationMain + lightPenetrationFill + lightPenetrationRim + 0.001));
    }
    if lightingControls.fillLightEnabled != 0u && lightPenetrationFill > 0.0 {
        interiorLightColor = mix(interiorLightColor,
            interiorLightColor * lightingControls.fillLightColor,
            lightPenetrationFill / (lightPenetrationMain + lightPenetrationFill + lightPenetrationRim + 0.001) * 0.5);
    }
    if lightingControls.rimLightEnabled != 0u && lightPenetrationRim > 0.0 {
        interiorLightColor = mix(interiorLightColor,
            interiorLightColor * lightingControls.rimLightColor,
            lightPenetrationRim / (lightPenetrationMain + lightPenetrationFill + lightPenetrationRim + 0.001) * 0.3);
    }

    // Combine interior lighting components
    interiorLighting = interiorLightColor * (scatteredLight * depthAttenuation + causticIntensity * thicknessAttenuation + deepAmbient);

    // Add particle-based light scattering in turbulent areas
    if turbulenceIntensity > 0.1 {
        var particleScattering = turbulenceIntensity * totalLightPenetration * 0.1;
        var particleColor = mix(waterAppearance.color.rgb, waterAppearance.color.rgb * vec3f(1.1, 1.05, 1.0), 0.3);
        interiorLighting += particleColor * particleScattering * thicknessAttenuation;
    }

    // Foam color mixing
    var foamColor = vec3f(1.0, 1.0, 1.0) * foamInfluence;

    // Combine all lighting components
    var finalColor: vec3f = baseWaterColor * depthColor * velocityColor;
    finalColor += subsurfaceColor;
    finalColor += reflectionColor;
    finalColor += vec3f(specular); // Convert scalar to vec3f
    finalColor += rimLighting; // Enhanced rim lighting
    finalColor += interiorLighting; // New interior lighting
    finalColor = mix(finalColor, foamColor, foamInfluence * 0.8);    // Add controllable ambient lighting
    finalColor += ambientContribution * 0.2; // Increased from 0.05

    // Apply edge enhancement
    finalColor *= edgeFactor;

    // Final alpha calculation
    var alpha = mix(waterAppearance.transparency, 1.0, thickness * 0.5);
    alpha = clamp(alpha, 0.1, 1.0);    // Replace simple alpha with physics-based transparency
    alpha = physicsBasedAlpha;

    // Apply transmission coefficient to final color for proper transparency (only if absorption is enabled)
    if effectsToggle.enableAbsorption != 0u {
        finalColor *= transmissionCoeff;
    }

    // DEBUG MODE VISUALIZATION SYSTEM
    if debug.mode != 0u {
        switch (debug.mode) {
            case 1u: { // DEPTH
                // Use view space depth for better visualization
                let viewDepth = abs(viewPos.z);
                let normalizedDepth = viewDepth * debug.intensity * 0.1;
                return vec4f(vec3f(normalizedDepth), 1.0);
            }
            case 2u: { // THICKNESS
                // Combine thickness with density for more variation
                let thicknessWithDensity = thickness * density * debug.intensity * 0.2;
                return vec4f(vec3f(thicknessWithDensity), 1.0);
            }
            case 3u: { // NORMALS
                if debug.layer == 0u {
                    // Raw normals (world space)
                    return vec4f(0.5 * normal + 0.5, 1.0);
                } else {
                    // Normal components separated
                    return vec4f(vec3f(abs(normal.x)), 1.0); // X component only
                }
            }
            case 4u: { // ABSORPTION
                // Use actual light attenuation calculation
                let absorptionVisualization = (1.0 - length(lightAttenuation)) * debug.intensity;
                return vec4f(vec3f(absorptionVisualization), 1.0);
            }
            case 5u: { // VELOCITY/FLOW
                // Use actual velocity from position derivatives
                let actualVelocity = velocityMagnitude * debug.intensity;
                return vec4f(vec3f(actualVelocity), 1.0);
            }
            case 6u: { // PRESSURE (derived from compression)
                // Use actual density variation instead of uniform thickness
                let pressureFromDensity = density * debug.intensity * 0.1;
                return vec4f(vec3f(pressureFromDensity), 1.0);
            }
            case 7u: { // CURVATURE
                // Use actual surface curvature from turbulent normals calculation
                let actualCurvature = (abs(thicknessCurvatureX) + abs(thicknessCurvatureY)) * debug.intensity;
                return vec4f(vec3f(actualCurvature), 1.0);
            }
            case 8u: { // FRESNEL
                return vec4f(vec3f(fresnel), 1.0);
            }
            case 9u: { // CAUSTICS
                // Show real caustic intensity from surface curvature
                let realCausticsVisualization = causticIntensity * debug.intensity;
                return vec4f(vec3f(realCausticsVisualization), 1.0);
            }
            case 10u: { // REFRACTION
                // Show actual surface normal variation
                let normalVariation = length(surfaceOffset) * debug.intensity;
                return vec4f(vec3f(normalVariation), 1.0);
            }
            case 11u: { // SURFACE GRADIENTS
                // Visualize actual thickness gradients causing the lines
                let gradientMagnitude = sqrt(thicknessGradX * thicknessGradX + thicknessGradY * thicknessGradY) * debug.intensity;
                return vec4f(vec3f(gradientMagnitude), 1.0);
            }
            default: { // ERROR COLOR
                return vec4f(1.0, 0.0, 1.0, 1.0); // Error color (magenta)
            }
        }
    }

    return vec4f(finalColor, alpha);
}
