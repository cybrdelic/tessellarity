# Runtime Shader Introspection System (Enhanced)

This document describes the enhanced implementation with unified binding layout system for capturing live shader breadcrumbs & metrics.

## Key Enhancement: Unified Binding Layout

The system now uses a "frozen interface" approach that eliminates pipeline rebuild issues:

- **Stable Binding Slots**: All possible GPU resource bindings are predefined and never change
- **No Conflicts**: Introspection always uses slot 7, other systems use designated slots
- **Reusable Bind Groups**: Single bind group works across all pipelines using the unified layout
- **No Pipeline Rebuilds**: Adding/removing features doesn't require pipeline recreation

## Unified Binding Slots

| Slot | Purpose | Type | Usage |
|------|---------|------|-------|
| 0 | Main particle buffer | storage | read_write |
| 1 | Auxiliary particle buffer | storage | read/read_write |
| 2 | Environment parameters | uniform | read |
| 3 | Simulation parameters | uniform | read |
| 4 | Box size buffer | uniform | read |
| 5 | Grid cell data | storage | read_write (optional) |
| 6 | Prefix sum data | storage | read (optional) |
| **7** | **Introspection buffer** | **storage** | **read_write** |
| 8 | Position output | storage | read_write (optional) |
| 9 | Render uniforms | uniform | read (optional) |
| 10-15 | Reserved for future use | storage | - |

## Slot Schema (Introspection Buffer)
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
1. Shaders call `set_breadcrumb()` writing into `introspectBuffer[idx]` at slot 7.
2. CPU encodes copy to a MAP_READ buffer each frame (`ShaderIntrospector.encodeCopy`).
3. Panel (or caller) invokes `fetch()` to parse entries.
4. Debug panel displays recent records.

## Usage Patterns

### New Unified Approach (Recommended)
```typescript
// Create with unified bindings enabled
const introspector = new ShaderIntrospector(device, { useUnifiedBindings: true });
const integration = new IntrospectionIntegration(device, device.queue, introspector);

// Bind resources to standard slots
const resourceManager = integration.getResourceManager();
resourceManager.setResource('particles', particleBuffer);
resourceManager.setResource('environment', envBuffer);

// Create pipeline with stable layout (no conflicts!)
const pipeline = integration.createComputePipeline(shaderModule);
const bindGroup = integration.getBindGroup(); // Works with all unified pipelines
```

### Legacy Manual Approach (Backwards Compatible)
```typescript
// Traditional approach still supported
const introspector = new ShaderIntrospector(device, { useUnifiedBindings: false });
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 7, resource: { buffer: introspector.getStorageBuffer() } }
  ]
});
```

## WGSL Usage

Always use slot 7 for introspection (conflict-free):

```wgsl
// Unified binding - no conflicts possible
@group(0) @binding(7) var<storage, read_write> introspectBuffer: array<IntrospectSlot>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  // Your computation...
  
  // Emit debug data
  set_breadcrumb(
    global_id.x,
    uniforms.frame,
    0u,
    particleId,
    density,
    array<u8,8>('D','E','N','S','I','T','Y',0),
    array<u8,8>('c','o','m','p','u','t','e',0)
  );
}
```

## Safety & Performance
- **Conflict-Free**: Slot 7 reserved exclusively for introspection
- **Stable Layout**: No pipeline rebuilds when adding/removing features  
- **Efficient**: Empty slots use minimal dummy buffers
- **Backwards Compatible**: Manual binding still supported
- **Future-Proof**: Reserved slots 10-15 for expansion

## Migration Benefits

Migrating to the unified system provides:

1. **Elimination of Binding Conflicts**: No more manual slot coordination
2. **Stable Pipeline Architecture**: Add features without rebuilding pipelines  
3. **Centralized Resource Management**: Single point of control for all GPU resources
4. **Reduced State Tracking**: No more hand-tracked handles and boolean flags
5. **Future Extensibility**: Reserved slots ready for new features

## Future Roadmap
- Automatic resource binding detection and validation
- Hot-swappable shader modules with introspection
- Multi-frame introspection buffer rotation  
- JSONL streaming & rotation for AI agent ingestion
- Category-based filtering (performance vs physics vs rendering)
- Structured error codes catalog
- Automatic seam detector integration

## Quick Integration Steps
1. Create: `const introspector = new ShaderIntrospector(device, { useUnifiedBindings: true });`
2. Integrate: `const integration = new IntrospectionIntegration(device, device.queue, introspector);`
3. Bind resources: `integration.getResourceManager().setResource('particles', buffer);`
4. Create pipeline: `const pipeline = integration.createComputePipeline(shaderModule);`
5. Get bind group: `const bindGroup = integration.getBindGroup();`
6. Use in render loop: `integration.encode(encoder);` before submit
7. Debug panel: `introspector.attachDebugPanel();`

---
Enhanced implementation eliminates pipeline rebuild issues and provides production-ready stability.