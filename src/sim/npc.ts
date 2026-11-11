// Crowd-tier NPCs: strolling pedestrians, territorial geese, and one security guard with a grudge
// against skateboards. Deterministic, cheap, and deliberately simple; the townsfolk and named
// characters of the brief come later.
import { World, Hit, collide, ground } from './world';

export interface Npc {
  kind: 'ped' | 'goose' | 'guard';
  x: number; y: number; z: number; yaw: number; speedNow: number;
  hx: number; hz: number;
  ax: number; az: number; bx: number; bz: number; t: number; dir: number; speed: number;
  /** 0 idle/walk, 1 startled, 2 chasing */
  state: number; timer: number; hue: number;
}

export function makeNpcs(w: World): Npc[] {
  return w.npcs.map(s => ({
    kind: s.kind, x: s.ax, y: 0, z: s.az, yaw: 0, speedNow: 0, hx: s.ax, hz: s.az,
    ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, t: s.t, dir: 1, speed: s.speed, state: 0, timer: 0, hue: s.hue,
  }));
}

const hit: Hit = { hit: false, nx: 0, nz: 0, top: 0, s: null };

function moveToward(w: World, n: Npc, tx: number, tz: number, speed: number, dt: number, solid: boolean) {
  const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { n.speedNow = 0; return; }
  const s = Math.min(speed * dt, d);
  n.x += dx / d * s; n.z += dz / d * s; n.yaw = Math.atan2(dz, dx); n.speedNow = speed;
  if (solid) collide(w, n, 0.3, 0.4, 1.7, hit);
  const g = ground(w, n.x, n.z, n.y + 0.6);
  n.y = g.y;
}

export interface PlayerView { x: number; y: number; z: number; vx: number; vz: number; mode: string; state: string; towed?: boolean; }

/** Advances every NPC. Returns 'goose' or 'busted' when one of them gets the player. */
export function stepNpcs(w: World, p: PlayerView, npcs: Npc[], dt: number, bumps: number[]): '' | 'goose' | 'busted' {
  const sp = Math.hypot(p.vx, p.vz), live = p.state !== 'bail';
  let out: '' | 'goose' | 'busted' = '';
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i];
    n.timer = Math.max(0, n.timer - dt);
    const dx = p.x - n.x, dz = p.z - n.z, dist = Math.hypot(dx, dz), near = Math.abs(p.y - n.y) < 2.5;
    if (n.kind === 'ped') {
      if (n.state === 1) { n.speedNow = 0; if (n.timer <= 0) n.state = 0; continue; }
      if (live && near && dist < 2.3 && sp > 5) { n.state = 1; n.timer = 1.6; n.yaw = Math.atan2(dz, dx); bumps.push(i); continue; }
      const len = Math.hypot(n.bx - n.ax, n.bz - n.az);
      n.t += n.dir * n.speed * dt / len;
      if (n.t > 1) { n.t = 1; n.dir = -1; } else if (n.t < 0) { n.t = 0; n.dir = 1; }
      n.x = n.ax + (n.bx - n.ax) * n.t; n.z = n.az + (n.bz - n.az) * n.t;
      n.yaw = Math.atan2((n.bz - n.az) * n.dir, (n.bx - n.ax) * n.dir); n.speedNow = n.speed;
      n.y = ground(w, n.x, n.z, 0.5).y;
    } else if (n.kind === 'goose') {
      const home = Math.hypot(p.x - n.hx, p.z - n.hz);
      if (live && near && home < 17 && p.mode !== 'kayak' && p.mode !== 'drive' && p.z > -175.5) {
        n.state = 2;
        moveToward(w, n, p.x, Math.max(-175, p.z), n.speed, dt, false);
        if (dist < 0.75 && n.timer <= 0) { n.timer = 3; out = 'goose'; }
      } else {
        n.state = 0;
        const wx = n.hx + Math.sin(n.t) * 2.5, wz = n.hz + Math.cos(n.t * 0.7) * 1.5; n.t += dt * 0.4;
        moveToward(w, n, wx, wz, 1.4, dt, false);
      }
    } else {
      const home = Math.hypot(p.x - n.hx, p.z - n.hz);
      if (n.state !== 2 && live && p.mode === 'skate' && !p.towed && home < 17 && near) { n.state = 2; n.timer = 14; }
      if (n.state === 2) {
        if (!live || dist > 48 || n.timer <= 0 || p.mode === 'kayak') n.state = 0;
        else {
          moveToward(w, n, p.x, p.z, n.speed, dt, true);
          if (dist < 0.95 && near) { n.state = 0; n.x = n.hx; n.z = n.hz; out = 'busted'; }
        }
      } else moveToward(w, n, n.hx, n.hz, 3, dt, true);
    }
  }
  return out;
}
