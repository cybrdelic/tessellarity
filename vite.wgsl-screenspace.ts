import fs from 'node:fs';
import path from 'node:path';

// Vite plugin to prepend the shared screenspace ABI to every WGSL shader (except the helper itself)
export default function wgslScreenspacePlugin() {
  // Current location of the canonical helper
  const ssPath = path.resolve(process.cwd(), 'render', 'screenspace.wgsl');
  let ssCode = '';
  try {
    ssCode = fs.readFileSync(ssPath, 'utf8');
  } catch (e) {
    console.warn('[wgsl-screenspace-prepend] Could not read screenspace.wgsl at', ssPath, e);
  }

  return {
    name: 'wgsl-screenspace-prepend',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('.wgsl')) return null;
      if (id.endsWith('screenspace.wgsl')) return null; // don't prepend to itself
      // If already has ss_dims marker (manual concat), skip to avoid duplication
      if (/\bfn\s+ss_dims\s*\(/.test(code)) return null;
      if (!ssCode) return null; // fail open
      return { code: ssCode + '\n' + code, map: null };
    },
  };
}
