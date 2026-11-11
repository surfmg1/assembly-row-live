// Tileable surface textures generated at startup, so the page needs no image files.
// Channels are data, not colour: most are rgb = tint multiplier, a = height for bump shading.
import * as THREE from 'three';

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Tileable value noise on an N x N grid with `cells` lattice points per side. */
function vnoise(N: number, cells: number, seed: number) {
  const r = rng(seed), g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = y / N * cells, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty), y0 = iy % cells, y1 = (iy + 1) % cells;
    for (let x = 0; x < N; x++) {
      const fx = x / N * cells, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx), x0 = ix % cells, x1 = (ix + 1) % cells;
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
      out[y * N + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}
function fbm(N: number, cells: number, oct: number, seed: number) {
  const out = new Float32Array(N * N); let amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { const n = vnoise(N, cells << o, seed + o * 101); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const clamp8 = (v: number) => v < 0 ? 0 : v > 1 ? 255 : Math.round(v * 255);

function tex(data: Uint8Array, N: number, aniso: number) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = aniso; t.needsUpdate = true;
  return t;
}

/** Asphalt: fine aggregate, a few dark sealed cracks. Covers 6 m. */
function asphalt(N: number) {
  const f = fbm(N, 8, 5, 11), d = new Uint8Array(N * N * 4), r = rng(7), lum = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) { const sp = r(); lum[i] = 0.80 + 0.32 * (f[i] - 0.5) + (sp < 0.07 ? (r() - 0.45) * 0.55 : 0); }
  for (let k = 0; k < 5; k++) {
    let x = r() * N, y = r() * N, a = r() * 6.28;
    for (let s = 0; s < 260; s++) {
      a += (r() - 0.5) * 0.5; x = (x + Math.cos(a) + N) % N; y = (y + Math.sin(a) + N) % N;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { const j = ((Math.floor(y) + oy + N) % N) * N + ((Math.floor(x) + ox + N) % N); lum[j] *= ox === 0 && oy === 0 ? 0.78 : 0.93; }
    }
  }
  for (let i = 0; i < N * N; i++) { const v = lum[i]; d[i * 4] = clamp8(v * 0.98); d[i * 4 + 1] = clamp8(v); d[i * 4 + 2] = clamp8(v * 1.03); d[i * 4 + 3] = clamp8(v * 0.9); }
  return d;
}
/** Concrete paving: 2 x 2 slabs with dark seams, light staining. Covers 3 m. */
function concrete(N: number) {
  const f = fbm(N, 6, 5, 21), st = fbm(N, 3, 3, 33), d = new Uint8Array(N * N * 4), h = N / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, dx = Math.min(x % h, h - x % h), dy = Math.min(y % h, h - y % h), seam = Math.min(dx, dy);
    let v = 0.88 + 0.2 * (f[i] - 0.5) - (st[i] < 0.38 ? (0.38 - st[i]) * 0.5 : 0), ht = 0.82 + 0.18 * f[i];
    if (seam < 2.5) { const k = seam / 2.5; v *= 0.55 + 0.45 * k; ht *= k; }
    d[i * 4] = clamp8(v); d[i * 4 + 1] = clamp8(v); d[i * 4 + 2] = clamp8(v * 0.98); d[i * 4 + 3] = clamp8(ht);
  }
  return d;
}
/** Grass: blade strokes over mottled noise. Covers 2.5 m. */
function grass(N: number) {
  const f = fbm(N, 16, 4, 41), lum = new Float32Array(N * N), r = rng(43), d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) lum[i] = 0.72 + 0.5 * (f[i] - 0.5);
  for (let k = 0; k < 14000; k++) {
    const x0 = r() * N, y0 = r() * N, len = 4 + r() * 10, a = -Math.PI / 2 + (r() - 0.5) * 0.9, l = 0.6 + r() * 0.75;
    for (let s = 0; s < len; s++) { const x = Math.floor(x0 + Math.cos(a) * s + N) % N, y = Math.floor(y0 + Math.sin(a) * s + N) % N; lum[y * N + x] = l * (0.85 + 0.3 * s / len); }
  }
  for (let i = 0; i < N * N; i++) { const v = lum[i]; d[i * 4] = clamp8(v * 0.9); d[i * 4 + 1] = clamp8(v); d[i * 4 + 2] = clamp8(v * 0.8); d[i * 4 + 3] = clamp8(v / 1.4); }
  return d;
}
/** Brick, running bond, 8 bricks by 8 courses. r = brick shade, g = mortar mask, b = height. Covers 2.48 x 1.2 m. */
function brick(N: number) {
  const f = fbm(N, 32, 3, 51), r = rng(53), d = new Uint8Array(N * N * 4), bw = N / 8, bh = N / 8, mort = 3.2;
  const shade: number[] = []; for (let i = 0; i < 128; i++) shade.push(0.78 + 0.34 * r());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, row = Math.floor(y / bh), xs = (x + (row % 2) * bw / 2) % N, col = Math.floor(xs / bw);
    const ex = Math.min(xs % bw, bw - xs % bw), ey = Math.min(y % bh, bh - y % bh), e = Math.min(ex, ey) + (f[i] - 0.5) * 2;
    const m = e < mort ? 1 : e < mort + 1.2 ? 1 - (e - mort) / 1.2 : 0;
    const v = shade[(row * 8 + col) % 128] * (0.92 + 0.16 * f[i]);
    d[i * 4] = clamp8(v); d[i * 4 + 1] = clamp8(m); d[i * 4 + 2] = clamp8((1 - m) * (0.85 + 0.15 * f[i])); d[i * 4 + 3] = 255;
  }
  return d;
}
/** Tangent-space normal map for water: a sum of tileable travelling waves. */
function waterNormals(N: number) {
  const r = rng(61), waves: number[][] = [];
  for (let k = 0; k < 26; k++) { const fx = Math.round((r() - 0.5) * 24), fy = Math.round((r() - 0.5) * 24); if (!fx && !fy) continue; waves.push([fx, fy, r() * 6.28, 1 / (1 + Math.hypot(fx, fy) * 0.6)]); }
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (const w of waves) s += w[3] * Math.sin(6.2832 * (w[0] * x + w[1] * y) / N + w[2]); h[y * N + x] = s; }
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    let nx = -dx * 2.2, ny = -dy * 2.2, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4; d[i] = clamp8(nx * 0.5 + 0.5); d[i + 1] = clamp8(ny * 0.5 + 0.5); d[i + 2] = clamp8(nz * 0.5 + 0.5); d[i + 3] = 255;
  }
  return d;
}

export function makeTextures(aniso: number) {
  return {
    asphalt: tex(asphalt(512), 512, aniso), concrete: tex(concrete(512), 512, aniso), grass: tex(grass(512), 512, aniso),
    brick: tex(brick(512), 512, aniso), water: tex(waterNormals(256), 256, aniso),
  };
}
