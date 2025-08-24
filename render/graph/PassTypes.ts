// Minimal pass descriptor & surface frame schema (Phase 1 scaffolding)

export type TextureFormat = 'r16float' | 'r32float' | 'rgba16float' | 'bgra8unorm';

export interface PassIO {
  name: string;
  format: TextureFormat;
  optional?: boolean;
}

export interface PassDescriptor {
  name: string;
  inputs: PassIO[];
  outputs: PassIO[];
}

export interface SurfaceFrameV1 {
  // tau in separate R32F (not yet implemented) would go here
  thicknessTex: string; // r16float normalized thickness
  normalCoverageTex: string; // rgba16float packed normal/thickness/coverage
}

export const Passes: PassDescriptor[] = [
  { name: 'ThicknessBlurX', inputs: [ { name: 'thicknessIn', format: 'r16float' } ], outputs: [ { name: 'thicknessTmp', format: 'r16float' } ] },
  { name: 'ThicknessBlurY', inputs: [ { name: 'thicknessTmp', format: 'r16float' } ], outputs: [ { name: 'thicknessOut', format: 'r16float' } ] },
  { name: 'NormalsFromThickness', inputs: [ { name: 'thicknessOut', format: 'r16float' } ], outputs: [ { name: 'surface', format: 'rgba16float' } ] },
  { name: 'ComposeFluid', inputs: [ { name: 'surface', format: 'rgba16float' } ], outputs: [ { name: 'swapchain', format: 'bgra8unorm' } ] }
];

export function validateGraph(textures: Record<string, TextureFormat>) {
  for (const pass of Passes) {
    for (const i of pass.inputs) {
      if (!textures[i.name] && !i.optional) {
        throw new Error(`Missing texture '${i.name}' for pass ${pass.name}`);
      }
      if (textures[i.name] && textures[i.name] !== i.format) {
        throw new Error(`Format mismatch for '${i.name}' in ${pass.name}: got ${textures[i.name]} expected ${i.format}`);
      }
    }
    for (const o of pass.outputs) {
      if (textures[o.name] && textures[o.name] !== o.format) {
        throw new Error(`Output format conflict for ${o.name}`);
      }
      textures[o.name] = o.format;
    }
  }
  return textures;
}
