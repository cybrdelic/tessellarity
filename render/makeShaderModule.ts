// makeShaderModule.ts
// Centralized creation of GPUShaderModule ensuring screenspace helpers are always prepended.
// This guarantees availability even for shaders loaded via fetch/runtime strings bypassing Vite plugins.

// Import raw helper WGSL
// (Using ?raw so Vite/rollup returns the file contents as string; harmless in other bundlers if supported.)
// If this path changes move file accordingly.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - raw import resolution
import screenspaceWGSL from './screenspace.wgsl?raw';

function needsPrepend(code: string): boolean {
  // Heuristic: if code already includes signature of ss_dims we assume helpers present.
  return !/\bfn\s+ss_dims\s*\(/.test(code);
}

export function makeShaderModule(device: GPUDevice, code: string): GPUShaderModule {
  const full = needsPrepend(code) ? `${screenspaceWGSL}\n${code}` : code;
  // Debug instrumentation: compute simple hash & log first lines for tracing origins
  try {
    const hash = (() => {
      let h = 0; for (let i=0;i<full.length;i++){ h = (h*131 + full.charCodeAt(i)) >>> 0; } return ('00000000'+h.toString(16)).slice(-8);
    })();
    const firstLines = full.split('\n').slice(0,15).join('\n');
    // eslint-disable-next-line no-console
    console.debug('[WGSL makeShaderModule] create', { hash, length: full.length, preview: firstLines });
    return device.createShaderModule({ label: `wgsl-${hash}`, code: full });
  } catch (e) {
    console.error('[WGSL makeShaderModule] failed before createShaderModule', e);
    return device.createShaderModule({ code: full });
  }
}

// Convenience to batch convert existing inline object form
export const createShaderModuleWithScreenspace = makeShaderModule;
