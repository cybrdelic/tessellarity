import { DebugVisualizationMode } from './DebugModes';

/**
 * Debug export utilities for capturing and downloading debug frames
 */
export class DebugExporter {
    /**
     * Capture a debug frame from the canvas
     * @param canvas - The WebGPU canvas element
     * @param mode - Current debug visualization mode
     * @returns Promise that resolves to a Blob containing the image data
     */
    static async captureDebugFrame(canvas: HTMLCanvasElement, mode: DebugVisualizationMode): Promise<Blob> {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    throw new Error('Failed to capture canvas as blob');
                }
                resolve(blob);
            }, 'image/png');
        });
    }

    /**
     * Download a debug capture as a PNG file
     * @param blob - The image blob to download
     * @param mode - The debug mode used for the capture
     */
    static downloadDebugCapture(blob: Blob, mode: DebugVisualizationMode): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug_${DebugVisualizationMode[mode]}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Get a human-readable name for a debug mode
     * @param mode - The debug visualization mode
     * @returns Human-readable string
     */
    static getDebugModeName(mode: DebugVisualizationMode): string {
        switch (mode) {
            case DebugVisualizationMode.NONE: return 'Normal Rendering';
            case DebugVisualizationMode.DEPTH: return 'Depth Map';
            case DebugVisualizationMode.THICKNESS: return 'Thickness Map';
            case DebugVisualizationMode.NORMALS: return 'Surface Normals';
            case DebugVisualizationMode.ABSORPTION: return 'Light Absorption';
            case DebugVisualizationMode.VELOCITY: return 'Flow Velocity';
            case DebugVisualizationMode.PRESSURE: return 'Pressure Field';
            case DebugVisualizationMode.CURVATURE: return 'Surface Curvature';
            case DebugVisualizationMode.FRESNEL: return 'Fresnel Effect';
            case DebugVisualizationMode.CAUSTICS: return 'Caustics Pattern';
            case DebugVisualizationMode.REFRACTION: return 'Refraction Vectors';
            default: return 'Unknown Mode';
        }
    }
}
