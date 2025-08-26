// screenspace.wgsl — Screen-Space ABI v1
// Centralized coordinate + sampling helpers to eliminate diagonal seams.
// All fullscreen/postprocess shaders should import ONLY these helpers for
// pixel/uv derivation & sampling policy.

// Optional probe support intentionally removed from core helper to avoid forcing a binding.
// A separate small include can append visualization utilities when needed.
// Stub type + accessor retained so shaders that were calling ss_probe_color still compile to no-op.
struct SSProbe { enabled: u32, mode: u32 };
fn ss_getProbe() -> SSProbe { return SSProbe(0u,0u); }

// ---------- Coord helpers ----------
fn ss_dims(tex: texture_2d<f32>) -> vec2u {
  return textureDimensions(tex);
}

fn ss_pix(pos: vec4f, tex: texture_2d<f32>) -> vec2u {
  let d = textureDimensions(tex);
  let p = vec2u(clamp(pos.xy, vec2f(0.0), vec2f(f32(d.x-1u), f32(d.y-1u))));
  return p;
}

fn ss_uv(pos: vec4f, tex: texture_2d<f32>) -> vec2f {
  let d = vec2f(textureDimensions(tex));
  return pos.xy / d; // pixel coord normalized; no +0.5 for consistency
}

fn ss_pix_remap(pos: vec4f, src: texture_2d<f32>, dst: texture_2d<f32>) -> vec2u {
  let ds = vec2f(textureDimensions(src));
  let dd = vec2f(textureDimensions(dst));
  let uv = pos.xy / dd;
  return vec2u(clamp(uv * ds, vec2f(0.0), ds - vec2f(1.0)));
}

// ---------- Sampling wrappers ----------
fn ss_load(tex: texture_2d<f32>, pos: vec4f) -> vec4f {
  return textureLoad(tex, ss_pix(pos, tex), 0);
}

fn ss_sample0(tex: texture_2d<f32>, samp: sampler, pos: vec4f) -> vec4f {
  let uv = clamp(ss_uv(pos, tex), vec2f(0.0), vec2f(1.0));
  return textureSampleLevel(tex, samp, uv, 0.0);
}

fn ss_load_remap(src: texture_2d<f32>, dst: texture_2d<f32>, pos: vec4f) -> vec4f {
  return textureLoad(src, ss_pix_remap(pos, src, dst), 0);
}

// ---------- Finite differences (derivative-free) ----------
fn ss_grad_x(tex: texture_2d<f32>, pos: vec4f, chan: u32) -> f32 {
  let d = textureDimensions(tex);
  let p = ss_pix(pos, tex);
  // Stay in unsigned domain to avoid mixed-type constructor issues
  let px_l = select(0u, p.x - 1u, p.x > 0u);
  let px_r = min(p.x + 1u, d.x - 1u);
  let l = textureLoad(tex, vec2u(px_l, p.y), 0)[chan];
  let r = textureLoad(tex, vec2u(px_r, p.y), 0)[chan];
  return 0.5 * (r - l);
}

fn ss_grad_y(tex: texture_2d<f32>, pos: vec4f, chan: u32) -> f32 {
  let d = textureDimensions(tex);
  let p = ss_pix(pos, tex);
  let py_t = select(0u, p.y - 1u, p.y > 0u);
  let py_b = min(p.y + 1u, d.y - 1u);
  let t = textureLoad(tex, vec2u(p.x, py_t), 0)[chan];
  let b = textureLoad(tex, vec2u(p.x, py_b), 0)[chan];
  return 0.5 * (b - t);
}

fn ss_curv_mag(tex: texture_2d<f32>, pos: vec4f, chan: u32) -> f32 {
  let gx = ss_grad_x(tex, pos, chan);
  let gy = ss_grad_y(tex, pos, chan);
  return length(vec2f(gx, gy));
}

// ---------- Seam probe visualization ----------
fn ss_probe_color(pos: vec4f, texA: texture_2d<f32>, samp: sampler) -> vec4f { return vec4f(0.0); }
