// Converts the CC0 models in assets/ into compact geometry for the instanced renderer:
// node tools/models.mjs  ->  src/render/models.gen.ts
// Texture colours are baked into vertex colours. Each car is split into a paint part (drawn with
// glossy paint and tinted per car) and a trim part (tyres, glass, lights) that keeps its own colours.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dir = join(root, 'assets/kaykit-city');
const png = PNG.sync.read(readFileSync(join(dir, 'citybits_texture.png')));
const texel = (u, v) => {
  const px = Math.min(png.width - 1, Math.floor((u - Math.floor(u)) * png.width)), py = Math.min(png.height - 1, Math.floor((v - Math.floor(v)) * png.height)), o = (py * png.width + px) * 4;
  return [png.data[o], png.data[o + 1], png.data[o + 2]];
};

/** Read a .gltf + .bin into flat triangles: position, normal and colour per corner, node offsets applied. */
function load(name) {
  const j = JSON.parse(readFileSync(join(dir, name + '.gltf'), 'utf8')), bin = readFileSync(join(dir, name + '.bin'));
  const acc = i => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const T = a.componentType === 5126 ? Float32Array : a.componentType === 5123 ? Uint16Array : Uint32Array, off = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
    return new T(bin.buffer.slice(off, off + a.count * n * T.BYTES_PER_ELEMENT));
  };
  const tris = [];
  for (const node of j.nodes) {
    if (node.mesh === undefined) continue;
    if (node.rotation || node.scale) throw new Error(name + ': node rotation/scale not supported');
    const t = node.translation || [0, 0, 0];
    for (const pr of j.meshes[node.mesh].primitives) {
      const P = acc(pr.attributes.POSITION), N = acc(pr.attributes.NORMAL), U = acc(pr.attributes.TEXCOORD_0), I = acc(pr.indices);
      for (let k = 0; k < I.length; k += 3) {
        const tri = [];
        for (let c = 0; c < 3; c++) { const v = I[k + c]; tri.push({ p: [P[v * 3] + t[0], P[v * 3 + 1] + t[1], P[v * 3 + 2] + t[2]], n: [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], c: texel(U[v * 2], U[v * 2 + 1]) }); }
        tris.push(tri);
      }
    }
  }
  return tris;
}
const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 1) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const chroma = c => Math.max(...c) - Math.min(...c);
const area = t => { const [a, b, c] = t.map(v => v.p), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2; };

/** Weld identical corners and pack as base64: int16 positions, int8 normals, uint8 colours, uint16 indices. */
function pack(tris) {
  const key = new Map(), pos = [], nor = [], col = [], idx = [];
  let ext = 0; for (const t of tris) for (const v of t) ext = Math.max(ext, ...v.p.map(Math.abs));
  const q = ext / 32767;
  for (const t of tris) for (const v of t) {
    const P = v.p.map(x => Math.round(x / q)), l = Math.hypot(...v.n) || 1, N = v.n.map(x => Math.round(x / l * 127)), k = P.join() + '|' + N.join() + '|' + v.c.join();
    let i = key.get(k); if (i === undefined) { i = pos.length / 3; key.set(k, i); pos.push(...P); nor.push(...N); col.push(...v.c.map(x => Math.max(0, Math.min(255, Math.round(x))))); }
    idx.push(i);
  }
  if (pos.length / 3 > 65535) throw new Error('too many vertices');
  const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  return { q, n: pos.length / 3, p: b64(new Int16Array(pos)), nn: b64(new Int8Array(nor)), c: b64(new Uint8Array(col)), i: b64(new Uint16Array(idx)) };
}

const out = {};
/** Cars: +x forward, wheels on y = 0, scaled to real length, width and height. */
function car(name, L, Wd, H, tint) {
  const tris = load(name); let mn = [9, 9, 9], mx = [-9, -9, -9];
  for (const t of tris) for (const v of t) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], v.p[a]); mx[a] = Math.max(mx[a], v.p[a]); }
  const sL = L / (mx[2] - mn[2]), sW = Wd / (mx[0] - mn[0]), sH = H / (mx[1] - mn[1]), cz = (mx[2] + mn[2]) / 2;
  for (const t of tris) for (const v of t) { const [x, y, z] = v.p, [nx, ny, nz] = v.n; v.p = [(z - cz) * sL, (y - mn[1]) * sH, -x * sW]; v.n = [nz / sL, ny / sH, -nx / sW]; }
  if (!tint) { out[name] = pack(tris); return; }
  // The paint is the most common strongly coloured surface. Keep its shading, drop its hue.
  const bins = new Array(36).fill(0);
  for (const t of tris) { const c = t[0].c; if (chroma(c) > 24) bins[Math.floor(hue(c) / 10)] += area(t); }
  const top = bins.indexOf(Math.max(...bins)) * 10 + 5;
  const isPaint = t => t.every(v => chroma(v.c) > 24 && Math.min(Math.abs(hue(v.c) - top), 360 - Math.abs(hue(v.c) - top)) < 28);
  const paint = tris.filter(isPaint), trim = tris.filter(t => !isPaint(t));
  let lum = 0, n = 0; for (const t of paint) for (const v of t) { lum += Math.max(...v.c); n++; } lum /= n;
  for (const t of paint) for (const v of t) { const g = Math.min(255, Math.max(...v.c) / lum * 215); v.c = [g, g, g]; }
  out[name + '_paint'] = pack(paint); out[name + '_trim'] = pack(trim);
}
/** Street furniture: uniform scale to a real height, standing on y = 0, centred in x and z. */
function prop(name, height) {
  const tris = load(name); let mn = [9, 9, 9], mx = [-9, -9, -9];
  for (const t of tris) for (const v of t) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], v.p[a]); mx[a] = Math.max(mx[a], v.p[a]); }
  const s = height / (mx[1] - mn[1]);
  for (const t of tris) for (const v of t) v.p = [v.p[0] * s, (v.p[1] - mn[1]) * s, v.p[2] * s];
  out[name] = pack(tris);
}
car('car_sedan', 4.5, 1.86, 1.52, true); car('car_hatchback', 4.15, 1.84, 1.55, true); car('car_stationwagon', 4.65, 1.86, 1.58, true);
car('car_taxi', 4.5, 1.86, 1.78, false); car('car_police', 4.6, 1.88, 1.68, false);
prop('bench', 0.5); prop('firehydrant', 0.85); prop('streetlight', 5.4); prop('dumpster', 1.3); prop('bush', 1.1); prop('trash_A', 0.95); prop('trash_B', 0.6);

const names = Object.keys(out);
let ts = '// Generated by tools/models.mjs from the CC0 models in assets/. Do not edit by hand.\n';
ts += 'export interface PackedModel { q: number; n: number; p: string; nn: string; c: string; i: string; }\n';
ts += `export const MODEL_NAMES = ${JSON.stringify(names)} as const;\nexport type ModelName = typeof MODEL_NAMES[number];\n`;
ts += `export const MODELS: Record<ModelName, PackedModel> = ${JSON.stringify(out)};\n`;
writeFileSync(join(root, 'src/render/models.gen.ts'), ts);
let verts = 0; for (const k of names) { verts += out[k].n; console.log(k.padEnd(24), out[k].n, 'verts'); }
console.log('total', verts, 'verts,', (ts.length / 1024).toFixed(0), 'kB');
