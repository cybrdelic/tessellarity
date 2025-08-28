// Unified Binding Definitions for WGSL
// Include this file in your shaders to use the standardized binding layout.
// This ensures all shaders use the same binding slots, eliminating conflicts.

// Standard simulation buffers
// @group(0) @binding(0) - Main particle buffer (read_write)
// @group(0) @binding(1) - Auxiliary/target particle buffer (read/read_write) 
// @group(0) @binding(2) - Environment parameters (uniform)
// @group(0) @binding(3) - Simulation-specific parameters (uniform)
// @group(0) @binding(4) - Box size buffer (uniform)

// Grid-based simulation buffers  
// @group(0) @binding(5) - Grid cell data (read_write)
// @group(0) @binding(6) - Prefix sum for sorting (read)

// Legacy/external bindings (preserved for compatibility)
// @group(0) @binding(7) - EffectsToggle buffer (uniform) - preserves existing fluid shader bindings

// Rendering and output buffers
// @group(0) @binding(8) - Position output for rendering (read_write)
// @group(0) @binding(9) - Rendering uniforms (uniform)

// Future expansion slots (10-14 reserved)
// @group(0) @binding(10-14) - Reserved for future use

// Introspection system (moved to avoid conflicts)
// @group(0) @binding(15) - ShaderIntrospector buffer (read_write) - moved from slot 7 to avoid EffectsToggle conflict

// Example usage:
// @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
// @group(0) @binding(15) var<storage, read_write> introspectBuffer: array<IntrospectSlot>;