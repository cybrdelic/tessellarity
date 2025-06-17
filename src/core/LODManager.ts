/**
 * LOD (Level of Detail) Manager for WebGPU Ocean Simulation
 * Provides dynamic particle count adjustment based on camera distance
 * with minimal impact on existing codebase
 */

export interface LODConfig {
    enabled: boolean;
    minDistance: number;      // Camera distance for maximum detail
    maxDistance: number;      // Camera distance for minimum detail
    minParticleRatio: number; // Minimum ratio of particles to render (0.1 = 10%)
    maxParticleRatio: number; // Maximum ratio of particles to render (1.0 = 100%)
    smoothTransition: boolean; // Enable smooth transitions between LOD levels
    updateFrequency: number;   // How often to update LOD (in frames)
}

export class LODManager {
    private config: LODConfig;
    private frameCounter: number = 0;
    private currentLODRatio: number = 1.0;
    private targetLODRatio: number = 1.0;
    private smoothingFactor: number = 0.1;

    constructor(config: Partial<LODConfig> = {}) {
        // Default configuration - conservative settings for safety
        this.config = {
            enabled: true,
            minDistance: 30,        // Close distance = full detail
            maxDistance: 200,       // Far distance = reduced detail
            minParticleRatio: 0.15, // Never go below 15% of particles
            maxParticleRatio: 1.0,  // 100% particles when close
            smoothTransition: true,
            updateFrequency: 5,     // Update every 5 frames to avoid flickering
            ...config
        };

        this.currentLODRatio = this.config.maxParticleRatio;
        this.targetLODRatio = this.config.maxParticleRatio;
    }

    /**
     * Calculate LOD ratio based on camera distance
     * @param cameraDistance Current camera distance from simulation center
     * @returns Ratio of particles to render (0.0 to 1.0)
     */
    calculateLOD(cameraDistance: number): number {
        if (!this.config.enabled) {
            return 1.0;
        }

        // Only update every N frames to prevent flickering
        this.frameCounter++;
        if (this.frameCounter % this.config.updateFrequency !== 0) {
            return this.config.smoothTransition ? this.currentLODRatio : this.targetLODRatio;
        }

        // Clamp distance to our range
        const clampedDistance = Math.max(
            this.config.minDistance,
            Math.min(this.config.maxDistance, cameraDistance)
        );

        // Calculate normalized distance (0 = close, 1 = far)
        const normalizedDistance = (clampedDistance - this.config.minDistance) /
            (this.config.maxDistance - this.config.minDistance);

        // Inverse mapping: close distance = high detail, far distance = low detail
        const rawRatio = this.config.maxParticleRatio -
            (normalizedDistance * (this.config.maxParticleRatio - this.config.minParticleRatio));

        // Apply easing curve for more natural transitions
        const easedRatio = this.easeInOutQuad(1.0 - normalizedDistance);
        this.targetLODRatio = this.config.minParticleRatio +
            (easedRatio * (this.config.maxParticleRatio - this.config.minParticleRatio));

        // Smooth transition
        if (this.config.smoothTransition) {
            this.currentLODRatio += (this.targetLODRatio - this.currentLODRatio) * this.smoothingFactor;
        } else {
            this.currentLODRatio = this.targetLODRatio;
        }

        return Math.max(this.config.minParticleRatio,
            Math.min(this.config.maxParticleRatio, this.currentLODRatio));
    }

    /**
     * Get effective particle count for rendering
     * @param totalParticles Total number of particles in simulation
     * @param cameraDistance Current camera distance
     * @returns Number of particles to actually render
     */
    getEffectiveParticleCount(totalParticles: number, cameraDistance: number): number {
        const lodRatio = this.calculateLOD(cameraDistance);
        const effectiveCount = Math.floor(totalParticles * lodRatio);

        // Ensure we always render at least 1 particle to avoid errors
        return Math.max(1, effectiveCount);
    }    /**
     * Get current LOD information for debugging/UI
     */
    getLODInfo(): {
        ratio: number;
        effectiveRatio: number;
        enabled: boolean;
        level: 'HIGH' | 'MEDIUM' | 'LOW';
        performance: 'Optimal' | 'Balanced' | 'Performance';
    } {
        const ratio = this.targetLODRatio;
        const effectiveRatio = this.currentLODRatio;

        let level: 'HIGH' | 'MEDIUM' | 'LOW';
        let performance: 'Optimal' | 'Balanced' | 'Performance';

        if (effectiveRatio >= 0.8) {
            level = 'HIGH';
            performance = 'Optimal';
        } else if (effectiveRatio >= 0.5) {
            level = 'MEDIUM';
            performance = 'Balanced';
        } else {
            level = 'LOW';
            performance = 'Performance';
        }

        return {
            ratio,
            effectiveRatio,
            enabled: this.config.enabled,
            level,
            performance
        };
    }

    /**
     * Update LOD configuration at runtime
     */
    updateConfig(newConfig: Partial<LODConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Enable/disable LOD system
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        if (!enabled) {
            this.currentLODRatio = 1.0;
            this.targetLODRatio = 1.0;
        }
    }

    /**
     * Easing function for smooth transitions
     */
    private easeInOutQuad(t: number): number {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    /**
     * Get recommended LOD settings for different simulation types
     */
    static getPresetConfig(simulationType: 'sph' | 'mls-mpm' | 'boids'): LODConfig {
        const baseConfig = {
            enabled: true,
            smoothTransition: true,
            updateFrequency: 5
        };

        switch (simulationType) {
            case 'sph':
                return {
                    ...baseConfig,
                    minDistance: 25,
                    maxDistance: 150,
                    minParticleRatio: 0.2,
                    maxParticleRatio: 1.0
                };
            case 'mls-mpm':
                return {
                    ...baseConfig,
                    minDistance: 40,
                    maxDistance: 200,
                    minParticleRatio: 0.15,
                    maxParticleRatio: 1.0
                };
            case 'boids':
                return {
                    ...baseConfig,
                    minDistance: 60,
                    maxDistance: 300,
                    minParticleRatio: 0.3,
                    maxParticleRatio: 1.0
                };
            default:
                return {
                    ...baseConfig,
                    minDistance: 30,
                    maxDistance: 200,
                    minParticleRatio: 0.15,
                    maxParticleRatio: 1.0
                };
        }
    }
}
