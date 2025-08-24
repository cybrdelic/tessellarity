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
    FRESNEL = 8,        // Fresnel effect isolation (tempered)
    CAUSTICS = 9,       // Caustics pattern visualization
    REFRACTION = 10,    // Refraction path length visualization
    NOV = 11,           // View angle (N·V) grayscale
    F_LAYER = 12,       // Raw layered Fresnel scalar (pre-temper)
    FOAM_PROB = 13,     // Foam probability mask
    HEIGHT = 14,        // Height field (scaled) visualization
    SLOPE = 15,         // Slope magnitude visualization
    RAW_HEIGHT = 16,    // Raw height normalized (debug)
    F_LAYER_HOT = 17,   // Layered Fresnel hotspot mask
    CURVATURE_MAG = 18, // Curvature magnitude detailed
    SLOPE_CAP_FOAM = 19,// Slope energy / capillary / foam composite
    HEIGHT_VAR = 20,    // Local height variance vs Fresnel vs NoV
    MIRROR_DIFF = 21,   // Vertical mirror difference (two-pass symmetry test)
    MID_SPLIT = 22,     // Midpoint split mask / edge highlight
    NOV_RAW = 23,       // Raw NoV (pre lift) diagnostic
    NOV_LIFTED = 24,    // Lifted NoV used for path amplification
    NOV_DELTA = 25      // (Lifted - Raw) to visualize smoothing impact
}

/**
 * Debug layer selection for visualization modes
 */
export enum DebugLayer {
    RAW = 0,           // Raw data
    FILTERED = 1,      // Post-processed data
    DIFFERENTIAL = 2   // Difference visualization
}
