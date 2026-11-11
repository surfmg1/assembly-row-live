// World description for the movement lab. Pure data + queries, no DOM, no rendering.
// Units are meters. +x east, +y up, +z south. Heading yaw 0 faces +x.

export type Surf = 'concrete' | 'steel' | 'wood' | 'water' | 'grass';

/** Axis-aligned solid. A ramp is a wedge whose top rises along one axis. */
export interface Solid {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  /** 0 rises toward +x, 1 toward -x, 2 toward +z, 3 toward -z */
  ramp?: 0 | 1 | 2 | 3;
  surf: Surf;
  /** 0 floor/blocks, 1 ramps, 2 accent steel, 3 room walls */
  tint: number;
  /** long top edges become grindable rails */
  grind?: boolean;
  /** render material: 0 paved grid, 1 plain, 2 water, 3 windowed facade */
  mat?: number;
  color?: number[];
  /** collides but is not drawn (map borders) */
  hide?: boolean;
}

/** Drawn but never collided with. */
export interface Decor { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; color: number[]; mat: number; }
export interface Dock { name: string; lx: number; ly: number; lz: number; wx: number; wz: number; yaw: number; }
/** A train on a straight north-south track: stops at `stop`, runs from `from` to `to` (z of its centre). */
export interface Train { x0: number; x1: number; from: number; stop: number; to: number; offset: number; }
export interface Zone { name: string; x0: number; x1: number; z0: number; z1: number; }
export interface Rect { x0: number; x1: number; z0: number; z1: number; }
export interface NpcSeed { kind: 'ped' | 'goose' | 'guard'; ax: number; az: number; bx: number; bz: number; t: number; speed: number; hue: number; }

export const TRAIN_PERIOD = 80, TRAIN_HALF = 32, TRAIN_H = 3.7;
const trainOut = { z: 0, v: 0, on: false };
/** Position and speed of a train at a moment. The timetable is invented; it only has to feel like the T. */
export function trainAt(tr: Train, time: number): { z: number; v: number; on: boolean } {
  const tl = (time + tr.offset) % TRAIN_PERIOD;
  if (tl < 18) { const u = tl / 18; trainOut.z = tr.from + (tr.stop - tr.from) * (1 - (1 - u) * (1 - u)); trainOut.v = (tr.stop - tr.from) * 2 * (1 - u) / 18; trainOut.on = true; }
  else if (tl < 28) { trainOut.z = tr.stop; trainOut.v = 0; trainOut.on = true; }
  else if (tl < 52) { const u = (tl - 28) / 24; trainOut.z = tr.stop + (tr.to - tr.stop) * u * u; trainOut.v = (tr.to - tr.stop) * 2 * u / 24; trainOut.on = true; }
  else { trainOut.on = false; trainOut.v = 0; trainOut.z = tr.from; }
  return trainOut;
}

export interface Rail {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  /** generated from a ledge edge (no posts drawn) */
  edge?: boolean;
}

export interface PropSeed { x: number; y: number; z: number; kind: 'cone' | 'crate'; }

export interface Spawn { name: string; x: number; y: number; z: number; yaw: number; mode: 'foot' | 'skate' | 'cart' | 'kayak'; }

export interface World {
  solids: Solid[];
  rails: Rail[];
  props: PropSeed[];
  spawns: Spawn[];
  /** inner room bounds */
  minX: number; maxX: number; minZ: number; maxZ: number;
  kind: 'lab' | 'city';
  /** height of the ground where no solid is: the lab floor, or the river surface */
  baseY: number;
  decor: Decor[]; docks: Dock[]; trains: Train[]; zones: Zone[]; hazards: Rect[]; npcs: NpcSeed[];
  rivets: number[][];
  trial: { sx: number; sz: number; fx: number; fz: number; r: number } | null;
}

export function topAt(s: Solid, x: number, z: number): number {
  if (s.ramp === undefined) return s.y1;
  let t: number;
  switch (s.ramp) {
    case 0: t = (x - s.x0) / (s.x1 - s.x0); break;
    case 1: t = (s.x1 - x) / (s.x1 - s.x0); break;
    case 2: t = (z - s.z0) / (s.z1 - s.z0); break;
    default: t = (s.z1 - z) / (s.z1 - s.z0);
  }
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return s.y0 + (s.y1 - s.y0) * t;
}

/** Height gradient (dy/dx, dy/dz) of a solid's top surface. */
export function slopeOf(s: Solid | null): [number, number] {
  if (!s || s.ramp === undefined) return [0, 0];
  const h = s.y1 - s.y0;
  switch (s.ramp) {
    case 0: return [h / (s.x1 - s.x0), 0];
    case 1: return [-h / (s.x1 - s.x0), 0];
    case 2: return [0, h / (s.z1 - s.z0)];
    default: return [0, -h / (s.z1 - s.z0)];
  }
}

const groundOut = { y: 0, s: null as Solid | null };
/** Highest walkable surface under (x,z) that is not above maxY. Floor is y=0. */
export function ground(w: World, x: number, z: number, maxY: number): { y: number; s: Solid | null } {
  let best = w.baseY; let bs: Solid | null = null;
  const ss = w.solids;
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const t = topAt(s, x, z);
    if (t <= maxY && t > best) { best = t; bs = s; }
  }
  groundOut.y = best; groundOut.s = bs;
  return groundOut;
}

export interface Hit { hit: boolean; nx: number; nz: number; top: number; s: Solid | null; }

/**
 * Push a vertical cylinder (foot at y, given radius/height) out of every solid it cannot
 * step onto. Mutates pos. Returns the deepest contact.
 */
export function collide(
  w: World, pos: { x: number; y: number; z: number }, r: number, stepH: number, height: number, out: Hit, move = true,
): Hit {
  out.hit = false; out.s = null; out.nx = 0; out.nz = 0; out.top = 0;
  let deepest = 0;
  const ss = w.solids;
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i];
    if (s.y0 >= pos.y + height) continue;
    const cx = pos.x < s.x0 ? s.x0 : pos.x > s.x1 ? s.x1 : pos.x;
    const cz = pos.z < s.z0 ? s.z0 : pos.z > s.z1 ? s.z1 : pos.z;
    const top = topAt(s, cx, cz);
    if (top <= pos.y + stepH) continue;
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    let nx: number, nz: number, pen: number;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d;
    } else {
      const l = pos.x - s.x0, rr = s.x1 - pos.x, n = pos.z - s.z0, f = s.z1 - pos.z;
      const m = Math.min(l, rr, n, f);
      if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === n) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
      pen = m + r;
    }
    if (move) { pos.x += nx * pen; pos.z += nz * pen; }
    if (pen > deepest) { deepest = pen; out.hit = true; out.nx = nx; out.nz = nz; out.top = top; out.s = s; }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// The grey test room. Three lines, one per traversal mode, sharing one floor so momentum
// can be carried from any line into any other.

export function buildLab(): World {
  const solids: Solid[] = [];
  const rails: Rail[] = [];
  const props: PropSeed[] = [];
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, o: Partial<Solid> = {}) => {
    const s: Solid = { x0, x1, y0, y1, z0, z1, surf: 'concrete', tint: 0, ...o }; solids.push(s); return s;
  };
  const ramp = (dir: 0 | 1 | 2 | 3, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    box(x0, x1, y0, y1, z0, z1, { ramp: dir, tint: 1 });

  const X = 45, Z = 30, H = 8;
  box(-X - 1, -X, 0, H, -Z - 1, Z + 1, { tint: 3 });
  box(X, X + 1, 0, H, -Z - 1, Z + 1, { tint: 3 });
  box(-X, X, 0, H, -Z - 1, -Z, { tint: 3 });
  box(-X, X, 0, H, Z, Z + 1, { tint: 3 });

  // --- Skate line (centre). Holding forward from the spawn gives roll-in, air, grind.
  box(-43, -35, 0, 2.5, -4, 4);
  ramp(1, -35, -25, 0, 2.5, -4, 4);
  ramp(0, -10, -6, 0, 1.4, -2.5, 2.5);
  rails.push({ ax: -3, ay: 0.9, az: 0, bx: 10, by: 0.9, bz: 0 });
  box(12, 20, 0, 0.45, 2.6, 3.6, { grind: true });
  box(12, 20, 0, 0.45, -3.6, -2.6, { grind: true });
  ramp(0, 24, 30, 0, 1.5, -9, 9);
  box(30, 45, 0, 1.5, -9, 9);
  box(34, 38, 1.5, 1.95, -5.2, -4.4, { grind: true, surf: 'wood' });
  box(34, 38, 1.5, 1.95, 3.4, 4.2, { grind: true, surf: 'wood' });
  for (let i = 0; i < 5; i++) box(33, 41, 0, 1.25 - i * 0.25, 9 + i * 0.7, 9 + (i + 1) * 0.7);
  rails.push({ ax: 37, ay: 2.1, az: 9, bx: 37, by: 0.6, bz: 12.6 });

  // --- Parkour run (north). Vaults, a step-up, a wall-run gap, then the truss beams.
  box(-34, -33.2, 0, 1.0, -24, -16);
  box(-29, -28.2, 0, 1.1, -24, -16);
  box(-24.5, -23.5, 0, 0.9, -24, -16);
  box(-21.2, -20, 0, 1.0, -24, -16);
  box(-20, -14, 0, 2.0, -24, -16);
  box(-16, 2, 0, 7, -25, -24, { tint: 3 });
  box(-4, 2, 0, 2.0, -24, -16);
  box(2, 8, 0, 3.0, -24, -16);
  box(8, 13, 0, 4.0, -24, -16);
  // Salvaged-truss stand-ins: narrow steel beams, the Baxter Riverfront Park reference.
  box(13, 30, 3.6, 4.0, -20.3, -19.7, { surf: 'steel', tint: 2 });
  box(15, 28, 4.5, 4.9, -23.2, -22.7, { surf: 'steel', tint: 2 });
  box(18, 18.4, 0, 3.6, -20.2, -19.8, { surf: 'steel', tint: 2 });
  box(25, 25.4, 0, 3.6, -20.2, -19.8, { surf: 'steel', tint: 2 });
  box(30, 37, 0, 4.0, -24, -16);

  // --- Cart lane (south). Push, hop on, ride the ramp, ram the stack.
  ramp(2, -43, -37, 0, 3, 6, 16);
  box(-43, -33, 0, 3, 16, 26);
  ramp(1, -33, -17, 0, 3, 16, 26);
  for (let i = 0; i < 7; i++) props.push({ x: -9 + i * 3.2, y: 0, z: i % 2 ? 22.8 : 19.2, kind: 'cone' });
  for (let row = 0; row < 3; row++) for (let c = 0; c < 4 - row; c++)
    props.push({ x: 20, y: row * 0.5, z: 19.6 + c * 0.55 + row * 0.275, kind: 'crate' });
  ramp(0, 27, 30, 0, 0.7, 18, 24);

  edgeRails(solids, rails);

  const spawns: Spawn[] = [
    { name: 'Skate line', x: -40, y: 2.5, z: 0, yaw: 0, mode: 'skate' },
    { name: 'Parkour run', x: -41, y: 0, z: -20, yaw: 0, mode: 'foot' },
    { name: 'Cart lane', x: -41, y: 3, z: 21, yaw: 0, mode: 'cart' },
  ];
  return { solids, rails, props, spawns, minX: -X, maxX: X, minZ: -Z, maxZ: Z, kind: 'lab', baseY: 0,
    decor: [], docks: [], trains: [], zones: [], hazards: [], npcs: [], rivets: [], trial: null };
}

/** Ledge edges become rails automatically (systems, not assets). */
export function edgeRails(solids: Solid[], rails: Rail[]) {
  for (const s of solids) {
    if (!s.grind) continue;
    const lx = s.x1 - s.x0, lz = s.z1 - s.z0;
    if (lx >= lz) {
      rails.push({ ax: s.x0, ay: s.y1, az: s.z0, bx: s.x1, by: s.y1, bz: s.z0, edge: true });
      rails.push({ ax: s.x0, ay: s.y1, az: s.z1, bx: s.x1, by: s.y1, bz: s.z1, edge: true });
    } else {
      rails.push({ ax: s.x0, ay: s.y1, az: s.z0, bx: s.x0, by: s.y1, bz: s.z1, edge: true });
      rails.push({ ax: s.x1, ay: s.y1, az: s.z0, bx: s.x1, by: s.y1, bz: s.z1, edge: true });
    }
  }

}
