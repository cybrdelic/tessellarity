@group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(3) var thickness_texture: texture_2d<f32>;
@group(0) @binding(4) var envmap_texture: texture_cube<f32>;
@group(0) @binding(5) var<uniform> waterAppearance: WaterAppearance;
@group(0) @binding(6) var<uniform> debug: DebugUniforms;
@group(0) @binding(7) var<uniform> effectsToggle: EffectsToggle;

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
    edgeFactor = mix(1.0, 2.0, clamp(depthGradient * 10.0, 0.0, 1.0));

    rayDir = normalize(viewPos);

    // ENHANCED LIGHTING SYSTEM - Multiple light sources for better illumination
    var mainLightDir = normalize((uniforms.view_matrix * vec4f(0.3, -0.7, -0.6, 0.)).xyz);
    var fillLightDir = normalize((uniforms.view_matrix * vec4f(-0.5, -0.3, 0.8, 0.)).xyz);
    var rimLightDir = normalize((uniforms.view_matrix * vec4f(0.8, 0.2, -0.4, 0.)).xyz);

    // Use main light for primary calculations
    var lightDir = mainLightDir;
    var H: vec3f = normalize(lightDir - rayDir);

    // Calculate ambient lighting from environment
    var ambientLight = dot(bgColor, vec3f(0.299, 0.587, 0.114)) * 0.15; // Reduced from 0.4 to 0.15

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

    // Apply turbulent surface deformation (Toggleable)
    var turbulentNormal = normal;
    if effectsToggle.enableTurbulentNormals != 0u {
        var turbulentDeformation = vorticity * 0.02 * turbulenceIntensity * cascadeEffect; // Reduced from 0.05
        turbulentNormal = normal + turbulentDeformation;

        // Simplified high-frequency details based on flow simulation
        var highFreqTurbulence = vec3f(
            sin(viewPos.x * 15.0 + vorticityMagnitude * 10.0) * turbulenceIntensity * 0.01,
            0.0,
            cos(viewPos.z * 15.0 + cascadeEffect * 8.0) * turbulenceIntensity * 0.01
        );
        turbulentNormal += highFreqTurbulence;

        // Add pressure-based surface deformation for more variation
        var pressureDeformation = vec3f(
            (density - 1.0) * 0.02 * sin(viewPos.x * 20.0),
            0.0,
            (density - 1.0) * 0.02 * cos(viewPos.z * 20.0)
        );
        turbulentNormal += pressureDeformation;

        // Add velocity-based surface ripples
        var velocityRipples = vec3f(
            velocityX * 0.01 * sin(viewPos.z * 25.0),
            0.0,
            velocityZ * 0.01 * cos(viewPos.x * 25.0)
        );
        turbulentNormal += velocityRipples;
    }

    normal = normalize(turbulentNormal);

    // Surface properties based on turbulence - enhanced for more shine
    var surfaceRoughness = clamp(velocityMagnitude * 0.4 + foamIntensity * 0.25 + turbulenceIntensity * 0.15, 0.0, 0.7);
    var baseSpecularPower = mix(768.0, 48.0, surfaceRoughness); // Increased specular power range
    var specularIntensity = mix(0.9, 0.2, surfaceRoughness); // Reduced from 1.8-0.4 to 0.9-0.2

    // Specular calculations (Toggleable)
    var specular: f32 = 0.0;
    if effectsToggle.enableSpecular != 0u {
        var viewDotNormal = abs(dot(normal, -rayDir));
        var fresnelSpecular = pow(1.0 - viewDotNormal, 2.0);

        // Multi-light specular calculations for brighter highlights
        var mainSpecular = pow(max(0.0, dot(H, normal)), baseSpecularPower) * specularIntensity * fresnelSpecular;
        var fillSpecular = pow(max(0.0, dot(normalize(fillLightDir - rayDir), normal)), baseSpecularPower * 0.7) * specularIntensity * 0.4;
        var rimSpecular = pow(max(0.0, dot(normalize(rimLightDir - rayDir), normal)), baseSpecularPower * 0.5) * specularIntensity * 0.3;

        specular = (mainSpecular + fillSpecular + rimSpecular) * (1.0 - foamInfluence * 0.7);
    }

    // Enhanced subsurface scattering (Toggleable)
    var subsurface: f32 = 0.0;
    if effectsToggle.enableSubsurface != 0u {
        var depthFactor = clamp(abs(viewPos.z) * 0.12, 0.0, 1.0); // Reduced depth influence
        var subsurfaceIntensity = mix(0.4, 0.15, depthFactor); // Further reduced from 0.8-0.3 to 0.4-0.15
        subsurface = max(0.0, dot(-lightDir, normal)) * thickness * subsurfaceIntensity;
    }

    // PHYSICS-BASED LIGHT ABSORPTION using Beer-Lambert Law (Toggleable)
    var lightAttenuation: vec3f = vec3f(1.0);
    if effectsToggle.enableAbsorption != 0u {
        // Light absorption coefficients - red light gets absorbed more in water
        var waterAbsorptionCoeffs = vec3f(
            0.45,   // Red light absorption coefficient (strongest)
            0.25,   // Green light absorption coefficient (moderate)
            0.05    // Blue light absorption coefficient (minimal)
        );

        // Calculate actual path length through water volume
        var waterPathLength = thickness * uniforms.sphere_size * 0.5;

        // Account for density variations affecting optical path
        var opticalDensity = density;
        var scatteringInfluence = velocityMagnitude * 0.1;
        var effectivePathLength = waterPathLength * opticalDensity * (1.0 + scatteringInfluence);

        // Add suspended particle absorption (turbidity effects)
        var particleConcentration = clamp(velocityMagnitude * 0.3 + turbulenceIntensity * 0.2, 0.0, 1.0);
        var particleAbsorptionCoeffs = vec3f(0.1, 0.1, 0.1) * particleConcentration;

        // Total absorption includes water + particles
        var totalAbsorptionCoeffs = waterAbsorptionCoeffs + particleAbsorptionCoeffs;

        // Apply Beer-Lambert law: I = I₀ * e^(-α * d)
        lightAttenuation = exp(-totalAbsorptionCoeffs * effectivePathLength);

        // Ensure reasonable bounds for light attenuation
        lightAttenuation = clamp(lightAttenuation, vec3f(0.1), vec3f(1.0));
    }

    // Apply base water color with proper mixing ratios
    var baseWaterColor: vec3f = waterAppearance.color.rgb;

    // Apply light absorption to the base color (darkens with depth)
    baseWaterColor *= lightAttenuation;

    // Calculate subsurface color after baseWaterColor is defined
    var subsurfaceColor: vec3f = baseWaterColor * subsurface * mix(0.5, 0.25, waterAppearance.transparency); // Further reduced from 1.0-0.5 to 0.5-0.25

    // Fresnel calculations (Toggleable)
    var fresnel: f32 = 1.0;
    if effectsToggle.enableFresnel != 0u {
        var viewDotNormal = abs(dot(normal, -rayDir));
        fresnel = pow(1.0 - viewDotNormal, 3.0) * waterAppearance.reflectivity;
    }

    // Environment reflection (Toggleable)
    var reflectionColor: vec3f = vec3f(0.0);
    if effectsToggle.enableReflection != 0u {
        var reflectDir = reflect(rayDir, normal);
        var worldReflectDir = (uniforms.inv_view_matrix * vec4f(reflectDir, 0.0)).xyz;
        reflectionColor = textureSampleLevel(envmap_texture, texture_sampler, worldReflectDir, 0.0).rgb;
        reflectionColor *= fresnel * edgeFactor;
    }

    // Depth-based coloring (Toggleable)
    var depthColor: vec3f = vec3f(1.0);
    if effectsToggle.enableDepthColoring != 0u {
        var depthFactor = clamp(abs(viewPos.z) * 0.1, 0.0, 1.0);
        // Use water appearance color for depth tinting instead of hardcoded values
        var deepWaterTint = waterAppearance.color.rgb * 0.3; // Darken the base water color
        depthColor = mix(vec3f(1.0, 1.0, 1.0), deepWaterTint, depthFactor);
    }

    // Velocity-based coloring (Toggleable)
    var velocityColor: vec3f = vec3f(1.0);
    if effectsToggle.enableVelocityColoring != 0u {
        var velocityColorFactor = clamp(velocityMagnitude * 0.5, 0.0, 1.0);
        // Use a slight variation of the water color for velocity effects
        var velocityTint = mix(vec3f(1.0), waterAppearance.color.rgb * vec3f(0.8, 0.9, 1.2), 0.5);
        velocityColor = mix(vec3f(1.0), velocityTint, velocityColorFactor);
    }

    // Rim lighting (Toggleable)
    var rimLight: f32 = 0.0;
    if effectsToggle.enableRimLighting != 0u {
        var viewDotNormal = abs(dot(normal, -rayDir));
        rimLight = pow(1.0 - viewDotNormal, 2.0) * 0.25; // Reduced from 0.5 to 0.25
    }

    // Foam color mixing
    var foamColor = vec3f(1.0, 1.0, 1.0) * foamInfluence;

    // Combine all lighting components
    var finalColor: vec3f = baseWaterColor * depthColor * velocityColor;
    finalColor += subsurfaceColor;
    finalColor += reflectionColor;
    finalColor += vec3f(specular); // Convert scalar to vec3f
    finalColor += vec3f(rimLight); // Convert scalar to vec3f
    finalColor = mix(finalColor, foamColor, foamInfluence * 0.8);

    // Add ambient lighting
    finalColor += vec3f(ambientLight * 0.05); // Reduced from 0.1 to 0.05

    // Apply edge enhancement
    finalColor *= edgeFactor;

    // Final alpha calculation
    var alpha = mix(waterAppearance.transparency, 1.0, thickness * 0.5);
    alpha = clamp(alpha, 0.1, 1.0);

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
                // Use actual surface curvature from cross product magnitude
                let actualCurvature = length(cross(ddx, ddy)) / (length(ddx) * length(ddy) + 0.001);
                return vec4f(vec3f(actualCurvature * debug.intensity), 1.0);
            }
            case 8u: { // FRESNEL
                return vec4f(vec3f(fresnel), 1.0);
            }
            case 9u: { // CAUSTICS
                // Basic caustics visualization
                let causticsVisualization = surfaceRoughness * debug.intensity;
                return vec4f(vec3f(causticsVisualization), 1.0);
            }
            case 10u: { // REFRACTION
                // Show surface normal deviation
                let refractionVisualization = length(normal) * debug.intensity;
                return vec4f(vec3f(refractionVisualization), 1.0);
            }
            case 11u: { // COMBINED VARIATION
                // Visualize combined effects to diagnose uniformity
                let combinedVariation = velocityMagnitude * 0.3 + turbulenceIntensity * 0.3 + surfaceRoughness * 0.2 + (fresnel - 0.5) * 0.2;
                return vec4f(vec3f(combinedVariation * debug.intensity), 1.0);
            }
            default: { // ERROR COLOR
                return vec4f(1.0, 0.0, 1.0, 1.0); // Error color (magenta)
            }
        }
    }

    return vec4f(finalColor, alpha);
}
