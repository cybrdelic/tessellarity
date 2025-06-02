import { SimulationMode } from './SimulationMode';
import { SimulatorConfig } from './SimulatorConfig';
import { FluidRenderer } from '../../render/fluidRender';

/**
 * Common interface that all simulators must implement
 */
export interface ISimulator {
    numParticles: number;
    reset(numParticles: number, boxSize: number[]): void;
    execute(commandEncoder: GPUCommandEncoder): void;
    changeBoxSize(newBoxSize: number[]): void;
}

/**
 * Plugin interface for registering simulators
 */
export interface SimulatorPlugin {
    mode: SimulationMode;
    config: SimulatorConfig;
    simulator: ISimulator;
    renderer: FluidRenderer;
}

/**
 * Registry for managing simulation plugins
 */
export class SimulatorRegistry {
    private plugins = new Map<SimulationMode, SimulatorPlugin>();
    private currentMode: SimulationMode = SimulationMode.MLSMPM;

    /**
     * Register a simulator plugin
     */
    register(plugin: SimulatorPlugin): void {
        this.plugins.set(plugin.mode, plugin);
        console.log(`Registered simulator: ${plugin.config.displayName}`);
    }

    /**
     * Get all registered plugins
     */
    getAllPlugins(): SimulatorPlugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Get a specific plugin by mode
     */
    getPlugin(mode: SimulationMode): SimulatorPlugin {
        const plugin = this.plugins.get(mode);
        if (!plugin) {
            throw new Error(`No plugin registered for mode: ${mode}`);
        }
        return plugin;
    }

    /**
     * Get the currently active plugin
     */
    getActivePlugin(): SimulatorPlugin {
        return this.getPlugin(this.currentMode);
    }

    /**
     * Switch to a different simulation mode
     */
    switchMode(newMode: SimulationMode): SimulatorPlugin {
        if (!this.plugins.has(newMode)) {
            throw new Error(`No plugin registered for mode: ${newMode}`);
        }

        this.currentMode = newMode;
        return this.getActivePlugin();
    }

    /**
     * Get the current simulation mode
     */
    getCurrentMode(): SimulationMode {
        return this.currentMode;
    }

    /**
     * Check if a mode is registered
     */
    hasMode(mode: SimulationMode): boolean {
        return this.plugins.has(mode);
    }

    /**
     * Get all available modes
     */
    getAvailableModes(): SimulationMode[] {
        return Array.from(this.plugins.keys());
    }
}
