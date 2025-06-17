/**
 * Enhanced LOD Integration with High-Quality Focus Effects
 * Integrates advanced LOD techniques with the existing WebGPU Ocean simulation
 */

import { AdvancedLODManager, AdvancedLODConfig, AdvancedLODSettings } from './AdvancedLODManager';
import { Camera } from '../../camera';

export class EnhancedLODIntegration {
    private advancedLODManager: AdvancedLODManager;
    private simulationCenter: [number, number, number] = [0, 0, 0];
    private frameCounter: number = 0;
    private lastSettings: AdvancedLODSettings | null = null;

    // Focus tracking
    private interestingAreas: Array<{ position: [number, number, number], importance: number }> = [];
    private autoFocusEnabled: boolean = true;

    // Performance tracking
    private performanceHistory: number[] = [];
    private qualityAdaptationActive: boolean = false;

    constructor(presetType: 'sph' | 'mls-mpm' | 'boids' | 'custom' = 'mls-mpm',
        customConfig?: Partial<AdvancedLODConfig>) {

        let config: Partial<AdvancedLODConfig>;

        if (presetType === 'custom' && customConfig) {
            config = customConfig;
        } else if (presetType !== 'custom') {
            config = this.getAdvancedPresetConfig(presetType);
        } else {
            config = this.getAdvancedPresetConfig('mls-mpm');
        }

        this.advancedLODManager = new AdvancedLODManager(config);
    }

    /**
     * Get comprehensive LOD settings with all enhancements
     */
    getEnhancedLODSettings(
        totalParticles: number,
        camera: Camera,
        boxSize: number[],
        frameTime: number = 16.67
    ): EnhancedLODResult {

        // Update simulation center
        this.simulationCenter = [boxSize[0] / 2, boxSize[1] / 4, boxSize[2] / 2];

        // Calculate camera distance and position
        const cameraDistance = this.calculateCameraDistance(camera);
        const cameraPosition = this.getCameraPosition(camera);

        // Update interesting areas for auto-focus
        if (this.autoFocusEnabled) {
            this.updateInterestingAreas(cameraPosition, totalParticles);
        }

        // Get advanced LOD settings
        const settings = this.advancedLODManager.calculateAdvancedLOD(
            cameraDistance,
            cameraPosition,
            frameTime
        );

        this.lastSettings = settings;

        // Calculate effective counts and qualities
        const effectiveParticleCount = Math.floor(totalParticles * settings.particleRatio);
        const renderScale = settings.renderScale;

        // Determine quality zones
        const qualityZones = this.calculateQualityZones(cameraPosition, settings);

        return {
            // Particle rendering
            effectiveParticleCount: Math.max(1, effectiveParticleCount),
            totalParticles,
            particleRatio: settings.particleRatio,

            // Visual quality settings
            shaderMode: settings.shaderMode,
            effectsEnabled: settings.effectsEnabled,
            lightingMode: settings.lightingMode,
            activeLights: settings.activeLights,

            // Performance settings
            renderScale,
            skipFrames: settings.skipFrames,
            updateRate: settings.updateRate,

            // Geometric detail
            geometryLevel: settings.geometryLevel,
            sphereDetail: settings.sphereDetail,

            // Physics settings
            physicsMode: settings.physicsMode,
            enableCollision: settings.enableCollision,

            // Quality zones for spatially-aware rendering
            qualityZones,

            // Focus information
            focusPoint: this.getCurrentFocusPoint(),
            focusRadius: this.getFocusRadius(),

            // Debug information
            cameraDistance,
            cameraPosition,
            frameTime,
            qualityAdaptationActive: this.qualityAdaptationActive,

            // Particle rendering scale
            particleSizeScale: settings.particleSizeScale,
        };
    }

    /**
     * High-Resolution Focus Enhancement
     * Creates quality zones around points of interest
     */
    private calculateQualityZones(
        cameraPosition: [number, number, number],
        settings: AdvancedLODSettings
    ): QualityZone[] {
        const zones: QualityZone[] = [];

        // Primary focus zone (around camera or manually set focus point)
        const focusPoint = this.getCurrentFocusPoint();
        zones.push({
            center: focusPoint,
            radius: this.getFocusRadius(),
            qualityMultiplier: 2.5,
            effectsOverride: {
                enableAllEffects: true,
                particleDensityBoost: 1.5,
                shaderQuality: 'ultra',
                lightingQuality: 'full'
            },
            type: 'focus'
        });

        // Secondary zones around interesting areas
        this.interestingAreas.forEach((area, index) => {
            if (index < 3) { // Limit to 3 secondary zones for performance
                zones.push({
                    center: area.position,
                    radius: 25 * area.importance,
                    qualityMultiplier: 1.0 + area.importance,
                    effectsOverride: {
                        enableAllEffects: area.importance > 0.7,
                        particleDensityBoost: 1.0 + (area.importance * 0.3),
                        shaderQuality: area.importance > 0.5 ? 'high' : 'medium',
                        lightingQuality: area.importance > 0.6 ? 'full' : 'simplified'
                    },
                    type: 'interest'
                });
            }
        });

        // Performance zone - reduced quality for distant areas
        if (settings.shaderMode !== 'full') {
            zones.push({
                center: cameraPosition,
                radius: 300,
                qualityMultiplier: 0.6,
                effectsOverride: {
                    enableAllEffects: false,
                    particleDensityBoost: 0.7,
                    shaderQuality: 'low',
                    lightingQuality: 'single'
                },
                type: 'performance',
                isInverted: true // Everything outside this radius gets reduced quality
            });
        }

        return zones;
    }

    /**
     * Adaptive Shader Effect Management
     * Dynamically enables/disables effects based on distance and performance
     */
    getShaderEffectOverrides(distance: number): ShaderEffectOverrides {
        if (!this.lastSettings) {
            return this.getDefaultShaderEffects();
        }

        const settings = this.lastSettings;

        return {
            // Core effects - always try to keep these
            enableDepthColoring: true,
            enableBasicLighting: true,

            // Distance-based effect scaling
            enableSpecular: settings.enableSpecular && distance < 120,
            enableSubsurface: settings.enableSubsurface && distance < 100,
            enableReflection: settings.effectsEnabled.reflection && distance < 80,
            enableRefraction: settings.effectsEnabled.refraction && distance < 60,
            enableCaustics: settings.effectsEnabled.caustics && distance < 100,
            enableFoam: settings.effectsEnabled.foam, // Foam is visually important, keep enabled
            enableAbsorption: settings.effectsEnabled.absorption && distance < 150,
            enableFresnel: settings.effectsEnabled.fresnel && distance < 100,

            // Advanced effects - only for close viewing
            enableVarianceLightTransport: distance < 50,
            enableTurbulentNormals: distance < 80,
            enableVelocityColoring: distance < 90,

            // Quality scaling factors
            specularQuality: Math.max(0.3, 1.0 - (distance / 200)),
            reflectionQuality: Math.max(0.2, 1.0 - (distance / 150)),
            causticsQuality: Math.max(0.4, 1.0 - (distance / 120)),

            // Shader mode override
            forceShaderMode: settings.shaderMode
        };
    }

    /**
     * Intelligent Focus Point Management
     */
    setFocusPoint(position: [number, number, number], radius: number = 50): void {
        this.autoFocusEnabled = false;
        // Manual focus point setting would update the LOD manager's focus
        this.advancedLODManager.updateConfig({
            adaptiveFocusPoint: false,
            focusRadius: radius
        });
    }

    enableAutoFocus(): void {
        this.autoFocusEnabled = true;
        this.advancedLODManager.updateConfig({
            adaptiveFocusPoint: true
        });
    }

    /**
     * Add area of interest for enhanced quality
     */
    addInterestArea(position: [number, number, number], importance: number = 1.0): void {
        this.interestingAreas.push({ position, importance });

        // Keep only the most important areas (limit for performance)
        if (this.interestingAreas.length > 5) {
            this.interestingAreas.sort((a, b) => b.importance - a.importance);
            this.interestingAreas = this.interestingAreas.slice(0, 5);
        }
    }

    /**
     * Performance-Based Quality Adaptation
     */
    updatePerformanceAdaptation(targetFPS: number, currentFPS: number): void {
        const performanceRatio = currentFPS / targetFPS;
        this.qualityAdaptationActive = performanceRatio < 0.9;

        if (performanceRatio < 0.7) {
            // Significant performance issues - aggressive adaptation
            this.advancedLODManager.updateConfig({
                enablePerformanceAdaptation: true,
                targetFrameRate: targetFPS,
                qualityAdjustmentRate: 0.1,
                distantShaderMode: 'minimal',
                distantLightingMode: 'single'
            });
        } else if (performanceRatio < 0.9) {
            // Moderate performance issues - gentle adaptation
            this.advancedLODManager.updateConfig({
                enablePerformanceAdaptation: true,
                targetFrameRate: targetFPS,
                qualityAdjustmentRate: 0.05,
                distantShaderMode: 'simplified',
                distantLightingMode: 'dual'
            });
        } else if (performanceRatio > 1.1) {
            // Good performance - can increase quality
            this.advancedLODManager.updateConfig({
                enablePerformanceAdaptation: true,
                targetFrameRate: targetFPS,
                qualityAdjustmentRate: 0.02,
                distantShaderMode: 'simplified',
                distantLightingMode: 'full'
            });
        }
    }

    /**
     * Get spatial particle distribution for optimized rendering
     */
    getSpatialParticleDistribution(totalParticles: number): SpatialDistribution {
        if (!this.lastSettings) {
            return { uniform: totalParticles, zones: [] };
        }

        const zones = this.calculateQualityZones(this.getCurrentFocusPoint(), this.lastSettings);
        const distribution: SpatialDistribution = {
            uniform: Math.floor(totalParticles * 0.3), // Base uniform distribution
            zones: []
        };

        let remainingParticles = totalParticles - distribution.uniform;

        zones.forEach(zone => {
            if (zone.type === 'focus' || zone.type === 'interest') {
                const zoneParticles = Math.floor(remainingParticles * zone.qualityMultiplier * 0.2);
                distribution.zones.push({
                    center: zone.center,
                    radius: zone.radius,
                    particleCount: zoneParticles,
                    densityMultiplier: zone.qualityMultiplier
                });
                remainingParticles -= zoneParticles;
            }
        });

        return distribution;
    }

    // Helper methods
    private calculateCameraDistance(camera: Camera): number {
        const cameraX = this.simulationCenter[0] + camera.currentDistance * Math.sin(camera.currentXtheta) * Math.cos(camera.currentYtheta);
        const cameraY = this.simulationCenter[1] + camera.currentDistance * Math.sin(camera.currentYtheta);
        const cameraZ = this.simulationCenter[2] + camera.currentDistance * Math.cos(camera.currentXtheta) * Math.cos(camera.currentYtheta);

        const dx = cameraX - this.simulationCenter[0];
        const dy = cameraY - this.simulationCenter[1];
        const dz = cameraZ - this.simulationCenter[2];

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    private getCameraPosition(camera: Camera): [number, number, number] {
        const x = this.simulationCenter[0] + camera.currentDistance * Math.sin(camera.currentXtheta) * Math.cos(camera.currentYtheta);
        const y = this.simulationCenter[1] + camera.currentDistance * Math.sin(camera.currentYtheta);
        const z = this.simulationCenter[2] + camera.currentDistance * Math.cos(camera.currentXtheta) * Math.cos(camera.currentYtheta);
        return [x, y, z];
    }

    private updateInterestingAreas(cameraPosition: [number, number, number], totalParticles: number): void {
        // Simple heuristic: areas with high particle density are interesting
        // In a real implementation, this could analyze particle velocity, density, or other metrics

        // Decay existing interest over time
        this.interestingAreas.forEach(area => {
            area.importance *= 0.995;
        });

        // Remove areas with very low importance
        this.interestingAreas = this.interestingAreas.filter(area => area.importance > 0.1);

        // Add camera vicinity as potentially interesting area
        if (Math.random() < 0.1) { // Occasionally sample new areas
            const interest = Math.random() * 0.8;
            if (interest > 0.3) {
                this.addInterestArea([
                    cameraPosition[0] + (Math.random() - 0.5) * 100,
                    cameraPosition[1] + (Math.random() - 0.5) * 50,
                    cameraPosition[2] + (Math.random() - 0.5) * 100
                ], interest);
            }
        }
    }

    private getCurrentFocusPoint(): [number, number, number] {
        // Return the most important area or simulation center
        if (this.interestingAreas.length > 0) {
            return this.interestingAreas[0].position;
        }
        return this.simulationCenter;
    }

    private getFocusRadius(): number {
        return 50; // Default focus radius
    }

    private getAdvancedPresetConfig(simulationType: 'sph' | 'mls-mpm' | 'boids'): Partial<AdvancedLODConfig> {
        const baseConfig = {
            enabled: true,
            smoothTransition: true,
            updateFrequency: 5,
            enableFocusEnhancement: true,
            enableShaderLOD: true,
            enableLightingLOD: true,
            enableTemporalLOD: true,
            enableGeometricLOD: true,
            enablePhysicsLOD: true,
            enableResolutionLOD: true,
            enablePerformanceAdaptation: true
        };

        switch (simulationType) {
            case 'sph':
                return {
                    ...baseConfig,
                    minDistance: 25,
                    maxDistance: 150,
                    minParticleRatio: 0.2,
                    maxParticleRatio: 1.0,
                    focusRadius: 40,
                    focusQualityMultiplier: 2.2,
                    shaderTransitionDistance: 100,
                    distantShaderMode: 'simplified',
                    sphereDetailLevels: [12, 8, 4]
                };
            case 'mls-mpm':
                return {
                    ...baseConfig,
                    minDistance: 40,
                    maxDistance: 200,
                    minParticleRatio: 0.15,
                    maxParticleRatio: 1.0,
                    focusRadius: 60,
                    focusQualityMultiplier: 2.5,
                    shaderTransitionDistance: 120,
                    distantShaderMode: 'simplified',
                    sphereDetailLevels: [16, 10, 6]
                };
            case 'boids':
                return {
                    ...baseConfig,
                    minDistance: 60,
                    maxDistance: 300,
                    minParticleRatio: 0.3,
                    maxParticleRatio: 1.0,
                    focusRadius: 80,
                    focusQualityMultiplier: 1.8,
                    shaderTransitionDistance: 150,
                    distantShaderMode: 'basic',
                    sphereDetailLevels: [8, 6, 4]
                };
            default:
                return baseConfig;
        }
    }

    private getDefaultShaderEffects(): ShaderEffectOverrides {
        return {
            enableDepthColoring: true,
            enableBasicLighting: true,
            enableSpecular: true,
            enableSubsurface: true,
            enableReflection: true,
            enableRefraction: true,
            enableCaustics: true,
            enableFoam: true,
            enableAbsorption: true,
            enableFresnel: true,
            enableVarianceLightTransport: true,
            enableTurbulentNormals: true,
            enableVelocityColoring: true,
            specularQuality: 1.0,
            reflectionQuality: 1.0,
            causticsQuality: 1.0,
            forceShaderMode: 'full'
        };
    }

    /**
     * Get comprehensive LOD information for UI
     */
    getEnhancedLODInfo() {
        const basicInfo = this.advancedLODManager.getLODInfo();
        return {
            ...basicInfo,
            qualityZones: this.interestingAreas.length,
            autoFocusEnabled: this.autoFocusEnabled,
            performanceAdaptationActive: this.qualityAdaptationActive,
            currentFocusPoint: this.getCurrentFocusPoint(),
            focusRadius: this.getFocusRadius()
        };
    }

    /**
     * Update configuration at runtime
     */
    updateConfig(config: Partial<AdvancedLODConfig>): void {
        this.advancedLODManager.updateConfig(config);
    }

    /**
     * Enable/disable the enhanced LOD system
     */
    setEnabled(enabled: boolean): void {
        this.advancedLODManager.updateConfig({ enabled });
    }
}

// Type definitions
export interface EnhancedLODResult {
    effectiveParticleCount: number;
    totalParticles: number;
    particleRatio: number;
    shaderMode: string;
    effectsEnabled: any;
    lightingMode: string;
    activeLights: number;
    renderScale: number;
    skipFrames: number;
    updateRate: number;
    geometryLevel: number;
    sphereDetail: number;
    physicsMode: string;
    enableCollision: boolean;
    particleSizeScale: number;  // New particle size scaling factor
    qualityZones: QualityZone[];
    focusPoint: [number, number, number];
    focusRadius: number;
    cameraDistance: number;
    cameraPosition: [number, number, number];
    frameTime: number;
    qualityAdaptationActive: boolean;
}

export interface QualityZone {
    center: [number, number, number];
    radius: number;
    qualityMultiplier: number;
    effectsOverride: {
        enableAllEffects: boolean;
        particleDensityBoost: number;
        shaderQuality: 'ultra' | 'high' | 'medium' | 'low';
        lightingQuality: 'full' | 'simplified' | 'single';
    };
    type: 'focus' | 'interest' | 'performance';
    isInverted?: boolean;
}

export interface ShaderEffectOverrides {
    enableDepthColoring: boolean;
    enableBasicLighting: boolean;
    enableSpecular: boolean;
    enableSubsurface: boolean;
    enableReflection: boolean;
    enableRefraction: boolean;
    enableCaustics: boolean;
    enableFoam: boolean;
    enableAbsorption: boolean;
    enableFresnel: boolean;
    enableVarianceLightTransport: boolean;
    enableTurbulentNormals: boolean;
    enableVelocityColoring: boolean;
    specularQuality: number;
    reflectionQuality: number;
    causticsQuality: number;
    forceShaderMode: string;
}

export interface SpatialDistribution {
    uniform: number;
    zones: Array<{
        center: [number, number, number];
        radius: number;
        particleCount: number;
        densityMultiplier: number;
    }>;
}

/**
 * Factory function for creating enhanced LOD integration
 */
export function createEnhancedLODIntegration(simulationType: 'sph' | 'mls-mpm' | 'boids'): EnhancedLODIntegration {
    return new EnhancedLODIntegration(simulationType);
}
