// Real building footprints from OpenStreetMap, fitted to the game's street grid.
//   node tools/osm-to-city.mjs [data/map.osm]   ->  src/sim/osm-buildings.ts
// The game map is compressed (about two-thirds scale) and its streets are straight, so each real
// block is warped onto the matching game block: the real street centre lines are fitted from the
// data, and a point keeps its relative position between the two streets either side of it.
// Footprints are then cut into axis-aligned boxes, which is all the collision code understands.
// Map data © OpenStreetMap contributors, ODbL.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(root, 'data/map.osm');
const xml = readFileSync(src, 'utf8');

// --- Parse ------------------------------------------------------------------------------------
const LAT0 = 42.3925, LON0 = -71.0775, KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KZ = 110540;
const nodes = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*? lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [(+m[3] - LON0) * KX, -(+m[2] - LAT0) * KZ]);
const unesc = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
const ways = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const tags = {}; for (const t of m[2].matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)) tags[t[1]] = unesc(t[2]);
  const pts = []; for (const n of m[2].matchAll(/<nd ref="(\d+)"/g)) { const p = nodes.get(n[1]); if (p) pts.push(p); }
  ways.push({ id: m[1], tags, pts });
}

// --- The real street grid ------------------------------------------------------------------------
// Rotate so Assembly Row runs along +v (south); u is then east.
const TH = Math.atan2(32, 211), CT = Math.cos(TH), ST = Math.sin(TH);
const uv = ([x, z]) => [x * CT - z * ST, x * ST + z * CT];
/** Least-squares centre line of a named street. 'ns' gives u = a + b v, 'cross' gives v = a + b u. */
function street(name, kind, lo, hi, keep = () => true) {
  const xs = [], ys = [];
  for (const w of ways) {
    if (w.tags.name !== name || !/^(residential|tertiary|secondary|pedestrian)$/.test(w.tags.highway || '')) continue;
    for (const p of w.pts) { const [u, v] = uv(p); if (!keep(u, v)) continue; const t = kind === 'cross' ? u : v; if (t < lo || t > hi) continue; xs.push(t); ys.push(kind === 'cross' ? v : u); }
  }
  if (xs.length < 4) throw new Error('Not enough of ' + name + ' in the map file. Export a wider area.');
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxy / sxx; return { a: my - b * mx, b };
}
// [real line, game coordinate]
const NS = [[street('Grand Union Boulevard', 'ns', -330, 120), -92], [street('Assembly Row', 'ns', -400, 60), 0], [street('Great River Road', 'ns', -300, -60, u => u > 20), 66]];
const EW = [[street('Great River Road', 'cross', -180, 130, (u, v) => v < -300), -123], [street('Artisan Way', 'cross', -180, 130), -62], [street('Canal Street', 'cross', -180, 130), 0],
  [street('Foley Street', 'cross', -180, 130), 70], [street('Revolution Drive', 'cross', -180, 130), 158]];
const SCALE = 0.68; // beyond the outermost streets, a plain scale
function between(lines, t, at) {
  const r = lines.map(([l, g]) => [l.a + l.b * at, g]);
  if (t <= r[0][0]) return r[0][1] + (t - r[0][0]) * SCALE;
  for (let i = 0; i < r.length - 1; i++) if (t <= r[i + 1][0]) return r[i][1] + (t - r[i][0]) / (r[i + 1][0] - r[i][0]) * (r[i + 1][1] - r[i][1]);
  const e = r[r.length - 1]; return e[1] + (t - e[0]) * SCALE;
}
/** Real metres (east, south) to game metres. */
const warp = p => { const [u, v] = uv(p); return [between(NS, u, v), between(EW, v, u)]; };

// --- Buildings ----------------------------------------------------------------------------------
const FLOOR0 = 4.4, FLOOR = 3.5; // matches the facade shader: a tall shopfront, then 3.5 m storeys
function height(t) {
  if (t.height && parseFloat(t.height) > 0) return parseFloat(t.height) * 0.8;
  let lv = parseFloat(t['building:levels']);
  if (!(lv > 0)) lv = /apartments|residential|hotel/.test(t.building) ? 6 : /office|commercial/.test(t.building) ? 6 : /parking/.test(t.building) || /garage/i.test(t.name || '') ? 5 : /retail|supermarket/.test(t.building) ? 1.6 : 4;
  // Towers are squeezed a little, as the ground plan is, so they do not loom over a compressed street.
  const h = FLOOR0 + (lv - 1) * FLOOR; return Math.round((h > 30 ? 30 + (h - 30) * 0.75 : h) * 2) / 2;
}
const kindOf = t => /parking/.test(t.building) || /garage/i.test(t.name || '') ? 'parking' : /apartments|residential/.test(t.building) ? 'apartments' : /hotel/.test(t.building) || /hotel/i.test(t.name || '') ? 'hotel'
  : /office|commercial/.test(t.building) ? 'office' : /retail|supermarket/.test(t.building) ? 'retail' : 'other';

// Where buildings may stand in the game: inside the sidewalk podiums, set back from the kerb.
const XW = [-80, -12], XE = [12, 54], XE2 = [12, 83];
const BLOCKS = [
  ['A-west', ...XW, -111, -70], ['A-east', ...XE, -111, -70], ['B-west', ...XW, -54, -8], ['B-east', ...XE, -54, -8],
  ['C-west', ...XW, 8, 58], ['C-east', ...XE, 8, 58], ['D-west', ...XW, 82, 148], ['D-east', ...XE, 96, 148],
  ['E-west', ...XW, 170, 254], ['E-east', ...XE2, 170, 254],
];
const CELL = 1;
const inside = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };

const out = [], debug = [];
for (const w of ways) {
  const t = w.tags; if (!t.building || t.building === 'no' || w.pts.length < 4) continue;
  const poly = w.pts.map(warp), cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  if (cx < -110 || cx > 110 || cz < -140 || cz > 290) continue;
  debug.push({ id: w.id, name: t.name || '', building: t.building, levels: t['building:levels'] || '', poly });
  const h = height(t), kind = kindOf(t);
  for (const [block, bx0, bx1, bz0, bz1] of BLOCKS) {
    // Rasterise onto the block's grid, then merge cells into as few rectangles as possible.
    const nx = Math.round((bx1 - bx0) / CELL), nz = Math.round((bz1 - bz0) / CELL), g = new Uint8Array(nx * nz); let any = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (inside(poly, bx0 + (i + 0.5) * CELL, bz0 + (j + 0.5) * CELL)) { g[j * nx + i] = 1; any++; }
    if (any < 30) continue;
    // Close one-cell notches and remove one-cell spurs so walls come out straight.
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const at = (a, b) => a >= 0 && b >= 0 && a < nx && b < nz ? g[b * nx + a] : 0, n = at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1);
      if (!g[j * nx + i] && n >= 3) g[j * nx + i] = 1; else if (g[j * nx + i] && n <= 1) g[j * nx + i] = 0;
    }
    const rects = [];
    for (;;) {
      // largest rectangle of filled cells (histogram method), repeatedly
      let best = null; const hgt = new Int32Array(nx);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) hgt[i] = g[j * nx + i] ? hgt[i] + 1 : 0;
        const st = [];
        for (let i = 0; i <= nx; i++) {
          const cur = i < nx ? hgt[i] : 0; let start = i;
          while (st.length && st[st.length - 1][1] > cur) { const [s, hh] = st.pop(), a = hh * (i - s); if (!best || a > best.a) best = { a, i0: s, i1: i, j0: j - hh + 1, j1: j + 1 }; start = s; }
          if (!st.length || st[st.length - 1][1] < cur) st.push([start, cur]);
        }
      }
      if (!best || best.a < 12 || Math.min(best.i1 - best.i0, best.j1 - best.j0) < 2) break;
      for (let j = best.j0; j < best.j1; j++) for (let i = best.i0; i < best.i1; i++) g[j * nx + i] = 0;
      rects.push([bx0 + best.i0 * CELL, bx0 + best.i1 * CELL, bz0 + best.j0 * CELL, bz0 + best.j1 * CELL]);
    }
    for (const r of rects) out.push({ r, h, kind, name: t.name || '', id: w.id, block });
  }
}

let ts = '// Generated by tools/osm-to-city.mjs from data/map.osm. Do not edit by hand.\n// Map data © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).\n';
ts += "export type OsmKind = 'apartments' | 'office' | 'retail' | 'parking' | 'hotel' | 'other';\n";
ts += '/** x0, x1, z0, z1, height, kind, building number (pieces of one building share it), block, name */\n';
const ids = [...new Set(out.map(o => o.id))];
ts += 'export const OSM_BUILDINGS: [number, number, number, number, number, OsmKind, number, string, string][] = [\n';
for (const o of out) ts += `  [${o.r.join(', ')}, ${o.h}, '${o.kind}', ${ids.indexOf(o.id)}, '${o.block}', ${JSON.stringify(o.name)}],\n`;
ts += '];\n';
writeFileSync(join(root, 'src/sim/osm-buildings.ts'), ts);
if (process.argv.includes('--debug')) writeFileSync('/tmp/osm/debug.json', JSON.stringify({ debug, out, BLOCKS }));
console.log(`${ids.length} buildings as ${out.length} boxes -> src/sim/osm-buildings.ts`);
for (const id of ids) { const o = out.filter(q => q.id === id); console.log(' ', o[0].block.padEnd(7), String(o.length).padStart(3), 'boxes', String(o[0].h).padStart(5), 'm', o[0].kind.padEnd(10), o[0].name); }
