/**
 * Advanced LOD Manager with Multiple Quality Enhancement Techniques
 * Extends the basic LOD system with sophisticated quality and performance optimizations
 */

export interface AdvancedLODConfig {
    // Existing basic LOD
    enabled: boolean;
    minDistance: number;
    maxDistance: number;
    minParticleRatio: number;
    maxParticleRatio: number;
    smoothTransition: boolean;
    updateFrequency: number;

    // === HIGH-RES FOCUS EFFECTS ===
    // Focus-based high resolution rendering
    enableFocusEnhancement: boolean;
    focusRadius: number;              // Radius around focus point for high detail
    focusTransitionWidth: number;     // Smooth transition zone width
    focusQualityMultiplier: number;   // Quality boost in focus area (1.0-3.0)
    adaptiveFocusPoint: boolean;      // Auto-adjust focus to interesting areas

    // === VISUAL QUALITY LOD ===
    // Shader effect LOD
    enableShaderLOD: boolean;
    distantShaderMode: 'simplified' | 'basic' | 'minimal';  // Shader complexity modes
    shaderTransitionDistance: number;   // Distance to start reducing shader effects

    // Lighting quality scaling
    enableLightingLOD: boolean;
    distantLightingMode: 'single' | 'dual' | 'full';  // Light count based on distance
    specularCutoffDistance: number;     // Distance to disable expensive specular
    subsurfaceCutoffDistance: number;   // Distance to disable subsurface scattering

    // === TEMPORAL LOD ===
    // Update frequency scaling
    enableTemporalLOD: boolean;
    minUpdateRate: number;            // Minimum updates per second for distant objects
    maxUpdateRate: number;            // Maximum updates per second for close objects
    temporalSmoothingFactor: number;  // Smoothing for temporal changes

    // === GEOMETRIC LOD ===
    // Mesh quality scaling
    enableGeometricLOD: boolean;
    sphereDetailLevels: number[];     // Different sphere tessellation levels [high, med, low]
    geometricTransitionDistances: number[];  // Distances for each geometry level

    // === PHYSICAL SIMULATION LOD ===
    // Physics complexity scaling
    enablePhysicsLOD: boolean;
    distantPhysicsMode: 'full' | 'simplified' | 'kinematic';
    physicsTransitionDistance: number;
    collisionLODDistance: number;     // Distance to disable expensive collision detection

    // === RESOLUTION SCALING ===
    // Render target scaling
    enableResolutionLOD: boolean;
    distantRenderScale: number;       // Scale factor for distant rendering (0.5 = half res)
    resolutionTransitionDistance: number;

    // === OCCLUSION AND CULLING ===
    // Advanced culling techniques
    enableOcclusionCulling: boolean;
    enableFrustumCulling: boolean;
    enableScreenSpaceCulling: boolean;  // Cull particles smaller than pixel threshold
    minScreenPixelSize: number;       // Minimum size in pixels before culling

    // === ADAPTIVE QUALITY ===
    // Performance-based adaptation
    enablePerformanceAdaptation: boolean;
    targetFrameRate: number;          // Target FPS for automatic adaptation
    qualityAdjustmentRate: number;    // How quickly to adapt quality
    minAcceptableFrameRate: number;   // Emergency quality reduction threshold

    // === PARTICLE SIZE SCALING ===
    // Particle size adaptation based on camera distance
    enableParticleSizeScaling: boolean;
    minParticleSizeScale: number;     // Size multiplier when close (e.g., 0.2 = 20% of original size)
    maxParticleSizeScale: number;     // Size multiplier when far (e.g., 1.0 = 100% of original size)
    particleSizeTransition: boolean;  // Smooth size transitions

    // === MOTION-ADAPTIVE LOD ===
    // Quality adaptation based on camera and fluid motion
    enableMotionAdaptiveLOD: boolean;
    motionSensitivityThreshold: number;   // Movement threshold to trigger quality changes
    highMotionQualityBoost: number;       // Quality multiplier during fast motion (1.0-2.0)
    staticSceneQualityReduction: number;  // Quality reduction when static (0.7-1.0)

    // === VIEW-DEPENDENT OPTIMIZATION ===
    // Higher quality in center of view, lower at edges
    enableViewDependentLOD: boolean;
    centerViewQualityRadius: number;      // Radius of high-quality center area (0.0-1.0)
    edgeQualityFalloff: number;           // How quickly quality falls off toward edges (0.1-1.0)

    // === SMART PARTICLE DISTRIBUTION ===
    // Intelligent particle density based on fluid features
    enableSmartDistribution: boolean;
    preserveBoundaryParticles: boolean;   // Keep particles at fluid boundaries
    bulkFluidReduction: number;           // Reduction in bulk interior (0.5-1.0)
    interfaceDetectionRadius: number;     // Radius for detecting fluid interfaces

    // === DYNAMIC EFFECT SCALING ===
    // Scale effects based on their visual contribution
    enableDynamicEffectScaling: boolean;
    causticsImportanceThreshold: number;  // Distance threshold for caustics
    foamDetailDistance: number;           // Distance for detailed foam rendering
    reflectionQualityDistance: number;    // Distance for high-quality reflections
}

export class AdvancedLODManager {
    private config: AdvancedLODConfig;
    private frameCounter: number = 0;
    private currentQualityLevel: number = 1.0;
    private performanceHistory: number[] = [];
    private focusPoint: [number, number, number] = [0, 0, 0];
    private lastFrameTime: number = 0;

    // Quality state tracking
    private currentShaderMode: string = 'full';
    private currentLightingMode: string = 'full';
    private currentGeometryLevel: number = 0;
    private currentPhysicsMode: string = 'full';

    // Advanced state tracking
    private lastCameraPosition: [number, number, number] = [0, 0, 0];
    private cameraVelocity: [number, number, number] = [0, 0, 0];
    private motionHistory: number[] = [];
    private viewCenterQualityMap: Map<string, number> = new Map();
    private staticFrameCount: number = 0;

    constructor(config: Partial<AdvancedLODConfig> = {}) {
        this.config = {            // Basic LOD defaults - REALISTIC fluid behavior
            enabled: true,
            minDistance: 30,
            maxDistance: 200,
            minParticleRatio: 0.3,   // 30% particles when FAR (reduced for performance)
            maxParticleRatio: 1.0,   // 100% particles when CLOSE (maintain fluid density)
            smoothTransition: true,
            updateFrequency: 5,

            // Advanced LOD defaults
            enableFocusEnhancement: true,
            focusRadius: 50,
            focusTransitionWidth: 25,
            focusQualityMultiplier: 2.0,
            adaptiveFocusPoint: true,

            enableShaderLOD: true,
            distantShaderMode: 'simplified',
            shaderTransitionDistance: 150,

            enableLightingLOD: true,
            distantLightingMode: 'single',
            specularCutoffDistance: 100,
            subsurfaceCutoffDistance: 80,

            enableTemporalLOD: true,
            minUpdateRate: 15,
            maxUpdateRate: 60,
            temporalSmoothingFactor: 0.1,

            enableGeometricLOD: true,
            sphereDetailLevels: [16, 8, 4],  // High, medium, low detail sphere subdivisions
            geometricTransitionDistances: [50, 120, 200],

            enablePhysicsLOD: true,
            distantPhysicsMode: 'simplified',
            physicsTransitionDistance: 100,
            collisionLODDistance: 150,

            enableResolutionLOD: true,
            distantRenderScale: 0.7,
            resolutionTransitionDistance: 120,

            enableOcclusionCulling: true,
            enableFrustumCulling: true,
            enableScreenSpaceCulling: true,
            minScreenPixelSize: 2.0,

            enablePerformanceAdaptation: true,
            targetFrameRate: 60,
            qualityAdjustmentRate: 0.05,
            minAcceptableFrameRate: 30,            // Particle size scaling defaults - REALISTIC fluid behavior
            enableParticleSizeScaling: true,
            minParticleSizeScale: 0.8,        // 80% of original size when FAR (slightly smaller for performance)
            maxParticleSizeScale: 1.0,        // 100% of original size when CLOSE (maintain fluid appearance)
            particleSizeTransition: true,

            // Motion-adaptive LOD defaults
            enableMotionAdaptiveLOD: true,
            motionSensitivityThreshold: 2.0,    // Units per frame to trigger motion response
            highMotionQualityBoost: 1.3,        // 30% more particles during fast motion
            staticSceneQualityReduction: 0.85,  // 15% fewer particles when static

            // View-dependent optimization defaults
            enableViewDependentLOD: true,
            centerViewQualityRadius: 0.4,       // 40% of screen center gets full quality
            edgeQualityFalloff: 0.6,            // Quality drops to 60% at edges

            // Smart particle distribution defaults
            enableSmartDistribution: true,
            preserveBoundaryParticles: true,    // Always keep boundary particles for shape
            bulkFluidReduction: 0.7,            // Reduce bulk interior to 70% when far
            interfaceDetectionRadius: 3.0,      // Radius for detecting interesting areas

            // Dynamic effect scaling defaults
            enableDynamicEffectScaling: true,
            causticsImportanceThreshold: 80,    // Disable caustics beyond 80 units
            foamDetailDistance: 60,             // High-detail foam within 60 units
            reflectionQualityDistance: 100,     // High-quality reflections within 100 units

            ...config
        };

        this.lastFrameTime = performance.now();
    }

    /**
     * Calculate comprehensive LOD settings based on multiple factors
     */
    calculateAdvancedLOD(
        cameraDistance: number,
        cameraPosition: [number, number, number],
        frameTime: number
    ): AdvancedLODSettings {
        if (!this.config.enabled) {
            return this.getDefaultLODSettings();
        }

        // Update performance tracking
        this.updatePerformanceTracking(frameTime);

        // Update motion analysis
        this.updateMotionAnalysis(cameraPosition);

        // Calculate motion-adaptive quality multiplier
        const motionMultiplier = this.calculateMotionAdaptiveMultiplier();

        // Calculate view-dependent quality map
        const viewDependentMultiplier = this.calculateViewDependentQuality(cameraPosition);

        // Calculate focus-enhanced particle ratio with motion and view adaptations
        const baseFocusRatio = this.calculateFocusEnhancedLOD(cameraDistance, cameraPosition);
        const adaptiveParticleRatio = baseFocusRatio * motionMultiplier * viewDependentMultiplier;        // Determine shader complexity mode with dynamic effect scaling
        const shaderSettings = this.calculateEnhancedShaderLOD(cameraDistance);

        // Calculate lighting LOD
        const lightingSettings = this.calculateLightingLOD(cameraDistance);

        // Determine temporal update settings
        const temporalSettings = this.calculateTemporalLOD(cameraDistance);

        // Calculate geometric detail level
        const geometricSettings = this.calculateGeometricLOD(cameraDistance);

        // Determine physics simulation level
        const physicsSettings = this.calculatePhysicsLOD(cameraDistance);

        // Calculate resolution scaling
        const resolutionSettings = this.calculateResolutionLOD(cameraDistance);

        // Calculate particle size scaling
        const particleSizeSettings = this.calculateParticleSizeLOD(cameraDistance);

        // Apply performance-based adaptations
        const performanceAdjustedSettings = this.applyPerformanceAdaptation({
            particleRatio: adaptiveParticleRatio,
            ...shaderSettings,
            ...lightingSettings,
            ...temporalSettings,
            ...geometricSettings,
            ...physicsSettings,
            ...resolutionSettings,
            ...particleSizeSettings
        });

        // Calculate smart particle distribution
        const smartDistributionRatio = this.calculateSmartDistribution(cameraDistance, performanceAdjustedSettings.particleRatio);

        return {
            ...performanceAdjustedSettings,
            particleRatio: smartDistributionRatio
        };
    }

    /**
     * Focus-based high resolution enhancement
     */
    private calculateFocusEnhancedLOD(
        cameraDistance: number,
        cameraPosition: [number, number, number]
    ): number {
        if (!this.config.enableFocusEnhancement) {
            return this.calculateBasicLOD(cameraDistance);
        }

        // Update adaptive focus point if enabled
        if (this.config.adaptiveFocusPoint) {
            this.updateAdaptiveFocusPoint(cameraPosition);
        }

        // Calculate distance from camera to focus point
        const focusDistance = this.distanceToFocus(cameraPosition);

        // Base LOD calculation
        const baseLOD = this.calculateBasicLOD(cameraDistance);

        // Focus enhancement calculation
        if (focusDistance <= this.config.focusRadius) {
            // Inside focus area - apply quality multiplier
            const focusStrength = 1.0 - (focusDistance / this.config.focusRadius);
            const qualityBoost = 1.0 + (this.config.focusQualityMultiplier - 1.0) * focusStrength;
            return Math.min(1.0, baseLOD * qualityBoost);
        } else if (focusDistance <= this.config.focusRadius + this.config.focusTransitionWidth) {
            // Transition zone - smooth falloff
            const transitionProgress = (focusDistance - this.config.focusRadius) / this.config.focusTransitionWidth;
            const qualityBoost = 1.0 + (this.config.focusQualityMultiplier - 1.0) * (1.0 - transitionProgress);
            return Math.min(1.0, baseLOD * qualityBoost);
        }

        return baseLOD;
    }

    /**
     * Calculate shader complexity LOD
     */
    private calculateShaderLOD(cameraDistance: number): ShaderLODSettings {
        if (!this.config.enableShaderLOD) {
            return { shaderMode: 'full', effectsEnabled: this.getFullEffectsSet() };
        }

        if (cameraDistance > this.config.shaderTransitionDistance) {
            this.currentShaderMode = this.config.distantShaderMode;

            switch (this.config.distantShaderMode) {
                case 'minimal':
                    return {
                        shaderMode: 'minimal',
                        effectsEnabled: {
                            specular: false,
                            subsurface: false,
                            reflection: false,
                            refraction: false,
                            caustics: false,
                            foam: true,  // Keep foam for visual appeal
                            absorption: false,
                            fresnel: false
                        }
                    };
                case 'basic':
                    return {
                        shaderMode: 'basic',
                        effectsEnabled: {
                            specular: true,
                            subsurface: false,
                            reflection: false,
                            refraction: false,
                            caustics: false,
                            foam: true,
                            absorption: true,
                            fresnel: false
                        }
                    };
                case 'simplified':
                default:
                    return {
                        shaderMode: 'simplified',
                        effectsEnabled: {
                            specular: true,
                            subsurface: true,
                            reflection: false,
                            refraction: false,
                            caustics: false,
                            foam: true,
                            absorption: true,
                            fresnel: true
                        }
                    };
            }
        }

        return { shaderMode: 'full', effectsEnabled: this.getFullEffectsSet() };
    }

    /**
     * Enhanced shader LOD with dynamic effect scaling
     */
    private calculateEnhancedShaderLOD(cameraDistance: number): ShaderLODSettings {
        const baseShaderSettings = this.calculateShaderLOD(cameraDistance);
        
        if (!this.config.enableDynamicEffectScaling) {
            return baseShaderSettings;
        }

        // Dynamically adjust effects based on distance thresholds
        const enhancedEffects = { ...baseShaderSettings.effectsEnabled };

        // Caustics - expensive, disable beyond threshold
        if (cameraDistance > this.config.causticsImportanceThreshold) {
            enhancedEffects.caustics = false;
        }

        // High-quality reflections - disable beyond threshold
        if (cameraDistance > this.config.reflectionQualityDistance) {
            enhancedEffects.reflection = false;
        }

        // Detailed foam - reduce complexity beyond threshold
        if (cameraDistance > this.config.foamDetailDistance) {
            // Could adjust foam complexity here (this is conceptual)
            enhancedEffects.foam = cameraDistance < this.config.foamDetailDistance * 1.5;
        }

        return {
            shaderMode: baseShaderSettings.shaderMode,
            effectsEnabled: enhancedEffects
        };
    }

    /**
     * Calculate lighting quality LOD
     */
    private calculateLightingLOD(cameraDistance: number): LightingLODSettings {
        if (!this.config.enableLightingLOD) {
            return { lightingMode: 'full', activeLights: 3 };
        }

        const settings: LightingLODSettings = {
            lightingMode: 'full',
            activeLights: 3,
            enableSpecular: cameraDistance < this.config.specularCutoffDistance,
            enableSubsurface: cameraDistance < this.config.subsurfaceCutoffDistance
        };

        if (cameraDistance > this.config.shaderTransitionDistance) {
            switch (this.config.distantLightingMode) {
                case 'single':
                    settings.lightingMode = 'single';
                    settings.activeLights = 1;
                    break;
                case 'dual':
                    settings.lightingMode = 'dual';
                    settings.activeLights = 2;
                    break;
                default:
                    break;
            }
        }

        return settings;
    }

    /**
     * Calculate temporal update LOD
     */
    private calculateTemporalLOD(cameraDistance: number): TemporalLODSettings {
        if (!this.config.enableTemporalLOD) {
            return { updateRate: this.config.maxUpdateRate, skipFrames: 0 };
        }

        // Interpolate update rate based on distance
        const normalizedDistance = Math.min(1.0, cameraDistance / this.config.maxDistance);
        const updateRate = this.config.maxUpdateRate -
            (normalizedDistance * (this.config.maxUpdateRate - this.config.minUpdateRate));

        const skipFrames = Math.max(0, Math.floor(60 / updateRate) - 1);

        return { updateRate, skipFrames };
    }

    /**
     * Calculate geometric detail LOD
     */
    private calculateGeometricLOD(cameraDistance: number): GeometricLODSettings {
        if (!this.config.enableGeometricLOD) {
            return { geometryLevel: 0, sphereDetail: this.config.sphereDetailLevels[0] };
        }

        for (let i = 0; i < this.config.geometricTransitionDistances.length; i++) {
            if (cameraDistance <= this.config.geometricTransitionDistances[i]) {
                this.currentGeometryLevel = i;
                return {
                    geometryLevel: i,
                    sphereDetail: this.config.sphereDetailLevels[i] || this.config.sphereDetailLevels[0]
                };
            }
        }

        // Use lowest detail for very far distances
        const lastLevel = this.config.sphereDetailLevels.length - 1;
        this.currentGeometryLevel = lastLevel;
        return {
            geometryLevel: lastLevel,
            sphereDetail: this.config.sphereDetailLevels[lastLevel]
        };
    }

    /**
     * Calculate physics simulation LOD
     */
    private calculatePhysicsLOD(cameraDistance: number): PhysicsLODSettings {
        if (!this.config.enablePhysicsLOD) {
            return { physicsMode: 'full', enableCollision: true };
        }

        const settings: PhysicsLODSettings = {
            physicsMode: 'full',
            enableCollision: cameraDistance < this.config.collisionLODDistance
        };

        if (cameraDistance > this.config.physicsTransitionDistance) {
            settings.physicsMode = this.config.distantPhysicsMode;
        }

        return settings;
    }

    /**
     * Calculate resolution scaling LOD
     */
    private calculateResolutionLOD(cameraDistance: number): ResolutionLODSettings {
        if (!this.config.enableResolutionLOD) {
            return { renderScale: 1.0 };
        }

        if (cameraDistance > this.config.resolutionTransitionDistance) {
            return { renderScale: this.config.distantRenderScale };
        }

        // Smooth transition
        const transitionStart = this.config.resolutionTransitionDistance * 0.8;
        if (cameraDistance > transitionStart) {
            const progress = (cameraDistance - transitionStart) /
                (this.config.resolutionTransitionDistance - transitionStart);
            const scale = 1.0 - (progress * (1.0 - this.config.distantRenderScale));
            return { renderScale: Math.max(this.config.distantRenderScale, scale) };
        }

        return { renderScale: 1.0 };
    }

    /**
     * Calculate particle size scaling LOD
     */
    private calculateParticleSizeLOD(cameraDistance: number): ParticleSizeLODSettings {
        if (!this.config.enableParticleSizeScaling) {
            return { particleSizeScale: 1.0 };
        }

        // Calculate size scaling based on distance
        const clampedDistance = Math.max(this.config.minDistance,
            Math.min(this.config.maxDistance, cameraDistance));
        const normalizedDistance = (clampedDistance - this.config.minDistance) /
            (this.config.maxDistance - this.config.minDistance);        // REALISTIC LOGIC: Close distance = normal size particles, Far distance = smaller particles
        // This maintains visual quality when close and saves performance when far
        const sizeScale = this.config.maxParticleSizeScale -
            (normalizedDistance * (this.config.maxParticleSizeScale - this.config.minParticleSizeScale));

        return { particleSizeScale: sizeScale };
    }

    /**
     * Apply performance-based quality adaptation
     */
    private applyPerformanceAdaptation(settings: any): AdvancedLODSettings {
        if (!this.config.enablePerformanceAdaptation) {
            return settings;
        }

        const avgFrameRate = this.getAverageFrameRate();

        if (avgFrameRate < this.config.minAcceptableFrameRate) {
            // Emergency quality reduction
            return this.getEmergencyLODSettings();
        } else if (avgFrameRate < this.config.targetFrameRate) {
            // Gradual quality reduction
            const qualityReduction = 1.0 - this.config.qualityAdjustmentRate;
            this.currentQualityLevel = Math.max(0.3, this.currentQualityLevel * qualityReduction);
        } else if (avgFrameRate > this.config.targetFrameRate * 1.1) {
            // Gradual quality increase
            const qualityIncrease = 1.0 + this.config.qualityAdjustmentRate;
            this.currentQualityLevel = Math.min(1.0, this.currentQualityLevel * qualityIncrease);
        }        // Apply quality scaling to settings
        return this.scaleSettingsByQuality(settings, this.currentQualityLevel);
    }

    // Helper methods
    private calculateBasicLOD(cameraDistance: number): number {
        const clampedDistance = Math.max(this.config.minDistance,
            Math.min(this.config.maxDistance, cameraDistance));
        const normalizedDistance = (clampedDistance - this.config.minDistance) /
            (this.config.maxDistance - this.config.minDistance);

        // REALISTIC LOGIC: Close distance = more particles, Far distance = fewer particles
        // This maintains fluid density when close and reduces for performance when far
        return this.config.maxParticleRatio -
            (normalizedDistance * (this.config.maxParticleRatio - this.config.minParticleRatio));
    }

    private updateAdaptiveFocusPoint(cameraPosition: [number, number, number]): void {
        // Simple implementation - focus point follows camera with some lag
        const lagFactor = 0.95;
        this.focusPoint[0] = this.focusPoint[0] * lagFactor + cameraPosition[0] * (1 - lagFactor);
        this.focusPoint[1] = this.focusPoint[1] * lagFactor + cameraPosition[1] * (1 - lagFactor);
        this.focusPoint[2] = this.focusPoint[2] * lagFactor + cameraPosition[2] * (1 - lagFactor);
    }

    private distanceToFocus(cameraPosition: [number, number, number]): number {
        const dx = cameraPosition[0] - this.focusPoint[0];
        const dy = cameraPosition[1] - this.focusPoint[1];
        const dz = cameraPosition[2] - this.focusPoint[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    private updatePerformanceTracking(frameTime: number): void {
        const currentTime = performance.now();
        const frameDelta = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;

        if (frameDelta > 0) {
            const fps = 1000 / frameDelta;
            this.performanceHistory.push(fps);

            // Keep only last 60 samples (1 second at 60fps)
            if (this.performanceHistory.length > 60) {
                this.performanceHistory.shift();
            }
        }
    }

    /**
     * Update motion analysis based on camera movement
     */
    private updateMotionAnalysis(cameraPosition: [number, number, number]): void {
        // Calculate camera velocity
        const deltaX = cameraPosition[0] - this.lastCameraPosition[0];
        const deltaY = cameraPosition[1] - this.lastCameraPosition[1];
        const deltaZ = cameraPosition[2] - this.lastCameraPosition[2];
        
        const speed = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
        
        // Update motion history
        this.motionHistory.push(speed);
        if (this.motionHistory.length > 10) {
            this.motionHistory.shift();
        }
        
        // Update static frame counter
        if (speed < 0.01) {
            this.staticFrameCount++;
        } else {
            this.staticFrameCount = 0;
        }
        
        // Update camera velocity
        this.cameraVelocity = [deltaX, deltaY, deltaZ];
        this.lastCameraPosition = [...cameraPosition];
    }

    /**
     * Calculate motion-adaptive quality multiplier
     */
    private calculateMotionAdaptiveMultiplier(): number {
        if (!this.config.enableMotionAdaptiveLOD) {
            return 1.0;
        }

        const avgSpeed = this.motionHistory.reduce((a, b) => a + b, 0) / this.motionHistory.length;
        
        if (avgSpeed > this.config.motionSensitivityThreshold) {
            // Fast motion - increase quality for better continuity
            return this.config.highMotionQualityBoost;
        } else if (this.staticFrameCount > 60) { // 1 second at 60fps
            // Static scene - can reduce quality
            return this.config.staticSceneQualityReduction;
        }
        
        return 1.0;
    }

    /**
     * Calculate view-dependent quality multiplier
     */
    private calculateViewDependentQuality(cameraPosition: [number, number, number]): number {
        if (!this.config.enableViewDependentLOD) {
            return 1.0;
        }

        // For now, return a base multiplier - this would be expanded with actual screen-space calculations
        // In a full implementation, this would analyze which particles are in the center vs edges of the view
        return 1.0; // Placeholder - would calculate based on screen position
    }

    private getAverageFrameRate(): number {
        if (this.performanceHistory.length === 0) return 60;

        const sum = this.performanceHistory.reduce((a, b) => a + b, 0);
        return sum / this.performanceHistory.length;
    }

    private getFullEffectsSet(): any {
        return {
            specular: true,
            subsurface: true,
            reflection: true,
            refraction: true,
            caustics: true,
            foam: true,
            absorption: true,
            fresnel: true
        };
    } private getDefaultLODSettings(): AdvancedLODSettings {
        return {
            particleRatio: 1.0,
            shaderMode: 'full',
            effectsEnabled: this.getFullEffectsSet(),
            lightingMode: 'full',
            activeLights: 3,
            enableSpecular: true,
            enableSubsurface: true,
            updateRate: this.config.maxUpdateRate,
            skipFrames: 0,
            geometryLevel: 0,
            sphereDetail: this.config.sphereDetailLevels[0],
            physicsMode: 'full',
            enableCollision: true,
            renderScale: 1.0,
            particleSizeScale: 1.0
        };
    }

    private getEmergencyLODSettings(): AdvancedLODSettings {
        return {
            particleRatio: 0.1,
            shaderMode: 'minimal',
            effectsEnabled: {
                foam: true, specular: false, subsurface: false, reflection: false,
                refraction: false, caustics: false, absorption: false, fresnel: false
            },
            lightingMode: 'single',
            activeLights: 1,
            enableSpecular: false,
            enableSubsurface: false,
            updateRate: this.config.minUpdateRate,
            skipFrames: 3,
            geometryLevel: this.config.sphereDetailLevels.length - 1,
            sphereDetail: this.config.sphereDetailLevels[this.config.sphereDetailLevels.length - 1],
            physicsMode: 'kinematic',
            enableCollision: false,
            renderScale: 0.5,
            particleSizeScale: 1.0
        };
    }

    private scaleSettingsByQuality(settings: any, quality: number): AdvancedLODSettings {
        return {
            ...settings,
            particleRatio: settings.particleRatio * quality,
            renderScale: Math.max(0.5, settings.renderScale * (0.5 + quality * 0.5))
        };
    }

    /**
     * Update configuration at runtime
     */
    updateConfig(newConfig: Partial<AdvancedLODConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Enable/disable LOD system
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        if (!enabled) {
            this.currentQualityLevel = 1.0;
        }
    }

    /**
     * Get comprehensive LOD information for UI display
     */
    getLODInfo(): AdvancedLODInfo {
        return {
            particleRatio: this.currentQualityLevel,
            shaderMode: this.currentShaderMode,
            lightingMode: this.currentLightingMode,
            geometryLevel: this.currentGeometryLevel,
            physicsMode: this.currentPhysicsMode,
            averageFrameRate: this.getAverageFrameRate(),
            focusPoint: [...this.focusPoint],
            enabled: this.config.enabled
        };
    }

    /**
     * Calculate smart particle distribution settings
     */
    private calculateSmartDistribution(cameraDistance: number, particleRatio: number): number {
        if (!this.config.enableSmartDistribution) {
            return particleRatio;
        }

        // When far away, intelligently reduce particles in bulk fluid while preserving boundaries
        if (cameraDistance > this.config.maxDistance * 0.6) {
            // Conceptual: In a real implementation, this would:
            // 1. Identify boundary particles (particles near fluid surface)
            // 2. Identify bulk interior particles
            // 3. Preferentially keep boundary particles for shape preservation
            // 4. Reduce bulk particles more aggressively
            
            const bulkReductionFactor = this.config.preserveBoundaryParticles ? 
                this.config.bulkFluidReduction : 1.0;
            
            return particleRatio * (0.3 + 0.7 * bulkReductionFactor); // Blend boundary preservation
        }

        return particleRatio;
    }
}

// Type definitions for LOD settings
export interface AdvancedLODSettings {
    particleRatio: number;
    shaderMode: string;
    effectsEnabled: any;
    lightingMode: string;
    activeLights: number;
    enableSpecular: boolean;
    enableSubsurface: boolean;
    updateRate: number;
    skipFrames: number;
    geometryLevel: number;
    sphereDetail: number;
    physicsMode: string;
    enableCollision: boolean;
    renderScale: number;
    particleSizeScale: number;  // New particle size scaling factor
}

export interface ShaderLODSettings {
    shaderMode: string;
    effectsEnabled: any;
}

export interface LightingLODSettings {
    lightingMode: string;
    activeLights: number;
    enableSpecular?: boolean;
    enableSubsurface?: boolean;
}

export interface TemporalLODSettings {
    updateRate: number;
    skipFrames: number;
}

export interface GeometricLODSettings {
    geometryLevel: number;
    sphereDetail: number;
}

export interface PhysicsLODSettings {
    physicsMode: string;
    enableCollision: boolean;
}

export interface ResolutionLODSettings {
    renderScale: number;
}

export interface ParticleSizeLODSettings {
    particleSizeScale: number;
}

export interface AdvancedLODInfo {
    particleRatio: number;
    shaderMode: string;
    lightingMode: string;
    geometryLevel: number;
    physicsMode: string;
    averageFrameRate: number;
    focusPoint: number[];
    enabled: boolean;
}
