// heightPhysical.wgsl
// Derive physically-relevant surface metrics from diffused height field.
// Input: height RGBA (H, dH/dx, dH/dy, coverage)
// Output (rgba16f storage):
//  R: slope magnitude (view gradient magnitude normalized)  <-- stabilized to remove zoom seam
//  G: directional curvature small scale (signed)
//  B: multi-scale crest candidate (pre-threshold, un-smoothed)
//  A: coverage
// Multi-scale + world scale approximation: use view-space z-derived scale factors.

struct RenderUniforms {
  @align(8) texel_size: vec2f,
  sphere_size: f32,
  padding0: f32,
  @align(16) inv_projection_matrix: mat4x4<f32>,
  projection_matrix: mat4x4<f32>,
  view_matrix: mat4x4<f32>,
  inv_view_matrix: mat4x4<f32>,
}

// Inputs:
//  binding 0: base (diffused) ENCODED height texture (R,G,B normalized, A coverage)
//  binding 1: blurred height radius2 (R encoded)
//  binding 2: blurred height radius4 (R encoded)
//  binding 3: RenderUniforms
//  binding 4: output physical metrics (rgba16f)
//  binding 5: HeightEncoding uniform (minH, invRange, range)
@group(0) @binding(0) var heightTex: texture_2d<f32>;
@group(0) @binding(1) var heightBlur2: texture_2d<f32>;
@group(0) @binding(2) var heightBlur4: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(4) var outPhysical: texture_storage_2d<rgba16float, write>;
struct HeightEncoding { minH: f32, invRange: f32, range: f32, padding: f32 }
@group(0) @binding(5) var<uniform> heightEncoding: HeightEncoding;

fn sampleHeight(i: vec2i) -> vec4f {
  let dims = vec2i(textureDimensions(heightTex));
  let c = clamp(i, vec2i(0), dims-vec2i(1));
  let raw = textureLoad(heightTex, vec2u(c), 0);
  let h = raw.r * heightEncoding.range + heightEncoding.minH;
  let dx = raw.g * heightEncoding.range;
  let dy = raw.b * heightEncoding.range;
  return vec4f(h, dx, dy, raw.a);
}

// Convert pixel center to NDC (-1..1). WGSL origin top-left; flip Y to conventional NDC
fn ndcFromPixel(px: vec2f, dims: vec2f) -> vec2f {
  let uv = (px + vec2f(0.5,0.5)) / dims;
  return vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
}

// Reconstruct world position from pixel + view-space depth (viewZ negative forward)
fn worldPos(px: vec2f, viewZ: f32, dims: vec2f, uniforms: RenderUniforms) -> vec3f {
  let fx = uniforms.projection_matrix[0][0];
  let fy = uniforms.projection_matrix[1][1];
  let ndc = ndcFromPixel(px, dims);
  let x_view = ndc.x * (-viewZ) / fx;
  let y_view = ndc.y * (-viewZ) / fy;
  let viewPos = vec4f(x_view, y_view, viewZ, 1.0);
  return (uniforms.inv_view_matrix * viewPos).xyz;
}

fn viewZFromHeight(h: f32) -> f32 { return -h; }

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(heightTex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let p = vec2i(gid.xy);
  let c = sampleHeight(p); // h(view), dx(view), dy(view), cov
  let cov = c.a;
  let dimsF = vec2f(textureDimensions(heightTex));
  // Sample heights for neighborhoods
  let hC = c.r; let vZC = viewZFromHeight(hC);
  let hL = sampleHeight(p + vec2i(-1,0)).r; let vZL = viewZFromHeight(hL);
  let hR = sampleHeight(p + vec2i( 1,0)).r; let vZR = viewZFromHeight(hR);
  let hU = sampleHeight(p + vec2i(0,-1)).r; let vZU = viewZFromHeight(hU);
  let hD = sampleHeight(p + vec2i(0, 1)).r; let vZD = viewZFromHeight(hD);
  // World positions
  let pc = vec2f(p);
  let pCw = worldPos(pc, vZC, dimsF, uniforms);
  let pLw = worldPos(pc + vec2f(-1.0,0.0), vZL, dimsF, uniforms);
  let pRw = worldPos(pc + vec2f( 1.0,0.0), vZR, dimsF, uniforms);
  let pUw = worldPos(pc + vec2f(0.0,-1.0), vZU, dimsF, uniforms);
  let pDw = worldPos(pc + vec2f(0.0, 1.0), vZD, dimsF, uniforms);
  // Finite difference world normal (still used for curvature orientation; no longer used directly for slope channel)
  let v1 = pRw - pCw + vec3f(1e-6,0.0,0.0);
  let v2 = pDw - pCw + vec3f(0.0,0.0,1e-6);
  var Nw = normalize(cross(v1, v2));
  if (any(Nw != Nw) || length(Nw) < 1e-5) { Nw = vec3f(0.0,1.0,0.0); }
  // View-space gradient based slope (height texture already stores dhdx/dhdy in view space)
  let viewDx = c.g;
  let viewDy = c.b;
  let viewGrad = sqrt(viewDx*viewDx + viewDy*viewDy);
  let slope = viewGrad / (viewGrad + 0.35); // soft normalization
  // Small-scale Laplacian in VIEW height space (was world-space; switching removes mixed-space bias that caused seam)
  let lapSmall = (hL + hR + hU + hD - 4.0*hC);
  // True multi-scale blurred heights (already filtered) from provided textures (sampling world reconstruction via base viewZ for center)
  let h2 = textureLoad(heightBlur2, vec2u(p), 0).r; // radius2 blurred
  let h4 = textureLoad(heightBlur4, vec2u(p), 0).r; // radius4 blurred
  // World-space positions for blurred heights (reuse center xy, substitute y from blurred height inversion)
  // We reconstruct world positions for blurred heights by re-projecting using center pixel geometry but adjusted viewZ.
  let vZ2 = viewZFromHeight(h2);
  let vZ4 = viewZFromHeight(h4);
  let p2w = worldPos(pc, vZ2, dimsF, uniforms);
  let p4w = worldPos(pc, vZ4, dimsF, uniforms);
  // Large scale Laplacian approximate from blurred heights by finite difference in scalar domain
  // Sample 4-neighborhood in blurred radius4 for stability
  let h4L = textureLoad(heightBlur4, vec2u(clamp(p + vec2i(-1,0), vec2i(0), vec2i(dims)-vec2i(1))), 0).r;
  let h4R = textureLoad(heightBlur4, vec2u(clamp(p + vec2i( 1,0), vec2i(0), vec2i(dims)-vec2i(1))), 0).r;
  let h4U = textureLoad(heightBlur4, vec2u(clamp(p + vec2i(0,-1), vec2i(0), vec2i(dims)-vec2i(1))), 0).r;
  let h4D = textureLoad(heightBlur4, vec2u(clamp(p + vec2i(0, 1), vec2i(0), vec2i(dims)-vec2i(1))), 0).r;
  let lapLarge = (h4L + h4R + h4U + h4D - 4.0*h4);

  // Pure view-space directional curvature (consistent with Laplacian & height domain diagnostics)
  let gradXv = (hR - hL) * 0.5;
  let gradYv = (hD - hU) * 0.5;
  let gradLenV = max(1e-6, sqrt(gradXv*gradXv + gradYv*gradYv));
  let nx = gradXv / gradLenV;
  let ny = gradYv / gradLenV;
  let d2x = (hR - 2.0*hC + hL);
  let d2y = (hD - 2.0*hC + hU);
  let hULv = sampleHeight(p + vec2i(-1,-1)).r;
  let hURv = sampleHeight(p + vec2i( 1,-1)).r;
  let hDLv = sampleHeight(p + vec2i(-1, 1)).r;
  let hDRv = sampleHeight(p + vec2i( 1, 1)).r;
  let d2xy = (hDRv + hULv - hURv - hDLv) * 0.25;
  let dirCurv = nx*nx*d2x + 2.0*nx*ny*d2xy + ny*ny*d2y;

  // Multi-scale slope coherence (coarse - fine difference emphasizes broad coherent crests)
  let coarseSlope = abs(p4w.y - p2w.y);
  let fineNegCurv = max(0.0, -dirCurv);
  // Soft coherence instead of hard binary sign agreement to avoid large zeroed regions
  let negAgree = step(0.0, -lapSmall) * step(0.0, -lapLarge); // 1 if both negative
  let coherence = sqrt(clamp(-lapSmall * -lapLarge, 0.0, 1e6));
  let crestMetric = fineNegCurv * coarseSlope * (0.35 + 0.65 * negAgree) * (coherence / (coherence + 1.0));
  // Relaxed coverage gating so interior can produce non-zero crest candidate
  let crestCand = crestMetric * smoothstep(0.05, 0.5, cov);

  textureStore(outPhysical, p, vec4f(f32(slope), f32(dirCurv), f32(crestCand), f32(cov)));
}
