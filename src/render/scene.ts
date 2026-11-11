// Turns simulation state into box instances: the world, the mannequin, board, cart, kayak, trains, NPCs.
import { World, ground, trainAt, TRAIN_HALF } from '../sim/world';
import { Player } from '../sim/player';
import { Instances } from './renderer';
import { M4, chain, mul, trans, scale, rotX, rotY, rotZ } from './mat';

// Palette. Orange is the MBTA Orange Line colour.
const CONCRETE = [0.80, 0.81, 0.83], RAMP = [0.68, 0.70, 0.74], WALL = [0.87, 0.88, 0.90], FLOOR = [0.74, 0.75, 0.78];
const ORANGE = [0.93, 0.545, 0.0], INK = [0.10, 0.12, 0.16], SLATE = [0.30, 0.34, 0.42], SKIN = [0.88, 0.83, 0.77];
const STEEL = [0.58, 0.61, 0.66], CRATE = [0.74, 0.62, 0.44], WHITE = [0.96, 0.96, 0.97], NAVY = [0.13, 0.19, 0.36];
const SHIRTS = [[0.80, 0.25, 0.22], [0.22, 0.45, 0.75], [0.30, 0.62, 0.38], [0.93, 0.80, 0.30], [0.55, 0.36, 0.70], [0.90, 0.90, 0.88], [0.20, 0.22, 0.26], [0.85, 0.50, 0.62]];
const CARS = [[0.75, 0.15, 0.15], [0.9, 0.9, 0.9], [0.15, 0.2, 0.3], [0.5, 0.52, 0.55], [0.2, 0.4, 0.7]];

export function buildStatic(w: World): { cubes: Instances; wedges: Instances } {
  const cubes = new Instances(1024), wedges = new Instances(32);
  const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: number[], mat = 1) =>
    cubes.push(mul(trans((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale(x1 - x0, y1 - y0, z1 - z0)), c[0], c[1], c[2], mat);
  if (w.kind === 'lab') bx(w.minX - 1, w.maxX + 1, -1, 0, w.minZ - 1, w.maxZ + 1, FLOOR, 0);
  for (const s of w.solids) {
    if (s.hide) continue;
    const col = s.color || (s.tint === 2 ? ORANGE : s.tint === 3 ? WALL : s.tint === 1 ? RAMP : s.surf === 'wood' ? CRATE : CONCRETE);
    const mat = s.mat !== undefined ? s.mat : s.tint === 2 ? 1 : 0;
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, cz = (s.z0 + s.z1) / 2;
    const lx = s.x1 - s.x0, ly = s.y1 - s.y0, lz = s.z1 - s.z0;
    if (s.ramp === undefined) cubes.push(mul(trans(cx, cy, cz), scale(lx, ly, lz)), col[0], col[1], col[2], mat);
    else {
      const rot = s.ramp === 0 ? 0 : s.ramp === 1 ? Math.PI : s.ramp === 2 ? -Math.PI / 2 : Math.PI / 2;
      const along = s.ramp < 2 ? lx : lz, across = s.ramp < 2 ? lz : lx;
      wedges.push(chain(trans(cx, cy, cz), rotY(rot), scale(along, ly, across)), col[0], col[1], col[2], mat === 3 ? 0 : mat);
    }
  }
  for (const d of w.decor) bx(d.x0, d.x1, d.y0, d.y1, d.z0, d.z1, d.color, d.mat);
  if (w.kind === 'lab') {
    const e = 0.03; // Orange Line stripe around the room
    bx(w.minX, w.minX + e, 1.0, 1.25, w.minZ, w.maxZ, ORANGE); bx(w.maxX - e, w.maxX, 1.0, 1.25, w.minZ, w.maxZ, ORANGE);
    bx(w.minX, w.maxX, 1.0, 1.25, w.minZ, w.minZ + e, ORANGE); bx(w.minX, w.maxX, 1.0, 1.25, w.maxZ - e, w.maxZ, ORANGE);
    for (const s of w.spawns) bx(s.x - 0.9, s.x + 0.9, s.y, s.y + 0.015, s.z - 0.9, s.z + 0.9, ORANGE);
    bx(-17, 26, 0, 0.012, 17.4, 17.55, WHITE); bx(-17, 26, 0, 0.012, 24.45, 24.6, WHITE);
  }
  for (const r of w.rails) {
    const dx = r.bx - r.ax, dy = r.by - r.ay, dz = r.bz - r.az, len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dz, dx), pitch = Math.asin(dy / len);
    cubes.push(chain(trans((r.ax + r.bx) / 2, (r.ay + r.by) / 2 - (r.edge ? 0.02 : 0.035), (r.az + r.bz) / 2), rotY(-yaw), rotZ(pitch),
      scale(len, r.edge ? 0.05 : 0.07, r.edge ? 0.05 : 0.07)), ORANGE[0], ORANGE[1], ORANGE[2], 1);
    if (r.edge) continue;
    const n = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = r.ax + dx * t, y = r.ay + dy * t, z = r.az + dz * t;
      const gy = ground(w, x, z, y).y;
      if (y - gy > 0.08) bx(x - 0.03, x + 0.03, gy, y - 0.05, z - 0.03, z + 0.03, STEEL);
    }
  }
  return { cubes, wedges };
}

function part(out: Instances, root: M4, px: number, py: number, pz: number, ang: number, sx: number, len: number, sz: number, c: number[], roll = 0) {
  out.push(chain(root, trans(px, py, pz), rotZ(ang), rotX(roll), trans(0, -len / 2, 0), scale(sx, len, sz)), c[0], c[1], c[2]);
}
function boxAt(out: Instances, root: M4, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number[]) {
  out.push(chain(root, trans(x, y, z), scale(sx, sy, sz)), c[0], c[1], c[2]);
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

function board(out: Instances, m: M4) {
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

function drawPlayer(out: Instances, p: Player, v: View) {
  const sp = Math.hypot(p.vx, p.vz);
  const sw = Math.sin(v.phase), k = Math.min(1, sp / 6);
  const air = !p.grounded;
  const trick = p.trickT > 0 ? 1 - p.trickT / p.trickDur : 0;

  if (p.state === 'bail') {
    const r = p.rag;
    const root = chain(trans(r.x, r.y, r.z), rotY(-p.yaw), rotZ(-r.rot), rotX(r.rot * 0.6), trans(0, -0.9, 0));
    const f = Math.sin(r.rot * 2);
    figure(out, root, { legL: 0.8 + f * 0.5, legR: -0.6 - f * 0.4, armL: 2.4 + f, armR: -2.0 + f, lean: 0.3 * f, legLen: 1, twist: 0.4 * f });
    const here = chain(trans(p.x, v.y, p.z), rotY(-p.yaw));
    if (p.mode === 'skate') board(out, chain(here, trans(0.6, 0.2, 0.3), rotX(Math.PI), rotY(0.7)));
    if (p.mode === 'cart') cart(out, chain(here, trans(0.9, 0.3, 0), rotX(Math.PI / 2), rotY(0.3)), 0);
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
    figure(out, root, pose);
  } else if (p.mode === 'skate') {
    const root = chain(trans(p.x, v.y, p.z), rotY(-p.yaw));
    const manual = p.state === 'manual';
    let bm = root;
    if (manual) bm = chain(root, trans(-0.27, 0.04, 0), rotZ(0.24), trans(0.27, -0.04, 0));
    else if (air && p.state !== 'grind') bm = chain(root, trans(0, 0.04, 0), rotZ(Math.max(-0.3, Math.min(0.3, p.vy * 0.03))));
    if (trick > 0) bm = p.trickName === 'Kickflip' ? chain(bm, trans(0, 0.1, 0), rotX(Math.PI * 2 * trick), trans(0, -0.1, 0)) : chain(bm, rotY(Math.PI * 2 * trick));
    board(out, bm);
    const crouch = air || p.state === 'grind' ? 0.72 : manual ? 0.85 : 1;
    const push = p.pushing && p.grounded ? Math.sin(v.phase * 0.9) : 0;
    const body = chain(root, trans(0, 0.12 + (trick > 0 ? 0.25 * Math.sin(trick * Math.PI) : 0), 0));
    const hip = 0.84 * crouch + 0.02;
    part(out, body, 0.17, hip, 0, 0.12 + (crouch < 1 ? 0.3 : 0), 0.17, 0.86 * crouch, 0.19, SLATE);
    part(out, body, -0.17, hip, 0, -0.12 - (crouch < 1 ? 0.3 : 0) - Math.max(0, push) * 0.9, 0.17, 0.86 * crouch, 0.19, SLATE);
    const up = chain(body, trans(0, hip, 0), rotZ(manual ? 0.3 : -0.12), rotY(1.05));
    boxAt(out, up, 0, 0.3, 0, 0.28, 0.6, 0.42, ORANGE); boxAt(out, up, 0.02, 0.76, 0, 0.24, 0.26, 0.24, SKIN); boxAt(out, up, -0.05, 0.84, 0, 0.3, 0.12, 0.28, INK);
    const arm = air || manual || p.state === 'grind' ? 1.25 : 0.25;
    part(out, up, 0, 0.56, -0.27, 0, 0.12, 0.6, 0.12, ORANGE, arm); part(out, up, 0, 0.56, 0.27, 0, 0.12, 0.6, 0.12, ORANGE, -arm);
  } else if (p.mode === 'kayak') {
    const bob = Math.sin(p.time * 2.1) * 0.03;
    const root = chain(trans(p.x, v.y + 0.02 + bob, p.z), rotY(-p.yaw), rotX(Math.sin(v.phase * 0.5) * 0.05 * k));
    const HULL = [0.95, 0.72, 0.12];
    boxAt(out, root, 0, 0.12, 0, 2.3, 0.3, 0.66, HULL); boxAt(out, root, 1.45, 0.13, 0, 0.7, 0.26, 0.44, HULL); boxAt(out, root, -1.45, 0.13, 0, 0.7, 0.26, 0.44, HULL);
    boxAt(out, root, 1.95, 0.14, 0, 0.4, 0.2, 0.2, HULL); boxAt(out, root, -1.95, 0.14, 0, 0.4, 0.2, 0.2, HULL); boxAt(out, root, -0.1, 0.28, 0, 0.9, 0.04, 0.5, INK);
    const stroke = p.pushing ? Math.sin(v.phase * 1.6) : Math.sin(p.time * 0.8) * 0.15;
    figure(out, chain(root, trans(-0.15, 0.2, 0)), { legL: 1.5, legR: 1.5, armL: 1.1 + stroke * 0.3, armR: 1.1 - stroke * 0.3, lean: -0.12, legLen: 0.5, twist: stroke * 0.35 });
    const pm = chain(root, trans(0.2, 0.95, 0), rotX(stroke * 0.75), rotY(stroke * 0.3));
    boxAt(out, pm, 0, 0, 0, 0.05, 0.05, 2.3, INK); boxAt(out, pm, 0, 0, 1.2, 0.05, 0.22, 0.42, ORANGE); boxAt(out, pm, 0, 0, -1.2, 0.05, 0.22, 0.42, ORANGE);
  } else {
    let root = chain(trans(p.x, v.y, p.z), rotY(-p.yaw));
    if (trick > 0) root = chain(root, rotY(Math.PI * 2 * trick));
    const wob = p.cartRide ? Math.sin(p.time * 11) * 0.5 * Math.min(1, sp / 10) : 0;
    if (p.cartRide) {
      const cm = chain(root, trans(0.2, 0, 0), rotY(wob * 0.08));
      cart(out, cm, wob);
      figure(out, chain(cm, trans(-0.12, 0.36, 0)), { legL: 1.45, legR: 1.3, armL: 0.9, armR: 0.9, lean: p.pc ? -0.75 : -0.2, legLen: 0.55, twist: 0 });
    } else {
      cart(out, chain(root, trans(0.95, 0, 0)), 0);
      figure(out, root, { legL: sw * 0.95 * k, legR: -sw * 0.95 * k, armL: 1.15, armR: 1.15, lean: -0.38 * k - 0.08, legLen: 1, twist: 0 });
    }
  }
}

function drawCity(out: Instances, w: World, p: Player) {
  const t = p.time;
  // Orange Line trains: four cars each.
  for (const tr of w.trains) {
    const s = trainAt(tr, t); if (!s.on) continue;
    const cx = (tr.x0 + tr.x1) / 2, wd = tr.x1 - tr.x0, carL = (TRAIN_HALF * 2 - 1.8) / 4;
    for (let c = 0; c < 4; c++) {
      const cz = s.z - TRAIN_HALF + carL / 2 + c * (carL + 0.6);
      const m = trans(cx, 0, cz);
      boxAt(out, m, 0, 2.1, 0, wd, 3.2, carL, [0.86, 0.87, 0.88]); boxAt(out, m, 0, 1.2, 0, wd + 0.04, 0.7, carL + 0.02, ORANGE);
      boxAt(out, m, 0, 2.45, 0, wd + 0.04, 0.9, carL - 1.2, [0.12, 0.15, 0.2]); boxAt(out, m, 0, 0.35, 0, wd - 0.6, 0.5, carL - 2, INK);
    }
    const front = s.v >= 0 ? s.z + TRAIN_HALF : s.z - TRAIN_HALF;
    boxAt(out, trans(cx, 0, front), 0, 2.0, 0, wd + 0.05, 2.6, 0.12, ORANGE);
  }
  // Traffic on I-93. Decoration only.
  for (let i = 0; i < 12; i++) {
    const north = i % 2 === 0, x = north ? -244 : -232;
    const z = ((t * (24 + (i % 3) * 3) + i * 97) % 640) - 340, c = CARS[i % CARS.length];
    boxAt(out, trans(x + (i % 4 < 2 ? 0 : 4), 9.5, north ? -z - 40 : z), 0, 0.75, 0, 1.9, 1.4, 4.4, c);
  }
  // Ford rivets still to be found.
  for (let i = 0; i < w.rivets.length; i++) {
    if (p.rivets[i]) continue;
    const r = w.rivets[i]; if (Math.abs(r[0] - p.x) + Math.abs(r[2] - p.z) > 320) continue;
    const m = chain(trans(r[0], r[1] + Math.sin(t * 2 + i) * 0.15, r[2]), rotY(t * 1.6 + i), rotZ(0.6), rotX(0.6));
    out.push(mul(m, scale(0.5, 0.5, 0.5)), 1.0, 0.62, 0.05); out.push(mul(m, scale(0.2, 0.75, 0.2)), 0.45, 0.25, 0.1);
  }
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
      figure(out, root, { legL: sw * 0.6 * k, legR: -sw * 0.6 * k, armL: sc ? 2.8 : -sw * 0.5 * k, armR: sc ? 2.6 : sw * 0.5 * k, lean: sc ? 0.15 : -0.05, legLen: 1, twist: 0 },
        SHIRTS[n.hue % SHIRTS.length], n.hue % 3 ? SLATE : [0.45, 0.38, 0.30], n.hue % 4 ? SKIN : INK);
    }
  }
}

export function buildDynamic(out: Instances, w: World, p: Player, v: View, dt: number) {
  out.clear();
  const sp = Math.hypot(p.vx, p.vz);
  v.phase += Math.max(sp, p.mode === 'kayak' && p.pushing ? 3 : 0) * dt * 2.3;
  // Vaults and step-ups snap in the sim; ease the drawn height so they read as motion.
  v.y += (p.y - v.y) * Math.min(1, dt * 22); if (Math.abs(p.y - v.y) > 2.5 || p.state === 'grind') v.y = p.y;
  drawPlayer(out, p, v);
  if (w.kind === 'city') drawCity(out, w, p);
  for (const q of p.props) {
    if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) > 260) continue;
    const upright = Math.abs(Math.cos(q.rx) * Math.cos(q.rz)) > 0.5;
    if (q.kind === 'cone') {
      const m = chain(trans(q.x, q.y + (upright || !q.rest ? 0.26 : 0.13), q.z), rotX(q.rx), rotY(q.ry), rotZ(q.rz));
      boxAt(out, m, 0, -0.24, 0, 0.38, 0.04, 0.38, ORANGE); boxAt(out, m, 0, 0, 0, 0.2, 0.46, 0.2, ORANGE); boxAt(out, m, 0, 0.05, 0, 0.21, 0.1, 0.21, WHITE);
    } else {
      out.push(chain(trans(q.x, q.y + 0.25, q.z), rotX(q.rx), rotY(q.ry), rotZ(q.rz), scale(0.5, 0.5, 0.5)), CRATE[0], CRATE[1], CRATE[2]);
    }
  }
}
