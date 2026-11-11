// Turns simulation state into box instances: the world, trees for the season, the mannequin,
// boards, cart, kayak, vehicles, the bungee, trains, NPCs and props.
import { World, ground, trainAt, TRAIN_HALF } from '../sim/world';
import { Player, Ride } from '../sim/player';
import { Car, ROPE } from '../sim/traffic';
import { M } from '../sim/city';
import { Instances } from './renderer';
import { M4, chain, mul, trans, scale, rotX, rotY, rotZ } from './mat';

const CONCRETE = [0.80, 0.81, 0.83], RAMP = [0.68, 0.70, 0.74], WALL = [0.87, 0.88, 0.90], FLOOR = [0.74, 0.75, 0.78];
const ORANGE = [0.93, 0.545, 0.0], INK = [0.10, 0.12, 0.16], SLATE = [0.30, 0.34, 0.42], SKIN = [0.88, 0.83, 0.77];
const STEEL = [0.58, 0.61, 0.66], CRATE = [0.74, 0.62, 0.44], WHITE = [0.96, 0.96, 0.97], NAVY = [0.13, 0.19, 0.36];
const TIRE = [0.09, 0.09, 0.10], GLASSD = [0.13, 0.17, 0.22], HEAD = [1.0, 0.96, 0.82], TAIL = [0.95, 0.12, 0.10], LIME = [0.75, 1.0, 0.25];
const SHIRTS = [[0.80, 0.25, 0.22], [0.22, 0.45, 0.75], [0.30, 0.62, 0.38], [0.93, 0.80, 0.30], [0.55, 0.36, 0.70], [0.90, 0.90, 0.88], [0.20, 0.22, 0.26], [0.85, 0.50, 0.62]];
const COATS = [[0.16, 0.18, 0.24], [0.45, 0.14, 0.16], [0.20, 0.34, 0.30], [0.62, 0.60, 0.56], [0.24, 0.30, 0.50], [0.80, 0.52, 0.16]];
const CARS = [[0.72, 0.14, 0.14], [0.90, 0.90, 0.90], [0.14, 0.19, 0.30], [0.50, 0.52, 0.56], [0.18, 0.38, 0.68], [0.12, 0.13, 0.14], [0.70, 0.72, 0.74], [0.40, 0.46, 0.34], [0.78, 0.74, 0.62]];
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function boxAt(out: Instances, root: M4, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number[], mat = 1) {
  out.push(chain(root, trans(x, y, z), scale(sx, sy, sz)), c[0], c[1], c[2], mat);
}

/** A passenger car. Local +x is forward. `sm` is the material for body panels (snow sticks to parked ones). */
function carModel(out: Instances, m: M4, c: number[], sm = 1) {
  boxAt(out, m, 0, 0.62, 0, 4.3, 0.62, 1.8, c, sm); boxAt(out, m, -0.2, 1.18, 0, 2.3, 0.5, 1.62, GLASSD); boxAt(out, m, -0.2, 1.46, 0, 2.2, 0.08, 1.66, c, sm);
  for (const x of [-1.35, 1.35]) for (const z of [-0.88, 0.88]) boxAt(out, m, x, 0.32, z, 0.64, 0.64, 0.2, TIRE);
  for (const z of [-0.6, 0.6]) { boxAt(out, m, 2.16, 0.7, z, 0.04, 0.16, 0.36, HEAD, M.EMIS); boxAt(out, m, -2.16, 0.74, z, 0.04, 0.14, 0.3, TAIL, M.EMIS); }
}
function pickupModel(out: Instances, m: M4, c: number[]) {
  boxAt(out, m, 0, 0.8, 0, 5.5, 0.6, 2.0, c); boxAt(out, m, 1.8, 1.22, 0, 1.9, 0.26, 1.96, c);
  boxAt(out, m, 0.15, 1.55, 0, 1.6, 0.62, 1.8, GLASSD); boxAt(out, m, 0.15, 1.9, 0, 1.7, 0.1, 1.9, c); boxAt(out, m, -0.62, 1.5, 0, 0.1, 0.7, 1.86, c);
  for (const z of [-0.96, 0.96]) boxAt(out, m, -1.75, 1.3, z, 2.0, 0.45, 0.08, c);
  boxAt(out, m, -2.72, 1.3, 0, 0.08, 0.45, 2.0, c); boxAt(out, m, -2.9, 0.62, 0, 0.3, 0.08, 0.08, STEEL);
  for (const x of [-1.75, 1.8]) for (const z of [-0.98, 0.98]) boxAt(out, m, x, 0.42, z, 0.84, 0.84, 0.26, TIRE);
  for (const z of [-0.7, 0.7]) { boxAt(out, m, 2.76, 0.95, z, 0.04, 0.18, 0.4, HEAD, M.EMIS); boxAt(out, m, -2.77, 1.05, z, 0.04, 0.3, 0.16, TAIL, M.EMIS); }
  // the friend at the wheel, arm out the window
  boxAt(out, m, 0.3, 1.62, -0.45, 0.26, 0.28, 0.26, SKIN); boxAt(out, m, 0.3, 1.8, -0.45, 0.3, 0.1, 0.3, [0.2, 0.5, 0.3]); boxAt(out, m, 0.35, 1.36, -1.0, 0.5, 0.1, 0.12, [0.2, 0.3, 0.5]);
}
function plowModel(out: Instances, m: M4, t: number, hue: number) {
  const body = hue % 2 ? [0.95, 0.62, 0.08] : [0.92, 0.78, 0.10];
  boxAt(out, m, -0.3, 0.95, 0, 6.6, 0.5, 2.5, [0.15, 0.15, 0.17]);
  boxAt(out, m, 2.0, 2.0, 0, 2.0, 1.7, 2.5, body); boxAt(out, m, 3.02, 2.3, 0, 0.05, 0.8, 2.2, GLASSD); boxAt(out, m, 2.0, 2.4, 0, 1.3, 0.7, 2.54, GLASSD);
  boxAt(out, m, -1.6, 2.2, 0, 4.0, 1.6, 2.7, [0.62, 0.64, 0.68]); boxAt(out, m, -3.75, 1.3, 0, 0.5, 0.5, 2.0, body);
  const bl = chain(m, trans(4.25, 0.72, 0), rotY(0.42));
  boxAt(out, bl, 0, 0, 0, 0.28, 1.3, 3.9, [0.95, 0.80, 0.10]); boxAt(out, bl, 0.12, -0.55, 0, 0.1, 0.18, 3.9, [0.3, 0.3, 0.32]);
  boxAt(out, m, 3.5, 0.8, 0, 1.2, 0.2, 1.2, [0.2, 0.2, 0.22]);
  const blink = Math.sin(t * 9) > 0;
  boxAt(out, m, 2.0, 2.98, 0, 0.34, 0.24, 0.34, blink ? [1.0, 0.72, 0.1] : [0.45, 0.3, 0.05], M.EMIS);
  for (const x of [2.2, -1.3, -2.5]) for (const z of [-1.15, 1.15]) boxAt(out, m, x, 0.52, z, 1.04, 1.04, 0.36, TIRE);
  for (const z of [-0.9, 0.9]) { boxAt(out, m, 3.04, 1.45, z, 0.04, 0.2, 0.4, HEAD, M.EMIS); boxAt(out, m, -3.62, 1.25, z, 0.04, 0.2, 0.3, TAIL, M.EMIS); }
}
function mowerModel(out: Instances, m: M4, t: number, running: boolean) {
  const R = [0.80, 0.14, 0.12], shake = running ? Math.sin(t * 50) * 0.008 : 0;
  const b = chain(m, trans(0, shake, 0));
  boxAt(out, b, -0.05, 0.56, 0, 1.5, 0.34, 0.8, R); boxAt(out, b, 0.48, 0.84, 0, 0.72, 0.3, 0.7, R); boxAt(out, b, 0.86, 0.78, 0, 0.05, 0.2, 0.5, INK);
  boxAt(out, b, -0.42, 0.78, 0, 0.46, 0.1, 0.5, INK); boxAt(out, b, -0.62, 1.02, 0, 0.1, 0.46, 0.5, INK);
  boxAt(out, b, 0.12, 1.02, 0, 0.06, 0.4, 0.06, INK); boxAt(out, b, 0.1, 1.24, 0, 0.06, 0.06, 0.42, INK);
  boxAt(out, b, 0.18, 0.2, 0, 1.2, 0.14, 1.36, [0.14, 0.14, 0.15]); boxAt(out, b, 0.18, 0.2, 0.78, 0.4, 0.12, 0.24, [0.14, 0.14, 0.15]);
  for (const z of [-0.5, 0.5]) { boxAt(out, b, -0.5, 0.3, z, 0.6, 0.6, 0.22, TIRE); boxAt(out, b, 0.62, 0.2, z * 0.86, 0.4, 0.4, 0.16, TIRE); }
}

function treeModel(out: Instances, w: World, x: number, z: number, y: number, h: number, lights: boolean, i: number) {
  const se = w.env.season, r = hash(i, 3), r2 = hash(i, 8), top = y + h * 0.42, cw = h * (0.46 + r * 0.12);
  if (se === 'winter') {
    const B = [0.26, 0.20, 0.16];
    out.box(x, top + h * 0.2, z, 0.16, h * 0.4, 0.16, B[0], B[1], B[2], M.PLAIN);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26 + r * 6, tilt = 0.7 + hash(i, k) * 0.4, len = h * (0.34 + hash(k, i) * 0.14);
      out.push(chain(trans(x, top + h * 0.05 * k, z), rotY(a), rotZ(tilt), trans(0, len / 2, 0), scale(0.09, len, 0.09)), B[0], B[1], B[2], M.SNOWY);
    }
  } else {
    let c: number[];
    if (se === 'fall') c = r < 0.34 ? [0.86, 0.46, 0.10] : r < 0.67 ? [0.74, 0.20, 0.10] : [0.93, 0.72, 0.16];
    else if (se === 'spring') c = r < 0.4 ? [0.96, 0.72, 0.82] : r < 0.55 ? [0.98, 0.93, 0.95] : [0.52, 0.74, 0.34];
    else c = r < 0.5 ? [0.22, 0.48, 0.20] : [0.28, 0.54, 0.24];
    const k = se === 'fall' ? 0.86 : 1;
    out.box(x, top + cw * 0.36 * k, z, cw * k, cw * 0.72 * k, cw * k, c[0], c[1], c[2], M.LEAF);
    out.box(x + (r2 - 0.5) * cw * 0.5, top + cw * 0.8 * k, z + (r - 0.5) * cw * 0.5, cw * 0.7 * k, cw * 0.5 * k, cw * 0.7 * k, c[0] * 1.06, c[1] * 1.06, c[2] * 1.06, M.LEAF);
    out.box(x - (r2 - 0.5) * cw * 0.6, top + cw * 0.3 * k, z - (r - 0.5) * cw * 0.6, cw * 0.6 * k, cw * 0.44 * k, cw * 0.6 * k, c[0] * 0.92, c[1] * 0.92, c[2] * 0.92, M.LEAF);
  }
  if (lights && (se === 'winter' || w.env.weather === 'snowy' || w.env.weather === 'rainy')) {
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4 + r * 6, rr = cw * (0.2 + hash(k, i) * 0.34);
      out.box(x + Math.cos(a) * rr, top + 0.2 + hash(i + 3, k) * cw * 0.9, z + Math.sin(a) * rr, 0.09, 0.09, 0.09, 1.0, 0.86, 0.5, M.EMIS);
    }
  }
}

export function buildStatic(w: World): { cubes: Instances; wedges: Instances } {
  const cubes = new Instances(4096), wedges = new Instances(64);
  const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: number[], mat = 1) =>
    cubes.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c[0], c[1], c[2], mat);
  const city = w.kind === 'city';
  if (!city) bx(w.minX - 1, w.maxX + 1, -1, 0, w.minZ - 1, w.maxZ + 1, FLOOR, 0);
  for (const s of w.solids) {
    if (s.hide) continue;
    const col = s.color || (s.tint === 2 ? ORANGE : s.tint === 3 ? WALL : s.tint === 1 ? RAMP : s.surf === 'wood' ? CRATE : CONCRETE);
    const mat = s.mat !== undefined ? s.mat : s.tint === 2 ? 1 : 0;
    if (s.ramp === undefined) bx(s.x0, s.x1, s.y0, s.y1, s.z0, s.z1, col, mat);
    else {
      const rot = s.ramp === 0 ? 0 : s.ramp === 1 ? Math.PI : s.ramp === 2 ? -Math.PI / 2 : Math.PI / 2;
      const lx = s.x1 - s.x0, lz = s.z1 - s.z0, along = s.ramp < 2 ? lx : lz, across = s.ramp < 2 ? lz : lx;
      wedges.push(chain(trans((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2), rotY(rot), scale(along, s.y1 - s.y0, across)), col[0], col[1], col[2], mat === 3 || mat === 8 || mat === 9 ? M.SNOWY : mat);
    }
  }
  for (const d of w.decor) bx(d.x0, d.x1, d.y0, d.y1, d.z0, d.z1, d.color, d.mat);
  if (!city) {
    const e = 0.03; // Orange Line stripe around the lab
    bx(w.minX, w.minX + e, 1.0, 1.25, w.minZ, w.maxZ, ORANGE); bx(w.maxX - e, w.maxX, 1.0, 1.25, w.minZ, w.maxZ, ORANGE);
    bx(w.minX, w.maxX, 1.0, 1.25, w.minZ, w.minZ + e, ORANGE); bx(w.minX, w.maxX, 1.0, 1.25, w.maxZ - e, w.maxZ, ORANGE);
    for (const s of w.spawns) bx(s.x - 0.9, s.x + 0.9, s.y, s.y + 0.015, s.z - 0.9, s.z + 0.9, ORANGE);
    bx(-17, 26, 0, 0.012, 17.4, 17.55, WHITE); bx(-17, 26, 0, 0.012, 24.45, 24.6, WHITE);
  }
  for (const r of w.rails) {
    const dx = r.bx - r.ax, dy = r.by - r.ay, dz = r.bz - r.az, len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dz, dx), pitch = Math.asin(dy / len);
    const rc = city && r.edge ? STEEL : ORANGE;
    cubes.push(chain(trans((r.ax + r.bx) / 2, (r.ay + r.by) / 2 - (r.edge ? 0.02 : 0.035), (r.az + r.bz) / 2), rotY(-yaw), rotZ(pitch),
      scale(len, r.edge ? 0.05 : 0.07, r.edge ? 0.05 : 0.07)), rc[0], rc[1], rc[2], 1);
    if (r.edge) continue;
    const n = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = r.ax + dx * t, y = r.ay + dy * t, z = r.az + dz * t;
      const gy = ground(w, x, z, y).y;
      if (y - gy > 0.08) bx(x - 0.03, x + 0.03, gy, y - 0.05, z - 0.03, z + 0.03, STEEL);
    }
  }
  w.trees.forEach((t, i) => treeModel(cubes, w, t.x, t.z, t.y, t.h, !!t.lights, i));
  const dusk = w.env.weather === 'snowy' || w.env.weather === 'rainy';
  for (const [x, y, z] of w.lamps) {
    bx(x - 0.07, x + 0.07, y, y + 4.6, z - 0.07, z + 0.07, [0.08, 0.08, 0.09]); bx(x - 0.16, x + 0.16, y, y + 0.5, z - 0.16, z + 0.16, [0.08, 0.08, 0.09]);
    bx(x - 0.2, x + 0.2, y + 4.6, y + 5.1, z - 0.2, z + 0.2, dusk ? [1.0, 0.86, 0.6] : [0.93, 0.92, 0.88], dusk ? M.EMIS : M.PLAIN);
    bx(x - 0.26, x + 0.26, y + 5.1, y + 5.2, z - 0.26, z + 0.26, [0.08, 0.08, 0.09]);
  }
  for (const c of w.parked) carModel(cubes, chain(trans(c.x, 0, c.z), rotY(-c.yaw)), CARS[Math.abs(Math.round(c.hue)) % CARS.length], M.SNOWY);
  // Uncut lawns read a little shaggier and darker until the mower has been over them.
  for (const f of w.fields) if (f.kind === 'lawn') {
    const y = f.z0 > 0 ? 0.16 : 0.05, g = w.env.season === 'fall' ? [0.44, 0.47, 0.22] : [0.30, 0.47, 0.20];
    bx(f.x0, f.x0 + f.nx * f.cell, y, y + 0.03, f.z0, f.z0 + f.nz * f.cell, g, M.GRASS);
  }
  return { cubes, wedges };
}

/** Mown stripes on the lawns, or plowed asphalt showing through the snow. */
export function buildField(out: Instances, w: World, p: Player) {
  out.clear();
  for (let k = 0; k < w.fields.length; k++) {
    const f = w.fields[k], cells = p.fields[k]; if (!cells) continue;
    const lawn = f.kind === 'lawn', y = lawn ? (f.z0 > 0 ? 0.2 : 0.09) : 0.035;
    for (let j = 0; j < f.nz; j++) for (let i = 0; i < f.nx; i++) {
      const c = cells[j * f.nx + i]; if (!c) continue;
      const x = f.x0 + (i + 0.5) * f.cell, z = f.z0 + (j + 0.5) * f.cell;
      if (lawn) { const l = c % 2 ? 1 : 0.84; out.box(x, y, z, f.cell, 0.02, f.cell, 0.46 * l, 0.72 * l, 0.32 * l, M.GRASS); }
      else { const v = 0.17 + hash(i, j) * 0.04; out.box(x, y, z, f.cell, 0.02, f.cell, v, v + 0.01, v + 0.03, M.PLAIN); }
    }
  }
}

function part(out: Instances, root: M4, px: number, py: number, pz: number, ang: number, sx: number, len: number, sz: number, c: number[], roll = 0) {
  out.push(chain(root, trans(px, py, pz), rotZ(ang), rotX(roll), trans(0, -len / 2, 0), scale(sx, len, sz)), c[0], c[1], c[2]);
}

interface Pose { legL: number; legR: number; armL: number; armR: number; lean: number; legLen: number; twist: number; }

function figure(out: Instances, root: M4, q: Pose, shirt = ORANGE, pants = SLATE, cap = INK) {
  const hip = 0.84 * q.legLen + 0.02;
  part(out, root, 0, hip, -0.1, q.legL, 0.17, 0.84 * q.legLen, 0.17, pants);
  part(out, root, 0, hip, 0.1, q.legR, 0.17, 0.84 * q.legLen, 0.17, pants);
  const up = chain(root, trans(0, hip, 0), rotZ(q.lean), rotY(q.twist));
  boxAt(out, up, 0, 0.3, 0, 0.28, 0.6, 0.42, shirt);
  boxAt(out, up, 0.02, 0.76, 0, 0.24, 0.26, 0.24, SKIN);
  boxAt(out, up, -0.05, 0.84, 0, 0.3, 0.12, 0.28, cap);
  part(out, up, 0, 0.56, -0.27, q.armL, 0.12, 0.6, 0.12, shirt);
  part(out, up, 0, 0.56, 0.27, q.armR, 0.12, 0.6, 0.12, shirt);
}

function board(out: Instances, m: M4, snow: boolean) {
  if (snow) {
    boxAt(out, m, 0, 0.05, 0, 1.3, 0.035, 0.3, [0.10, 0.62, 0.66]); boxAt(out, m, 0.72, 0.07, 0, 0.2, 0.035, 0.26, [0.10, 0.62, 0.66]); boxAt(out, m, -0.72, 0.07, 0, 0.2, 0.035, 0.26, [0.10, 0.62, 0.66]);
    boxAt(out, m, 0, 0.071, 0, 0.9, 0.004, 0.08, ORANGE); for (const x of [-0.25, 0.25]) boxAt(out, m, x, 0.1, 0, 0.12, 0.07, 0.3, INK);
    return;
  }
  boxAt(out, m, 0, 0.1, 0, 0.86, 0.035, 0.24, INK); boxAt(out, m, 0, 0.121, 0, 0.5, 0.004, 0.06, ORANGE);
  for (const x of [-0.27, 0.27]) for (const z of [-0.09, 0.09]) boxAt(out, m, x, 0.04, z, 0.08, 0.08, 0.05, WHITE);
}

function cart(out: Instances, m: M4, wob: number) {
  const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c = STEEL) => boxAt(out, m, x, y, z, sx, sy, sz, c);
  b(0, 0.34, 0, 0.9, 0.03, 0.56); b(0, 0.13, 0, 0.8, 0.03, 0.4);
  for (const x of [-0.43, 0.43]) for (const z of [-0.265, 0.265]) b(x, 0.58, z, 0.03, 0.5, 0.03);
  for (const y of [0.58, 0.83]) { for (const z of [-0.265, 0.265]) b(0, y, z, 0.9, 0.03, 0.03); for (const x of [-0.43, 0.43]) b(x, y, 0, 0.03, 0.03, 0.56); }
  for (const x of [-0.22, 0, 0.22]) for (const z of [-0.265, 0.265]) b(x, 0.58, z, 0.02, 0.5, 0.02);
  b(-0.53, 0.95, 0, 0.04, 0.04, 0.62, ORANGE); for (const z of [-0.265, 0.265]) b(-0.48, 0.89, z, 0.12, 0.03, 0.03);
  for (const x of [-0.36, 0.36]) for (const z of [-0.2, 0.2]) {
    const wm = x > 0 && z > 0 ? chain(m, trans(x, 0.05, z), rotY(wob)) : chain(m, trans(x, 0.05, z));
    out.push(mul(wm, scale(0.11, 0.1, 0.04)), INK[0], INK[1], INK[2]);
  }
}

export interface View { phase: number; y: number; }

function drawPlayer(out: Instances, w: World, p: Player, v: View) {
  const sp = Math.hypot(p.vx, p.vz);
  const sw = Math.sin(v.phase), k = Math.min(1, sp / 6);
  const air = !p.grounded, snow = w.env.snow, towed = p.tow.rope;
  const trick = p.trickT > 0 ? 1 - p.trickT / p.trickDur : 0;
  const shirt = snow ? [0.93, 0.36, 0.10] : ORANGE, cap = snow ? [0.16, 0.42, 0.62] : INK;

  if (p.state === 'bail') {
    const r = p.rag;
    const root = chain(trans(r.x, r.y, r.z), rotY(-p.yaw), rotZ(-r.rot), rotX(r.rot * 0.6), trans(0, -0.9, 0));
    const f = Math.sin(r.rot * 2);
    figure(out, root, { legL: 0.8 + f * 0.5, legR: -0.6 - f * 0.4, armL: 2.4 + f, armR: -2.0 + f, lean: 0.3 * f, legLen: 1, twist: 0.4 * f }, shirt, SLATE, cap);
    const here = chain(trans(p.x, v.y, p.z), rotY(-p.yaw));
    if (p.mode === 'skate') board(out, chain(here, trans(0.6, 0.2, 0.3), rotX(Math.PI), rotY(0.7)), snow);
    if (p.mode === 'cart') cart(out, chain(here, trans(0.9, 0.3, 0), rotX(Math.PI / 2), rotY(0.3)), 0);
  } else if (p.mode === 'drive') {
    const r = p.rides[p.ride], root = chain(trans(p.x, v.y, p.z), rotY(-p.yaw));
    if (r.kind === 'plow') plowModel(out, root, p.time, 0);
    else {
      mowerModel(out, root, p.time, true);
      figure(out, chain(root, trans(-0.42, 0.5, 0)), { legL: 1.35, legR: 1.35, armL: 1.0, armR: 1.0, lean: -0.1, legLen: 0.55, twist: 0 }, shirt, SLATE, cap);
    }
  } else if (p.mode === 'foot') {
    let root = chain(trans(p.x, v.y, p.z), rotY(-p.yaw));
    const pose: Pose = { legL: sw * 0.95 * k, legR: -sw * 0.95 * k, armL: -sw * 0.8 * k, armR: sw * 0.8 * k, lean: -0.16 * k, legLen: 1, twist: 0 };
    if (p.state === 'slide') { root = chain(root, trans(0, 0.12, 0), rotZ(1.15)); pose.legL = 0.25; pose.legR = -0.1; pose.armL = -0.9; pose.armR = -0.5; pose.lean = -0.5; }
    else if (p.state === 'mantle') { pose.armL = pose.armR = 2.9; pose.legL = 0.5; pose.legR = 0.1; pose.lean = -0.1; }
    else if (p.state === 'wallrun') {
      const side = Math.sign(p.wallNx * -Math.sin(p.yaw) + p.wallNz * Math.cos(p.yaw)) || 1;
      root = chain(root, rotX(0.42 * side)); pose.lean = -0.25;
    } else if (p.state === 'grind') { pose.legL = 0.5; pose.legR = -0.35; pose.armL = 1.4; pose.armR = 1.4; pose.lean = -0.2; pose.twist = 0.9; }
    else if (p.vaultT > 0) { const t = p.vaultT / 0.28; root = chain(root, trans(0, 0.25 * t, 0), rotZ(-1.0 * t)); pose.armL = pose.armR = 1.3; pose.legL = 0.9; pose.legR = 0.5; }
    else if (air) { pose.legL = 0.75; pose.legR = -0.25; pose.armL = 2.3; pose.armR = 2.0; pose.lean = -0.1; }
    if (trick > 0) { root = chain(root, trans(0, 0.9, 0), rotZ(-Math.PI * 2 * trick), trans(0, -0.9, 0)); pose.legL = pose.legR = 1.2; pose.armL = pose.armR = 0.9; }
    figure(out, root, pose, shirt, SLATE, cap);
  } else if (p.mode === 'skate') {
    const root = chain(trans(p.x, v.y, p.z), rotY(-p.yaw));
    const manual = p.state === 'manual';
    let bm = root;
    if (manual) bm = chain(root, trans(-0.27, 0.04, 0), rotZ(0.24), trans(0.27, -0.04, 0));
    else if (air && p.state !== 'grind') bm = chain(root, trans(0, 0.04, 0), rotZ(Math.max(-0.3, Math.min(0.3, p.vy * 0.03))));
    if (p.edge) bm = chain(bm, rotY(0.9), rotX(-0.35));
    if (trick > 0) bm = p.trickName === 'Kickflip' ? chain(bm, trans(0, 0.1, 0), rotX(Math.PI * 2 * trick), trans(0, -0.1, 0)) : p.trickName === 'Method grab' ? chain(bm, rotZ(0.5 * Math.sin(trick * Math.PI)), rotX(0.7 * Math.sin(trick * Math.PI))) : chain(bm, rotY(Math.PI * 2 * trick));
    board(out, bm, snow);
    const crouch = air || p.state === 'grind' || p.edge ? 0.72 : manual ? 0.85 : towed ? 0.9 : 1;
    const push = p.pushing && p.grounded && !towed ? Math.sin(v.phase * 0.9) : 0;
    const spin = trick > 0 && p.trickName === 'Backside 360' ? rotY(Math.PI * 2 * trick) : rotY(0);
    const body = chain(root, trans(0, (snow ? 0.08 : 0.12) + (trick > 0 ? 0.25 * Math.sin(trick * Math.PI) : 0), 0), spin, rotZ(p.edge ? 0.35 : 0));
    const hip = 0.84 * crouch + 0.02, st = snow ? 0.25 : 0.17;
    part(out, body, st, hip, 0, 0.12 + (crouch < 1 ? 0.3 : 0), 0.17, 0.86 * crouch, 0.19, SLATE);
    part(out, body, -st, hip, 0, -0.12 - (crouch < 1 ? 0.3 : 0) - Math.max(0, push) * 0.9, 0.17, 0.86 * crouch, 0.19, SLATE);
    const up = chain(body, trans(0, hip, 0), rotZ(manual ? 0.3 : towed ? 0.12 : -0.12), rotY(towed ? 0.55 : 1.05));
    boxAt(out, up, 0, 0.3, 0, 0.28, 0.6, 0.42, shirt); boxAt(out, up, 0.02, 0.76, 0, 0.24, 0.26, 0.24, SKIN); boxAt(out, up, -0.05, 0.84, 0, 0.3, 0.12, 0.28, cap);
    if (towed) { part(out, up, 0.05, 0.54, -0.2, 1.35, 0.12, 0.62, 0.12, shirt, -0.25); part(out, up, 0.05, 0.54, 0.2, 1.35, 0.12, 0.62, 0.12, shirt, 0.6); }
    else {
      const arm = air || manual || p.state === 'grind' ? 1.25 : 0.25;
      part(out, up, 0, 0.56, -0.27, 0, 0.12, 0.6, 0.12, shirt, arm); part(out, up, 0, 0.56, 0.27, 0, 0.12, 0.6, 0.12, shirt, -arm);
    }
  } else if (p.mode === 'kayak') {
    const bob = Math.sin(p.time * 2.1) * 0.03;
    const root = chain(trans(p.x, v.y + 0.02 + bob, p.z), rotY(-p.yaw), rotX(Math.sin(v.phase * 0.5) * 0.05 * k));
    const HULL = [0.95, 0.72, 0.12];
    boxAt(out, root, 0, 0.12, 0, 2.3, 0.3, 0.66, HULL); boxAt(out, root, 1.45, 0.13, 0, 0.7, 0.26, 0.44, HULL); boxAt(out, root, -1.45, 0.13, 0, 0.7, 0.26, 0.44, HULL);
    boxAt(out, root, 1.95, 0.14, 0, 0.4, 0.2, 0.2, HULL); boxAt(out, root, -1.95, 0.14, 0, 0.4, 0.2, 0.2, HULL); boxAt(out, root, -0.1, 0.28, 0, 0.9, 0.04, 0.5, INK);
    const stroke = p.pushing ? Math.sin(v.phase * 1.6) : Math.sin(p.time * 0.8) * 0.15;
    figure(out, chain(root, trans(-0.15, 0.2, 0)), { legL: 1.5, legR: 1.5, armL: 1.1 + stroke * 0.3, armR: 1.1 - stroke * 0.3, lean: -0.12, legLen: 0.5, twist: stroke * 0.35 }, shirt, SLATE, cap);
    const pm = chain(root, trans(0.2, 0.95, 0), rotX(stroke * 0.75), rotY(stroke * 0.3));
    boxAt(out, pm, 0, 0, 0, 0.05, 0.05, 2.3, INK); boxAt(out, pm, 0, 0, 1.2, 0.05, 0.22, 0.42, ORANGE); boxAt(out, pm, 0, 0, -1.2, 0.05, 0.22, 0.42, ORANGE);
  } else {
    let root = chain(trans(p.x, v.y, p.z), rotY(-p.yaw));
    if (trick > 0) root = chain(root, rotY(Math.PI * 2 * trick));
    const wob = p.cartRide ? Math.sin(p.time * 11) * 0.5 * Math.min(1, sp / 10) : 0;
    if (p.cartRide) {
      const cm = chain(root, trans(0.2, 0, 0), rotY(wob * 0.08));
      cart(out, cm, wob);
      figure(out, chain(cm, trans(-0.12, 0.36, 0)), { legL: 1.45, legR: 1.3, armL: towed ? 1.4 : 0.9, armR: towed ? 1.4 : 0.9, lean: p.pc ? -0.75 : -0.2, legLen: 0.55, twist: 0 }, shirt, SLATE, cap);
    } else {
      cart(out, chain(root, trans(0.95, 0, 0)), 0);
      figure(out, root, { legL: sw * 0.95 * k, legR: -sw * 0.95 * k, armL: 1.15, armR: 1.15, lean: -0.38 * k - 0.08, legLen: 1, twist: 0 }, shirt, SLATE, cap);
    }
  }
}

function drawCar(out: Instances, c: Car, t: number) {
  const m = chain(trans(c.x, 0, c.z), rotY(-c.yaw));
  if (c.kind === 'truck') pickupModel(out, m, [0.78, 0.12, 0.10]);
  else if (c.kind === 'plow') plowModel(out, m, t + c.hue, c.hue);
  else carModel(out, m, CARS[c.hue % CARS.length]);
}
function drawRide(out: Instances, r: Ride, w: World, t: number) {
  const m = chain(trans(r.x, ground(w, r.x, r.z, 2).y, r.z), rotY(-r.yaw));
  if (r.kind === 'plow') plowModel(out, m, 0.2, 0); else mowerModel(out, m, t, false);
}

function drawCity(out: Instances, w: World, p: Player, v: View) {
  const t = p.time, env = w.env;
  // Orange Line trains: four cars each.
  for (const tr of w.trains) {
    const s = trainAt(tr, t); if (!s.on) continue;
    const cx = (tr.x0 + tr.x1) / 2, wd = tr.x1 - tr.x0, carL = (TRAIN_HALF * 2 - 1.8) / 4;
    for (let c = 0; c < 4; c++) {
      const cz = s.z - TRAIN_HALF + carL / 2 + c * (carL + 0.6);
      out.box(cx, 2.1, cz, wd, 3.2, carL, 0.86, 0.87, 0.88); out.box(cx, 1.2, cz, wd + 0.04, 0.7, carL + 0.02, ORANGE[0], ORANGE[1], ORANGE[2]);
      out.box(cx, 2.45, cz, wd + 0.04, 0.9, carL - 1.2, 0.12, 0.15, 0.2); out.box(cx, 0.35, cz, wd - 0.6, 0.5, carL - 2, INK[0], INK[1], INK[2]);
    }
    const front = s.v >= 0 ? s.z + TRAIN_HALF : s.z - TRAIN_HALF;
    out.box(cx, 2.0, front, wd + 0.05, 2.6, 0.12, ORANGE[0], ORANGE[1], ORANGE[2]);
    for (const dx of [-0.9, 0.9]) out.box(cx + dx, 1.0, front + (s.v >= 0 ? 0.08 : -0.08), 0.3, 0.2, 0.05, HEAD[0], HEAD[1], HEAD[2], M.EMIS);
  }
  // Highway traffic on the viaduct. Decoration only.
  for (let i = 0; i < 12; i++) {
    const north = i % 2 === 0, x = north ? -244 : -232;
    const z = ((t * (24 + (i % 3) * 3) + i * 97) % 640) - 340, c = CARS[i % CARS.length];
    out.box(x + (i % 4 < 2 ? 0 : 4), 10.25, north ? -z - 40 : z, 1.9, 1.4, 4.4, c[0], c[1], c[2]);
  }
  for (const c of p.cars) drawCar(out, c, t);
  for (let i = 0; i < p.rides.length; i++) if (i !== p.ride) drawRide(out, p.rides[i], w, t);
  // The bungee.
  if (p.cars.length && (p.tow.rope || !p.tow.active)) {
    const tk = p.cars[0], ax = tk.x - tk.hx * (tk.len / 2 + 0.3), az = tk.z - tk.hz * (tk.len / 2 + 0.3), ay = 0.68;
    let bx = ax - tk.hx * 1.2, bz = az - tk.hz * 1.2, by = 0.12;
    if (p.tow.rope) { bx = p.x + Math.cos(p.yaw) * 0.45; bz = p.z + Math.sin(p.yaw) * 0.45; by = v.y + (p.mode === 'cart' ? 0.95 : 1.02); }
    const d = Math.hypot(bx - ax, bz - az), sag = p.tow.rope ? Math.max(0, ROPE - d) * 0.3 : 0, yaw = Math.atan2(bz - az, bx - ax), N = 14;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N, y = Math.max(0.07, ay + (by - ay) * u - sag * 4 * u * (1 - u));
      out.push(chain(trans(ax + (bx - ax) * u, y, az + (bz - az) * u), rotY(-yaw), scale(d / N + 0.02, 0.055, 0.055)), LIME[0], LIME[1], LIME[2], M.EMIS);
    }
    if (p.tow.rope) out.push(chain(trans(bx, by, bz), rotY(-yaw), scale(0.05, 0.05, 0.5)), INK[0], INK[1], INK[2]);
  }
  if (w.turbine) for (let k = 0; k < 3; k++)
    out.push(chain(trans(w.turbine[0], w.turbine[1], w.turbine[2]), rotZ(t * 0.7 + k * 2.094), trans(0, 19, 0), scale(1.5, 38, 0.4)), 0.95, 0.95, 0.95);
  // Ford rivets still to be found.
  for (let i = 0; i < w.rivets.length; i++) {
    if (p.rivets[i]) continue;
    const r = w.rivets[i]; if (Math.abs(r[0] - p.x) + Math.abs(r[2] - p.z) > 320) continue;
    const m = chain(trans(r[0], r[1] + Math.sin(t * 2 + i) * 0.15, r[2]), rotY(t * 1.6 + i), rotZ(0.6), rotX(0.6));
    out.push(mul(m, scale(0.5, 0.5, 0.5)), 1.0, 0.62, 0.05, M.EMIS); out.push(mul(m, scale(0.2, 0.75, 0.2)), 0.45, 0.25, 0.1);
  }
  const cold = env.snow || env.season === 'fall', rain = env.weather === 'rainy';
  for (const n of p.npcs) {
    if (Math.abs(n.x - p.x) + Math.abs(n.z - p.z) > 170) continue;
    const root = chain(trans(n.x, n.y, n.z), rotY(-n.yaw));
    const ph = t * 6 + n.hue * 1.7, sw = Math.sin(ph), k = Math.min(1, n.speedNow / 2.2);
    if (n.kind === 'goose') {
      const chase = n.state === 2, g = [0.50, 0.44, 0.38];
      boxAt(out, root, 0, 0.36, 0, 0.55, 0.3, 0.3, g); boxAt(out, root, -0.3, 0.42, 0, 0.16, 0.14, 0.2, WHITE);
      const neck = chain(root, trans(0.24, 0.45, 0), rotZ(chase ? -1.0 : 0.15));
      boxAt(out, neck, 0, 0.25, 0, 0.09, 0.5, 0.09, INK); boxAt(out, neck, 0.07, 0.5, 0, 0.22, 0.11, 0.11, INK); boxAt(out, neck, 0.02, 0.44, 0, 0.1, 0.05, 0.12, WHITE);
      boxAt(out, root, 0, 0.1 + Math.abs(sw) * 0.04 * k, -0.07, 0.05, 0.2, 0.05, ORANGE); boxAt(out, root, 0, 0.1 + Math.abs(Math.cos(ph)) * 0.04 * k, 0.07, 0.05, 0.2, 0.05, ORANGE);
      if (chase) { boxAt(out, chain(root, trans(0, 0.45, -0.3), rotX(-0.6)), 0, 0, 0, 0.4, 0.04, 0.4, g); boxAt(out, chain(root, trans(0, 0.45, 0.3), rotX(0.6)), 0, 0, 0, 0.4, 0.04, 0.4, g); }
    } else if (n.kind === 'guard') {
      const run = n.state === 2 ? 1 : k;
      figure(out, root, { legL: sw * 0.9 * run, legR: -sw * 0.9 * run, armL: n.state === 2 ? 1.6 : -sw * 0.6 * run, armR: sw * 0.7 * run, lean: -0.2 * run, legLen: 1, twist: 0 }, NAVY, INK, NAVY);
      boxAt(out, root, 0.15, 1.2, 0.12, 0.02, 0.1, 0.1, [0.95, 0.8, 0.2]);
    } else {
      const sc = n.state === 1;
      const top = cold ? COATS[n.hue % COATS.length] : SHIRTS[n.hue % SHIRTS.length];
      figure(out, root, { legL: sw * 0.6 * k, legR: -sw * 0.6 * k, armL: sc ? 2.8 : -sw * 0.5 * k, armR: sc ? 2.6 : rain ? 1.9 : sw * 0.5 * k, lean: sc ? 0.15 : -0.05, legLen: 1, twist: 0 },
        top, n.hue % 3 ? SLATE : [0.45, 0.38, 0.30], cold ? SHIRTS[(n.hue + 3) % SHIRTS.length] : n.hue % 4 ? SKIN : INK);
      if (rain && !sc) { const u = SHIRTS[(n.hue + 1) % SHIRTS.length]; boxAt(out, root, 0.2, 2.02, 0.2, 1.15, 0.07, 1.15, u); boxAt(out, root, 0.2, 1.6, 0.2, 0.03, 0.8, 0.03, INK); }
    }
  }
}

export function buildDynamic(out: Instances, w: World, p: Player, v: View, dt: number) {
  out.clear();
  const sp = Math.hypot(p.vx, p.vz);
  v.phase += Math.max(sp, p.mode === 'kayak' && p.pushing ? 3 : 0) * dt * 2.3;
  // Vaults and step-ups snap in the sim; ease the drawn height so they read as motion.
  v.y += (p.y - v.y) * Math.min(1, dt * 22); if (Math.abs(p.y - v.y) > 2.5 || p.state === 'grind') v.y = p.y;
  drawPlayer(out, w, p, v);
  if (w.kind === 'city') drawCity(out, w, p, v);
  for (let i = 0; i < p.props.length; i++) {
    const q = p.props[i];
    if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) > 260) continue;
    if (q.kind === 'leaves') {
      if (q.gone > 0) continue;
      out.box(q.x, q.y + 0.2, q.z, 1.7, 0.4, 1.7, 0.84, 0.46, 0.12); out.box(q.x + 0.15, q.y + 0.5, q.z - 0.1, 1.1, 0.34, 1.1, 0.76, 0.24, 0.10); out.box(q.x - 0.2, q.y + 0.74, q.z + 0.1, 0.6, 0.26, 0.6, 0.93, 0.72, 0.18);
      continue;
    }
    if (q.kind === 'snowman') {
      if (q.gone > 0) continue;
      const a = i * 1.3, c = Math.cos(a), s = Math.sin(a);
      out.box(q.x, q.y + 0.45, q.z, 0.9, 0.9, 0.9, 0.97, 0.98, 1.0); out.box(q.x, q.y + 1.2, q.z, 0.66, 0.66, 0.66, 0.97, 0.98, 1.0); out.box(q.x, q.y + 1.74, q.z, 0.46, 0.46, 0.46, 0.97, 0.98, 1.0);
      out.box(q.x + c * 0.3, q.y + 1.74, q.z + s * 0.3, 0.2, 0.08, 0.2, ORANGE[0], ORANGE[1], ORANGE[2]); out.box(q.x, q.y + 2.04, q.z, 0.5, 0.14, 0.5, INK[0], INK[1], INK[2]); out.box(q.x, q.y + 2.2, q.z, 0.32, 0.24, 0.32, INK[0], INK[1], INK[2]);
      out.box(q.x - s * 0.55, q.y + 1.3, q.z + c * 0.55, 0.06, 0.06, 0.6, 0.3, 0.2, 0.14); out.box(q.x + s * 0.55, q.y + 1.3, q.z - c * 0.55, 0.06, 0.06, 0.6, 0.3, 0.2, 0.14);
      continue;
    }
    const upright = Math.abs(Math.cos(q.rx) * Math.cos(q.rz)) > 0.5;
    if (q.kind === 'cone') {
      const m = chain(trans(q.x, q.y + (upright || !q.rest ? 0.26 : 0.13), q.z), rotX(q.rx), rotY(q.ry), rotZ(q.rz));
      boxAt(out, m, 0, -0.24, 0, 0.38, 0.04, 0.38, ORANGE); boxAt(out, m, 0, 0, 0, 0.2, 0.46, 0.2, ORANGE); boxAt(out, m, 0, 0.05, 0, 0.21, 0.1, 0.21, WHITE);
    } else {
      out.push(chain(trans(q.x, q.y + 0.25, q.z), rotX(q.rx), rotY(q.ry), rotZ(q.rz), scale(0.5, 0.5, 0.5)), CRATE[0], CRATE[1], CRATE[2]);
    }
  }
}
