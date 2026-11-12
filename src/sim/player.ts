// Deterministic movement simulation: parkour on foot, skateboard, shopping cart.
// Fixed 60 Hz step, no DOM, no randomness. One rule above all: switching mode never
// touches the velocity vector, so momentum carries between every pair of modes.

import { World, Solid, Hit, Surf, PathPos, ground, collide, slopeOf, topAt, trainAt, pathAt, TRAIN_HALF, TRAIN_H } from './world';
import { Car, Tow, ROPE, makeCars, makeTow, stepCars, carContact } from './traffic';
import { Npc, makeNpcs, stepNpcs } from './npc';

export const G = 22;
export const DT = 1 / 60;
const R = 0.3, HEIGHT = 1.7;
const MODES = ['foot', 'skate', 'cart'] as const;
export type Mode = typeof MODES[number] | 'kayak' | 'drive';

export interface Input {
  /** desired direction in world space, magnitude 0..1 */
  mx: number; mz: number;
  jump: boolean; crouch: boolean; trick: boolean; switchMode: boolean; bail: boolean;
}
export const noInput = (): Input => ({ mx: 0, mz: 0, jump: false, crouch: false, trick: false, switchMode: false, bail: false });

export type EvType = 'jump' | 'land' | 'vault' | 'mantle' | 'wallrun' | 'walljump' | 'slide' | 'grindStart'
  | 'grindEnd' | 'trick' | 'bank' | 'bail' | 'respawn' | 'switch' | 'hopOn' | 'hopOff' | 'bobsled' | 'ram'
  | 'impact' | 'step' | 'trickStart' | 'splash' | 'train' | 'zap' | 'rivet' | 'finish' | 'trialStart' | 'busted' | 'goose' | 'bump' | 'deny' | 'dock'
  | 'horn' | 'honk' | 'carHit' | 'closeCall' | 'rope' | 'ropeOff' | 'lap' | 'sling' | 'puff' | 'mow' | 'fieldDone' | 'ride' | 'rideOff' | 'soft' | 'launch'
  | 'token' | 'line' | 'runEnd' | 'runTick';
export interface Ev { type: EvType; v: number; name?: string; surf?: Surf; }

export interface Prop {
  kind: 'cone' | 'crate' | 'leaves' | 'snowman';
  /** soft props (leaf piles, snowmen) vanish for a while after being hit */
  gone: number;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number; wx: number; wy: number; wz: number;
  rest: boolean; hx: number; hy: number; hz: number;
}

export type State = 'normal' | 'slide' | 'wallrun' | 'mantle' | 'grind' | 'manual' | 'bail';

export interface Player {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number;
  mode: Mode; cartRide: boolean; grounded: boolean; surf: Surf;
  state: State; stateT: number;
  coyote: number; jumpBuf: number; jumping: boolean; lastRate: number; airT: number;
  flow: number; flowIdle: number; slideCd: number; vaultT: number;
  wallNx: number; wallNz: number; wallCd: number; wallTouch: boolean; wallUsed: boolean;
  rail: number; railT: number; railS: number; railCd: number; grindPts: number;
  mantleFrom: number; mantleTo: number;
  trickT: number; trickDur: number; trickName: string; trickPts: number;
  comboPts: number; comboN: number; comboNames: string[]; comboLand: number;
  score: number; lastBank: number; best: number;
  safe: number[]; safeOld: number[]; safeT: number;
  rag: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rot: number; spin: number };
  pj: boolean; pc: boolean; pt: boolean; ps: boolean; pb: boolean;
  time: number; firstTrickAt: number; stride: number; pushing: boolean; bails: number;
  props: Prop[];
  npcs: Npc[]; rivets: boolean[]; rivetN: number; trialT: number; trialArmed: boolean; trialBest: number;
  cars: Car[]; tow: Tow; rides: Ride[]; ride: number; dsp: number; edge: boolean; inv: number;
  fields: Uint8Array[]; fieldN: number; fieldTotal: number; fieldMile: number;
  /** T tokens: seconds until each one is back (0 = there to collect), and how many are left in each line */
  tokens: Float32Array; lineLeft: Int16Array;
  /** timed run: seconds left (-1 when free skating) and the score it started from */
  runT: number; run0: number;
  st: Stats;
}

/** Counters that goals and the end-of-run card read. They survive warps and bails. */
export interface Stats {
  tricks: number; streak: number; streakBest: number; grind: number; close: number; sling: number; soft: number;
  tokens: number; lines: number; laps: number; air: number; walls: number;
}
export const makeStats = (): Stats => ({ tricks: 0, streak: 0, streakBest: 0, grind: 0, close: 0, sling: 0, soft: 0, tokens: 0, lines: 0, laps: 0, air: 0, walls: 0 });
function resetTokens(w: World, p: Player) {
  p.tokens = new Float32Array(w.tokens.length); p.lineLeft = new Int16Array(w.tokenLines);
  for (const t of w.tokens) p.lineLeft[t[3]]++;
}
/** Start a timed run: the clock, a clean score and every token back in place. */
export function startRun(w: World, p: Player, secs: number) {
  p.score = 0; p.best = 0; p.lastBank = 0; p.bails = 0; p.comboPts = 0; p.comboN = 0; p.comboNames = []; p.st = makeStats();
  resetTokens(w, p); p.runT = secs; p.run0 = 0;
}
export function endRun(p: Player) { p.runT = -1; }

/** A vehicle the player can climb onto: a ride-on mower in the warm seasons, a plow in the snow. */
export interface Ride { kind: 'mower' | 'plow'; x: number; z: number; yaw: number; hx: number; hz: number; hyaw: number; }
export const makeRides = (w: World): Ride[] => w.rides.map(r => ({ kind: r.kind, x: r.x, z: r.z, yaw: r.yaw, hx: r.x, hz: r.z, hyaw: r.yaw }));
const makeFields = (w: World) => w.fields.map(f => new Uint8Array(f.nx * f.nz));
const fieldTotal = (w: World) => w.fields.reduce((a, f) => a + f.nx * f.nz, 0);

export function makeProps(w: World): Prop[] {
  return w.props.map(s => ({
    kind: s.kind, x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0,
    rest: true, hx: s.x, hy: s.y, hz: s.z, gone: 0,
  }));
}

export function makePlayer(w: World, spawn = 0): Player {
  const s = w.spawns[spawn];
  const p: Player = {
    x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, yaw: s.yaw, mode: s.mode, cartRide: false, grounded: true, surf: 'concrete',
    state: 'normal', stateT: 0, coyote: 0, jumpBuf: 0, jumping: false, lastRate: 0, airT: 0,
    flow: 0, flowIdle: 0, slideCd: 0, vaultT: 0,
    wallNx: 0, wallNz: 0, wallCd: 0, wallTouch: false, wallUsed: false,
    rail: -1, railT: 0, railS: 0, railCd: 0, grindPts: 0, mantleFrom: 0, mantleTo: 0,
    trickT: 0, trickDur: 1, trickName: '', trickPts: 0,
    comboPts: 0, comboN: 0, comboNames: [], comboLand: 0, score: 0, lastBank: 0, best: 0,
    safe: [s.x, s.y, s.z, s.yaw], safeOld: [s.x, s.y, s.z, s.yaw], safeT: 0,
    rag: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0 },
    pj: false, pc: false, pt: false, ps: false, pb: false,
    time: 0, firstTrickAt: -1, stride: 0, pushing: false, bails: 0,
    props: makeProps(w),
    npcs: makeNpcs(w), rivets: w.rivets.map(() => false), rivetN: 0, trialT: -1, trialArmed: false, trialBest: 0,
    cars: makeCars(w), tow: makeTow(), rides: makeRides(w), ride: -1, dsp: 0, edge: false, inv: 0,
    fields: makeFields(w), fieldN: 0, fieldTotal: fieldTotal(w), fieldMile: 0,
    tokens: new Float32Array(0), lineLeft: new Int16Array(0), runT: -1, run0: 0, st: makeStats(),
  };
  resetTokens(w, p);
  return p;
}

/** Move to a spawn point. Clears motion but keeps score and session clock. */
export function warp(w: World, p: Player, spawn: number) {
  const s = w.spawns[spawn];
  p.x = s.x; p.y = s.y; p.z = s.z; p.vx = p.vy = p.vz = 0; p.yaw = s.yaw; p.mode = s.mode; p.cartRide = false;
  p.grounded = true; p.state = 'normal'; p.stateT = 0; p.trickT = 0; p.rail = -1;
  p.comboPts = 0; p.comboN = 0; p.comboNames = [];
  p.safe = [s.x, s.y, s.z, s.yaw]; p.safeOld = p.safe.slice();
  p.props = makeProps(w); p.trialT = -1; p.trialArmed = false;
  p.rides = makeRides(w); p.ride = -1; p.dsp = 0; p.edge = false; p.tow = makeTow(); p.inv = 0;
  if (p.cars.length) { const t = p.cars[0]; t.s = w.towS; t.off = t.offT = 5.0; t.v = 0; }
  if (s.tow && p.cars.length) { p.tow.active = true; p.tow.rope = true; p.tow.startT = p.time; p.cartRide = p.mode === 'cart'; }
}

/** The season or weather changed and the world was rebuilt: keep the player, refresh everything else. */
export function rebind(w: World, p: Player) {
  p.props = makeProps(w); p.npcs = makeNpcs(w); p.cars = makeCars(w); p.tow = makeTow(); p.rides = makeRides(w);
  if (p.mode === 'drive') p.mode = 'foot';
  p.ride = -1; p.dsp = 0; p.edge = false; p.fields = makeFields(w); p.fieldN = 0; p.fieldTotal = fieldTotal(w); p.fieldMile = 0;
  if (p.rivets.length !== w.rivets.length) { p.rivets = w.rivets.map(() => false); p.rivetN = 0; }
  resetTokens(w, p);
  if (p.state !== 'bail') { p.state = 'normal'; p.stateT = 0; }
  p.rail = -1; p.trickT = 0;
  if (p.mode !== 'kayak') { p.y = Math.max(p.y, ground(w, p.x, p.z, p.y + 3).y) + 0.05; p.grounded = false; }
  p.safe = [p.x, p.y, p.z, p.yaw]; p.safeOld = p.safe.slice();
}

/** What the context button would do right now, for prompts. */
export function context(w: World, p: Player): '' | 'exit' | 'letgo' | 'tow' | 'mower' | 'plow' | 'kayak' | 'dock' {
  if (p.state === 'bail') return '';
  if (p.mode === 'drive') return 'exit';
  if (p.tow.rope) return 'letgo';
  if (p.mode === 'kayak') { for (const d of w.docks) if (Math.hypot(p.x - d.wx, p.z - d.wz) <= 12) return 'dock'; return ''; }
  if (nearTruck(p)) return 'tow';
  const r = nearRide(p); if (r >= 0) return p.rides[r].kind;
  for (const d of w.docks) if (Math.hypot(p.x - d.lx, p.z - d.lz) <= 8 && Math.abs(p.y - d.ly) <= 1.5) return 'kayak';
  return '';
}
function hitchX(t: Car) { return t.x - t.hx * (t.len / 2 + 0.3); }
function hitchZ(t: Car) { return t.z - t.hz * (t.len / 2 + 0.3); }
function nearTruck(p: Player) {
  if (!p.cars.length || p.tow.active || p.mode === 'kayak' || p.mode === 'drive') return false;
  const t = p.cars[0]; return Math.hypot(p.x - hitchX(t), p.z - hitchZ(t)) < 8 && p.y < 2;
}
function nearRide(p: Player) {
  for (let i = 0; i < p.rides.length; i++) { const r = p.rides[i]; if (Math.hypot(p.x - r.x, p.z - r.z) < (r.kind === 'plow' ? 5.5 : 3.2)) return i; }
  return -1;
}
function dropRide(p: Player, home: boolean) {
  if (p.ride < 0) return;
  const r = p.rides[p.ride];
  if (home) { r.x = r.hx; r.z = r.hz; r.yaw = r.hyaw; } else { r.x = p.x; r.z = p.z; r.yaw = p.yaw; }
  p.ride = -1; p.mode = 'foot'; p.dsp = 0;
}
const surfOf = (w: World, s: Solid | null): Surf => {
  const sf: Surf = s ? s.surf : w.baseY < 0 ? 'water' : 'concrete';
  return w.env.snow && (sf === 'concrete' || sf === 'grass') ? 'snow' : sf;
};
const tp: PathPos = { x: 0, z: 0, hx: 0, hz: 0, corner: false };
const honks: number[] = [];

const hit: Hit = { hit: false, nx: 0, nz: 0, top: 0, s: null };
const probe: Hit = { hit: false, nx: 0, nz: 0, top: 0, s: null };
const tmp = { x: 0, y: 0, z: 0 };
let lastImpact = 0;
const impactOf = (_p: Player) => -lastImpact;

function addTrick(p: Player, ev: Ev[], name: string, pts: number) {
  // Variety pays: the same trick again in one combo is worth less each time.
  let rep = 0; for (let i = 0; i < p.comboNames.length; i++) if (p.comboNames[i] === name) rep++;
  if (rep) pts = Math.round(pts * (rep === 1 ? 0.7 : rep === 2 ? 0.45 : 0.25));
  p.st.tricks++; p.st.streak++; if (p.st.streak > p.st.streakBest) p.st.streakBest = p.st.streak;
  p.comboPts += pts; p.comboN++; p.comboLand = 0;
  p.comboNames.push(name); if (p.comboNames.length > 4) p.comboNames.shift();
  p.flow = Math.min(1, p.flow + 0.18); p.flowIdle = 0;
  if (p.firstTrickAt < 0) p.firstTrickAt = p.time;
  ev.push({ type: 'trick', v: pts, name });
}

function bail(p: Player, ev: Ev[]) {
  if (p.state === 'bail') return;
  const sp = Math.hypot(p.vx, p.vz);
  if (p.mode === 'drive') dropRide(p, p.surf === 'water');
  p.tow.rope = false; p.edge = false;
  p.state = 'bail'; p.stateT = 0; p.trickT = 0; p.rail = -1; p.bails++; p.st.streak = 0;
  p.comboPts = 0; p.comboN = 0; p.comboNames = []; p.flow = 0;
  p.rag.x = p.x; p.rag.y = p.y + 0.9; p.rag.z = p.z;
  p.rag.vx = p.vx * 0.8; p.rag.vz = p.vz * 0.8; p.rag.vy = Math.max(p.vy, 0) + 4.5;
  p.rag.rot = 0; p.rag.spin = 8 + sp * 0.8;
  p.vx = p.vy = p.vz = 0;
  ev.push({ type: 'bail', v: sp });
}

function stepBail(w: World, p: Player, dt: number, ev: Ev[]) {
  const r = p.rag;
  p.stateT += dt;
  r.vy -= G * dt;
  r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
  if (r.x < w.minX + 0.4) { r.x = w.minX + 0.4; r.vx = Math.abs(r.vx) * 0.5; }
  if (r.x > w.maxX - 0.4) { r.x = w.maxX - 0.4; r.vx = -Math.abs(r.vx) * 0.5; }
  if (r.z < w.minZ + 0.4) { r.z = w.minZ + 0.4; r.vz = Math.abs(r.vz) * 0.5; }
  if (r.z > w.maxZ - 0.4) { r.z = w.maxZ - 0.4; r.vz = -Math.abs(r.vz) * 0.5; }
  const gy = ground(w, r.x, r.z, r.y + 0.6).y + 0.3;
  if (r.y < gy) {
    r.y = gy;
    if (r.vy < -2) ev.push({ type: 'impact', v: -r.vy * 0.5 });
    r.vy = -r.vy * 0.35; r.vx *= 0.6; r.vz *= 0.6; r.spin *= 0.55;
  }
  r.rot += r.spin * dt;
  if (p.stateT >= 1.5) {
    const s = p.safeOld;
    p.x = s[0]; p.y = s[1] + 0.05; p.z = s[2]; p.yaw = s[3];
    p.vx = p.vy = p.vz = 0; p.state = 'normal'; p.stateT = 0; p.grounded = false; p.cartRide = false; p.airT = 0;
    p.inv = 2.5;
    if (p.tow.active && w.path && p.mode !== 'kayak') {
      // back on the bungee, right behind the truck
      const t = p.cars[0]; pathAt(w.path, t.s - 9, t.off, tp);
      p.x = tp.x; p.z = tp.z; p.y = ground(w, p.x, p.z, 3).y + 0.05; p.yaw = t.yaw; p.tow.rope = true; p.cartRide = p.mode === 'cart';
      if (p.mode === 'foot') p.mode = 'skate';
      s[0] = p.x; s[1] = p.y; s[2] = p.z; s[3] = p.yaw;
    }
    p.safe = s.slice();
    ev.push({ type: 'respawn', v: 0 });
  }
}

function switchMode(p: Player, ev: Ev[]) {
  // Velocity is deliberately untouched here. See tests/sim.test.ts "momentum carries".
  p.mode = MODES[(MODES.indexOf(p.mode as typeof MODES[number]) + 1) % 3];
  p.cartRide = p.mode === 'cart' && Math.hypot(p.vx, p.vz) > 3;
  if (p.state === 'slide' || p.state === 'manual' || p.state === 'wallrun') { p.state = 'normal'; p.stateT = 0; }
  p.trickT = 0;
  ev.push({ type: 'switch', v: MODES.indexOf(p.mode as typeof MODES[number]) });
}

function leaveRail(p: Player, ev: Ev[], pop: number) {
  addTrick(p, ev, p.mode === 'skate' ? (p.surf === 'snow' ? 'Boardslide' : '50-50 grind') : 'Rail slide', 50 + Math.round(p.grindPts));
  p.state = 'normal'; p.stateT = 0; p.rail = -1; p.railCd = 0.3; p.grounded = false; p.airT = 0;
  p.vy = Math.max(p.vy, 0) + pop;
  ev.push({ type: 'grindEnd', v: 0 });
}

function stepGrind(w: World, p: Player, inp: Input, dt: number, ev: Ev[]) {
  const r = w.rails[p.rail];
  const dx = r.bx - r.ax, dy = r.by - r.ay, dz = r.bz - r.az;
  const len = Math.hypot(dx, dy, dz);
  const ux = dx / len, uy = dy / len, uz = dz / len;
  p.railS += -G * uy * dt;
  p.railS -= Math.sign(p.railS) * 0.8 * dt;
  p.railT += p.railS * dt / len;
  const t = p.railT < 0 ? 0 : p.railT > 1 ? 1 : p.railT;
  p.x = r.ax + dx * t; p.y = r.ay + dy * t; p.z = r.az + dz * t;
  p.vx = ux * p.railS; p.vy = uy * p.railS; p.vz = uz * p.railS;
  p.yaw = Math.atan2(p.vz, p.vx);
  p.stateT += dt; p.grindPts += dt * 120; p.flowIdle = 0; p.st.grind += dt;
  if (p.jumpBuf > 0) { p.jumpBuf = 0; leaveRail(p, ev, 5.6); ev.push({ type: 'jump', v: 1 }); }
  else if (p.railT <= 0 || p.railT >= 1) leaveRail(p, ev, 1.5);
  else if (Math.abs(p.railS) < 1) leaveRail(p, ev, 1.0);
}

function tryRail(w: World, p: Player, ev: Ev[]) {
  if (p.grounded || p.mode === 'cart' || p.mode === 'kayak' || p.mode === 'drive' || p.railCd > 0 || p.vy > 1.5 || p.state !== 'normal') return;
  const rails = w.rails;
  for (let i = 0; i < rails.length; i++) {
    const r = rails[i];
    const dx = r.bx - r.ax, dy = r.by - r.ay, dz = r.bz - r.az;
    const l2 = dx * dx + dy * dy + dz * dz;
    let t = ((p.x - r.ax) * dx + (p.y - r.ay) * dy + (p.z - r.az) * dz) / l2;
    if (t < 0 || t > 1) continue;
    const qx = r.ax + dx * t, qy = r.ay + dy * t, qz = r.az + dz * t;
    if (p.y < qy - 0.35) continue;
    const d = Math.hypot(p.x - qx, p.y - qy, p.z - qz);
    if (d > 0.55) continue;
    const len = Math.sqrt(l2);
    const s = (p.vx * dx + p.vz * dz) / len;
    if (Math.abs(s) < 2.5) continue;
    const sp = Math.hypot(p.vx, p.vz);
    p.state = 'grind'; p.stateT = 0; p.rail = i; p.railT = t; p.grindPts = 0;
    p.railS = Math.sign(s) * Math.max(Math.abs(s), sp * 0.92);
    p.trickT = 0;
    ev.push({ type: 'grindStart', v: sp });
    if (p.firstTrickAt < 0) p.firstTrickAt = p.time;
    return;
  }
}

function hash(i: number, t: number) { const s = Math.sin(i * 12.9898 + t * 78.233) * 43758.5453; return s - Math.floor(s); }

function stepProps(w: World, p: Player, dt: number, ev: Ev[]) {
  const sp = Math.hypot(p.vx, p.vz);
  const reach = p.mode === 'cart' ? 0.85 : p.mode === 'drive' ? 1.5 : 0.55;
  const ps = p.props;
  for (let i = 0; i < ps.length; i++) {
    const q = ps[i];
    if (q.kind === 'leaves' || q.kind === 'snowman') {
      if (q.gone > 0) { q.gone -= dt; continue; }
      if (p.state === 'bail' || sp < 2) continue;
      const dx = q.x - p.x, dz = q.z - p.z;
      if (dx * dx + dz * dz > 1.1 || Math.abs(q.y - p.y) > 1.6) continue;
      q.gone = 30; p.vx *= 0.96; p.vz *= 0.96;
      addTrick(p, ev, q.kind === 'leaves' ? 'Leaf pile' : 'Snowman', q.kind === 'leaves' ? 25 : 40); p.st.soft++;
      ev.push({ type: 'soft', v: i, name: q.kind });
      continue;
    }
    if (q.rest) {
      if (p.state === 'bail' || sp < 1.5) continue;
      const dx = q.x - p.x, dz = q.z - p.z;
      if (dx * dx + dz * dz > reach * reach || q.y - p.y > 1.2 || q.y - p.y < -0.6) continue;
      const k = 0.8 + hash(i, 1) * 0.5;
      q.rest = false; q.vx = p.vx * k + (hash(i, 2) - 0.5) * 3; q.vz = p.vz * k + (hash(i, 3) - 0.5) * 3;
      q.vy = 2.5 + sp * 0.3; q.wx = (hash(i, 4) - 0.5) * 14; q.wy = (hash(i, 5) - 0.5) * 10; q.wz = (hash(i, 6) - 0.5) * 14;
      for (let j = 0; j < ps.length; j++) {
        const o = ps[j];
        if (o.rest && o.y > q.y + 0.1 && Math.abs(o.x - q.x) < 0.7 && Math.abs(o.z - q.z) < 0.7) { o.rest = false; o.wx = 2; }
      }
      const keep = p.mode === 'cart' ? 0.975 : 0.9;
      p.vx *= keep; p.vz *= keep;
      if (p.mode === 'cart') addTrick(p, ev, 'Ram', 30);
      ev.push({ type: 'ram', v: sp });
    } else {
      q.vy -= G * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rx += q.wx * dt; q.ry += q.wy * dt; q.rz += q.wz * dt;
      if (q.x < w.minX + 0.3) { q.x = w.minX + 0.3; q.vx = Math.abs(q.vx) * 0.5; }
      if (q.x > w.maxX - 0.3) { q.x = w.maxX - 0.3; q.vx = -Math.abs(q.vx) * 0.5; }
      if (q.z < w.minZ + 0.3) { q.z = w.minZ + 0.3; q.vz = Math.abs(q.vz) * 0.5; }
      if (q.z > w.maxZ - 0.3) { q.z = w.maxZ - 0.3; q.vz = -Math.abs(q.vz) * 0.5; }
      const gy = ground(w, q.x, q.z, q.y + 0.5).y;
      if (q.y < gy) {
        q.y = gy;
        if (Math.abs(q.vy) < 2 && Math.hypot(q.vx, q.vz) < 0.6) {
          q.rest = true; q.vx = q.vy = q.vz = 0; q.wx = q.wy = q.wz = 0;
          q.rx = Math.round(q.rx / (Math.PI / 2)) * (Math.PI / 2); q.rz = Math.round(q.rz / (Math.PI / 2)) * (Math.PI / 2);
        } else { q.vy = -q.vy * 0.4; q.vx *= 0.65; q.vz *= 0.65; q.wx *= 0.6; q.wy *= 0.6; q.wz *= 0.6; }
      }
    }
  }
}

function rotateVel(p: Player, a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  const vx = p.vx * c - p.vz * s, vz = p.vx * s + p.vz * c;
  p.vx = vx; p.vz = vz;
}

function decel(p: Player, a: number) {
  const sp = Math.hypot(p.vx, p.vz);
  if (sp < 1e-6) return;
  const n = Math.max(0, sp - a) / sp;
  p.vx *= n; p.vz *= n;
}

function footControl(p: Player, inp: Input, ix: number, iz: number, mag: number, crouchPressed: boolean, dt: number, ev: Ev[], gs: Solid | null) {
  const max = 6.5 + 3 * p.flow;
  const sp = Math.hypot(p.vx, p.vz);
  p.pushing = false;
  if (p.grounded) {
    const [gx, gz] = slopeOf(gs);
    if (p.state === 'slide') {
      decel(p, 1.5 * dt);
      if (mag > 0 && sp > 0.5) {
        const ang = Math.atan2(p.vx * iz - p.vz * ix, p.vx * ix + p.vz * iz);
        rotateVel(p, Math.max(-1.2 * dt, Math.min(1.2 * dt, ang)));
      }
      p.vx -= G * gx * dt; p.vz -= G * gz * dt;
      p.stateT += dt;
      if (!inp.crouch || Math.hypot(p.vx, p.vz) < 2) { p.state = 'normal'; p.stateT = 0; }
    } else {
      if (crouchPressed && sp > 4) {
        p.state = 'slide'; p.stateT = 0;
        if (p.slideCd <= 0) { const k = (sp + 1.5) / sp; p.vx *= k; p.vz *= k; p.slideCd = 1.2; addTrick(p, ev, 'Slide', 30); }
        ev.push({ type: 'slide', v: sp });
      } else if (mag > 0) {
        if (sp > max + 0.5 && p.vx * ix + p.vz * iz > 0.3 * sp) {
          // Carrying more speed than legs can make: keep it, bleed slowly, still steer.
          const ang = Math.atan2(p.vx * iz - p.vz * ix, p.vx * ix + p.vz * iz);
          rotateVel(p, Math.max(-2.5 * dt, Math.min(2.5 * dt, ang)));
          decel(p, 4 * dt);
        } else {
          const tx = ix * max * mag, tz = iz * max * mag;
          const dx = tx - p.vx, dz = tz - p.vz; const d = Math.hypot(dx, dz);
          const a = 34 * dt;
          if (d <= a) { p.vx = tx; p.vz = tz; } else { p.vx += dx / d * a; p.vz += dz / d * a; }
        }
        p.vx -= G * gx * 0.2 * dt; p.vz -= G * gz * 0.2 * dt;
      } else decel(p, (sp > max ? 7 : 28) * dt);
    }
  } else if (p.state === 'wallrun') {
    const dn = p.vx * p.wallNx + p.vz * p.wallNz;
    p.vx -= dn * p.wallNx; p.vz -= dn * p.wallNz;
    p.stateT += dt; p.flowIdle = 0;
    const hs = Math.hypot(p.vx, p.vz);
    if (p.jumpBuf > 0) {
      p.jumpBuf = 0; p.vx += p.wallNx * 5.5; p.vz += p.wallNz * 5.5; p.vy = 6.8;
      p.state = 'normal'; p.stateT = 0; p.wallCd = 0.35; p.wallUsed = false;
      addTrick(p, ev, 'Wall jump', 60); ev.push({ type: 'walljump', v: hs });
    } else if (p.stateT > 1.0 || hs < 3 || !p.wallTouch) { p.state = 'normal'; p.stateT = 0; p.wallCd = 0.35; }
  } else if (mag > 0) {
    const cap = Math.max(sp, max);
    p.vx += ix * 10 * mag * dt; p.vz += iz * 10 * mag * dt;
    const n = Math.hypot(p.vx, p.vz);
    if (n > cap) { p.vx *= cap / n; p.vz *= cap / n; }
  }
  if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0) && (p.state === 'normal' || p.state === 'slide')) {
    p.vy = 6.6; p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.jumping = true; p.airT = 0;
    p.state = 'normal'; p.stateT = 0;
    ev.push({ type: 'jump', v: 0 });
  }
}

function wheelControl(w: World, p: Player, inp: Input, ix: number, iz: number, mag: number, dt: number, ev: Ev[], gs: Solid | null) {
  const snowy = w.env.snow, slick = w.env.wet ? 0.85 : 1, towed = p.tow.rope;
  let sp = Math.hypot(p.vx, p.vz);
  const skate = p.mode === 'skate';
  let hx: number, hz: number;
  if (sp > 0.6) { hx = p.vx / sp; hz = p.vz / sp; } else { hx = Math.cos(p.yaw); hz = Math.sin(p.yaw); }
  p.pushing = false;
  if (p.grounded) {
    const riding = !skate && p.cartRide;
    const k = Math.min(1, sp / 14);
    const turn = (skate ? (snowy ? 3.0 - 1.2 * k : 3.4 - 1.7 * k) : riding ? (inp.crouch ? 0.6 : towed ? 1.7 : 1.25) : 2.4) * slick;
    let rot = 0;
    if (mag > 0) {
      const ang = Math.atan2(hx * iz - hz * ix, hx * ix + hz * iz);
      const aa = Math.abs(ang);
      if (sp < 0.6) { hx = ix; hz = iz; }
      else if (aa < 2.3) rot = Math.max(-turn * dt, Math.min(turn * dt, ang));
      if (aa < 1.75) {
        if (!riding) {
          const pm = skate ? (snowy ? 5.5 : 10) : 9.5;
          if (sp < pm) { sp = Math.min(pm, sp + (skate ? (snowy ? 4.5 : 7) : 6.5) * mag * dt); p.pushing = true; }
        } else if (sp < 2.5 && !towed) { p.cartRide = false; ev.push({ type: 'hopOff', v: sp }); }
      } else if (aa > 2.3) sp = Math.max(0, sp - (riding ? 5 : 12) * dt);
    }
    // Hands off the stick on the bungee: the board settles in behind the truck by itself.
    if (towed && mag === 0 && sp > 2 && p.cars.length) {
      const t = p.cars[0], ax = hitchX(t) + t.hx * 4 - p.x, az = hitchZ(t) + t.hz * 4 - p.z;
      const ang = Math.atan2(hx * az - hz * ax, hx * ax + hz * az);
      rot = Math.max(-1.3 * dt, Math.min(1.3 * dt, ang));
    }
    // The cart has one bad wheel. It pulls harder the faster you go.
    if (riding) rot += (Math.sin(p.time * 11) * 0.22 * Math.min(1, sp / 10) + Math.sin(p.time * 3.7) * 0.1) * dt;
    if (rot !== 0) { const c = Math.cos(rot), s = Math.sin(rot); const nx = hx * c - hz * s; hz = hx * s + hz * c; hx = nx; }
    // On the bungee, crouching digs an edge in: a hard brake that stretches the cord for a slingshot.
    const dig = towed && skate && inp.crouch && sp > 2;
    if (p.edge && !dig && p.tow.stretch > 2.2 && p.tow.slingCd <= 0) { p.tow.slingCd = 2.5; p.st.sling++; addTrick(p, ev, 'Slingshot', 60); ev.push({ type: 'sling', v: p.tow.stretch }); }
    p.edge = dig;
    const fr = dig ? 22 : skate ? (p.state === 'manual' ? 0.3 : snowy ? 0.22 : 0.7 * slick) : riding ? (inp.crouch ? 0.2 : 0.5 * slick) : (mag > 0 ? 0.8 : 5);
    sp = Math.max(0, sp - (fr + 0.006 * sp * sp) * dt);
    p.vx = hx * sp; p.vz = hz * sp;
    const [gx, gz] = slopeOf(gs);
    // Fun over fidelity (ADR 0004): wheels lose less than half the speed physics would
    // take on the way up a ramp, and gain all of it on the way down.
    const up = gx * p.vx + gz * p.vz > 0 ? 0.45 : 1;
    const gg = up * G / (1 + gx * gx + gz * gz);
    p.vx -= gg * gx * dt; p.vz -= gg * gz * dt;
    if (sp < 0.6 && mag > 0) p.yaw = Math.atan2(hz, hx);

    if (skate) {
      if (p.state === 'manual') {
        p.stateT += dt; p.flowIdle = 0;
        if (!inp.crouch || sp < 2 || towed) { addTrick(p, ev, snowy ? 'Butter' : 'Manual', Math.round(p.stateT * 60)); p.state = 'normal'; p.stateT = 0; }
        else if (p.stateT > 3) { bail(p, ev); return; }
      } else if (inp.crouch && sp > 3 && p.state === 'normal' && !towed) { p.state = 'manual'; p.stateT = 0; }
    }
  } else {
    p.edge = false;
    if (mag > 0 && sp > 0.5) {
      // A little air steer so lines can be corrected, never enough to add speed.
      const ang = Math.atan2(hx * iz - hz * ix, hx * ix + hz * iz);
      rotateVel(p, Math.max(-0.9 * dt, Math.min(0.9 * dt, ang)));
    }
  }
  if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
    p.jumpBuf = 0;
    if (skate) {
      if (p.state === 'manual') { addTrick(p, ev, 'Manual', Math.round(p.stateT * 60)); p.state = 'normal'; p.stateT = 0; }
      p.vy = Math.max(p.vy, 0) + 7.0; p.grounded = false; p.coyote = 0; p.airT = 0; ev.push({ type: 'jump', v: 1 });
    } else if (!p.cartRide) {
      p.cartRide = true; p.vy = 2.2; p.grounded = false; p.coyote = 0; p.airT = 0;
      if (sp >= 8) { const k = (sp + 1.5) / sp; p.vx *= k; p.vz *= k; addTrick(p, ev, 'Bobsled start', 80); ev.push({ type: 'bobsled', v: sp }); }
      ev.push({ type: 'hopOn', v: sp });
    } else { p.vy = 4.2; p.grounded = false; p.coyote = 0; p.airT = 0; ev.push({ type: 'jump', v: 2 }); }
  }
}

export function step(w: World, p: Player, inp: Input, dt: number, ev: Ev[]) {
  p.time += dt;
  if (p.runT >= 0) {
    const was = p.runT; p.runT -= dt;
    if (p.runT <= 0) {
      // Time. Whatever combo is in hand is banked as it stands.
      if (p.comboN > 0 && p.state !== 'bail') { const total = p.comboPts * p.comboN; p.score += total; if (total > p.best) p.best = total; p.comboPts = 0; p.comboN = 0; p.comboNames = []; }
      p.runT = -1; ev.push({ type: 'runEnd', v: p.score - p.run0 });
    } else if (p.runT <= 10 && Math.floor(was) !== Math.floor(p.runT)) ev.push({ type: 'runTick', v: Math.ceil(p.runT) });
  }
  const jumpPressed = inp.jump && !p.pj, crouchPressed = inp.crouch && !p.pc, trickPressed = inp.trick && !p.pt;
  const switchPressed = inp.switchMode && !p.ps, bailPressed = inp.bail && !p.pb;
  p.pj = inp.jump; p.pc = inp.crouch; p.pt = inp.trick; p.ps = inp.switchMode; p.pb = inp.bail;
  p.jumpBuf = jumpPressed ? 0.13 : Math.max(0, p.jumpBuf - dt);
  p.wallCd = Math.max(0, p.wallCd - dt); p.railCd = Math.max(0, p.railCd - dt);
  p.slideCd = Math.max(0, p.slideCd - dt); p.vaultT = Math.max(0, p.vaultT - dt);
  p.coyote = Math.max(0, p.coyote - dt); p.inv = Math.max(0, p.inv - dt); p.tow.slingCd = Math.max(0, p.tow.slingCd - dt);
  if (w.path) {
    honks.length = 0;
    stepCars(w, p.cars, p.tow, p, p.state === 'bail' || (p.mode !== 'drive' && Math.hypot(p.vx, p.vz) < 4), dt, honks);
    for (let i = 0; i < honks.length; i++) ev.push({ type: 'honk', v: honks[i] });
  }

  if (p.state === 'bail') { stepBail(w, p, dt, ev); stepProps(w, p, dt, ev); if (w.kind === 'city') stepNpcs(w, p, p.npcs, dt, bumps); return; }
  if (bailPressed) { bail(p, ev); return; }
  if (switchPressed && p.state !== 'mantle') {
    let ri = -1;
    if (p.mode === 'drive') {
      const side = p.rides[p.ride].kind === 'plow' ? 2.6 : 1.3, yaw = p.yaw;
      dropRide(p, false); p.x += -Math.sin(yaw) * side; p.z += Math.cos(yaw) * side; p.vx = p.vz = 0;
      collide(w, p, R, 0.35, HEIGHT, hit); ev.push({ type: 'rideOff', v: 0 });
    } else if (p.tow.rope) { p.tow.rope = false; p.tow.active = false; p.edge = false; ev.push({ type: 'ropeOff', v: 0 }); }
    else if (nearTruck(p)) {
      if (p.state === 'grind') leaveRail(p, ev, 1.0);
      if (p.mode === 'foot') p.mode = 'skate';
      p.cartRide = p.mode === 'cart'; p.state = 'normal'; p.stateT = 0;
      p.tow.active = true; p.tow.rope = true; p.tow.startT = p.time; p.tow.laps = 0; p.tow.dist = 0;
      ev.push({ type: 'rope', v: 1 });
    } else if (p.mode !== 'kayak' && (ri = nearRide(p)) >= 0) {
      const r = p.rides[ri];
      p.ride = ri; p.mode = 'drive'; p.x = r.x; p.z = r.z; p.yaw = r.yaw; p.dsp = 0; p.vx = p.vy = p.vz = 0; p.cartRide = false;
      p.y = ground(w, p.x, p.z, p.y + 1.5).y; p.grounded = true; p.state = 'normal'; p.stateT = 0; p.trickT = 0; p.rail = -1;
      ev.push({ type: 'ride', v: ri, name: r.kind });
    }
    else if (w.docks.length && dockSwitch(w, p, ev)) { /* launched or landed a kayak */ }
    else if (p.mode === 'kayak') ev.push({ type: 'deny', v: 0 });
    else {
      if (p.state === 'grind') leaveRail(p, ev, 1.0);
      switchMode(p, ev);
    }
  }

  if (p.state === 'mantle') {
    p.stateT += dt;
    const k = Math.min(1, p.stateT / 0.36), e = k * k * (3 - 2 * k);
    p.y = p.mantleFrom + (p.mantleTo + 0.02 - p.mantleFrom) * e;
    if (k >= 1) {
      p.x -= p.wallNx * (R + 0.18); p.z -= p.wallNz * (R + 0.18);
      p.vx = -p.wallNx * 3.5; p.vz = -p.wallNz * 3.5; p.vy = 0;
      p.state = 'normal'; p.stateT = 0; p.grounded = true;
      addTrick(p, ev, 'Climb up', 40); ev.push({ type: 'mantle', v: 0 });
    }
    return;
  }
  if (p.state === 'grind') { stepGrind(w, p, inp, dt, ev); stepProps(w, p, dt, ev); if (w.kind === 'city' && cityStep(w, p, dt, ev)) return; tail(p, dt, ev); return; }

  const im = Math.hypot(inp.mx, inp.mz);
  const mag = im > 0.15 ? Math.min(1, im) : 0;
  const ix = mag > 0 ? inp.mx / im : 0, iz = mag > 0 ? inp.mz / im : 0;
  const stepH = p.mode === 'foot' ? 0.35 : p.mode === 'skate' ? 0.2 : p.mode === 'kayak' ? 0.05 : p.mode === 'drive' ? 0.3 : 0.12;
  const rad = p.mode === 'drive' ? (p.rides[p.ride].kind === 'plow' ? 1.5 : 0.75) : R;
  const gs = p.grounded ? ground(w, p.x, p.z, p.y + 0.05).s : null;

  if (p.mode === 'foot') footControl(p, inp, ix, iz, mag, crouchPressed, dt, ev, gs);
  else if (p.mode === 'kayak') kayakControl(p, ix, iz, mag, dt);
  else if (p.mode === 'drive') driveControl(p, inp, ix, iz, mag, dt, ev);
  else wheelControl(w, p, inp, ix, iz, mag, dt, ev, gs);
  if ((p.state as State) === 'bail') return;

  // The bungee: a spring that only pulls, anchored to the truck's hitch.
  if (p.tow.rope) {
    const t = p.cars[0];
    let dx = hitchX(t) - p.x, dz = hitchZ(t) - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const st = d - ROPE; p.tow.stretch = Math.max(0, st);
    if (st > 0) {
      const sep = -((p.vx - t.hx * t.v) * dx + (p.vz - t.hz * t.v) * dz);
      const a = Math.min(st * 5.5, 44) + (sep > 0 ? sep * 1.6 : 0);
      p.vx += dx * a * dt; p.vz += dz * a * dt;
    }
    p.tow.dist += t.v * dt;
    if (w.path && p.tow.dist >= (p.tow.laps + 1) * w.path.len) { p.tow.laps++; p.st.laps++; p.score += 300 * p.tow.laps; ev.push({ type: 'lap', v: p.tow.laps }); }
    if (st > 17) { p.tow.rope = false; p.edge = false; ev.push({ type: 'ropeOff', v: 1 }); }
  } else p.tow.stretch = 0;

  // Air tricks: one button, a mode-specific trick. Landing before it finishes is a bail.
  if (!p.grounded && trickPressed && p.trickT <= 0 && p.state === 'normal' && p.mode !== 'kayak' && p.mode !== 'drive' && (p.mode !== 'cart' || p.cartRide)) {
    if (p.mode === 'foot') { p.trickName = 'Front flip'; p.trickPts = 120; p.trickDur = 0.55; }
    else if (p.mode === 'cart') { p.trickName = 'Cart 360'; p.trickPts = 150; p.trickDur = 0.55; }
    else if (inp.crouch) { p.trickName = w.env.snow ? 'Backside 360' : 'Shove-it'; p.trickPts = 150; p.trickDur = 0.46; }
    else { p.trickName = w.env.snow ? 'Method grab' : 'Kickflip'; p.trickPts = 100; p.trickDur = 0.36; }
    p.trickT = p.trickDur; ev.push({ type: 'trickStart', v: 0, name: p.trickName });
  }
  if (p.trickT > 0) { p.trickT -= dt; if (p.trickT <= 0) { p.trickT = 0; addTrick(p, ev, p.trickName, p.trickPts); } }

  // Variable jump height on foot.
  if (p.jumping && !inp.jump && p.vy > 3 && p.mode === 'foot') p.vy = 3;
  if (p.vy <= 0) p.jumping = false;

  // Integrate, in sub-steps when fast so thin obstacles cannot be skipped.
  if (!p.grounded) p.vy -= (p.state === 'wallrun' ? G * 0.3 : G) * dt;
  if (p.state === 'wallrun' && p.vy < -1.5) p.vy = -1.5;
  const hs0 = Math.hypot(p.vx, p.vz);
  const n = hs0 * dt > 0.2 ? Math.ceil(hs0 * dt / 0.2) : 1;
  const h = dt / n;
  p.wallTouch = false;
  for (let i = 0; i < n; i++) {
    const prevY = p.y;
    if (p.state === 'wallrun') { p.x -= p.wallNx * 0.03; p.z -= p.wallNz * 0.03; }
    p.x += p.vx * h; p.z += p.vz * h;
    if (!p.grounded) p.y += p.vy * h;
    if (p.vy > 0 && !p.grounded) headBump(w, p, prevY);
    // In the air a ledge you are below is a wall (and on foot, something to grab).
    // Judge walls from the height this sub-step started at, so a fast fall lands on a surface
    // instead of being treated as inside it.
    const yNow = p.y; if (!p.grounded && prevY > p.y) p.y = prevY;
    collide(w, p, rad, p.grounded ? stepH : Math.min(stepH, 0.12), HEIGHT, hit);
    p.y = yNow;
    if (hit.hit && respond(w, p, inp, ev, rad)) return;
    resolveGround(w, p, inp, prevY, h, stepH, ev);
    if ((p.state as State) === 'bail' || (p.state as State) === 'mantle') return;
  }

  if (p.mode === 'foot' && !p.grounded && p.state === 'normal' && p.wallCd <= 0 && !p.wallUsed && p.vy > -9) tryWallrun(w, p, ev);
  tryRail(w, p, ev);
  stepProps(w, p, dt, ev);
  if (w.kind === 'city' && cityStep(w, p, dt, ev)) return;
  tail(p, dt, ev);
}

const bumps: number[] = [];

function kayakControl(p: Player, ix: number, iz: number, mag: number, dt: number) {
  let sp = Math.hypot(p.vx, p.vz), hx: number, hz: number;
  if (sp > 0.5) { hx = p.vx / sp; hz = p.vz / sp; } else { hx = Math.cos(p.yaw); hz = Math.sin(p.yaw); }
  p.pushing = false;
  if (mag > 0) {
    const ang = Math.atan2(hx * iz - hz * ix, hx * ix + hz * iz), aa = Math.abs(ang);
    const rot = Math.max(-1.6 * dt, Math.min(1.6 * dt, ang));
    const c = Math.cos(rot), s = Math.sin(rot), nx = hx * c - hz * s; hz = hx * s + hz * c; hx = nx;
    if (aa < 1.5) { sp = Math.min(5.8, sp + 3.4 * mag * dt); p.pushing = true; }
    else if (aa > 2.3) sp = Math.max(0, sp - 4 * dt);
    p.yaw = Math.atan2(hz, hx);
  }
  sp = Math.max(0, sp - (0.3 + 0.06 * sp * sp) * dt);
  p.vx = hx * sp; p.vz = hz * sp;
}

/** Ride-on mower or snowplow: explicit heading and signed speed, steered toward the stick. */
function driveControl(p: Player, inp: Input, ix: number, iz: number, mag: number, dt: number, ev: Ev[]) {
  const plow = p.rides[p.ride].kind === 'plow';
  const vmax = plow ? 11 : 7.5, acc = plow ? 4.5 : 6.5, turn = plow ? 1.3 : 2.7;
  const hx = Math.cos(p.yaw), hz = Math.sin(p.yaw);
  p.pushing = false;
  if (p.grounded) {
    if (mag > 0) {
      const ang = Math.atan2(hx * iz - hz * ix, hx * ix + hz * iz), aa = Math.abs(ang);
      // reversing latches, so the machine never chatters between forward and back
      if (p.dsp < -0.05 ? aa > 1.7 : (aa > 2.5 && p.dsp < 1.5)) {
        p.dsp = Math.max(-3.5, p.dsp - acc * dt);
        const back = ang - Math.sign(ang) * Math.PI;
        p.yaw += Math.max(-turn * dt, Math.min(turn * dt, back)) * Math.min(1, Math.abs(p.dsp) / 2);
      } else {
        const grip = plow ? Math.min(1, Math.abs(p.dsp) / 3) : 1;
        p.yaw += Math.max(-turn * dt, Math.min(turn * dt, ang)) * grip;
        p.dsp = Math.min(vmax, p.dsp + acc * mag * dt); p.pushing = true;
      }
    } else p.dsp -= Math.sign(p.dsp) * Math.min(Math.abs(p.dsp), 4 * dt);
    if (inp.crouch) p.dsp -= Math.sign(p.dsp) * Math.min(Math.abs(p.dsp), 14 * dt);
    p.vx = Math.cos(p.yaw) * p.dsp; p.vz = Math.sin(p.yaw) * p.dsp;
  }
  if (p.jumpBuf > 0) { p.jumpBuf = 0; ev.push({ type: 'horn', v: plow ? 1 : 0 }); }
}

/** Mark the cells under a mower deck or plow blade. */
function workField(w: World, p: Player, ev: Ev[]) {
  const plow = p.rides[p.ride].kind === 'plow', want = plow ? 'snow' : 'lawn';
  const bx = p.x + Math.cos(p.yaw) * (plow ? 3.4 : 0.6), bz = p.z + Math.sin(p.yaw) * (plow ? 3.4 : 0.6), r = plow ? 2.3 : 1.45;
  let fresh = 0;
  for (let k = 0; k < w.fields.length; k++) {
    const f = w.fields[k]; if (f.kind !== want) continue;
    const i0 = Math.max(0, Math.floor((bx - r - f.x0) / f.cell)), i1 = Math.min(f.nx - 1, Math.floor((bx + r - f.x0) / f.cell));
    const j0 = Math.max(0, Math.floor((bz - r - f.z0) / f.cell)), j1 = Math.min(f.nz - 1, Math.floor((bz + r - f.z0) / f.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = f.x0 + (i + 0.5) * f.cell - bx, cz = f.z0 + (j + 0.5) * f.cell - bz;
      if (cx * cx + cz * cz > r * r || p.fields[k][j * f.nx + i]) continue;
      // stripe direction: remember which way the machine was heading
      p.fields[k][j * f.nx + i] = Math.abs(Math.cos(p.yaw)) > 0.7 ? (Math.cos(p.yaw) > 0 ? 1 : 2) : (Math.sin(p.yaw) > 0 ? 3 : 4);
      fresh++;
    }
  }
  if (!fresh) return;
  p.fieldN += fresh; p.score += fresh * 2; ev.push({ type: 'mow', v: fresh });
  const mile = Math.floor(p.fieldN / p.fieldTotal * 4);
  if (mile > p.fieldMile) { p.fieldMile = mile; p.score += 500 * mile; ev.push({ type: 'fieldDone', v: mile * 25, name: plow ? 'plow' : 'mow' }); }
}

/** Launch a kayak from a dock, or step back onto one. */
function dockSwitch(w: World, p: Player, ev: Ev[]): boolean {
  for (const d of w.docks) {
    if (p.mode === 'kayak') {
      if (Math.hypot(p.x - d.wx, p.z - d.wz) > 12) continue;
      p.x = d.lx; p.y = d.ly; p.z = d.lz; p.mode = 'foot';
    } else {
      if (Math.hypot(p.x - d.lx, p.z - d.lz) > 8 || Math.abs(p.y - d.ly) > 1.5) continue;
      p.x = d.wx; p.y = w.baseY; p.z = d.wz; p.mode = 'kayak'; p.yaw = d.yaw;
    }
    p.vx = p.vy = p.vz = 0; p.grounded = true; p.state = 'normal'; p.stateT = 0; p.trickT = 0; p.rail = -1; p.cartRide = false;
    p.safe = [p.x, p.y, p.z, p.yaw]; p.safeOld = p.safe.slice();
    ev.push({ type: 'dock', v: p.mode === 'kayak' ? 1 : 0, name: d.name });
    return true;
  }
  return false;
}

/** Trains, the third rail, rivets, the time trial and NPCs. Returns true if the step ended in a bail. */
function cityStep(w: World, p: Player, dt: number, ev: Ev[]): boolean {
  for (const tr of w.trains) {
    const t = trainAt(tr, p.time);
    if (!t.on || p.y >= TRAIN_H || p.x <= tr.x0 - R || p.x >= tr.x1 + R || Math.abs(p.z - t.z) >= TRAIN_HALF + R) continue;
    if (Math.abs(t.v) > 1.5) { p.vz = t.v * 0.8; p.vx += p.x < (tr.x0 + tr.x1) / 2 ? -3 : 3; ev.push({ type: 'train', v: Math.abs(t.v) }); bail(p, ev); return true; }
    p.x = p.x < (tr.x0 + tr.x1) / 2 ? tr.x0 - R : tr.x1 + R; p.vx = 0;
  }
  if (p.grounded && p.y < 0.4) for (const h of w.hazards) {
    if (p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1) { p.vy = 7; ev.push({ type: 'zap', v: 0 }); bail(p, ev); return true; }
  }
  // Traffic: get hit, squeeze past for points, or thump harmlessly into the tow truck.
  const crad = p.mode === 'drive' ? (p.rides[p.ride].kind === 'plow' ? 1.5 : 0.75) : R;
  for (let i = 0; i < p.cars.length; i++) {
    const c = p.cars[i], k = carContact(c, p, crad);
    if (k.hit) {
      if (p.inv > 0) continue;
      if (i === 0 || k.rel < 4.5 || p.mode === 'drive') {
        p.x += k.nx * k.pen; p.z += k.nz * k.pen;
        const vn = (p.vx - c.hx * c.v) * k.nx + (p.vz - c.hz * c.v) * k.nz;
        if (vn < 0) { p.vx -= vn * k.nx; p.vz -= vn * k.nz; if (p.mode === 'drive') p.dsp *= 0.5; if (vn < -2) ev.push({ type: 'impact', v: -vn }); }
      } else {
        p.vx = c.hx * c.v + k.nx * 4; p.vz = c.hz * c.v + k.nz * 4; p.vy = 3;
        ev.push({ type: 'carHit', v: k.rel, name: c.kind }); bail(p, ev); return true;
      }
    } else if (k.near && k.rel > 7 && c.ccd <= 0 && i !== 0 && p.mode !== 'drive' && p.mode !== 'kayak') {
      c.ccd = 5; p.st.close++; addTrick(p, ev, c.kind === 'plow' ? 'Plow dodge' : 'Close call', c.kind === 'plow' ? 120 : 75); ev.push({ type: 'closeCall', v: k.rel });
    }
  }
  if (p.tow.active && !p.tow.rope && p.cars.length) {
    const t = p.cars[0], d = Math.hypot(p.x - hitchX(t), p.z - hitchZ(t));
    if (d < 9 && (p.mode === 'skate' || p.mode === 'cart')) { p.tow.rope = true; p.cartRide = p.mode === 'cart'; ev.push({ type: 'rope', v: 2 }); }
    else if (d > 90) p.tow.active = false;
  }
  if (p.mode === 'drive' && p.grounded) workField(w, p, ev);

  for (let i = 0; i < w.rivets.length; i++) {
    if (p.rivets[i]) continue;
    const r = w.rivets[i];
    if (Math.abs(p.x - r[0]) < 1.5 && Math.abs(p.z - r[2]) < 1.5 && Math.abs(p.y + 0.9 - r[1]) < 1.9) {
      p.rivets[i] = true; p.rivetN++; p.score += 500; ev.push({ type: 'rivet', v: p.rivetN });
    }
  }
  // T tokens: ride through one to take it. A whole line pays a bonus, then the line comes back later.
  const tk = w.tokens, reach = p.mode === 'drive' ? 2.2 : 1.5;
  for (let i = 0; i < tk.length; i++) {
    if (p.tokens[i] > 0) { if (p.runT < 0) { p.tokens[i] -= dt; if (p.tokens[i] <= 0) { p.tokens[i] = 0; p.lineLeft[tk[i][3]]++; } } continue; }
    const t = tk[i];
    if (Math.abs(p.x - t[0]) > reach || Math.abs(p.z - t[2]) > reach || Math.abs(p.y + 0.9 - t[1]) > 1.9) continue;
    p.tokens[i] = 75; p.st.tokens++; p.score += 50; p.flow = Math.min(1, p.flow + 0.06); p.flowIdle = 0;
    ev.push({ type: 'token', v: i });
    if (--p.lineLeft[t[3]] === 0) { p.st.lines++; p.score += 500; ev.push({ type: 'line', v: 500 }); }
  }
  const tr = w.trial;
  if (tr) {
    if (Math.hypot(p.x - tr.sx, p.z - tr.sz) < 5) { p.trialArmed = true; p.trialT = -1; }
    else if (p.trialArmed) { p.trialArmed = false; p.trialT = 0; ev.push({ type: 'trialStart', v: 0 }); }
    if (p.trialT >= 0) {
      p.trialT += dt;
      if (Math.hypot(p.x - tr.fx, p.z - tr.fz) < tr.r) {
        if (p.trialBest === 0 || p.trialT < p.trialBest) p.trialBest = p.trialT;
        ev.push({ type: 'finish', v: p.trialT }); p.score += 2000; p.trialT = -1;
      }
    }
  }
  bumps.length = 0;
  const got = stepNpcs(w, p, p.npcs, dt, bumps);
  for (let i = 0; i < bumps.length; i++) ev.push({ type: 'bump', v: bumps[i] });
  if (got === 'goose') { ev.push({ type: 'goose', v: 0 }); bail(p, ev); return true; }
  if (got === 'busted') {
    const keep = p.trialBest; warp(w, p, 0); p.mode = 'foot'; p.trialBest = keep; p.trialArmed = false;
    p.x -= 12; p.y = ground(w, p.x, p.z, p.y + 0.5).y; p.safe = [p.x, p.y, p.z, p.yaw]; p.safeOld = p.safe.slice();
    ev.push({ type: 'busted', v: 0 }); return true;
  }
  return false;
}

function headBump(w: World, p: Player, prevY: number) {
  const ss = w.solids;
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i];
    if (s.y0 <= 0 || p.x < s.x0 || p.x > s.x1 || p.z < s.z0 || p.z > s.z1) continue;
    if (prevY + HEIGHT <= s.y0 + 0.01 && p.y + HEIGHT > s.y0) { p.y = s.y0 - HEIGHT; p.vy = 0; }
  }
}

function tryWallrun(w: World, p: Player, ev: Ev[]) {
  tmp.x = p.x; tmp.y = p.y; tmp.z = p.z;
  collide(w, tmp, R + 0.22, 0.35, HEIGHT, probe, false);
  if (!probe.hit || !probe.s) return;
  const s = probe.s;
  if (probe.top - p.y <= 2.3 || s.y0 > p.y + 0.5) return;
  const dn = p.vx * probe.nx + p.vz * probe.nz;
  const tx = p.vx - dn * probe.nx, tz = p.vz - dn * probe.nz;
  const ts = Math.hypot(tx, tz);
  if (ts < 4.5 || dn > 1.5) return;
  const full = Math.hypot(p.vx, p.vz);
  p.vx = tx / ts * full; p.vz = tz / ts * full;
  // Snap onto the wall so the contact holds from the first frame.
  collide(w, tmp, R + 0.22, 0.35, HEIGHT, probe, true);
  p.x = tmp.x - probe.nx * 0.23; p.z = tmp.z - probe.nz * 0.23;
  p.state = 'wallrun'; p.stateT = 0; p.wallNx = probe.nx; p.wallNz = probe.nz; p.wallTouch = true;
  p.vy = Math.min(Math.max(p.vy, 2.2), 3.5); p.trickT = 0; p.wallUsed = true;
  p.st.walls++; addTrick(p, ev, 'Wall run', 80); ev.push({ type: 'wallrun', v: full });
}

/** React to a wall contact. Returns true if the step should end (bail). */
function respond(w: World, p: Player, inp: Input, ev: Ev[], rad = R): boolean {
  const nx = hit.nx, nz = hit.nz;
  const vn = p.vx * nx + p.vz * nz;
  if (p.state === 'wallrun' && nx * p.wallNx + nz * p.wallNz > 0.7) p.wallTouch = true;
  if (vn >= 0) return false;
  const into = -vn;
  const sp = Math.hypot(p.vx, p.vz);
  const rel = hit.top - p.y;
  if (p.mode === 'foot') {
    const standable = hit.s !== null && hit.s.tint !== 3;
    if (standable && rel <= 1.25 && sp >= 3 && into > 1.5 && (p.state === 'normal' || p.state === 'slide')) {
      p.x -= nx * (R + 0.06); p.z -= nz * (R + 0.06);
      p.y = hit.top + 0.02; p.vy = 0; p.grounded = true; p.state = 'normal'; p.vaultT = 0.28;
      addTrick(p, ev, 'Vault', 50); ev.push({ type: 'vault', v: sp });
      return false;
    }
    if (standable && !p.grounded && rel > 0 && rel <= 2.3 && into > 0.5 && p.state === 'normal') {
      p.state = 'mantle'; p.stateT = 0; p.mantleFrom = p.y; p.mantleTo = hit.top;
      p.wallNx = nx; p.wallNz = nz; p.vx = p.vy = p.vz = 0; p.trickT = 0;
      return false;
    }
    p.vx -= vn * nx; p.vz -= vn * nz;
    if (into > 4) ev.push({ type: 'impact', v: into });
    return false;
  }
  // Snow is soft: anything on wheels or a board rides up onto a drift instead of stopping dead.
  if (hit.s && hit.s.surf === 'snow' && rel <= 1.9 && p.mode !== 'kayak') {
    p.x -= nx * (rad + 0.05); p.z -= nz * (rad + 0.05); p.y = hit.top + 0.02; p.vy = 0; p.grounded = true;
    p.vx *= 0.88; p.vz *= 0.88; ev.push({ type: 'puff', v: into });
    return false;
  }
  if (p.mode === 'drive') {
    p.vx -= vn * nx; p.vz -= vn * nz; if (into > 1) p.dsp *= 0.55;
    if (into > 3) ev.push({ type: 'impact', v: into });
    return false;
  }
  if (p.mode !== 'kayak' && into > (p.mode === 'skate' ? 7 : 6.5)) { ev.push({ type: 'impact', v: into }); bail(p, ev); return true; }
  p.vx -= vn * nx; p.vz -= vn * nz;
  p.vx *= 0.92; p.vz *= 0.92;
  if (into > 2) ev.push({ type: 'impact', v: into });
  return false;
}

function resolveGround(w: World, p: Player, inp: Input, prevY: number, h: number, stepH: number, ev: Ev[]) {
  if (p.grounded) {
    const g = ground(w, p.x, p.z, p.y + stepH);
    if (g.y >= p.y - 0.4) {
      const [gx, gz] = slopeOf(g.s);
      const rate = gx * p.vx + gz * p.vz;
      // Cresting a bank at speed: leave the ground instead of hugging the far side.
      if (p.lastRate > 3.2 && rate < p.lastRate - 3 && (p.mode === 'skate' || p.mode === 'cart') && p.state !== 'manual') {
        p.y = Math.max(p.y, g.y); p.grounded = false; p.vy = Math.min(p.lastRate * 1.15, 12); p.coyote = 0; p.airT = 0; p.lastRate = 0;
        ev.push({ type: 'launch', v: p.vy });
        return;
      }
      p.lastRate = rate;
      p.y = g.y; p.vy = 0; p.surf = surfOf(w, g.s);
      if (p.surf === 'water' && p.mode !== 'kayak') { ev.push({ type: 'splash', v: 0 }); bail(p, ev); return; }
    } else {
      p.grounded = false; p.vy = Math.max(0, Math.min(p.lastRate, 12)); p.coyote = 0.12; p.airT = 0; p.lastRate = 0;
      if (p.state === 'slide') { p.state = 'normal'; p.stateT = 0; }
      if (p.state === 'manual') { addTrick(p, ev, 'Manual', Math.round(p.stateT * 60)); p.state = 'normal'; p.stateT = 0; }
    }
    return;
  }
  p.airT += h; if (p.airT > p.st.air) p.st.air = p.airT;
  const g = ground(w, p.x, p.z, Math.max(prevY, p.y) + 0.12);
  if (p.vy <= 0 && p.y <= g.y) {
    const impact = -p.vy; lastImpact = impact;
    p.y = g.y; p.vy = 0; p.grounded = true; p.surf = surfOf(w, g.s); p.lastRate = 0; p.wallUsed = false;
    if (p.surf === 'water' && p.mode !== 'kayak') { ev.push({ type: 'splash', v: -impactOf(p) }); bail(p, ev); return; }
    if (p.state === 'wallrun') { p.state = 'normal'; p.stateT = 0; }
    ev.push({ type: 'land', v: impact, surf: p.surf });
    // a trick that is nearly round counts, a little sketchy
    if (p.trickT > 0.1) { bail(p, ev); return; }
    if (p.trickT > 0) { p.trickT = 0; addTrick(p, ev, p.trickName, Math.round(p.trickPts * 0.7)); }
    if (p.mode === 'foot') {
      if (inp.crouch && impact > 8) addTrick(p, ev, 'Roll', 40);
      else if (impact > 17) { bail(p, ev); return; }
      else if (impact > 11) { p.vx *= 0.6; p.vz *= 0.6; }
    } else if (impact > 19 && p.surf !== 'snow') { bail(p, ev); return; }
    else if (p.mode === 'drive') p.dsp *= 0.7;
  }
}

/** Bookkeeping that runs at the end of every live step. */
function tail(p: Player, dt: number, ev: Ev[]) {
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > 0.8 && p.state !== 'grind' && p.mode !== 'drive') p.yaw = Math.atan2(p.vz, p.vx);
  p.flowIdle += dt;
  if (p.flowIdle > 1.5) p.flow = Math.max(0, p.flow - 0.1 * dt);
  if (p.grounded && p.mode === 'foot' && p.state === 'normal') {
    p.stride += sp * dt;
    if (p.stride > 1.7) { p.stride = 0; ev.push({ type: 'step', v: sp, surf: p.surf }); }
  }
  if (p.comboN > 0 && p.grounded && p.state === 'normal' && p.trickT <= 0) {
    p.comboLand += dt;
    if (p.comboLand > 0.7) {
      const total = p.comboPts * p.comboN;
      p.score += total; p.lastBank = total; if (total > p.best) p.best = total;
      ev.push({ type: 'bank', v: total });
      p.comboPts = 0; p.comboN = 0; p.comboNames = [];
    }
  } else p.comboLand = 0;
  if (p.grounded && p.state === 'normal' && sp < 16 && !p.tow.rope && p.mode !== 'drive' && (p.surf !== 'water' || p.mode === 'kayak')) {
    p.safeT += dt;
    if (p.safeT > 0.5) { p.safeT = 0; p.safeOld = p.safe; p.safe = [p.x, p.y, p.z, p.yaw]; }
  }
}

export { topAt };
