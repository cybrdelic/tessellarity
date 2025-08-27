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
    , FOAM_BASE = 26    // Instantaneous foam seed
    , FOAM_FINAL = 27   // Final foam mask after accumulation/detail
    , SPRAY_MASK = 28   // Spray emission mask
    , BUBBLE_MASK = 29  // Bubble mask
    , BUBBLE_COMPONENTS = 30 // Bubble gating components (R thicknessGate, G maturity, B final mask)
    , CREST_RAW = 31         // Raw phys.b crest candidate
    , CREST_GRAD = 32        // Gradient magnitude of crest field
    , SOURCE_COMPOSITE = 33  // R crest, G slope, B curvature
    , PHYS_SLOPE = 34        // physicalTex.r raw slope
    , PHYS_CURV = 35         // physicalTex.g raw directional curvature
    , PHYS_CREST = 36        // physicalTex.b crest candidate stored
    , PHYS_COVERAGE = 37     // physicalTex.a coverage
    , WORKGROUP_GRID = 38    // visualization of 8x8 workgroup pattern (diagnose tiling seams)
    , WORLD_NORMAL_Y = 39    // world-space normal Y component
    , VIEW_SLOPE = 40        // view-space slope (sqrt(dhdx^2+dhdy^2))
    , SLOPE_DIFF = 41        // world slope vs view slope difference
    , CURV_COMPARE = 42      // old vs phys curvature (diff)
    , CURV_ABS = 43          // abs curvature normalized
    , GRAD_MAG = 44          // view-space gradient magnitude
    , CURV_SLOPE_COMBO = 45  // composite of curvature / slope / grad
    , FRAC_COORD = 46        // fractional pixel coordinate (artifact geometry check)
    , HEIGHT_DX = 47         // finite difference abs dx of height
    , HEIGHT_DY = 48         // finite difference abs dy of height
    , HEIGHT_LAPLACE = 49    // Laplacian magnitude of height
    , DEPTH_NEIGHBOR_DIFF = 50 // raw surface thickness neighbor diffs (proxy for depth)
    , CURV_VS_LAPLACE = 51   // curvature vs Laplacian vs diff
    , COVERAGE = 52          // coverage channel raw
    , COVERAGE_DY = 53       // vertical derivative of coverage
    , HEIGHT_DIFFUSED_DELTA = 54 // (placeholder) diffused vs original height
    , HEIGHT_VERT_GRAD = 55  // vertical height gradient magnitude
    , ORIG_HEIGHT_VERT_DIFF = 56 // vertical diff on original height snapshot
    , ROW_MEAN_DEVIATION = 57 // per-row local mean deviation (signed)
    , ORIG_HEIGHT_VERT_LAPLACE = 58 // vertical Laplacian on original height
    , FILTER_PASS_DELTA = 59 // difference between vertical-pass input & output (to locate seam source)
    , ROW_LAPLACIAN_PROFILER = 60 // visualizes row Laplacian energy (grayscale, peak row highlighting)
    , FILTERED_DEPTH_VERT_DIFF = 61 // vertical diff of final filtered depth (pre height reconstruction)
    , HEIGHT_VS_NEG_DEPTH = 62 // difference between reconstructed height and -filteredDepth
    , DERIVATIVE_CONSISTENCY = 63 // difference between height-based dhdy and direct depth finite difference
    , ORIGINAL_HEIGHT_VS_NEG_DEPTH = 64 // original pre-diffusion height vs -filtered filteredDepth
    , DIFFUSED_MINUS_ORIGINAL = 65 // final height minus original snapshot
    , R32_HEIGHT_DIFF = 66 // difference between rgba16f stored height and r32 reference height
    , FP16_QUANTIZATION_ERROR = 67 // absolute quantization error magnitude visualization
}

/**
 * Debug layer selection for visualization modes
 */
export enum DebugLayer {
    RAW = 0,           // Raw data
    FILTERED = 1,      // Post-processed data
    DIFFERENTIAL = 2   // Difference visualization
}
