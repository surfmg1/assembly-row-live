// Vehicles on the driving loop: ordinary traffic, snowplows, and the friend's pickup that tows
// the player on a bungee. Deterministic; positions come from distance along a closed path.
import { World, Path, PathPos, pathAt } from './world';

export interface Car {
  kind: 'car' | 'plow' | 'truck';
  s: number; dir: 1 | -1; off: number; offT: number; v: number; vmax: number;
  x: number; z: number; yaw: number; hx: number; hz: number;
  len: number; wid: number; h: number; hue: number;
  /** cooldowns: close-call scoring, horn */
  ccd: number; honk: number;
}
export interface Tow {
  /** a tow session is running (truck is driving the loop) */
  active: boolean;
  /** the bungee is in the player's hands */
  rope: boolean;
  startT: number; laps: number; dist: number; stretch: number; slingCd: number;
}
export const ROPE = 11;

const DIM = { car: [4.4, 1.9, 1.5], plow: [7.6, 3.4, 3.0], truck: [5.6, 2.1, 1.9] } as const;
const pp: PathPos = { x: 0, z: 0, hx: 0, hz: 0, corner: false };

export function makeCars(w: World): Car[] {
  if (!w.path) return [];
  return w.cars.map(c => {
    const d = DIM[c.kind];
    const car: Car = { kind: c.kind, s: c.s, dir: c.dir, off: c.off, offT: c.off, v: c.kind === 'truck' ? 0 : c.speed, vmax: c.speed, x: 0, z: 0, yaw: 0, hx: 1, hz: 0,
      len: d[0], wid: d[1], h: d[2], hue: c.hue, ccd: 0, honk: 0 };
    place(w.path!, car); return car;
  });
}
export const makeTow = (): Tow => ({ active: false, rope: false, startT: 0, laps: 0, dist: 0, stretch: 0, slingCd: 0 });

function place(path: Path, c: Car) {
  pathAt(path, c.s, c.off, pp);
  c.x = pp.x; c.z = pp.z; c.hx = pp.hx * c.dir; c.hz = pp.hz * c.dir; c.yaw = Math.atan2(c.hz, c.hx);
  return pp.corner;
}

/** Signed gap from a to b along a's direction of travel, in (-len/2, len/2]. */
function gap(path: Path, a: Car, b: Car) {
  let g = ((b.s - a.s) * a.dir) % path.len; if (g > path.len / 2) g -= path.len; if (g < -path.len / 2) g += path.len;
  return g;
}

export interface Walker { x: number; y: number; z: number; vx: number; vz: number; }

/** Advance every vehicle. `honks` receives the index of any car that brakes for the player. */
export function stepCars(w: World, cars: Car[], tow: Tow, p: Walker, playerSlow: boolean, dt: number, honks: number[]) {
  const path = w.path; if (!path) return;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    c.ccd = Math.max(0, c.ccd - dt); c.honk = Math.max(0, c.honk - dt);
    pathAt(path, c.s + c.dir * 6, c.off, pp);
    let target = c.vmax * (pp.corner ? 0.62 : 1);
    if (c.kind === 'truck') {
      if (!tow.active) { target = 0; c.offT = 5.0; }
      else {
        if (w.env.season !== 'winter' && !w.env.snow) target = Math.min(target, 12);
        // ease off when the bungee is badly stretched, so the rider is not torn away
        if (tow.rope && tow.stretch > 7) target *= 0.6;
        if (!tow.rope) target = 0;
        let passing = false;
        for (let j = 0; j < cars.length; j++) {
          const o = cars[j]; if (o === c || o.dir !== c.dir) continue;
          const g = gap(path, c, o);
          if (g > -12 && g < 26 && o.v < c.vmax - 2) passing = true;
        }
        c.offT = passing ? -0.6 : 3.0;
      }
    } else {
      for (let j = 0; j < cars.length; j++) {
        const o = cars[j]; if (o === c || o.dir !== c.dir || Math.abs(o.off - c.off) > 2.2) continue;
        const g = gap(path, c, o);
        if (g > 0 && g < (o.len + c.len) / 2 + 9) target = Math.min(target, Math.max(0, o.v - (g < (o.len + c.len) / 2 + 4 ? 2 : 0)));
      }
      // brake and honk for someone standing in the lane
      const dx = p.x - c.x, dz = p.z - c.z, ahead = dx * c.hx + dz * c.hz, side = -dx * c.hz + dz * c.hx;
      if (playerSlow && p.y < 1.2 && ahead > 0 && ahead < 10 + c.len / 2 && Math.abs(side) < c.wid / 2 + 0.5) {
        target = 0; if (c.honk <= 0) { c.honk = 2.5; honks.push(i); }
      }
    }
    c.v += Math.max(-9 * dt, Math.min(3.6 * dt, target - c.v));
    if (c.v < 0) c.v = 0;
    c.off += Math.max(-2.6 * dt, Math.min(2.6 * dt, c.offT - c.off));
    c.s += c.dir * c.v * dt; if (c.s < 0) c.s += path.len; if (c.s >= path.len) c.s -= path.len;
    place(path, c);
  }
}

export interface CarContact { hit: boolean; near: boolean; nx: number; nz: number; pen: number; rel: number; }
const cc: CarContact = { hit: false, near: false, nx: 0, nz: 0, pen: 0, rel: 0 };
/** Test a walker of radius r against one vehicle's footprint. */
export function carContact(c: Car, p: Walker, r: number): CarContact {
  cc.hit = false; cc.near = false;
  if (p.y > c.h) return cc;
  const dx = p.x - c.x, dz = p.z - c.z;
  const lx = dx * c.hx + dz * c.hz, lz = -dx * c.hz + dz * c.hx;
  const hl = c.len / 2 + r, hw = c.wid / 2 + r;
  if (Math.abs(lx) >= hl + 1.5 || Math.abs(lz) >= hw + 1.6) return cc;
  const rvx = p.vx - c.hx * c.v, rvz = p.vz - c.hz * c.v;
  cc.rel = Math.hypot(rvx, rvz);
  if (Math.abs(lx) < hl && Math.abs(lz) < hw) {
    cc.hit = true;
    const px = hl - Math.abs(lx), pz = hw - Math.abs(lz);
    if (px < pz) { const sg = lx < 0 ? -1 : 1; cc.nx = c.hx * sg; cc.nz = c.hz * sg; cc.pen = px; }
    else { const sg = lz < 0 ? -1 : 1; cc.nx = -c.hz * sg; cc.nz = c.hx * sg; cc.pen = pz; }
  } else if (Math.abs(lx) < hl) cc.near = true;
  return cc;
}
