/**
 * Simulation mode enumeration for type-safe mode management
 */
export enum SimulationMode {
    MLSMPM = "mls-mpm",
    SPH = "sph",
    BOIDS = "boids"
}

/**
 * Utility functions for simulation mode management
 */
export class SimulationModeUtils {
    static fromString(mode: string): SimulationMode {
        switch (mode) {
            case "mls-mpm":
                return SimulationMode.MLSMPM;
            case "sph":
                return SimulationMode.SPH;
            case "boids":
                return SimulationMode.BOIDS;
            default:
                throw new Error(`Unknown simulation mode: ${mode}`);
        }
    }

    static toString(mode: SimulationMode): string {
        return mode as string;
    }

    static getAllModes(): SimulationMode[] {
        return [SimulationMode.MLSMPM, SimulationMode.SPH, SimulationMode.BOIDS];
    }
}
