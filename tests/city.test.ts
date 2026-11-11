// Headless tests for the Assembly Row map: spawns, water, kayak, trains, NPCs, goals,
// traffic, the bungee tow, the mower and the plow, across seasons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCity } from '../src/sim/city';
import { trainAt, ground, makeEnv, World } from '../src/sim/world';
import { makePlayer, step, warp, rebind, context, noInput, DT, Ev, Input, Player } from '../src/sim/player';

const summer = buildCity(makeEnv('summer', 'sunny')), winter = buildCity(makeEnv('winter', 'snowy'));
const w = summer;
function run(wd: World, p: Player, secs: number, f: (t: number, p: Player) => Partial<Input>, ev: Ev[] = [], until?: (p: Player, ev: Ev[]) => boolean) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) { step(wd, p, { ...noInput(), ...f(i * DT, p) }, DT, ev); if (until && until(p, ev)) break; }
  return ev;
}
const has = (ev: Ev[], t: string) => ev.some(e => e.type === t);
const tap = (wd: World, p: Player, ev: Ev[] = []) => { step(wd, p, { ...noInput(), switchMode: true }, DT, ev); step(wd, p, noInput(), DT, ev); return ev; };
const inMap = (wd: World, p: Player) => p.x > wd.minX && p.x < wd.maxX && p.z > wd.minZ && p.z < wd.maxZ && p.y >= wd.baseY - 0.3 && p.y < 120
  && Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz);
const toHitch = (p: Player) => { const t = p.cars[0]; const dx = t.x - t.hx * 3 - p.x, dz = t.z - t.hz * 3 - p.z, d = Math.hypot(dx, dz) || 1; return { mx: dx / d, mz: dz / d }; };

test('every spawn is a safe place to stand, in summer and in snow', () => {
  for (const wd of [summer, winter]) wd.spawns.forEach((s, i) => {
    const p = makePlayer(wd, 0); warp(wd, p, i);
    const ev = run(wd, p, 2, () => ({}));
    assert.ok(!has(ev, 'bail'), `${wd.env.season} ${s.name} bailed: ${ev.map(e => e.type).join(',')}`);
    if (i === 0 || s.tow) return; // the station ramp rolls; the tow spawn is being pulled
    assert.ok(Math.abs(p.y - s.y) < 0.6 && Math.hypot(p.x - s.x, p.z - s.z) < 3, `${wd.env.season} ${s.name} drifted to ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
  });
});

test('holding forward from the station rolls down into the paseo and starts the time trial', () => {
  const p = makePlayer(w, 0);
  const ev = run(w, p, 6, () => ({ mx: -1 }));
  assert.ok(!has(ev, 'bail'), 'bailed: ' + ev.map(e => e.type).join(','));
  assert.ok(p.x < 40 && p.y < 0.2, `ended at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`);
  assert.ok(has(ev, 'trialStart'));
});

test('walking into the river is a splash and a respawn on dry land within 2 s', () => {
  const p = makePlayer(w, 5); p.x = -40; p.y = 0; p.z = -168; p.mode = 'foot';
  run(w, p, 1, () => ({}));
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

test('kayak: launch at the marina, paddle under the highway, land at the boathouse', () => {
  const p = makePlayer(w, 5); p.z = -214;
  assert.equal(context(w, p), 'kayak');
  tap(w, p);
  assert.equal(p.mode, 'kayak');
  const ev = run(w, p, 200, (_, q) => ({ mx: -1, mz: q.z > -212 ? -0.4 : q.z < -226 ? 0.4 : 0 }), [], q => q.x < -438);
  assert.ok(!has(ev, 'bail'));
  assert.ok(p.x < -438, 'only reached x=' + p.x.toFixed(0));
  run(w, p, 30, (_, q) => ({ mx: Math.sign(-442 - q.x) * 0.6, mz: Math.sign(-187 - q.z) * 0.6 }), [], q => Math.hypot(q.x + 442, q.z + 187) < 6);
  const e2 = tap(w, p);
  assert.equal(p.mode, 'foot'); assert.ok(has(e2, 'dock'));
  run(w, p, 1, () => ({}), e2);
  assert.ok(!has(e2, 'bail') && p.y > -0.4, 'not standing on the dock');
});

test('kayak cannot be left mid-river', () => {
  const p = makePlayer(w, 5); p.z = -214; tap(w, p);
  run(w, p, 12, () => ({ mz: -1 }));
  const ev: Ev[] = []; step(w, p, { ...noInput(), switchMode: true }, DT, ev);
  assert.equal(p.mode, 'kayak'); assert.ok(has(ev, 'deny'));
});

test('a moving train is a bail; the third rail is a zap', () => {
  const p = makePlayer(w, 0); p.mode = 'foot'; p.x = 91.9; p.y = 0; p.z = 20; p.grounded = true;
  const ev = run(w, p, 85, () => ({}), [], (_, e) => has(e, 'train'));
  assert.ok(has(ev, 'train') && has(ev, 'bail'));
  assert.ok(trainAt(w.trains[0], 20).on);
  const q = makePlayer(w, 0); q.mode = 'foot'; q.x = 89.0; q.y = 0; q.z = -60; q.grounded = true; q.time = 60;
  const e2 = run(w, q, 2, () => ({ mx: 1 }), [], (_, e) => has(e, 'bail'));
  assert.ok(has(e2, 'zap'));
});

test('rivets, the time trial finish, the court guard and the geese', () => {
  const p = makePlayer(w, 0); p.mode = 'foot';
  const r = w.rivets[14]; p.x = r[0] - 4; p.z = r[2]; p.y = ground(w, p.x, p.z, 1).y;
  let ev = run(w, p, 2, () => ({ mx: 1 }));
  assert.ok(has(ev, 'rivet') && p.rivetN === 1 && p.score >= 500);

  const q = makePlayer(w, 0);
  ev = run(w, q, 3, () => ({ mx: -1 }));
  assert.ok(q.trialT > 0);
  q.x = w.trial!.fx; q.z = w.trial!.fz + 4; q.y = -0.3; q.vx = q.vz = 0; q.mode = 'foot';
  ev = run(w, q, 0.5, () => ({}));
  assert.ok(has(ev, 'finish') && q.trialBest > 0);

  const s = makePlayer(w, 1); s.x = -30; s.z = 106; s.y = 0.1;
  ev = run(w, s, 12, () => ({}), [], (_, e) => has(e, 'busted'));
  assert.ok(has(ev, 'busted') && s.mode === 'foot');

  const g = makePlayer(w, 0); g.mode = 'foot'; g.x = 42; g.z = -156; g.y = 0;
  ev = run(w, g, 10, () => ({}), [], (_, e) => has(e, 'goose'));
  assert.ok(has(ev, 'goose') && has(ev, 'bail'));
});

test('cart down the garage ramp', () => {
  const p = makePlayer(w, 2);
  let minY = 99;
  const ev = run(w, p, 8, (t, q) => { minY = Math.min(minY, q.y); return { mz: 1, jump: t > 0.8 && t < 0.9 }; });
  assert.ok(has(ev, 'hopOn'));
  assert.ok(minY < 5, 'never got below ' + minY.toFixed(1));
});

test('the giraffe can be climbed', () => {
  const p = makePlayer(w, 0); p.mode = 'foot'; p.x = -21.5; p.y = 0.1; p.z = -51; p.grounded = true;
  let top = 0;
  run(w, p, 9, (t, q) => { top = Math.max(top, q.grounded ? q.y : 0); return { mx: q.x < -14.9 ? 1 : 0, jump: q.grounded && q.y > 1 && Math.floor(t * 4) % 2 === 0 }; });
  assert.ok(top >= 5.9, 'highest perch ' + top.toFixed(1));
});

test('traffic keeps to the loop, brakes and honks for someone standing in the road', () => {
  const p = makePlayer(w, 1);
  assert.ok(w.path!.len > 640 && w.path!.len < 720, 'loop length ' + w.path!.len);
  run(w, p, 90, () => ({}));
  for (const c of p.cars) assert.ok(c.x > -104 && c.x < 78 && c.z > -135 && c.z < 82, `${c.kind} left the loop at ${c.x.toFixed(0)},${c.z.toFixed(0)}`);
  assert.equal(p.cars[0].v, 0, 'the truck should wait at the curb');
  const q = makePlayer(w, 1); q.mode = 'foot'; q.x = -95.3; q.y = 0; q.z = 0;
  const ev = run(w, q, 60, () => ({}));
  assert.ok(has(ev, 'honk'), 'nobody honked');
  assert.ok(!has(ev, 'bail'), 'ran over a pedestrian who was standing still');
});

test('riding into moving traffic is a bail', () => {
  const p = makePlayer(w, 1); const c = p.cars[2];
  p.mode = 'skate'; p.x = c.x + c.hx * 5; p.z = c.z + c.hz * 5; p.y = 0; p.vx = -c.hx * 7; p.vz = -c.hz * 7; p.grounded = true;
  const ev = run(w, p, 1, () => ({}), [], (_, e) => has(e, 'bail'));
  assert.ok(has(ev, 'carHit'), ev.map(e => e.type).join(','));
});

test('winter tow: the truck pulls a snowboarder around the loop', () => {
  const p = makePlayer(winter, 0); warp(winter, p, 3);
  assert.ok(p.tow.rope && p.tow.active);
  let top = 0, far = 0; const x0 = p.x, z0 = p.z;
  const ev = run(winter, p, 60, (_, q) => { top = Math.max(top, Math.hypot(q.vx, q.vz)); far = Math.max(far, Math.hypot(q.x - x0, q.z - z0)); return toHitch(q); });
  assert.ok(top > 11, 'top speed only ' + top.toFixed(1));
  assert.ok(far > 150, 'only travelled ' + far.toFixed(0));
  assert.ok(p.tow.active, 'tow session ended');
  assert.ok(p.bails <= 2, `bailed ${p.bails} times just following the truck: ${ev.filter(e => e.type === 'carHit' || e.type === 'impact').length} hits`);
  assert.ok(p.surf === 'snow' || !p.grounded);
  console.log(`    tow: top ${(top * 2.237).toFixed(0)} mph, ${p.bails} bails, ${p.tow.dist.toFixed(0)} m towed in 60 s`);
});

test('digging an edge stretches the bungee, and letting go slingshots', () => {
  const p = makePlayer(winter, 0); warp(winter, p, 3);
  run(winter, p, 7, (_, q) => toHitch(q));
  const before = Math.hypot(p.vx, p.vz);
  let st = 0;
  run(winter, p, 1.6, (_, q) => { st = Math.max(st, q.tow.stretch); return { ...toHitch(q), crouch: true }; });
  assert.ok(st > 2.5, 'stretch only ' + st.toFixed(1));
  let top = 0; const ev: Ev[] = [];
  run(winter, p, 1.5, (_, q) => { top = Math.max(top, Math.hypot(q.vx, q.vz)); return toHitch(q); }, ev);
  assert.ok(has(ev, 'sling'), 'no slingshot');
  assert.ok(top > before + 2.5, `before ${before.toFixed(1)}, after ${top.toFixed(1)}`);
});

test('letting go, and grabbing the bungee again on foot', () => {
  const p = makePlayer(winter, 0); warp(winter, p, 3);
  const ev = tap(winter, p);
  assert.ok(has(ev, 'ropeOff') && !p.tow.active);
  p.mode = 'foot'; p.vx = p.vz = 0;
  run(winter, p, 3, () => ({}));
  assert.equal(context(winter, p), 'tow');
  tap(winter, p, ev);
  assert.ok(p.tow.rope && p.mode === 'skate');
});

test('snowbanks: soft to hit, and cresting one at speed gets air', () => {
  const p = makePlayer(winter, 1); p.mode = 'skate'; p.x = -94; p.y = 0; p.z = -31; p.vx = -10; p.vz = -2; p.grounded = true;
  const ev = run(winter, p, 1.2, () => ({}));
  assert.ok(has(ev, 'launch'), ev.map(e => e.type).join(','));
  assert.ok(!has(ev, 'bail'));
  const q = makePlayer(winter, 1); q.mode = 'skate'; q.x = -85; q.y = 0; q.z = -58; q.vx = 0; q.vz = 12; q.grounded = true; // straight into a bank's end
  const e2 = run(winter, q, 1, () => ({}));
  assert.ok(has(e2, 'puff') && !has(e2, 'bail'), e2.map(e => e.type).join(','));
});

test('summer: the ride-on mower cuts the lawn', () => {
  const p = makePlayer(w, 0); warp(w, p, 4);
  assert.equal(context(w, p), 'mower');
  const ev = tap(w, p);
  assert.equal(p.mode, 'drive'); assert.ok(has(ev, 'ride'));
  run(w, p, 3, () => ({ mz: -1 }), ev); run(w, p, 14, (t) => ({ mx: 1, mz: Math.sin(t) * 0.2 }), ev);
  assert.ok(p.fieldN > 35, 'cut only ' + p.fieldN + ' cells');
  assert.ok(has(ev, 'mow') && !has(ev, 'bail'));
  tap(w, p, ev);
  assert.equal(p.mode, 'foot'); assert.ok(has(ev, 'rideOff'));
  assert.ok(Math.hypot(p.rides[0].x - p.x, p.rides[0].z - p.z) < 3, 'the mower should stay where it was parked');
});

test('winter: the snowplow clears the lot and reports progress', () => {
  const p = makePlayer(winter, 0); warp(winter, p, 4);
  assert.equal(context(winter, p), 'plow');
  const ev = tap(winter, p);
  assert.equal(p.mode, 'drive');
  // long passes across the lot, with wide turns between them
  const wp = [[-174, -60], [-174, -77], [-110, -77], [-110, -94], [-174, -94], [-174, -43], [-110, -43], [-110, -26], [-174, -26]]; let k = 0;
  run(winter, p, 150, (_, q) => {
    if (k < wp.length - 1 && Math.hypot(wp[k][0] - q.x, wp[k][1] - q.z) < 6) k++;
    const dx = wp[k][0] - q.x, dz = wp[k][1] - q.z, d = Math.hypot(dx, dz) || 1;
    return { mx: dx / d, mz: dz / d };
  }, ev, q => q.fieldMile >= 1);
  assert.ok(p.fieldMile >= 1, `cleared ${(p.fieldN / p.fieldTotal * 100).toFixed(0)}%`);
  assert.ok(has(ev, 'fieldDone'));
});

test('changing the season mid-game keeps the player and rebuilds the rest', () => {
  const p = makePlayer(w, 1); run(w, p, 2, () => ({ mz: 1 }));
  p.vx = p.vz = 0; const x = p.x, z = p.z, score = p.score;
  rebind(winter, p);
  const ev = run(winter, p, 2, () => ({}));
  assert.ok(!has(ev, 'bail')); assert.ok(Math.hypot(p.x - x, p.z - z) < 12); assert.equal(p.score, score);
  assert.ok(p.cars.some(c => c.kind === 'plow'));
  assert.equal(p.surf, 'snow');
});

for (const [name, wd] of [['summer', summer], ['winter', winter], ['fall', buildCity(makeEnv('fall', 'blustery'))]] as [string, World][]) {
  test(`fuzz: 12 minutes of seeded random input in ${name}`, () => {
    const play = () => {
      const p = makePlayer(wd, 0); let s = 777; let cur: Partial<Input> = {};
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      let bailT = 0, maxBail = 0;
      for (let i = 0; i < 12 * 3600; i++) {
        if (i % 25 === 0) { const a = rnd() * 6.283; cur = { mx: Math.cos(a), mz: Math.sin(a), jump: rnd() < 0.3, crouch: rnd() < 0.2, trick: rnd() < 0.1, switchMode: rnd() < 0.06, bail: rnd() < 0.004 }; }
        if (i % 2400 === 0 && i) warp(wd, p, (i / 2400) % wd.spawns.length);
        step(wd, p, { ...noInput(), ...cur }, DT, []);
        if (p.state === 'bail') { bailT += DT; maxBail = Math.max(maxBail, bailT); } else bailT = 0;
        if (!inMap(wd, p)) throw new Error(`step ${i}: out of the map at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} mode ${p.mode} state ${p.state}`);
      }
      return { sig: [p.x, p.y, p.z, p.score, p.bails, p.rivetN, p.fieldN].join('|'), maxBail, bails: p.bails };
    };
    const a = play(), b = play();
    assert.equal(a.sig, b.sig); assert.ok(a.maxBail <= 2, 'longest bail ' + a.maxBail);
    console.log(`    ${name} fuzz: ${a.bails} bails, longest ${a.maxBail.toFixed(2)} s`);
  });
}

test('city simulation cost per step', () => {
  const p = makePlayer(winter, 3); const n = 20000; const t0 = performance.now();
  for (let i = 0; i < n; i++) step(winter, p, { ...noInput(), ...toHitch(p), jump: i % 90 < 5 }, DT, []);
  const us = (performance.now() - t0) / n * 1000;
  console.log(`    city sim: ${us.toFixed(1)} µs per step (${(us / 16667 * 100).toFixed(2)}% of a 60 fps frame), ${winter.solids.length} solids, ${winter.npcs.length} NPCs, ${p.cars.length} vehicles`);
  assert.ok(us < 3000);
});
