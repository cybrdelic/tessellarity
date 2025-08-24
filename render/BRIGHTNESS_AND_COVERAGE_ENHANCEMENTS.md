# Brightness & Coverage Enhancements (fluid.wgsl)

This document summarizes the recent shader improvements that address over‑bright rim lighting / subsurface scattering and the particle‑like appearance introduced by LOD thinning.

## Overview
Enhancements added to `render/fluid.wgsl` focus on:
- Preventing uncontrolled HDR blowout (rim + subsurface) via normalization, clamping, and an energy budget.
- Smoothing visual continuity when particle coverage thins (LOD / sparse regions).
- Adding debug modes to visualize intermediate fields.

## New/Modified Compile‑Time Constants
| Constant | Purpose | Typical Range | Effect of Increasing |
|----------|---------|---------------|----------------------|
| `SUBSURFACE_THICKNESS_SCALE` | Exponential normalization rate for thickness → subsurface | 0.3 – 1.0 | Faster saturation (brighter thin regions) |
| `MAX_SUBSURFACE_CONTRIB` | Per‑channel clamp of subsurface before composition | 0.6 – 1.5 | Allows more subsurface energy (risk of blowout) |
| `RIM_COMBINED_MAX` | Caps (userStrength * lightIntensity) for rim | 0.6 – 1.2 | Higher = more rim intensity potential |
| `SIMPLE_TONEMAP` | Enables lightweight Reinhard tone map | (bool) | N/A |
| `COVERAGE_SMOOTHING_STRENGTH` | Amount of background tint infill in sparse areas | 0.3 – 0.9 | Stronger fill; hides holes, may haze image |
| `COVERAGE_SPECULAR_SCALE_MIN` | Minimum specular scale at zero coverage | 0.2 – 0.7 | Higher retains more sparkle in sparse regions |
| `COVERAGE_RIM_SCALE_MIN` | Minimum rim scale at zero coverage | 0.2 – 0.7 | Higher keeps stronger rim in sparse areas |
| `LUM_KNEE_START` | Luminance where compression begins | 0.7 – 1.1 | Higher postpones compression (brighter peaks) |
| `LUM_KNEE_SLOPE` | Softness of compression curve | 1.5 – 4.0 | Larger = gentler roll‑off (more highlight energy) |

## Added Surface Metric
`SurfaceData.coverage` (0 → 1) is a simple neighborhood occupancy heuristic (counts thickness presence among center + 4 neighbors). It drives adaptive scaling / smoothing:
- Low coverage → specular & rim are reduced; slight envmap tint infill blends gaps.
- High coverage → full lighting intensity.

## Energy Budget Stage
`applyEnergyBudget(color)` applies a luminance knee before tone mapping:
```text
lum <= LUM_KNEE_START          → unchanged
lum >  LUM_KNEE_START          → soft compressed
```
This preconditions highlights so the subsequent Reinhard (`SIMPLE_TONEMAP`) does less drastic flattening.

## Debug Modes (DebugUniforms.mode)
| Mode | Visualization |
|------|---------------|
| 10 | `tNorm` (exponential normalized thickness feeding subsurface) |
| 11 | Rim lighting contribution (pre‑final tone map) |
| 12 | Coverage (black=0 sparse, white=1 dense) |

(Existing modes 1–9 retained.)

## Tuning Workflow
1. Start with defaults. Verify no persistent white blowouts (use mode 11 to inspect rim concentration).
2. If subsurface still pops on thin splashes: lower `SUBSURFACE_THICKNESS_SCALE` (e.g. 0.5 → 0.4) or `MAX_SUBSURFACE_CONTRIB` (1.1 → 0.9).
3. If highlights look dull: raise `LUM_KNEE_START` slightly (0.9 → 1.0) or decrease `LUM_KNEE_SLOPE` (2.5 → 2.0) for stronger compression (counter‑intuitive: lower slope = stronger clamp).
4. If sparse particle regions look too sparkly: lower `COVERAGE_SPECULAR_SCALE_MIN` / `COVERAGE_RIM_SCALE_MIN`.
5. If gaps between particles are noticeable: raise `COVERAGE_SMOOTHING_STRENGTH` moderately (0.6 → 0.7). Watch for haze.

## Future Extension Ideas
| Idea | Benefit |
|------|---------|
| Move constants to a small runtime uniform block | Real‑time tuning via UI sliders |
| Temporal accumulation of coverage | Smoother transitions as particles appear/disappear |
| Normal confidence weighting (based on coverage variance) | Reduces noisy shading on thin edges |
| Multi‑scale thickness filtering | Improves continuity at high LOD distances |

## Integration Notes
- Other shader variants (`fluid_clean`, `fluid_modular`, `fluid_decoupled`) have not yet been upgraded; `fluid.wgsl` is now the canonical reference for brightness & coverage handling.
- If you plan to propagate, port: constants, `coverage` addition in `SurfaceData`, coverage computation, adaptive specular/rim scaling, infill block, energy budget function, debug cases 10–12.

## Quick Checklist When Adjusting
- Inspect mode 10 to ensure `tNorm` stays < ~0.85 for average body regions; if too high, lower `SUBSURFACE_THICKNESS_SCALE`.
- Inspect mode 11 for rim: large uniform white bands → increase `rimLightPower` or reduce `RIM_COMBINED_MAX`.
- Inspect mode 12 for coverage: If large dark speckle clusters produce visible sparkle, decrease `COVERAGE_SPECULAR_SCALE_MIN`.

---
Feel free to request a runtime uniform block conversion if you want live tweaking without recompiling.
