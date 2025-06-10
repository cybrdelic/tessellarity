/**
 * Debug visualization modes for the WebGPU Ocean simulation system
 */
export enum DebugVisualizationMode {
    NONE = 0,           // Normal rendering
    DEPTH = 1,          // Raw depth visualization
    THICKNESS = 2,      // Thickness layer visualization
    NORMALS = 3,        // Surface normals visualization
    ABSORPTION = 4,     // Light absorption debugging
    VELOCITY = 5,       // Flow velocity visualization
    PRESSURE = 6,       // Pressure field visualization
    CURVATURE = 7,      // Surface curvature analysis
    FRESNEL = 8,        // Fresnel effect isolation
    CAUSTICS = 9,       // Caustics pattern visualization
    REFRACTION = 10     // Refraction vector debugging
}

/**
 * Debug layer selection for visualization modes
 */
export enum DebugLayer {
    RAW = 0,           // Raw data
    FILTERED = 1,      // Post-processed data
    DIFFERENTIAL = 2   // Difference visualization
}
