# Runtime Shader Introspection System (MVP)

This document describes the initial implementation added for capturing live shader breadcrumbs & metrics.

## Slot Schema
| Field | Type | Bytes | Description |
|-------|------|-------|-------------|
| frame | u32  | 4 | Frame index (0 == unused) |
| errorCode | u32 | 4 | 0 = OK, non-zero = category / error id |
| subjectId | u32 | 4 | Particle / pixel / entity id |
| shaderTag | 8 x u8 | 8 | Short ASCII shader identifier |
| stageTag | 8 x u8 | 8 | Short ASCII pipeline stage tag |
| value | f32 | 4 | Generic metric (density, pressure, normal length, etc.) |
| (total) |     | 32 | Multiple of 16 (alignment safe) |

## Lifecycle
1. Shaders call `set_breadcrumb()` writing into `introspectBuffer[idx]`.
2. CPU encodes copy to a MAP_READ buffer each frame (`ShaderIntrospector.encodeCopy`).
3. Panel (or caller) invokes `fetch()` to parse entries.
4. Debug panel displays recent records.

## Binding Guidance
Default binding: `@group(0) @binding(7)` – Adjust if occupied. Ensure pipeline layouts include the storage buffer binding.

## Safety & Overhead
- Empty slots (all zeros) are skipped.
- Single buffer strategy for MVP. Future: double-buffer to eliminate map/copy overlap risk for very large buffers.
- UI polling (500ms default) reduces overhead versus every frame mapping.

## Future Roadmap
- Double-buffering & ring index atomic.
- JSONL streaming & rotation for AI agent ingestion.
- Category-based filtering (performance vs physics vs rendering).
- Structured error codes catalog.
- Automatic seam detector (e.g., compare neighbor surface thickness—emit breadcrumb on threshold breach).

## Quick Integration Steps
1. Instantiate after device: `const introspector = new ShaderIntrospector(device);`
2. Add bind group entry referencing `introspector.getStorageBuffer()`.
3. In frame: `integration.encode(encoder);` before `device.queue.submit()`. 
4. Call `introspector.attachDebugPanel();` once on init for live overlay.
5. Insert `set_breadcrumb()` calls inside critical compute passages (density, pressure solve, surface reconstruction) and in fragment stage if diagnosing seams.

---
MVP implemented per ticket acceptance checklist foundation.