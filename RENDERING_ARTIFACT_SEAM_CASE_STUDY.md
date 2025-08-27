# Rendering Artifact Case Study: Zoom-Dependent Moving Line Seam

## Summary
A faint horizontal (sometimes diagonal-perceived) line appeared across the ocean surface in *nearly every debug mode* and moved as the camera zoom changed. It did not correspond to a workgroup tile boundary and was absent from certain base channels (coverage, world normal Y, pure view-space slope), but present in derived world-space differential metrics (physical slope, curvature, and their composite differences). The artifact was eliminated by replacing world-space reconstructed slope with a stable view-space gradient magnitude and softening crest metric gating logic.

## Symptoms
| Observation | Result |
|-------------|-------|
| Appears in most debug modes | Yes |
| Visible in Phys Slope (mode 34) & Phys Curvature (35) | Yes |
| Visible in Coverage (mode 37) | No |
| Workgroup Grid (38) shows aligned seam | No (rules out 8x8 tile boundary) |
| World Normal Y (39) shows seam | No |
| View Slope (40) shows seam | No |
| Slope Difference (41) shows seam | Yes (only in diff) |
| Crest Raw / Stored (31/36) mostly zero | Yes (due to aggressive gating) |

## Root Cause
The seam originated from precision and discretization sensitivity in the world-space reconstruction path used to compute physical slope and curvature:

1. World positions were reconstructed per pixel by inverting projection (height -> viewZ -> world position).
2. Slope was derived indirectly from the geometric normal (cross of neighbor vectors) and then normalized via division by |N.y| (or angular form later), making it highly sensitive near flat regions.
3. Tiny camera zoom changes slightly altered reconstructed neighbor world positions due to floating‑point resolution and non-linear perspective scaling, shifting where slope/curvature crossed normalization thresholds.
4. Curvature reused these reconstructed positions, so both slope and curvature displayed a synchronized zoom-dependent discontinuity. Coverage (phys.a) and view-space gradients (dhdx/dhdy) were unaffected, proving the issue was confined to the reprojection + world differential layer.
5. Crest candidate (phys.b) was largely zeroed by a hard binary sign-agreement gate (signAgree) and strict coverage thresholding, obscuring diagnostic signals until relaxed.

## Key Diagnostic Breakthroughs
Added staged debug modes to isolate each pipeline layer:
- 34–38: physical texture channels + workgroup structure.
- 39–41: separated world-normal Y, raw view-space slope, and world-vs-view slope difference.

Critical observation: The seam appeared only in the difference (41) between stored world-slope and directly computed view-slope, proving world reconstruction was the sole contaminant.

## Implemented Fixes
1. Replaced world-space geometric-normal slope with stable view-space gradient magnitude (sqrt(dhdx^2 + dhdy^2)) in `heightPhysical.wgsl` written to physicalTex.r.
2. Removed hard binary crest gating; introduced soft coherence weighting and relaxed coverage smoothstep to allow non-extreme crest values.
3. Retained world-space normal only for curvature orientation (no longer feeding slope magnitude directly), removing the unstable normalization pathway.
4. Added micro biases only where still needed (avoiding broad bias injection) and removed unnecessary slope division cliffs.

## Why This Works
- View-space gradients come directly from an earlier pass and are already stable across zoom (derivatives in screen/view space do not amplify perspective scaling artifacts like back-projected world positions do).
- Eliminating the dependence on world position reconstruction for slope severs the precision feedback loop causing the moving line.
- Soft gating avoids large zero plateaus where tiny numeric shifts caused abrupt binary changes.

## Avoiding Similar Artifacts in Future
| Guideline | Rationale |
|-----------|-----------|
| Prefer local (view or texture-space) derivatives for scalar energy metrics; reserve world reconstruction for orientation-only tasks. | Reduces camera-distance and projection precision coupling. |
| Use soft weighting (smoothstep, rational normalization x/(x+k)) instead of hard binary gates for multi-field coherence checks. | Prevents large flat regions sensitive to tiny numeric noise. |
| Introduce diagnostic modes early for each intermediate texture channel. | Rapid isolation of which stage injects artifacts. |
| Compare world-space vs view-space versions of the same metric (diff debug mode). | Quickly attributes artifacts to reconstruction vs intrinsic data. |
| Avoid division by near-constants derived from reconstructed normals (e.g., horiz/|N.y|) when a direct gradient magnitude exists. | Reduces amplification of small floating-point differences. |
| When using world position reconstruction, ensure symmetric neighbor sampling and consider fused computation (single projection pass) to reduce per-pixel reprojection jitter. | Minimizes differential mismatch. |
| Use continuous coherence factors (e.g., sqrt(a*b)/(sqrt(a*b)+1)) instead of strict sign agreement. | Avoids all-or-nothing suppression patterns. |

## Potential Further Hardening
1. Cache and reuse reconstructed world positions across related metrics (avoid repeated inversion calls diverging due to rounding).
2. Optional temporal smoothing of curvature only (low-pass) if minor residual flicker appears at extreme zoom.
3. Blue-noise micro dither (very low amplitude) applied before high non-linear operations to decorrelate quantization banding (not needed now, but a tool in reserve).

## Validation Checklist
- Seam absent in modes 34, 35, 41 after fix. ✔
- Coverage, crest, spray, foam unaffected visually except for improved stability. ✔
- Crest candidate now non-zero on moderate features (pending further artistic tuning). ✔

## Files Modified
- `render/heightPhysical.wgsl`: Rewrote slope channel computation; softened crest gating.
- `render/fluid_surface.wgsl`: Added/expanded debug modes and adjusted foam shaping thresholds.
- `src/debug/DebugModes.ts`, `fluidRender.ts`, `main.ts`: Added diagnostic mode plumbing.

## Core Lesson
Decouple physically intuitive metrics from expensive or precision-sensitive reconstructions when a mathematically equivalent (or monotonic) local-space proxy exists. Always validate differential metrics against a simpler canonical form before layering complex gating logic.

---
Authoring context: Resolved during investigation of moving seam artifact (August 2025). Feel free to extend this document with future artifact case studies.
