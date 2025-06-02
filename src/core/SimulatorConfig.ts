import { SimulationMode } from './SimulationMode';

/**
 * Configuration interface for simulation parameters
 */
export interface SimulatorConfig {
    mode: SimulationMode;
    displayName: string;
    particleCounts: number[];
    particleLabels: string[];
    boxSizes: number[][];
    cameraDistances: number[];
    renderSettings: {
        radius: number;
        fov: number;
        zoomRate: number;
    };
    uiSettings: {
        showWaterControls: boolean;
        sliderLabel: string;
        particleCountLabel: string;
    };
    particleStructSize: number;
}

/**
 * Pre-defined configurations for each simulation mode
 */
export const SIMULATION_CONFIGS: Record<SimulationMode, SimulatorConfig> = {
    [SimulationMode.MLSMPM]: {
        mode: SimulationMode.MLSMPM,
        displayName: "MLS-MPM Fluid",
        particleCounts: [40000, 70000, 120000, 200000],
        particleLabels: [
            "Small (40,000 particles)",
            "Medium (70,000 particles)",
            "Large (120,000 particles)",
            "Very Large (200,000 particles)"
        ],
        boxSizes: [[35, 25, 55], [40, 30, 60], [45, 40, 80], [50, 50, 80]],
        cameraDistances: [60, 70, 90, 100],
        renderSettings: {
            radius: 0.6,
            fov: 45 * Math.PI / 180,
            zoomRate: 1.5
        },
        uiSettings: {
            showWaterControls: true,
            sliderLabel: "Box width:",
            particleCountLabel: "Number of Particles"
        },
        particleStructSize: 64 // mlsmpmParticleStructSize
    },

    [SimulationMode.SPH]: {
        mode: SimulationMode.SPH,
        displayName: "SPH Fluid",
        particleCounts: [10000, 20000, 30000, 40000],
        particleLabels: [
            "Small (10,000 particles)",
            "Medium (20,000 particles)",
            "Large (30,000 particles)",
            "Very Large (40,000 particles)"
        ],
        boxSizes: [[0.7, 2.0, 0.7], [1.0, 2.0, 1.0], [1.2, 2.0, 1.2], [1.4, 2.0, 1.4]],
        cameraDistances: [2.6, 3.0, 3.4, 3.8],
        renderSettings: {
            radius: 0.04,
            fov: 45 * Math.PI / 180,
            zoomRate: 0.05
        },
        uiSettings: {
            showWaterControls: true,
            sliderLabel: "Box width:",
            particleCountLabel: "Number of Particles"
        },
        particleStructSize: 64 // sphParticleStructSize
    },

    [SimulationMode.BOIDS]: {
        mode: SimulationMode.BOIDS,
        displayName: "Boids Flocking",
        particleCounts: [5000, 10000, 15000, 20000],
        particleLabels: [
            "Small Flock (5,000 boids)",
            "Medium Flock (10,000 boids)",
            "Large Flock (15,000 boids)",
            "Massive Flock (20,000 boids)"
        ],
        boxSizes: [[40, 30, 40], [50, 40, 50], [60, 50, 60], [70, 60, 70]],
        cameraDistances: [80, 100, 120, 140],
        renderSettings: {
            radius: 0.3,
            fov: 45 * Math.PI / 180,
            zoomRate: 0.8
        },
        uiSettings: {
            showWaterControls: false,
            sliderLabel: "Flight area:",
            particleCountLabel: "Flock Size"
        },
        particleStructSize: 64 // boidsParticleStructSize
    }
};

/**
 * Utility class for configuration management
 */
export class ConfigManager {
    static getConfig(mode: SimulationMode): SimulatorConfig {
        const config = SIMULATION_CONFIGS[mode];
        if (!config) {
            throw new Error(`No configuration found for mode: ${mode}`);
        }
        return config;
    }

    static getMaxParticleStructSize(): number {
        return Math.max(...Object.values(SIMULATION_CONFIGS).map(config => config.particleStructSize));
    }

    static getAllConfigs(): SimulatorConfig[] {
        return Object.values(SIMULATION_CONFIGS);
    }
}
