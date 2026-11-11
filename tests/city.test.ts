// Headless tests for the Assembly Row map: spawns, water, kayak, trains, NPCs, goals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCity } from '../src/sim/city';
import { trainAt, ground } from '../src/sim/world';
import { makePlayer, step, warp, noInput, DT, Ev, Input, Player } from '../src/sim/player';

const w = buildCity();
function run(p: Player, secs: number, f: (t: number, p: Player) => Partial<Input>, ev: Ev[] = [], until?: (p: Player, ev: Ev[]) => boolean) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) { step(w, p, { ...noInput(), ...f(i * DT, p) }, DT, ev); if (until && until(p, ev)) break; }
  return ev;
}
const has = (ev: Ev[], t: string) => ev.some(e => e.type === t);
const inMap = (p: Player) => p.x > w.minX && p.x < w.maxX && p.z > w.minZ && p.z < w.maxZ && p.y >= w.baseY - 0.3 && p.y < 120
  && Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz);

test('every spawn is a safe place to stand', () => {
  w.spawns.forEach((s, i) => {
    const p = makePlayer(w, 0); warp(w, p, i);
    const ev = run(p, 2, () => ({}));
    assert.ok(!has(ev, 'bail'), s.name + ' bailed: ' + ev.map(e => e.type).join(','));
    if (i === 0 || i === 2) return; // these two start on a ramp and are meant to roll
    assert.ok(Math.abs(p.y - s.y) < 0.6 && Math.hypot(p.x - s.x, p.z - s.z) < 3, `${s.name} drifted to ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
  });
});

test('holding forward from the station rolls down onto Foley Street and starts the time trial', () => {
  const p = makePlayer(w, 0);
  const ev = run(p, 6, () => ({ mx: -1 }));
  assert.ok(!has(ev, 'bail'), 'bailed: ' + ev.map(e => e.type).join(','));
  assert.ok(p.x < 30 && p.y < 0.2, `ended at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`);
  assert.ok(has(ev, 'trialStart'));
});

test('walking into the river is a splash and a respawn on dry land within 2 s', () => {
  const p = makePlayer(w, 4); p.x = 0; p.y = 0; p.z = -170; p.mode = 'foot';
  run(p, 1, () => ({}));
  const ev: Ev[] = []; let t = 0, splashAt = -1, backAt = -1;
  while (t < 8 && backAt < 0) {
    step(w, p, { ...noInput(), mz: -1 }, DT, ev); t += DT;
    if (splashAt < 0 && has(ev, 'splash')) splashAt = t;
    if (has(ev, 'respawn')) backAt = t;
  }
  assert.ok(splashAt > 0, 'no splash');
  assert.ok(backAt - splashAt <= 2, 'respawn took ' + (backAt - splashAt));
  assert.ok(p.z > -176 && p.y >= -0.01, 'respawned in the water');
});

test('kayak: launch at Baxter dock, paddle under I-93, land at the boathouse', () => {
  const p = makePlayer(w, 4);
  step(w, p, { ...noInput(), switchMode: true }, DT, []); step(w, p, noInput(), DT, []);
  assert.equal(p.mode, 'kayak');
  const ev = run(p, 150, (_, q) => ({ mx: -1, mz: q.z > -205 ? -0.4 : q.z < -230 ? 0.4 : 0 }), [], q => q.x < -438);
  assert.ok(!has(ev, 'bail'));
  assert.ok(p.x < -438, 'only reached x=' + p.x.toFixed(0));
  run(p, 30, (_, q) => ({ mx: Math.sign(-442 - q.x) * 0.6, mz: Math.sign(-187 - q.z) * 0.6 }), [], q => Math.hypot(q.x + 442, q.z + 187) < 6);
  const e2: Ev[] = [];
  step(w, p, { ...noInput(), switchMode: true }, DT, e2);
  assert.equal(p.mode, 'foot'); assert.ok(has(e2, 'dock'));
  run(p, 1, () => ({}), e2);
  assert.ok(!has(e2, 'bail') && p.y > -0.4, 'not standing on the dock');
});

test('kayak cannot be left mid-river', () => {
  const p = makePlayer(w, 4);
  step(w, p, { ...noInput(), switchMode: true }, DT, []); step(w, p, noInput(), DT, []);
  run(p, 12, () => ({ mz: -1 }));
  const ev: Ev[] = []; step(w, p, { ...noInput(), switchMode: true }, DT, ev);
  assert.equal(p.mode, 'kayak'); assert.ok(has(ev, 'deny'));
});

test('a moving train is a bail; a stopped one is a wall', () => {
  const p = makePlayer(w, 0); p.mode = 'foot'; p.x = 91.9; p.y = 0; p.z = 20; p.grounded = true;
  const ev = run(p, 85, () => ({}), [], (_, e) => has(e, 'train'));
  assert.ok(has(ev, 'train') && has(ev, 'bail'));
  // find a moment when the west train is stopped and stand beside it
  let t = 0; while (!(trainAt(w.trains[0], t).on && trainAt(w.trains[0], t).v === 0)) t += 0.5;
  const q = makePlayer(w, 0); q.mode = 'foot'; q.time = t + 1; q.x = 89.2; q.y = 0; q.z = 120; q.grounded = true;
  const e2 = run(q, 3, () => ({ mx: 1 }));
  assert.ok(!has(e2, 'train'), 'stopped train hurt'); assert.ok(q.x < 90.5, 'walked through the train: x=' + q.x.toFixed(2));
});

test('the third rail', () => {
  const p = makePlayer(w, 0); p.mode = 'foot'; p.x = 89.0; p.y = 0; p.z = -60; p.grounded = true; p.time = 60;
  const ev = run(p, 2, () => ({ mx: 1 }), [], (_, e) => has(e, 'bail'));
  assert.ok(has(ev, 'zap'));
});

test('rivets, the time trial finish, the guard and the geese', () => {
  const p = makePlayer(w, 0); p.mode = 'foot';
  const r = w.rivets[15]; p.x = r[0] - 4; p.z = r[2]; p.y = ground(w, p.x, p.z, 1).y;
  let ev = run(p, 2, () => ({ mx: 1 }));
  assert.ok(has(ev, 'rivet') && p.rivetN === 1 && p.score >= 500);

  const q = makePlayer(w, 0);
  ev = run(q, 3, () => ({ mx: -1 }));
  assert.ok(q.trialT > 0);
  q.x = w.trial!.fx; q.z = w.trial!.fz + 4; q.y = -0.3; q.vx = q.vz = 0; q.mode = 'foot';
  ev = run(q, 0.5, () => ({}));
  assert.ok(has(ev, 'finish') && q.trialBest > 0);

  const s = makePlayer(w, 1); s.x = 20; s.z = 34; s.y = 0.1;
  ev = run(s, 12, () => ({}), [], (_, e) => has(e, 'busted'));
  assert.ok(has(ev, 'busted') && s.mode === 'foot');

  const g = makePlayer(w, 0); g.mode = 'foot'; g.x = 30; g.z = -160; g.y = 0;
  ev = run(g, 10, () => ({}), [], (_, e) => has(e, 'goose'));
  assert.ok(has(ev, 'goose') && has(ev, 'bail'));
});

test('cart down the garage switchback', () => {
  const p = makePlayer(w, 2);
  let minY = 99;
  const ev = run(p, 7, (t, q) => { minY = Math.min(minY, q.y); return { mx: -1, jump: t > 0.8 && t < 0.9 }; });
  assert.ok(has(ev, 'hopOn'));
  assert.ok(minY < 6, 'never got below ' + minY.toFixed(1));
});

test('the giraffe can be climbed', () => {
  const p = makePlayer(w, 0); p.mode = 'foot'; p.x = -14; p.y = 0.1; p.z = -116; p.grounded = true;
  let top = 0;
  run(p, 9, (t, q) => { top = Math.max(top, q.grounded ? q.y : 0); return { mx: q.x < -6.4 ? 1 : 0, jump: q.grounded && q.y > 1 && Math.floor(t * 4) % 2 === 0 }; });
  assert.ok(top >= 5.9, 'highest perch ' + top.toFixed(1));
});

test('fuzz: 20 minutes of seeded random input across the city', () => {
  const play = () => {
    const p = makePlayer(w, 0); let s = 777; let cur: Partial<Input> = {};
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    let bailT = 0, maxBail = 0;
    for (let i = 0; i < 20 * 3600; i++) {
      if (i % 25 === 0) { const a = rnd() * 6.283; cur = { mx: Math.cos(a), mz: Math.sin(a), jump: rnd() < 0.3, crouch: rnd() < 0.2, trick: rnd() < 0.1, switchMode: rnd() < 0.06, bail: rnd() < 0.004 }; }
      if (i % 3000 === 0 && i) warp(w, p, (i / 3000) % w.spawns.length);
      step(w, p, { ...noInput(), ...cur }, DT, []);
      if (p.state === 'bail') { bailT += DT; maxBail = Math.max(maxBail, bailT); } else bailT = 0;
      if (!inMap(p)) throw new Error(`step ${i}: out of the map at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} mode ${p.mode} state ${p.state}`);
    }
    return { sig: [p.x, p.y, p.z, p.score, p.bails, p.rivetN].join('|'), maxBail, bails: p.bails };
  };
  const a = play(), b = play();
  assert.equal(a.sig, b.sig); assert.ok(a.maxBail <= 2);
  console.log(`    city fuzz: ${a.bails} bails, longest ${a.maxBail.toFixed(2)} s`);
});

test('city simulation cost per step', () => {
  const p = makePlayer(w, 1); const n = 20000; const t0 = performance.now();
  for (let i = 0; i < n; i++) step(w, p, { ...noInput(), mx: Math.cos(i / 300), mz: Math.sin(i / 300), jump: i % 90 < 5 }, DT, []);
  const us = (performance.now() - t0) / n * 1000;
  console.log(`    city sim: ${us.toFixed(1)} µs per step (${(us / 16667 * 100).toFixed(2)}% of a 60 fps frame), ${w.solids.length} solids, ${w.npcs.length} NPCs`);
  assert.ok(us < 2000);
});
