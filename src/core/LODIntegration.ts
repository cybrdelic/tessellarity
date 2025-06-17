/**
 * Minimal LOD Integration Helper
 *
 * This module provides a simple way to integrate LOD (Level of Detail)
 * functionality into the existing WebGPU Ocean simulation with minimal changes.
 */

import { LODManager, LODConfig } from './LODManager';
import { Camera } from '../../camera';
import { renderUniformsViews } from '../../common';

export class LODIntegration {
    private lodManager: LODManager;
    private simulationCenter: [number, number, number] = [0, 0, 0];
    constructor(presetType: 'sph' | 'mls-mpm' | 'boids' | 'custom' = 'mls-mpm', customConfig?: Partial<LODConfig>) {
        // Initialize LOD manager with appropriate preset or custom config
        if (presetType === 'custom' && customConfig) {
            this.lodManager = new LODManager(customConfig);
        } else if (presetType !== 'custom') {
            const presetConfig = LODManager.getPresetConfig(presetType);
            this.lodManager = new LODManager(presetConfig);
        } else {
            // Fallback to default if custom without config
            this.lodManager = new LODManager();
        }
    }

    /**
     * Calculate effective particle count for rendering with LOD
     * @param totalParticles Total number of particles in the simulation
     * @param camera Camera instance to calculate distance from
     * @param boxSize Current simulation box size [x, y, z]
     * @returns Effective particle count to use for rendering
     */
    getEffectiveParticleCount(totalParticles: number, camera: Camera, boxSize: number[]): number {
        // Update simulation center based on current box size
        this.simulationCenter = [boxSize[0] / 2, boxSize[1] / 4, boxSize[2] / 2];

        // Calculate camera distance from simulation center
        const cameraDistance = this.calculateCameraDistance(camera);

        // Get effective particle count from LOD manager
        return this.lodManager.getEffectiveParticleCount(totalParticles, cameraDistance);
    }

    /**
     * Calculate camera distance from simulation center
     * @param camera Camera instance
     * @returns Distance from camera to simulation center
     */
    private calculateCameraDistance(camera: Camera): number {
        // Get camera position from current distance and rotation
        const cameraX = this.simulationCenter[0] + camera.currentDistance * Math.sin(camera.currentXtheta) * Math.cos(camera.currentYtheta);
        const cameraY = this.simulationCenter[1] + camera.currentDistance * Math.sin(camera.currentYtheta);
        const cameraZ = this.simulationCenter[2] + camera.currentDistance * Math.cos(camera.currentXtheta) * Math.cos(camera.currentYtheta);

        // Calculate distance from camera to simulation center
        const dx = cameraX - this.simulationCenter[0];
        const dy = cameraY - this.simulationCenter[1];
        const dz = cameraZ - this.simulationCenter[2];

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Update simulation center (call when box size changes)
     * @param boxSize New simulation box size [x, y, z]
     */
    updateSimulationCenter(boxSize: number[]): void {
        this.simulationCenter = [boxSize[0] / 2, boxSize[1] / 4, boxSize[2] / 2];
    }

    /**
     * Get current LOD information for debugging/UI
     */
    getLODInfo() {
        return this.lodManager.getLODInfo();
    }

    /**
     * Enable/disable LOD system
     * @param enabled Whether LOD should be enabled
     */
    setEnabled(enabled: boolean): void {
        this.lodManager.setEnabled(enabled);
    }

    /**
     * Update LOD configuration at runtime
     * @param config New configuration options
     */
    updateConfig(config: Partial<LODConfig>): void {
        this.lodManager.updateConfig(config);
    }

    /**
     * Get the underlying LOD manager for advanced use cases
     */
    getLODManager(): LODManager {
        return this.lodManager;
    }
}

/**
 * Simple factory function to create LOD integration for different simulation types
 */
export function createLODIntegration(simulationType: 'sph' | 'mls-mpm' | 'boids'): LODIntegration {
    return new LODIntegration(simulationType);
}
