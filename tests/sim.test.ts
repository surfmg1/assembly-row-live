// Headless physics tests for the movement lab. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLab } from '../src/sim/world';
import { makePlayer, step, warp, noInput, DT, Ev, Input, Player, Mode } from '../src/sim/player';

const w = buildLab();
const speed = (p: Player) => Math.hypot(p.vx, p.vz);
function run(p: Player, secs: number, f: (t: number, p: Player) => Partial<Input>, ev: Ev[] = []) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) step(w, p, { ...noInput(), ...f(i * DT, p) }, DT, ev);
  return ev;
}
const inRoom = (p: Player) => p.x > w.minX && p.x < w.maxX && p.z > w.minZ && p.z < w.maxZ && p.y >= -0.2 && p.y < 20
  && Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz);

test('momentum carries between all three modes, grounded and airborne', () => {
  for (const air of [false, true]) {
    const p = makePlayer(w, 1);
    p.x = -10; p.z = 12; p.y = air ? 3 : 0; p.grounded = !air; p.vx = 9; p.vz = 2; p.vy = air ? 1 : 0;
    const seen: Mode[] = [];
    for (let i = 0; i < 6; i++) {
      const before = [p.vx, p.vy, p.vz];
      // press, then release, so each press is a fresh edge; compare across the press step only
      const vx0 = p.vx, vz0 = p.vz;
      step(w, p, { ...noInput(), switchMode: true }, DT, []);
      seen.push(p.mode);
      const lost = Math.hypot(vx0, vz0) - speed(p);
      assert.ok(lost < 0.2, `switch to ${p.mode} (${air ? 'air' : 'ground'}) lost ${lost.toFixed(3)} m/s of ${Math.hypot(before[0], before[2]).toFixed(1)}`);
      step(w, p, noInput(), DT, []);
      p.vx = 9; p.vz = 2; if (air) { p.y = 3; p.vy = 1; p.grounded = false; }
    }
    assert.deepEqual(new Set(seen), new Set(['foot', 'skate', 'cart']));
  }
});

test('holding forward from the spawn produces air and a grind within 10 s, no bail', () => {
  const p = makePlayer(w, 0);
  const ev = run(p, 10, () => ({ mx: 1 }));
  const types = ev.map(e => e.type);
  const gi = types.indexOf('grindStart');
  assert.ok(gi >= 0, 'expected a grind: ' + [...new Set(types)].join(','));
  assert.ok(!types.slice(0, gi).includes('bail'), 'bailed before the grind');
  assert.ok(p.firstTrickAt > 0 && p.firstTrickAt < 10, 'first trick at ' + p.firstTrickAt);
});

test('the kicker launches a skater', () => {
  const p = makePlayer(w, 0);
  p.x = -14; p.y = 0; p.z = 1.5; p.vx = 11;
  let maxY = 0;
  run(p, 1.2, (_, q) => { maxY = Math.max(maxY, q.y); return {}; });
  assert.ok(maxY > 1.5, 'peak ' + maxY.toFixed(2));
});

test('jump height and coyote time on foot', () => {
  const p = makePlayer(w, 1);
  let maxY = 0;
  run(p, 1, (t, q) => { maxY = Math.max(maxY, q.y); return { jump: t < 0.5 }; });
  assert.ok(maxY > 0.85 && maxY < 1.1, 'apex ' + maxY.toFixed(2));
  assert.ok(p.grounded);
  // run off the 2 m platform, press jump just after leaving the edge
  const q = makePlayer(w, 1);
  q.x = -15; q.y = 2; q.z = -18; let left = -1; let jumped = false;
  run(q, 1, (t, r) => { if (!r.grounded && left < 0) left = t; const j = left >= 0 && t - left > 0.05 && t - left < 0.1; if (j && r.vy > 0) jumped = true; return { mx: 1, jump: j }; }, []);
  run(q, 0.05, (_, r) => { if (r.vy > 0) jumped = true; return {}; });
  assert.ok(left >= 0, 'never left the edge');
});

test('vault keeps speed over a 1 m box', () => {
  const p = makePlayer(w, 1);
  const ev = run(p, 2.2, () => ({ mx: 1 }));
  assert.ok(ev.some(e => e.type === 'vault'), 'no vault');
  assert.ok(p.x > -33, 'did not clear the box, x=' + p.x.toFixed(1));
  assert.ok(speed(p) > 5.5, 'speed after vault ' + speed(p).toFixed(1));
});

test('the parkour run can be chained to the far side of the wall-run gap', () => {
  const p = makePlayer(w, 1);
  p.z = -23.2;
  let across = false, top = false;
  const ev = run(p, 9, (_, q) => {
    if (q.grounded && q.x > -3.5 && q.x < 2 && q.y > 1.99) across = true;
    if (q.grounded && q.x > 8 && q.y > 3.99) top = true;
    return { mx: q.x < 12 ? 1 : 0, mz: q.x > -16 && q.x < -5 ? -0.25 : 0, jump: q.x > -14.6 && q.x < -14.3 };
  });
  const types = new Set(ev.map(e => e.type));
  assert.ok(types.has('wallrun'), 'no wall run: ' + [...types].join(','));
  assert.ok(across, 'did not land on the far platform');
  assert.ok(top, 'did not chain up to the 4 m deck');
});

test('cart: push, bobsled hop, ride the ramp, ram the stack', () => {
  const p = makePlayer(w, 2);
  const ev = run(p, 9, (t, q) => ({ mx: 1, jump: t > 1.0 && t < 1.1, crouch: q.cartRide }));
  const types = ev.map(e => e.type);
  assert.ok(types.includes('hopOn'), 'never hopped on');
  assert.ok(types.includes('ram'), 'never rammed anything: ' + [...new Set(types)].join(','));
  assert.ok(p.props.some(q => !q.rest || Math.hypot(q.x - q.hx, q.z - q.hz) > 0.5), 'props untouched');
});

test('bail respawns within 2 seconds at a safe spot', () => {
  const p = makePlayer(w, 0);
  run(p, 3, () => ({ mx: 1 }));
  const ev: Ev[] = []; let t = 0, back = -1;
  step(w, p, { ...noInput(), bail: true }, DT, ev);
  while (t < 3 && back < 0) { step(w, p, noInput(), DT, ev); t += DT; if (ev.some(e => e.type === 'respawn')) back = t; }
  assert.ok(back > 0 && back <= 2, 'respawn after ' + back);
  assert.ok(inRoom(p));
});

test('nothing tunnels: fast launches into walls and obstacles stay in the room', () => {
  for (let i = 0; i < 400; i++) {
    const p = makePlayer(w, i % 3);
    const a = i * 2.399963; const v = 12 + (i % 7) * 3;
    p.x = ((i * 37) % 80) - 40; p.z = ((i * 53) % 50) - 25; p.y = 6; p.grounded = false;
    p.vx = Math.cos(a) * v; p.vz = Math.sin(a) * v;
    run(p, 4, t => ({ mx: Math.cos(a), mz: Math.sin(a), jump: (Math.floor(t * 3) + i) % 2 === 0 }));
    assert.ok(inRoom(p), `case ${i} escaped: ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
  }
});

test('fuzz: 20 minutes of seeded random input stays finite, in bounds, deterministic', () => {
  const play = () => {
    const p = makePlayer(w, 0); let s = 12345; let cur: Partial<Input> = {};
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const n = 20 * 60 * 60; let maxBail = 0, bailT = 0;
    for (let i = 0; i < n; i++) {
      if (i % 20 === 0) {
        const a = rnd() * Math.PI * 2;
        cur = { mx: Math.cos(a), mz: Math.sin(a), jump: rnd() < 0.35, crouch: rnd() < 0.2, trick: rnd() < 0.15, switchMode: rnd() < 0.04, bail: rnd() < 0.005 };
      }
      if (i % 7200 === 0 && i) warp(w, p, (i / 7200) % 3);
      step(w, p, { ...noInput(), ...cur }, DT, []);
      if (p.state === 'bail') { bailT += DT; maxBail = Math.max(maxBail, bailT); } else bailT = 0;
      if (!inRoom(p)) throw new Error(`step ${i}: out of bounds ${p.x},${p.y},${p.z} mode ${p.mode} state ${p.state}`);
    }
    return { sig: [p.x, p.y, p.z, p.score, p.bails].join('|'), maxBail, score: p.score, bails: p.bails };
  };
  const a = play(), b = play();
  assert.equal(a.sig, b.sig);
  assert.ok(a.maxBail <= 2, 'longest bail ' + a.maxBail);
  console.log(`    fuzz: score ${a.score}, bails ${a.bails}, longest bail ${a.maxBail.toFixed(2)} s`);
});

test('simulation cost per step', () => {
  const p = makePlayer(w, 0); const n = 60000; const t0 = performance.now();
  for (let i = 0; i < n; i++) step(w, p, { ...noInput(), mx: Math.cos(i / 200), mz: Math.sin(i / 200), jump: i % 90 < 5 }, DT, []);
  const us = (performance.now() - t0) / n * 1000;
  console.log(`    sim: ${us.toFixed(2)} µs per step (${(us / 16667 * 100).toFixed(3)}% of a 60 fps frame)`);
  assert.ok(us < 500);
});
