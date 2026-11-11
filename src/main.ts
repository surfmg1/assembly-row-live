// Browser entry point. The city is the default; add #lab to the address for the grey movement lab.
import { buildLab, topAt, trainAt, World } from './sim/world';
import { buildCity } from './sim/city';
import { makePlayer, step, warp, DT, Ev, Input, Mode } from './sim/player';
import { Renderer, Instances } from './render/renderer';
import { buildStatic, buildDynamic, View } from './render/scene';
import { perspective, lookAt, mul } from './render/mat';
import { Controls } from './input';
import { Sound } from './audio';

const $ = (id: string) => document.getElementById(id)!;
const BAILS = ['Wicked bail.', 'You got Storrowed.', 'Nobody saw that.', 'The geese saw that.', 'Walk it off.'];
const MODE_NAME: Record<Mode, string> = { foot: 'Parkour', skate: 'Skate', cart: 'Cart', kayak: 'Kayak' };
const LABELS: Record<Mode, { jump: string; crouch: string; trick: string }> = {
  foot: { jump: 'Jump', crouch: 'Slide', trick: 'Flip' },
  skate: { jump: 'Ollie', crouch: 'Manual', trick: 'Kickflip' },
  cart: { jump: 'Hop', crouch: 'Tuck', trick: '360' },
  kayak: { jump: '·', crouch: '·', trick: '·' },
};
const clock = (t: number) => Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60).toFixed(1);

function start() {
  const canvas = $('gl') as HTMLCanvasElement, stage = $('stage');
  let renderer: Renderer;
  try { renderer = new Renderer(canvas); } catch (e) {
    const f = $('fail'); f.hidden = false; f.textContent = 'This game needs WebGL2, which this browser or device has turned off. Try a current Chrome, Safari, Firefox or Edge.';
    return;
  }
  const lab = location.hash === '#lab';
  const w: World = lab ? buildLab() : buildCity(), city = w.kind === 'city';
  const p = makePlayer(w, 0);
  const FOG = city ? [0.80, 0.86, 0.93] : [0.905, 0.912, 0.925];
  document.documentElement.style.setProperty('--concrete', city ? '#ccdbed' : '#e7e9ec');
  const st = buildStatic(w); renderer.setStatic(st.cubes, st.wedges);
  const dyn = new Instances(1024), view: View = { phase: 0, y: p.y };
  const controls = new Controls(stage, $('stick'), $('nub')), sound = new Sound();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.onGesture = () => sound.start();
  const setMute = (m: boolean) => { sound.setMuted(m); $('muteBtn').textContent = m ? 'Sound off' : 'Sound on'; $('muteBtn').setAttribute('aria-pressed', String(m)); };
  controls.onMute = () => setMute(!sound.muted);
  $('muteBtn').addEventListener('click', () => { sound.start(); setMute(!sound.muted); });
  $('statsBtn').addEventListener('click', () => { const s = $('stats'); s.hidden = !s.hidden; $('statsBtn').setAttribute('aria-expanded', String(!s.hidden)); });
  const linesEl = $('lines');
  w.spawns.forEach((s, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'warp' + i; b.textContent = s.name;
    b.addEventListener('click', () => { controls.warp = i; sound.start(); b.blur(); });
    linesEl.insertBefore(b, $('statsBtn'));
  });
  $('goal').hidden = !city;
  let best = 0;
  try { best = Number(localStorage.getItem('arl-trial-best')) || 0; } catch (e) { /* storage is optional */ }
  p.trialBest = best;

  const cam = { yaw: p.yaw, user: 0, pitch: 0.3, dist: 6, idle: 9, x: 0, y: 0, z: 0 };
  let shake = 0, last = performance.now(), acc = 0, hudT = 0, tipUntil = 14, flash = '', flashT = 0, simUs = 0, zoneName = '';
  const frames: number[] = []; let fpsMed = 0, fpsLow = 0;
  const ev: Ev[] = [];
  const inp: Input = { mx: 0, mz: 0, jump: false, crouch: false, trick: false, switchMode: false, bail: false };
  let lastMode = '', lastDock = false, trainWas = [false, false];
  const say = (text: string, secs = 1.8) => { flash = text; flashT = secs; };

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  }

  function blocked(x: number, y: number, z: number) {
    if (x < w.minX + 0.3 || x > w.maxX - 0.3 || z < w.minZ + 0.3 || z > w.maxZ - 0.3) return true;
    for (const s of w.solids) {
      if (x < s.x0 - 0.2 || x > s.x1 + 0.2 || z < s.z0 - 0.2 || z > s.z1 + 0.2 || y < s.y0 - 0.2) continue;
      if (y < topAt(s, x, z) + 0.25) return true;
    }
    return false;
  }
  const nearDock = () => {
    for (const d of w.docks) {
      if (p.mode === 'kayak' ? Math.hypot(p.x - d.wx, p.z - d.wz) < 12 : Math.hypot(p.x - d.lx, p.z - d.lz) < 8 && Math.abs(p.y - d.ly) < 1.5) return true;
    }
    return false;
  };

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (dt > 0) { frames.push(dt); if (frames.length > 300) frames.shift(); }
    resize();
    controls.poll();
    if (controls.warp >= 0 && controls.warp < w.spawns.length) { warp(w, p, controls.warp); cam.yaw = p.yaw; cam.user = 0; view.y = p.y; tipUntil = p.time + 12; }
    controls.warp = -1;

    const vy = cam.yaw + cam.user, fx = Math.cos(vy), fz = Math.sin(vy);
    inp.mx = fx * controls.sy - fz * controls.sx; inp.mz = fz * controls.sy + fx * controls.sx;
    inp.jump = controls.jump; inp.crouch = controls.crouch; inp.trick = controls.trick; inp.switchMode = controls.switchMode; inp.bail = controls.bail;

    acc += dt; ev.length = 0; let n = 0; const t0 = performance.now();
    while (acc >= DT && n < 5) { step(w, p, inp, DT, ev); acc -= DT; n++; }
    if (n === 5) acc = 0;
    if (n) simUs = simUs * 0.95 + (performance.now() - t0) / n * 1000 * 0.05;

    let why = '';
    for (const e of ev) {
      if (e.type === 'land') shake += Math.min(0.5, e.v * 0.022);
      else if (e.type === 'impact') shake += Math.min(0.6, e.v * 0.05);
      else if (e.type === 'ram') shake += 0.18;
      else if (e.type === 'splash') why = 'Splash. The Mystic says hi.';
      else if (e.type === 'train') why = 'Stand clear of the closing doors.';
      else if (e.type === 'zap') why = 'That was the third rail.';
      else if (e.type === 'goose') why = 'Goosed.';
      else if (e.type === 'bail') { shake += 0.7; say(why || BAILS[p.bails % BAILS.length]); }
      else if (e.type === 'busted') { say('Busted. No skating in the hotel plaza.', 2.6); cam.yaw = p.yaw; cam.user = 0; view.y = p.y; }
      else if (e.type === 'bank') say('+' + e.v.toLocaleString('en-US'), 1.4);
      else if (e.type === 'rivet') say('Ford rivet ' + e.v + ' of ' + w.rivets.length, 2);
      else if (e.type === 'trialStart') say('Station to the boathouse. Go.', 2);
      else if (e.type === 'finish') {
        say('Boathouse in ' + clock(e.v) + (p.trialBest === e.v ? '. New best.' : ''), 4);
        try { localStorage.setItem('arl-trial-best', String(p.trialBest)); } catch (err) { /* optional */ }
      }
      else if (e.type === 'dock') { say(e.v ? 'Kayak launched' : 'Back on the dock', 1.6); view.y = p.y; tipUntil = p.time + 10; }
      else if (e.type === 'deny') say('Paddle to a dock to get out.', 1.6);
      else if (e.type === 'switch') tipUntil = p.time + 10;
    }
    sound.events(ev); sound.frame(p);
    // The arrival chime, when a train pulls in within earshot.
    w.trains.forEach((tr, i) => {
      const s = trainAt(tr, p.time), stopped = s.on && s.v === 0;
      if (stopped && !trainWas[i] && Math.hypot(p.x - 98, p.z - s.z) < 160) sound.chime();
      trainWas[i] = stopped;
    });

    // Chase camera.
    const sp = Math.hypot(p.vx, p.vz), k = Math.min(1, sp / 18), bailed = p.state === 'bail';
    if (controls.camDX || controls.camDY) { cam.user -= controls.camDX * 0.006; cam.pitch = Math.max(0.06, Math.min(1.15, cam.pitch + controls.camDY * 0.004)); cam.idle = 0; controls.camDX = controls.camDY = 0; }
    cam.idle += dt;
    if (sp > 1.5 && !bailed) {
      let d = Math.atan2(p.vz, p.vx) - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      cam.yaw += d * Math.min(1, dt * 2.6 * Math.min(1, sp / 5));
      if (cam.idle > 1.2) cam.user *= Math.exp(-dt * 1.6);
    }
    const yaw = cam.yaw + cam.user, cp = Math.cos(cam.pitch), spn = Math.sin(cam.pitch);
    const tx = bailed ? p.rag.x : p.x, ty = (bailed ? p.rag.y - 0.3 : view.y + 1.15), tz = bailed ? p.rag.z : p.z;
    const want = (p.mode === 'kayak' ? 7.5 : 5.4) + k * 2.4; let free = want;
    for (let i = 1; i <= 10; i++) {
      const d = want * i / 10;
      if (blocked(tx - Math.cos(yaw) * cp * d, ty + spn * d, tz - Math.sin(yaw) * cp * d)) { free = Math.max(0.8, want * (i - 1) / 10); break; }
    }
    cam.dist += (free - cam.dist) * Math.min(1, dt * (free < cam.dist ? 14 : 3));
    shake *= Math.exp(-dt * 7); const sh = calm ? 0 : shake;
    cam.x = tx - Math.cos(yaw) * cp * cam.dist + Math.sin(now * 0.071) * sh * 0.25;
    cam.y = ty + spn * cam.dist + Math.sin(now * 0.093) * sh * 0.25;
    cam.z = tz - Math.sin(yaw) * cp * cam.dist + Math.sin(now * 0.059) * sh * 0.25;
    const aspect = canvas.width / canvas.height;
    const base = (60 + (calm ? 0 : 16 * k * k)) * Math.PI / 180;
    const fovy = Math.min(1.85, 2 * Math.atan(Math.tan(base / 2) * Math.pow(Math.max(1, 1 / aspect), 0.75)));
    const vp = mul(perspective(fovy, aspect, city ? 0.25 : 0.1, city ? 1600 : 260), lookAt(cam.x, cam.y, cam.z, tx, ty + 0.2, tz));

    buildDynamic(dyn, w, p, view, dt);
    const shY = bailed ? p.rag.y - 0.3 : view.y;
    renderer.draw(vp, [cam.x, cam.y, cam.z], [tx, shY + 0.05, tz], FOG, dyn, p.time, city ? 160 : 40, city ? 1500 : 120);

    // HUD.
    ($('flow') as HTMLElement).style.transform = `scaleX(${p.state === 'manual' ? p.stateT / 3 : p.flow})`;
    $('flow').classList.toggle('risk', p.state === 'manual');
    if (!calm) ($('streaks') as HTMLElement).style.opacity = String(Math.max(0, Math.min(0.55, (sp - 9) / 14)));
    flashT -= dt; hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      let zn = '';
      for (const z of w.zones) if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1) { zn = z.name; break; }
      if (zn !== zoneName) { zoneName = zn; $('zone').textContent = zn; }
      $('speed').textContent = String(Math.round(sp * 2.23694));
      $('score').textContent = p.score.toLocaleString('en-US');
      if (city) $('goal').textContent = 'Rivets ' + p.rivetN + '/' + w.rivets.length + (p.trialBest ? ' · best ' + clock(p.trialBest) : '');
      const dock = city && nearDock();
      if (p.mode !== lastMode || dock !== lastDock) {
        lastMode = p.mode; lastDock = dock; $('mode').textContent = MODE_NAME[p.mode];
        const l = LABELS[p.mode];
        $('bJump').textContent = l.jump; $('bCrouch').textContent = l.crouch; $('bTrick').textContent = l.trick;
        $('bSwitch').textContent = p.mode === 'kayak' ? 'Dock' : dock ? 'Kayak' : MODE_NAME[p.mode === 'foot' ? 'skate' : p.mode === 'skate' ? 'cart' : 'foot'];
        $('bSwitch').classList.toggle('hot', dock);
      }
      if (p.mode === 'cart') $('bJump').textContent = p.cartRide ? 'Hop' : 'Hop on';
      const c = $('combo');
      if (flashT > 0) { c.textContent = flash; c.className = 'combo flash'; }
      else if (p.state === 'grind') { c.textContent = (p.mode === 'skate' ? 'Grind ' : 'Rail slide ') + Math.round(50 + p.grindPts); c.className = 'combo live'; }
      else if (p.comboN > 0) { c.textContent = p.comboNames.join(' + ') + '  ' + p.comboPts + ' × ' + p.comboN; c.className = 'combo live'; }
      else if (p.trialT >= 0) { c.textContent = 'To the boathouse  ' + clock(p.trialT); c.className = 'combo live'; }
      else { c.textContent = ''; c.className = 'combo'; }
      $('hint').textContent = hint(dock);
      if (!$('stats').hidden) stats();
      if (city) minimap();
    }
  }

  function hint(dock: boolean): string {
    if (p.state === 'bail') return '';
    const t = controls.touch || matchMedia('(pointer: coarse)').matches;
    if (p.mode === 'kayak') return dock ? (t ? 'Tap Dock to climb out.' : 'Press Q to climb out.') : p.time < tipUntil ? 'Paddle west, under I-93, to the boathouse.' : '';
    if (dock) return t ? 'Tap Kayak to launch.' : 'Press Q to launch a kayak.';
    if (p.firstTrickAt < 0 && p.time < 40) {
      if (p.mode === 'skate') return city ? (t ? 'Drag up on the left side to roll down from the station.' : 'Hold W to roll down from the station.') : (t ? 'Drag up on the left side. The ramp does the rest.' : 'Hold W. The ramp does the rest.');
      if (p.mode === 'foot') return city ? 'Run at low walls to vault them. Find the Ford rivets.' : 'Run straight at the boxes to vault them.';
      return 'Push to full speed, then hop on.';
    }
    if (p.time > tipUntil) return '';
    if (p.mode === 'skate') return 'Ollie near a rail to grind it. Kickflip in the air, and land it first.';
    if (p.mode === 'foot') return 'Jump beside a tall wall to run along it. Slide to keep speed.';
    return p.cartRide ? 'Tuck on the ramps. Aim for the crates.' : 'Push to full speed, then hop on.';
  }

  const mm = $('map') as HTMLCanvasElement, mc = mm.getContext('2d');
  function minimap() {
    if (!mc) return;
    const S = mm.width, R = 150, sc = S / (R * 2);
    const X = (x: number) => (x - p.x + R) * sc, Z = (z: number) => (z - p.z + R) * sc;
    mc.fillStyle = '#6f9cc0'; mc.fillRect(0, 0, S, S);
    for (let pass = 0; pass < 2; pass++) for (const s of w.solids) {
      if (s.hide || s.x1 < p.x - R || s.x0 > p.x + R || s.z1 < p.z - R || s.z0 > p.z + R) continue;
      const tall = s.y1 > 3 && s.y0 < 1;
      if ((pass === 1) !== tall) continue;
      if (!tall && s.y0 > 1) continue;
      mc.fillStyle = tall ? '#3b424c' : s.surf === 'grass' ? '#9cc184' : s.y1 > 0.05 ? '#e9eaee' : '#b9bdc6';
      mc.fillRect(X(s.x0), Z(s.z0), (s.x1 - s.x0) * sc, (s.z1 - s.z0) * sc);
    }
    mc.fillStyle = '#ed8b00';
    w.rivets.forEach((r, i) => { if (!p.rivets[i]) mc.fillRect(X(r[0]) - 2, Z(r[2]) - 2, 4, 4); });
    for (const tr of w.trains) { const s = trainAt(tr, p.time); if (s.on) mc.fillRect(X(tr.x0), Z(s.z - 32), 3 * sc + 1, 64 * sc); }
    mc.fillStyle = '#1d6fd1'; for (const d of w.docks) mc.fillRect(X(d.lx) - 3, Z(d.lz) - 3, 6, 6);
    const a = p.yaw; mc.save(); mc.translate(S / 2, S / 2); mc.rotate(a);
    mc.fillStyle = '#12151a'; mc.beginPath(); mc.moveTo(7, 0); mc.lineTo(-5, -5); mc.lineTo(-5, 5); mc.closePath(); mc.fill(); mc.restore();
  }

  function stats() {
    const s = frames.slice().sort((a, b) => a - b);
    if (s.length) { fpsMed = 1 / s[s.length >> 1]; fpsLow = 1 / s[Math.min(s.length - 1, Math.floor(s.length * 0.99))]; }
    $('sFps').textContent = fpsMed.toFixed(0) + ' / ' + fpsLow.toFixed(0);
    $('sDraw').textContent = renderer.drawCalls + ' calls, ' + (st.cubes.n + st.wedges.n + dyn.n) + ' boxes';
    $('sSim').textContent = simUs.toFixed(0) + ' µs';
    $('sRes').textContent = canvas.width + ' × ' + canvas.height;
    $('sFirst').textContent = p.firstTrickAt < 0 ? 'not yet' : p.firstTrickAt.toFixed(1) + ' s';
    $('sBest').textContent = p.best.toLocaleString('en-US');
    $('sBails').textContent = String(p.bails);
  }

  (window as any).__lab = { p, w, cam, stats: () => { stats(); return { fpsMed, fpsLow, simUs, drawCalls: renderer.drawCalls, boxes: st.cubes.n + st.wedges.n + dyn.n }; } };
  requestAnimationFrame(frame);
}

start();
