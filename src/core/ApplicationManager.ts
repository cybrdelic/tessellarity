import { Camera } from '../../camera';
import { SimulationMode } from './SimulationMode';
import { SimulatorRegistry, ISimulator } from './SimulatorRegistry';
import { ConfigManager, SimulatorConfig } from './SimulatorConfig';
import { UIManager } from './UIManager';
import { FluidRenderer } from '../../render/fluidRender';

/**
 * Main application manager that coordinates all systems
 */
export class ApplicationManager {
    private registry: SimulatorRegistry;
    private uiManager: UIManager;
    private camera: Camera;
    private canvas: HTMLCanvasElement;
    private currentParameterIndex: number = 1; // Default to medium setting
    private realBoxSize: number[] = [];

    constructor(
        canvas: HTMLCanvasElement,
        camera: Camera
    ) {
        this.canvas = canvas;
        this.camera = camera;
        this.registry = new SimulatorRegistry();
        this.uiManager = new UIManager();
        this.setupEventListeners();
    }

    /**
     * Register a simulator plugin
     */
    registerSimulator(
        mode: SimulationMode,
        simulator: ISimulator,
        renderer: FluidRenderer
    ): void {
        const config = ConfigManager.getConfig(mode);

        this.registry.register({
            mode,
            config,
            simulator,
            renderer
        });
    }

    /**
     * Initialize the application with default simulation
     */
    initialize(): void {
        this.switchToMode(SimulationMode.MLSMPM);
    }

    /**
     * Switch to a different simulation mode
     */
    switchToMode(mode: SimulationMode): void {
        try {
            const plugin = this.registry.switchMode(mode);
            const config = plugin.config;

            // Update UI for new mode
            this.uiManager.updateForSimulation(config);

            // Reset simulation with current parameter index
            this.resetSimulation();

            console.log(`Switched to ${config.displayName}`);
        } catch (error) {
            console.error('Failed to switch simulation mode:', error);
            this.uiManager.showError(`Failed to switch to ${mode}`);
        }
    }

    /**
     * Reset current simulation with given parameter index
     */
    resetSimulation(parameterIndex?: number): void {
        if (parameterIndex !== undefined) {
            this.currentParameterIndex = parameterIndex;
        }

        const plugin = this.registry.getActivePlugin();
        const config = plugin.config;
        const idx = this.currentParameterIndex;

        // Reset simulation
        const boxSize = config.boxSizes[idx];
        plugin.simulator.reset(config.particleCounts[idx], boxSize);

        // Update real box size
        this.realBoxSize = [...boxSize];

        // Reset camera based on simulation type
        this.resetCameraForMode(config, idx);

        // Reset UI slider
        this.uiManager.resetSlider();
    }

    /**
     * Reset camera for specific simulation mode
     */
    private resetCameraForMode(config: SimulatorConfig, parameterIndex: number): void {
        const boxSize = config.boxSizes[parameterIndex];
        const distance = config.cameraDistances[parameterIndex];
        const renderSettings = config.renderSettings;

        let cameraTarget: [number, number, number];

        switch (config.mode) {
            case SimulationMode.MLSMPM:
                cameraTarget = [boxSize[0] / 2, boxSize[1] / 4, boxSize[2] / 2];
                break;
            case SimulationMode.SPH:
                cameraTarget = [0, -boxSize[1] + 0.1, 0];
                break;
            case SimulationMode.BOIDS:
                cameraTarget = [boxSize[0] / 2, boxSize[1] / 2, boxSize[2] / 2];
                break;
            default:
                cameraTarget = [0, 0, 0];
        }

        this.camera.reset(
            this.canvas,
            distance,
            cameraTarget,
            renderSettings.fov,
            renderSettings.zoomRate
        );
    }    /**
     * Execute current simulation step
     */
    executeSimulation(commandEncoder: GPUCommandEncoder): void {
        const plugin = this.registry.getActivePlugin();
        plugin.simulator.execute(commandEncoder);
    }

    /**
     * Update box size based on slider value
     */
    updateBoxSize(): void {
        const sliderValue = this.uiManager.getSliderValue();
        const ratio = sliderValue / 100;

        const plugin = this.registry.getActivePlugin();
        const config = plugin.config;
        const baseBoxSize = config.boxSizes[this.currentParameterIndex];

        const newBoxSize = [
            baseBoxSize[0] * ratio,
            baseBoxSize[1],  // Height typically stays constant
            baseBoxSize[2] * ratio
        ];

        this.realBoxSize = newBoxSize;
        plugin.simulator.changeBoxSize(newBoxSize);
    }

    /**
     * Get current active renderer
     */
    getCurrentRenderer(): FluidRenderer {
        return this.registry.getActivePlugin().renderer;
    }

    /**
     * Get current active simulator
     */
    getCurrentSimulator(): ISimulator {
        return this.registry.getActivePlugin().simulator;
    }

    /**
     * Get current simulation mode
     */
    getCurrentMode(): SimulationMode {
        return this.registry.getCurrentMode();
    }

    /**
     * Get current box size
     */
    getCurrentBoxSize(): number[] {
        return [...this.realBoxSize];
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        // Simulation mode change listener
        this.uiManager.setupSimulationModeListener((mode) => {
            this.switchToMode(mode);
        });

        // Particle count change listener
        this.uiManager.setupParticleCountListener((index) => {
            this.resetSimulation(index);
        });
    }

    /**
     * Get available simulation modes
     */
    getAvailableModes(): SimulationMode[] {
        return this.registry.getAvailableModes();
    }

    /**
     * Check if a mode is available
     */
    hasMode(mode: SimulationMode): boolean {
        return this.registry.hasMode(mode);
    }

    /**
     * Get UI manager for external access
     */
    getUIManager(): UIManager {
        return this.uiManager;
    }
}
