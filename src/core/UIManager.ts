import { SimulationMode } from './SimulationMode';
import { SimulatorConfig } from './SimulatorConfig';

/**
 * Centralized UI management for simulation controls
 */
export class UIManager {
    private elements = new Map<string, HTMLElement>();

    constructor() {
        this.cacheElements();
    }

    /**
     * Cache frequently accessed DOM elements
     */
    private cacheElements(): void {
        const elementIds = [
            'small-value',
            'medium-value',
            'large-value',
            'very-large-value',
            'particle-count-label',
            'water-appearance-controls',
            'slider-label',
            'simulation-mode',
            'slider'
        ];

        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.elements.set(id, element);
            } else {
                console.warn(`Element with id '${id}' not found`);
            }
        });
    }

    /**
     * Update UI for a specific simulation configuration
     */
    updateForSimulation(config: SimulatorConfig): void {
        this.setParticleLabels(config.particleLabels);
        this.toggleWaterControls(config.uiSettings.showWaterControls);
        this.setSliderLabel(config.uiSettings.sliderLabel);
        this.setParticleCountLabel(config.uiSettings.particleCountLabel);
    }

    /**
     * Set particle count labels
     */
    private setParticleLabels(labels: string[]): void {
        const labelElements = ['small-value', 'medium-value', 'large-value', 'very-large-value'];

        labelElements.forEach((elementId, index) => {
            const element = this.elements.get(elementId);
            if (element && labels[index]) {
                element.textContent = labels[index];
            }
        });
    }

    /**
     * Toggle water appearance controls visibility
     */
    private toggleWaterControls(show: boolean): void {
        const controls = this.elements.get('water-appearance-controls');
        if (controls) {
            (controls as HTMLElement).style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Set slider label text
     */
    private setSliderLabel(label: string): void {
        const sliderLabel = this.elements.get('slider-label');
        if (sliderLabel) {
            sliderLabel.textContent = label;
        }
    }

    /**
     * Set particle count label text
     */
    private setParticleCountLabel(label: string): void {
        const particleCountLabel = this.elements.get('particle-count-label');
        if (particleCountLabel) {
            particleCountLabel.textContent = label;
        }
    }

    /**
     * Reset slider to default value
     */
    resetSlider(): void {
        const slider = this.elements.get('slider') as HTMLInputElement;
        if (slider) {
            slider.value = "100";
        }
    }

    /**
     * Get slider value
     */
    getSliderValue(): number {
        const slider = this.elements.get('slider') as HTMLInputElement;
        return slider ? parseFloat(slider.value) : 100;
    }

    /**
     * Set up simulation mode change listener
     */
    setupSimulationModeListener(callback: (mode: SimulationMode) => void): void {
        const form = this.elements.get('simulation-mode') as HTMLFormElement;
        if (form) {
            form.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                if (target?.name === 'options') {
                    try {
                        const mode = target.value as SimulationMode;
                        callback(mode);
                    } catch (error) {
                        console.error('Invalid simulation mode:', target.value);
                    }
                }
            });
        }
    }

    /**
     * Setup particle count button listeners
     */
    setupParticleCountListener(callback: (index: number) => void): void {
        const buttons = document.querySelectorAll('input[name="particle-count"]');
        buttons.forEach(button => {
            button.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                if (target.checked) {
                    const index = parseInt(target.value);
                    callback(index);
                }
            });
        });
    }

    /**
     * Get cached element by ID
     */
    getElement(id: string): HTMLElement | undefined {
        return this.elements.get(id);
    }

    /**
     * Update error display
     */
    showError(message: string): void {
        const errorLog = document.getElementById('error-reason');
        if (errorLog) {
            errorLog.textContent = message;
        }
    }

    /**
     * Clear error display
     */
    clearError(): void {
        this.showError('');
    }
}
