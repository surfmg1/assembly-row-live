// Browser entry point. The city is the default; add #lab to the address for the grey movement lab.
import { buildLab, topAt, trainAt, World, Env, Season, Weather, makeEnv } from './sim/world';
import { buildCity, M } from './sim/city';
import { makePlayer, step, warp, rebind, context, startRun, endRun, DT, Ev, Input } from './sim/player';
import { GOALS, MEDALS, medalFor } from './goals';
import { Renderer, Instances, Look, Frame, Quality } from './render/renderer';
import { buildStatic, buildDynamic, buildField, View } from './render/scene';
import { chain, trans, rotX, rotY, scale } from './render/mat';
import { Controls } from './input';
import { Sound } from './audio';

const $ = (id: string) => document.getElementById(id)!;
const BAILS = ['Wicked bail.', 'You got Storrowed.', 'Nobody saw that.', 'The geese saw that.', 'Walk it off.'];
const clock = (t: number) => Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60).toFixed(1);
const mod = (a: number, n: number) => ((a % n) + n) % n;
const rnd = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

const DEFAULT_WEATHER: Record<Season, Weather> = { summer: 'sunny', fall: 'blustery', winter: 'snowy', spring: 'rainy' };
const BLURB: Record<Season, string> = {
  winter: 'Grab the bungee behind Sully’s truck. Carve the snowbanks, dodge the plows, or take a plow and clear the lot.',
  summer: 'Skate down from the station, mow Baxter Park on a ride-on mower, kayak the Mystic.',
  fall: 'Low sun and long shadows. Blow through the leaf piles down Assembly Row.',
  spring: 'Blossom on the trees, umbrellas out, and streets that slide a little.',
};

/** Lighting, sky and ground cover for a season and its weather. */
function makeLook(env: Env): Look {
  const se = env.season, w = env.weather;
  const el = se === 'summer' ? 0.98 : se === 'spring' ? 0.82 : se === 'fall' ? 0.46 : 0.40, az = 2.25;
  const sun = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  const L: Look = {
    sun, sunCol: [0.62, 0.58, 0.50], ambSky: [0.54, 0.60, 0.70], ambGnd: [0.40, 0.40, 0.38],
    fog: [0.70, 0.81, 0.92], fogNear: 220, fogFar: 1500, zen: [0.20, 0.42, 0.80], hor: [0.66, 0.80, 0.93],
    cloud: 0.36, cloudCol: [1.0, 1.0, 1.0], sunVis: 1, snow: 0, wet: 0, night: 0, shadow: 1, ice: se === 'winter' ? 1 : 0,
  };
  if (se === 'fall') { L.sunCol = [0.78, 0.56, 0.32]; L.hor = [0.92, 0.78, 0.62]; L.fog = [0.88, 0.80, 0.70]; L.zen = [0.22, 0.40, 0.72]; L.ambSky = [0.50, 0.53, 0.64]; L.ambGnd = [0.42, 0.38, 0.33]; L.cloud = 0.3; }
  if (se === 'spring') { L.zen = [0.26, 0.48, 0.82]; L.cloud = 0.45; }
  if (se === 'winter') { L.sunCol = [0.68, 0.63, 0.56]; L.ambSky = [0.58, 0.66, 0.80]; L.ambGnd = [0.56, 0.58, 0.63]; L.hor = [0.74, 0.85, 0.95]; L.fog = [0.80, 0.87, 0.95]; L.zen = [0.17, 0.39, 0.80]; L.cloud = 0.22; }
  if (w === 'blustery') {
    L.cloud = 0.74; L.cloudCol = [0.86, 0.86, 0.88]; L.zen = [0.32, 0.44, 0.64]; L.shadow = 0.6; L.sunVis = 0.6;
    L.sunCol = L.sunCol.map(c => c * 0.72); L.ambSky = L.ambSky.map(c => c * 1.06); L.fogNear = 160; L.fogFar = 1100;
  } else if (w === 'rainy') {
    L.zen = [0.34, 0.38, 0.44]; L.hor = [0.52, 0.56, 0.60]; L.fog = [0.52, 0.56, 0.60]; L.fogNear = 50; L.fogFar = 560;
    L.sunCol = [0.10, 0.10, 0.11]; L.ambSky = [0.56, 0.60, 0.66]; L.ambGnd = [0.36, 0.37, 0.38];
    L.cloud = 1; L.cloudCol = [0.50, 0.53, 0.57]; L.shadow = 0; L.sunVis = 0; L.wet = 1; L.night = 0.55;
  } else if (w === 'snowy') {
    L.zen = [0.60, 0.63, 0.69]; L.hor = [0.78, 0.80, 0.84]; L.fog = [0.80, 0.82, 0.86]; L.fogNear = 40; L.fogFar = 400;
    L.sunCol = [0.13, 0.13, 0.14]; L.ambSky = [0.72, 0.75, 0.80]; L.ambGnd = [0.56, 0.58, 0.62];
    L.cloud = 1; L.cloudCol = [0.76, 0.78, 0.82]; L.shadow = 0.12; L.sunVis = 0; L.night = 0.5;
  }
  L.snow = se === 'winter' ? 1 : w === 'snowy' ? 0.88 : 0;
  return L;
}

/** Draw every sign's text into one canvas and build the quads that show it. */
function buildSigns(w: World): { verts: Float32Array; canvas: HTMLCanvasElement } {
  const S = 2048, canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
  const g = canvas.getContext('2d')!; const v: number[] = [];
  const H = 64, PAD = 18, ROW = H + 26;
  g.font = `600 ${H}px "Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; g.textBaseline = 'middle';
  let x = 2, y = 2; const seen = new Map<string, number[]>();
  for (const s of w.signs) {
    const key = s.text + '|' + s.color + '|' + (s.bg || '');
    let r = seen.get(key);
    if (!r) {
      const tw = Math.ceil(g.measureText(s.text).width), cw = tw + PAD * 2;
      if (x + cw > S - 2) { x = 2; y += ROW + 4; }
      if (y + ROW > S) continue;
      if (s.bg) { g.fillStyle = s.bg; g.fillRect(x, y, cw, ROW); }
      g.fillStyle = s.color; g.fillText(s.text, x + PAD, y + ROW / 2 + 2);
      r = [x / S, y / S, (x + cw) / S, (y + ROW) / S, cw / ROW]; seen.set(key, r); x += cw + 6;
    }
    const hh = s.h * (ROW / H) / 2, hw = hh * r[4];
    const rx = s.face === 1 ? 0 : s.face === 0 ? 0 : s.face === 2 ? 1 : -1, rz = s.face === 0 ? -1 : s.face === 1 ? 1 : 0, gl = s.glow ? 1 : 0;
    const P = (sx: number, sy: number, u: number, t: number) => v.push(s.x + rx * hw * sx, s.y + hh * sy, s.z + rz * hw * sx, u, t, gl);
    P(-1, 1, r[0], r[1]); P(1, 1, r[2], r[1]); P(1, -1, r[2], r[3]); P(-1, 1, r[0], r[1]); P(1, -1, r[2], r[3]); P(-1, -1, r[0], r[3]);
  }
  return { verts: new Float32Array(v), canvas };
}

interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; c: number[]; mat: number; g: number; }

function start() {
  const canvas = $('gl') as HTMLCanvasElement, stage = $('stage');
  let renderer: Renderer;
  try { renderer = new Renderer(canvas); } catch (e) {
    const f = $('fail'); f.hidden = false; f.textContent = 'This game needs WebGL2, which this browser or device has turned off. Try a current Chrome, Safari, Firefox or Edge.';
    $('menu').hidden = true; return;
  }
  const lab = location.hash === '#lab';
  const month = new Date().getMonth();
  let season: Season = month < 2 || month === 11 ? 'winter' : month < 5 ? 'spring' : month < 8 ? 'summer' : 'fall';
  let weather: Weather = DEFAULT_WEATHER[season];
  try { const s = localStorage.getItem('arl-season') as Season | null, wt = localStorage.getItem('arl-weather') as Weather | null; if (s && BLURB[s]) { season = s; weather = wt && ['sunny', 'rainy', 'snowy', 'blustery'].includes(wt) ? wt : DEFAULT_WEATHER[s]; } } catch (e) { /* optional */ }
  let env = makeEnv(season, weather);
  let w: World = lab ? buildLab() : buildCity(env);
  const city = !lab;
  const p = makePlayer(w, 0);
  let look = makeLook(w.env);
  const dyn = new Instances(2048), fx = new Instances(2048), field = new Instances(1024), view: View = { phase: 0, y: p.y };
  let boxesStatic = 0, fieldSeen = -1;
  function loadWorld() {
    look = lab ? { ...makeLook(makeEnv('summer', 'sunny')), fog: [0.905, 0.912, 0.925], hor: [0.905, 0.912, 0.925], zen: [0.80, 0.83, 0.88], cloud: 0, fogNear: 40, fogFar: 140, sunVis: 0 } : makeLook(w.env);
    const wd = w.decor.find(d => d.mat === M.WATER);
    renderer.setLook(look, wd ? wd.color : null, !!wd);
    const st = buildStatic(w); renderer.setStatic(st.cubes, st.wedges); boxesStatic = st.cubes.n + st.wedges.n;
    const sg = buildSigns(w); renderer.setSigns(sg.verts, sg.canvas);
    fieldSeen = -1; tracks.length = 0; bits.length = 0;
    const f = look.fog; document.documentElement.style.setProperty('--concrete', `rgb(${f.map(c => Math.round(c * 255)).join(',')})`);
  }
  const tracks: number[][] = [], bits: Bit[] = [];
  loadWorld();
  if ((document as any).fonts && (document as any).fonts.load) (document as any).fonts.load('600 64px "Barlow Condensed"').then(() => { const sg = buildSigns(w); renderer.setSigns(sg.verts, sg.canvas); }).catch(() => {});

  const controls = new Controls(stage, $('stick'), $('nub')), sound = new Sound();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.onGesture = () => sound.start();
  const setMute = (m: boolean) => { sound.setMuted(m); $('muteBtn').textContent = m ? 'Sound off' : 'Sound on'; $('muteBtn').setAttribute('aria-pressed', String(m)); };
  controls.onMute = () => setMute(!sound.muted);
  $('muteBtn').addEventListener('click', () => { sound.start(); setMute(!sound.muted); });
  $('statsBtn').addEventListener('click', () => { const s = $('stats'); s.hidden = !s.hidden; $('statsBtn').setAttribute('aria-expanded', String(!s.hidden)); });
  const placesEl = $('places');
  function fillPlaces() {
    placesEl.textContent = '';
    w.spawns.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.id = 'warp' + i; b.textContent = (i + 1) + '  ' + s.name;
      b.addEventListener('click', () => { controls.warp = i; sound.start(); placesEl.hidden = true; b.blur(); });
      placesEl.appendChild(b);
    });
  }
  fillPlaces();
  $('placesBtn').addEventListener('click', () => { placesEl.hidden = !placesEl.hidden; $('goals').hidden = true; $('placesBtn').setAttribute('aria-expanded', String(!placesEl.hidden)); });
  $('goal').hidden = !city;
  let best = 0;
  try { best = Number(localStorage.getItem('arl-trial-best')) || 0; } catch (e) { /* storage is optional */ }
  p.trialBest = best;

  // --- Season menu --------------------------------------------------------------------------
  let paused = city, pickS = season, pickW = weather;
  const menu = $('menu');
  function paintMenu() {
    for (const b of Array.from(menu.querySelectorAll<HTMLElement>('[data-season]'))) b.setAttribute('aria-pressed', String(b.dataset.season === pickS));
    for (const b of Array.from(menu.querySelectorAll<HTMLElement>('[data-weather]'))) b.setAttribute('aria-pressed', String(b.dataset.weather === pickW));
    $('blurb').textContent = BLURB[pickS];
    let b = 0; try { b = Number(localStorage.getItem('arl-run-best-' + pickS)) || 0; } catch (e) { /* optional */ }
    const md = medalFor(b);
    $('bestline').textContent = b ? 'Best two-minute run in ' + pickS + ': ' + b.toLocaleString('en-US') + (md ? ' · ' + md : '') : 'Two-minute run: score as much as you can before the clock runs out.';
  }

  // --- Goals ------------------------------------------------------------------------------------
  const goalsDone = new Set<string>();
  try { for (const id of JSON.parse(localStorage.getItem('arl-goals') || '[]')) goalsDone.add(id); } catch (e) { /* optional */ }
  const liveGoals = () => GOALS.filter(g => !g.when || g.when(w));
  function paintGoals() {
    const gs = liveGoals(), ul = $('goalList'); ul.textContent = '';
    $('goalsBtn').textContent = 'Goals ' + gs.filter(g => goalsDone.has(g.id)).length + '/' + gs.length;
    if ($('goals').hidden) return;
    for (const g of gs) {
      const done = goalsDone.has(g.id), v = Math.min(g.target, g.value(p, w));
      const li = document.createElement('li'); if (done) li.className = 'done';
      li.append(document.createTextNode((done ? '✓ ' : '') + g.text));
      const sp = document.createElement('span'); sp.textContent = done ? 'done' : (g.target > 1 ? v + '/' + g.target + ' · ' : '') + '+' + g.pts.toLocaleString('en-US'); li.append(sp);
      const bar = document.createElement('i'), fill = document.createElement('b'); fill.style.width = Math.round(v / g.target * 100) + '%'; bar.append(fill); li.append(bar);
      ul.append(li);
    }
  }
  function checkGoals() {
    let changed = false;
    for (const g of liveGoals()) {
      if (goalsDone.has(g.id) || g.value(p, w) < g.target) continue;
      goalsDone.add(g.id); p.score += g.pts; changed = true;
      say('Goal: ' + g.text + '  +' + g.pts.toLocaleString('en-US'), 3.2); sound.events([{ type: 'finish', v: 0 }]);
    }
    if (changed) { try { localStorage.setItem('arl-goals', JSON.stringify(Array.from(goalsDone))); } catch (e) { /* optional */ } paintGoals(); }
  }
  let goalsPaintT = 0;
  $('goalsBtn').addEventListener('click', () => { const g = $('goals'); g.hidden = !g.hidden; placesEl.hidden = true; $('goalsBtn').setAttribute('aria-expanded', String(!g.hidden)); paintGoals(); ($('goalsBtn') as HTMLElement).blur(); });
  $('goalsBtn').hidden = !city;
  function setEnv(s: Season, wt: Weather, spawn = -1) {
    season = s; weather = wt; env = makeEnv(s, wt);
    w = buildCity(env); rebind(w, p); loadWorld(); fillPlaces();
    if (spawn >= 0) { warp(w, p, spawn); cam.yaw = p.yaw; cam.user = 0; view.y = p.y; tipUntil = p.time + 14; if (p.tow.rope) say('Bungee on. Sully floors it.', 2.4); }
    try { localStorage.setItem('arl-season', s); localStorage.setItem('arl-weather', wt); } catch (e) { /* optional */ }
    lastMode = '';
  }
  for (const b of Array.from(menu.querySelectorAll<HTMLElement>('[data-season]'))) b.addEventListener('click', () => { pickS = b.dataset.season as Season; pickW = DEFAULT_WEATHER[pickS]; paintMenu(); });
  for (const b of Array.from(menu.querySelectorAll<HTMLElement>('[data-weather]'))) b.addEventListener('click', () => { pickW = b.dataset.weather as Weather; paintMenu(); });
  const RUN_SECS = 120, runKey = () => 'arl-run-best-' + season;
  const runBest = () => { try { return Number(localStorage.getItem(runKey())) || 0; } catch (e) { return 0; } };
  function begin(run: boolean) {
    sound.start();
    const e = makeEnv(pickS, pickW);
    setEnv(pickS, pickW, e.snow ? 3 : pickS === 'fall' ? 1 : 0);
    if (run) { startRun(w, p, RUN_SECS); say('Two minutes. Go.', 2); } else endRun(p);
    menu.hidden = true; $('result').hidden = true; paused = false; stage.classList.remove('menuing');
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  $('play').addEventListener('click', () => begin(false));
  $('runBtn').addEventListener('click', () => begin(true));
  $('rAgain').addEventListener('click', () => { pickS = season; pickW = weather; begin(true); });
  $('rFree').addEventListener('click', () => { $('result').hidden = true; paused = false; stage.classList.remove('menuing'); ($('rFree') as HTMLElement).blur(); });
  function showResult(score: number) {
    const was = runBest(), best = Math.max(was, score), medal = medalFor(score);
    try { localStorage.setItem(runKey(), String(best)); } catch (e) { /* optional */ }
    $('rScore').textContent = score.toLocaleString('en-US');
    $('rMedal').textContent = (medal ? medal + ' medal' : '') + (score > was && was > 0 ? (medal ? ' · ' : '') + 'New best' : '');
    $('rCombo').textContent = p.best.toLocaleString('en-US'); $('rTricks').textContent = String(p.st.tricks);
    $('rTokens').textContent = p.st.tokens + ' · ' + p.st.lines; $('rBails').textContent = String(p.bails); $('rBest').textContent = best.toLocaleString('en-US');
    const next = MEDALS.slice().reverse().find(m => m[1] > score);
    $('rNext').textContent = next ? next[0] + ' is ' + next[1].toLocaleString('en-US') + '. Link different tricks before you land, and clear whole token lines for 500 each.' : 'Gold. Try another season: the lines ride differently in the snow.';
    $('result').hidden = false; paused = true; placesEl.hidden = true; $('goals').hidden = true; stage.classList.add('menuing');
  }
  const openMenu = () => {
    if (!city || !$('result').hidden) return; pickS = season; pickW = weather; paintMenu(); menu.hidden = false; paused = true; placesEl.hidden = true; $('goals').hidden = true; stage.classList.add('menuing');
  };
  $('menuBtn').addEventListener('click', openMenu);
  controls.onMenu = () => { if (!$('result').hidden) return; if (menu.hidden) openMenu(); else if (p.time > 0) { menu.hidden = true; paused = false; stage.classList.remove('menuing'); } };
  if (city) { paintMenu(); stage.classList.add('menuing'); } else menu.hidden = true;

  const cam = { yaw: p.yaw, user: 0, pitch: 0.3, dist: 6, idle: 9, x: 0, y: 0, z: 0 };
  let shake = 0, last = performance.now(), acc = 0, hudT = 0, tipUntil = 14, flash = '', flashT = 0, simUs = 0, zoneName = '', wall = 0;
  const frames: number[] = []; let fpsMed = 0, fpsLow = 0;
  const ev: Ev[] = [];
  const inp: Input = { mx: 0, mz: 0, jump: false, crouch: false, trick: false, switchMode: false, bail: false };
  let lastMode = '', lastCtx = '', trainWas = [false, false], prevYaw = p.yaw, trackX = 0, trackZ = 0;
  function say(text: string, secs = 1.8) { flash = text; flashT = secs; }

  function burst(n: number, x: number, y: number, z: number, sp: number, up: number, c: number[], size: number, life: number, mat = M.PLAIN, g = 14, bx = 0, bz = 0) {
    for (let i = 0; i < n && bits.length < 500; i++) {
      const a = Math.random() * 6.283, s = sp * (0.4 + Math.random() * 0.8);
      bits.push({ x, y, z, vx: Math.cos(a) * s + bx, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s + bz, life, max: life, size: size * (0.6 + Math.random() * 0.8), c, mat, g });
    }
  }
  const SNOWC = [0.95, 0.97, 1.0], LEAFC = [[0.86, 0.46, 0.10], [0.74, 0.20, 0.10], [0.93, 0.72, 0.16]];

  function resize() { renderer.resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), devicePixelRatio || 1); }

  // Graphics quality: remembered per browser, stepped down automatically if frames are slow.
  const QNAMES: Quality[] = ['high', 'medium', 'low'];
  let quality: Quality = (matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700) ? 'medium' : 'high';
  try { const q = localStorage.getItem('arl-quality') as Quality | null; if (q && QNAMES.includes(q)) quality = q; } catch (e) { /* optional */ }
  let autoQ = true, slowT = 0;
  const setQuality = (q: Quality, manual: boolean) => {
    quality = q; renderer.setQuality(q); $('gfxBtn').textContent = 'Graphics: ' + q[0].toUpperCase() + q.slice(1);
    if (manual) { autoQ = false; try { localStorage.setItem('arl-quality', q); } catch (e) { /* optional */ } }
  };
  setQuality(quality, false);
  $('gfxBtn').addEventListener('click', () => { setQuality(QNAMES[(QNAMES.indexOf(quality) + 1) % 3], true); ($('gfxBtn') as HTMLElement).blur(); });
  function blocked(x: number, y: number, z: number) {
    if (x < w.minX + 0.3 || x > w.maxX - 0.3 || z < w.minZ + 0.3 || z > w.maxZ - 0.3) return true;
    for (const s of w.solids) {
      if (x < s.x0 - 0.2 || x > s.x1 + 0.2 || z < s.z0 - 0.2 || z > s.z1 + 0.2 || y < s.y0 - 0.2) continue;
      if (y < topAt(s, x, z) + 0.25) return true;
    }
    return false;
  }

  function handle(evs: Ev[]) {
    let why = '';
    for (const e of evs) {
      switch (e.type) {
        case 'land': shake += Math.min(0.5, e.v * 0.022); if (p.surf === 'snow' && e.v > 4) burst(10, p.x, p.y + 0.1, p.z, 2.5, 2.5, SNOWC, 0.12, 0.6, M.PARTICLE); break;
        case 'impact': shake += Math.min(0.6, e.v * 0.05); break;
        case 'ram': shake += 0.18; break;
        case 'launch': shake += 0.1; break;
        case 'puff': burst(16, p.x, p.y, p.z, 3, 3.5, SNOWC, 0.14, 0.7, M.PARTICLE); break;
        case 'splash': why = 'Splash. The Mystic says hi.'; burst(26, p.x, w.baseY, p.z, 3, 6, [0.8, 0.9, 1.0], 0.12, 0.8, M.PARTICLE); break;
        case 'train': why = 'Stand clear of the closing doors.'; break;
        case 'zap': why = 'That was the third rail.'; break;
        case 'goose': why = 'Goosed.'; break;
        case 'carHit': why = e.name === 'plow' ? 'Plowed.' : p.bails % 2 ? 'Hood ornament.' : 'They had the right of way.'; break;
        case 'bail': shake += 0.7; say(why || BAILS[p.bails % BAILS.length]); break;
        case 'busted': say('Busted. No skating on the courts.', 2.6); cam.yaw = p.yaw; cam.user = 0; view.y = p.y; break;
        case 'bank': say('+' + e.v.toLocaleString('en-US'), 1.4); break;
        case 'token': { const k = w.tokens[e.v]; burst(7, k[0], k[1], k[2], 2.2, 2.5, [1.0, 0.62, 0.1], 0.09, 0.45, M.EMIS, 9); break; }
        case 'line': say('Line cleared  +500', 1.8); break;
        case 'runEnd': showResult(e.v); break;
        case 'rivet': say('Ford rivet ' + e.v + ' of ' + w.rivets.length, 2); break;
        case 'trialStart': say('Station to the boathouse. Go.', 2); break;
        case 'finish':
          say('Boathouse in ' + clock(e.v) + (p.trialBest === e.v ? '. New best.' : ''), 4);
          try { localStorage.setItem('arl-trial-best', String(p.trialBest)); } catch (err) { /* optional */ }
          break;
        case 'dock': say(e.v ? 'Kayak launched' : 'Back on the dock', 1.6); view.y = p.y; tipUntil = p.time + 10; break;
        case 'deny': say('Paddle to a dock to get out.', 1.6); break;
        case 'switch': tipUntil = p.time + 10; break;
        case 'rope': say(e.v === 2 ? 'Back on the bungee.' : 'Bungee on. Sully floors it.', 2.2); tipUntil = p.time + 14; break;
        case 'ropeOff': say(e.v ? 'The bungee got away from you.' : 'Let go.', 1.8); break;
        case 'lap': say('Lap ' + e.v + '   +' + (300 * e.v), 2.4); break;
        case 'ride': say(e.name === 'plow' ? 'Snowplow. Clear the lot.' : 'Ride-on mower. Stripe the lawn.', 2.4); view.y = p.y; tipUntil = p.time + 12; break;
        case 'fieldDone': say((e.name === 'plow' ? 'Lot ' : 'Lawns ') + e.v + '% ' + (e.name === 'plow' ? 'cleared' : 'mowed') + (e.v >= 100 ? '. Nice work.' : ''), 2.6); break;
        case 'mow': {
          const plow = p.ride >= 0 && p.rides[p.ride].kind === 'plow', c = Math.cos(p.yaw), s = Math.sin(p.yaw);
          if (plow) burst(3, p.x + c * 3.6 + s * 1.8, 0.4, p.z + s * 3.6 - c * 1.8, 1.5, 3, SNOWC, 0.2, 0.7, M.PARTICLE, 12, s * 5, -c * 5);
          else burst(2, p.x - s * 0.9, 0.3, p.z + c * 0.9, 1, 1.6, [0.40, 0.70, 0.28], 0.07, 0.5, M.PLAIN, 10, -s * 2.5, c * 2.5);
          break;
        }
        case 'soft': {
          const q = p.props[e.v];
          if (e.name === 'leaves') for (let k = 0; k < 3; k++) burst(10, q.x, q.y + 0.4, q.z, 3.5, 4, LEAFC[k], 0.13, 1.4, M.PLAIN, 5, p.vx * 0.4, p.vz * 0.4);
          else { burst(22, q.x, q.y + 1, q.z, 3.5, 4, SNOWC, 0.22, 0.9, M.PARTICLE, 14, p.vx * 0.5, p.vz * 0.5); burst(1, q.x, q.y + 1.8, q.z, 2, 5, [0.93, 0.545, 0], 0.16, 1.2); }
          shake += 0.12; break;
        }
      }
    }
  }

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now; wall += dt;
    if (dt > 0) { frames.push(dt); if (frames.length > 300) frames.shift(); }
    if (autoQ && !paused && dt > 0 && quality !== 'low') {
      slowT = dt > 1 / 38 ? slowT + dt : Math.max(0, slowT - dt * 0.5);
      if (slowT > 3) { slowT = 0; setQuality(quality === 'high' ? 'medium' : 'low', false); say('Graphics set to ' + quality + ' for smoother play', 2.2); }
    }
    resize();
    controls.poll();
    if (!paused) {
      if (controls.warp >= 0 && controls.warp < w.spawns.length) {
        warp(w, p, controls.warp); cam.yaw = p.yaw; cam.user = 0; view.y = p.y; tipUntil = p.time + 12; fieldSeen = -1;
        if (p.tow.rope) say('Bungee on. Sully floors it.', 2.2);
      }
      const vy = cam.yaw + cam.user, fwx = Math.cos(vy), fwz = Math.sin(vy);
      inp.mx = fwx * controls.sy - fwz * controls.sx; inp.mz = fwz * controls.sy + fwx * controls.sx;
      inp.jump = controls.jump; inp.crouch = controls.crouch; inp.trick = controls.trick; inp.switchMode = controls.switchMode; inp.bail = controls.bail;
      acc += dt; ev.length = 0; let n = 0; const t0 = performance.now();
      while (acc >= DT && n < 5) { step(w, p, inp, DT, ev); acc -= DT; n++; }
      if (n === 5) acc = 0;
      if (n) simUs = simUs * 0.95 + (performance.now() - t0) / n * 1000 * 0.05;
      handle(ev); sound.events(ev);
    }
    controls.warp = -1;
    const sp = Math.hypot(p.vx, p.vz), k = Math.min(1, sp / 18), bailed = p.state === 'bail';
    const driving = p.mode === 'drive', plowing = driving && p.rides[p.ride].kind === 'plow';
    sound.frame(p);
    // Engines: your own machine, or the tow truck ahead.
    if (driving) sound.engine(plowing ? 46 + Math.abs(p.dsp) * 6 : 84 + Math.abs(p.dsp) * 7, paused ? 0 : plowing ? 0.10 : 0.07, plowing ? 'sawtooth' : 'square');
    else if (p.tow.active && p.cars.length) { const t = p.cars[0], d = Math.hypot(t.x - p.x, t.z - p.z); sound.engine(52 + t.v * 5.5, paused ? 0 : 0.085 * Math.max(0, 1 - d / 50), 'sawtooth'); }
    else sound.engine(60, 0, 'sawtooth');
    sound.ambience(paused ? 0 : look.wet, env.weather === 'blustery' || env.weather === 'snowy' ? 0.5 : 0);
    w.trains.forEach((tr, i) => {
      const s = trainAt(tr, p.time), stopped = s.on && s.v === 0;
      if (stopped && !trainWas[i] && Math.hypot(p.x - 98, p.z - s.z) < 160) sound.chime();
      trainWas[i] = stopped;
    });

    // Chase camera.
    if (controls.camDX || controls.camDY) { cam.user -= controls.camDX * 0.006; cam.pitch = Math.max(0.06, Math.min(1.15, cam.pitch + controls.camDY * 0.004)); cam.idle = 0; controls.camDX = controls.camDY = 0; }
    cam.idle += dt;
    if (paused) cam.user += dt * 0.12;
    else if (sp > 1.5 && !bailed) {
      const hy = driving ? (p.dsp < 0 ? p.yaw : p.yaw) : Math.atan2(p.vz, p.vx);
      let d = hy - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      cam.yaw += d * Math.min(1, dt * 2.6 * Math.min(1, sp / 5));
      if (cam.idle > 1.2) cam.user *= Math.exp(-dt * 1.6);
    }
    const yaw = cam.yaw + cam.user, cp = Math.cos(cam.pitch), spn = Math.sin(cam.pitch);
    const tx = bailed ? p.rag.x : p.x, ty = (bailed ? p.rag.y - 0.3 : view.y + (plowing ? 2.4 : 1.15)), tz = bailed ? p.rag.z : p.z;
    const want = (plowing ? 12 : p.mode === 'kayak' ? 7.5 : p.tow.rope ? 6.6 : driving ? 6.5 : 5.4) + k * 2.4; let free = want;
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
    const ay = ty + 0.2;

    // --- Effects: weather around the camera, bursts, tracks in the snow -----------------------
    fx.clear();
    const t = wall;
    if (city) {
      const wt = env.weather, se = env.season;
      const kind = wt === 'rainy' ? 1 : wt === 'snowy' ? 2 : se === 'fall' ? 3 : se === 'spring' ? 4 : wt === 'blustery' && se === 'winter' ? 2 : wt === 'blustery' ? 3 : 0;
      const count = kind === 1 ? 650 : kind === 2 ? (wt === 'snowy' ? 900 : 260) : kind === 0 ? 0 : wt === 'blustery' ? 220 : 45;
      const BX = 44, BY = 24, wx = kind === 1 ? 3 : kind === 2 ? 1.2 : wt === 'blustery' ? 6 : 1.2, fall = kind === 1 ? 21 : kind === 2 ? 1.9 : 1.1;
      for (let i = 0; i < count; i++) {
        const x = cam.x + mod(rnd(i, 1) * BX + wx * t - cam.x, BX) - BX / 2, z = cam.z + mod(rnd(i, 2) * BX + wx * 0.4 * t - cam.z, BX) - BX / 2;
        const y = cam.y + mod(rnd(i, 3) * BY - fall * (0.8 + rnd(i, 4) * 0.4) * t - cam.y, BY) - 8;
        if (kind === 1) fx.box(x, y, z, 0.025, 0.85, 0.025, 0.80, 0.84, 0.90, M.RAIN);
        else if (kind === 2) fx.box(x + Math.sin(t * 1.3 + i) * 0.4, y, z + Math.cos(t * 1.1 + i * 2) * 0.4, 0.07, 0.07, 0.07, 0.98, 0.98, 1.0, M.PARTICLE);
        else {
          const c = kind === 4 ? [0.98, 0.78, 0.86] : se === 'summer' ? [0.34, 0.56, 0.26] : LEAFC[i % 3];
          fx.push(chain(trans(x, y + Math.sin(t * 2 + i) * 0.5, z), rotY(t * 2 + i), rotX(t * 3 + i * 2), scale(kind === 4 ? 0.09 : 0.18, 0.02, kind === 4 ? 0.07 : 0.12)), c[0], c[1], c[2], M.PLAIN);
        }
      }
      // spray: carving and edging on snow, plows throwing snow, wet wheels
      if (!paused && p.grounded && !bailed && p.mode !== 'foot' && p.mode !== 'kayak' && sp > 4) {
        let dy = p.yaw - prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const carve = Math.min(1, Math.abs(dy) / Math.max(dt, 0.001) / 2.2), side = Math.sign(dy) || 1;
        const px = -Math.sin(p.yaw) * side, pz = Math.cos(p.yaw) * side;
        if (p.surf === 'snow' && (p.edge || carve > 0.35 || plowing)) burst(p.edge ? 4 : plowing ? 2 : 2, p.x, p.y + 0.1, p.z, 1.2, 2 + sp * 0.12, SNOWC, 0.11, 0.55, M.PARTICLE, 12, -px * (2 + sp * 0.3) + p.vx * 0.3, -pz * (2 + sp * 0.3) + p.vz * 0.3);
        else if (look.wet > 0 && sp > 6) burst(1, p.x, p.y + 0.05, p.z, 0.8, 1.6, [0.75, 0.82, 0.9], 0.05, 0.35, M.PARTICLE, 12, -p.vx * 0.2, -p.vz * 0.2);
      }
      prevYaw = p.yaw;
      if (env.snow && !paused) for (const c of p.cars) if (c.kind === 'plow' && c.v > 2 && Math.abs(c.x - p.x) + Math.abs(c.z - p.z) < 120 && Math.random() < 0.5)
        burst(1, c.x + c.hx * 4.2 - c.hz * -1.9, 0.5, c.z + c.hz * 4.2 + c.hx * -1.9, 1, 3, SNOWC, 0.2, 0.7, M.PARTICLE, 12, c.hz * 5 + c.hx * c.v, -c.hx * 5 + c.hz * c.v);
      if (p.surf === 'snow' && p.grounded && !bailed && p.mode !== 'foot' && Math.hypot(p.x - trackX, p.z - trackZ) > 0.55) {
        trackX = p.x; trackZ = p.z; tracks.push([p.x, p.y, p.z, p.yaw, plowing ? 2.6 : driving ? 1 : 0.3]); if (tracks.length > 260) tracks.shift();
      }
      for (const tk of tracks) fx.push(chain(trans(tk[0], tk[1] + 0.025, tk[2]), rotY(-tk[3]), scale(0.62, 0.012, tk[4])), 0.78, 0.82, 0.89, M.PLAIN);
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; b.life -= dt; if (b.life <= 0) { bits[i] = bits[bits.length - 1]; bits.pop(); continue; }
      b.vy -= b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const s = b.size * Math.min(1, b.life / b.max * 2.5);
      fx.box(b.x, Math.max(b.y, w.baseY), b.z, s, s, s, b.c[0], b.c[1], b.c[2], b.mat);
    }

    buildDynamic(dyn, w, p, view, paused ? 0 : dt);
    if (city && fieldSeen !== p.fieldN) { fieldSeen = p.fieldN; buildField(field, w, p); renderer.setField(field); }
    const shY = bailed ? p.rag.y - 0.3 : view.y;
    const fr: Frame = { cam: [cam.x, cam.y, cam.z], target: [tx, ay, tz], fovy, aspect, near: city ? 0.3 : 0.1, far: city ? 1700 : 260, focus: [tx, shY, tz], time: t };
    renderer.draw(fr, dyn, fx);

    // --- HUD ------------------------------------------------------------------------------------
    ($('flow') as HTMLElement).style.transform = `scaleX(${p.state === 'manual' ? p.stateT / 3 : p.tow.rope ? Math.min(1, p.tow.stretch / 6) : p.flow})`;
    $('flow').classList.toggle('risk', p.state === 'manual' || p.edge);
    if (!calm) ($('streaks') as HTMLElement).style.opacity = String(paused ? 0 : Math.max(0, Math.min(0.55, (sp - 10) / 14)));
    flashT -= dt; hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      let zn = '';
      for (const z of w.zones) if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1) { zn = z.name; break; }
      if (zn !== zoneName) { zoneName = zn; $('zone').textContent = zn; }
      $('speed').textContent = String(Math.round(sp * 2.23694));
      $('score').textContent = p.score.toLocaleString('en-US');
      if (city && !paused) checkGoals();
      goalsPaintT -= 0.1; if (goalsPaintT <= 0) { goalsPaintT = 1; if (city) paintGoals(); }
      const tm = $('timer'); tm.hidden = p.runT < 0;
      if (p.runT >= 0) { const s = Math.ceil(p.runT); tm.textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); tm.classList.toggle('late', s <= 10); }
      if (city) {
        const pct = p.fieldTotal ? Math.round(p.fieldN / p.fieldTotal * 100) : 0;
        $('goal').textContent = 'Rivets ' + p.rivetN + '/' + w.rivets.length + ' · ' + (env.snow ? 'Lot ' : 'Lawns ') + pct + '%' + (p.tow.laps ? ' · lap ' + p.tow.laps : '') + (p.trialBest ? ' · best ' + clock(p.trialBest) : '');
      }
      const ctx = city ? context(w, p) : '';
      const mkey = p.mode + (p.tow.rope ? 't' : '') + (p.cartRide ? 'r' : '') + p.ride;
      if (mkey !== lastMode || ctx !== lastCtx) {
        lastMode = mkey; lastCtx = ctx;
        const snow = env.snow && city;
        $('mode').textContent = p.mode === 'foot' ? 'Parkour' : p.mode === 'skate' ? (snow ? 'Snowboard' : 'Skate') : p.mode === 'cart' ? 'Cart' : p.mode === 'kayak' ? 'Kayak' : plowing ? 'Snowplow' : 'Mower';
        const l = p.mode === 'foot' ? ['Jump', 'Slide', 'Flip'] : p.mode === 'skate' ? (snow ? ['Ollie', p.tow.rope ? 'Dig in' : 'Butter', 'Grab'] : ['Ollie', p.tow.rope ? 'Dig in' : 'Manual', 'Kickflip'])
          : p.mode === 'cart' ? [p.cartRide ? 'Hop' : 'Hop on', 'Tuck', '360'] : p.mode === 'drive' ? ['Horn', 'Brake', '·'] : ['·', '·', '·'];
        $('bJump').textContent = l[0]; $('bCrouch').textContent = l[1]; $('bTrick').textContent = l[2];
        $('bSwitch').textContent = ctx === 'tow' ? 'Grab rope' : ctx === 'letgo' ? 'Let go' : ctx === 'mower' ? 'Mower' : ctx === 'plow' ? 'Plow' : ctx === 'exit' ? 'Get off' : ctx === 'kayak' ? 'Kayak' : ctx === 'dock' ? 'Dock'
          : p.mode === 'kayak' ? '·' : p.mode === 'foot' ? (snow ? 'Board' : 'Skate') : p.mode === 'skate' ? 'Cart' : 'On foot';
        $('bSwitch').classList.toggle('hot', ctx !== '' && ctx !== 'letgo' && ctx !== 'exit');
      }
      const c = $('combo');
      if (flashT > 0) { c.textContent = flash; c.className = 'combo flash'; }
      else if (p.state === 'grind') { c.textContent = (p.mode === 'skate' ? (p.surf === 'snow' ? 'Boardslide ' : 'Grind ') : 'Rail slide ') + Math.round(50 + p.grindPts); c.className = 'combo live'; }
      else if (p.comboN > 0) { c.textContent = p.comboNames.join(' + ') + '  ' + p.comboPts + ' × ' + p.comboN; c.className = 'combo live'; }
      else if (p.trialT >= 0) { c.textContent = 'To the boathouse  ' + clock(p.trialT); c.className = 'combo live'; }
      else { c.textContent = ''; c.className = 'combo'; }
      $('hint').textContent = paused ? '' : hint(ctx);
      if (!$('stats').hidden) stats();
      if (city) minimap();
    }
  }

  function hint(ctx: string): string {
    if (p.state === 'bail') return '';
    const t = controls.touch || matchMedia('(pointer: coarse)').matches, tip = p.time < tipUntil;
    const q = (key: string, tap: string) => t ? 'Tap ' + tap + ' ' : 'Press Q ' + key + ' ';
    if (ctx === 'tow') return q('to', 'Grab rope to') + 'grab the bungee.';
    if (ctx === 'mower') return q('to', 'Mower to') + 'hop on the mower.';
    if (ctx === 'plow') return q('to', 'Plow to') + 'climb into the plow.';
    if (ctx === 'kayak') return q('to', 'Kayak to') + 'launch a kayak.';
    if (ctx === 'dock') return q('to', 'Dock to') + 'climb out.';
    if (ctx === 'letgo') return tip ? (t ? 'Steer wide to whip. Hold Dig in, then release to slingshot.' : 'Steer wide to whip. Hold Shift to dig in, release to slingshot.') : '';
    if (ctx === 'exit') return tip ? (p.rides[p.ride].kind === 'plow' ? 'Drive the lot to clear it. Space honks.' : 'Drive the lawn to stripe it. Space honks.') : '';
    if (p.mode === 'kayak') return tip ? 'Paddle west, under the highway, to the boathouse.' : '';
    if (p.firstTrickAt < 0 && p.time < 40) {
      if (p.mode === 'skate') return !city ? (t ? 'Drag up on the left side. The ramp does the rest.' : 'Hold W. The ramp does the rest.') : env.snow ? 'Find Sully’s red truck on Grand Union for a tow.' : (t ? 'Drag up on the left side to roll.' : 'Hold W to roll.');
      if (p.mode === 'foot') return city ? 'Run at low walls to vault them. Find the Ford rivets.' : 'Run straight at the boxes to vault them.';
      return 'Push to full speed, then hop on.';
    }
    if (!tip) return '';
    if (p.mode === 'skate') return env.snow && city ? 'Ollie off a snowbank and grab. Land it first.' : 'Ollie near a rail to grind it. Kickflip in the air, and land it first.';
    if (p.mode === 'foot') return 'Jump beside a tall wall to run along it. Slide to keep speed.';
    return p.cartRide ? 'Tuck on the ramps. Aim for the crates.' : 'Push to full speed, then hop on.';
  }

  const mm = $('map') as HTMLCanvasElement, mc = mm.getContext('2d');
  function minimap() {
    if (!mc) return;
    const S = mm.width, R = 150, sc = S / (R * 2), snow = env.snow;
    const X = (x: number) => (x - p.x + R) * sc, Z = (z: number) => (z - p.z + R) * sc;
    mc.fillStyle = snow ? '#5f7f9c' : '#6f9cc0'; mc.fillRect(0, 0, S, S);
    for (let pass = 0; pass < 2; pass++) for (const s of w.solids) {
      if (s.hide || s.x1 < p.x - R || s.x0 > p.x + R || s.z1 < p.z - R || s.z0 > p.z + R || s.x1 - s.x0 < 1) continue;
      const tall = s.y1 > 3 && s.y0 < 1;
      if ((pass === 1) !== tall) continue;
      if (!tall && s.y0 > 1) continue;
      mc.fillStyle = tall ? '#3b424c' : s.surf === 'grass' ? (snow ? '#eef1f5' : '#9cc184') : s.surf === 'snow' ? '#ffffff' : s.y1 > 0.05 ? (snow ? '#f4f5f8' : '#e9eaee') : (snow ? '#cfd5de' : '#aeb3bd');
      mc.fillRect(X(s.x0), Z(s.z0), (s.x1 - s.x0) * sc, (s.z1 - s.z0) * sc);
    }
    mc.fillStyle = '#ed8b00';
    w.rivets.forEach((r, i) => { if (!p.rivets[i]) mc.fillRect(X(r[0]) - 2, Z(r[2]) - 2, 4, 4); });
    for (const tr of w.trains) { const s = trainAt(tr, p.time); if (s.on) mc.fillRect(X(tr.x0), Z(s.z - 32), 3 * sc + 1, 64 * sc); }
    for (const c of p.cars) { mc.fillStyle = c.kind === 'truck' ? '#d21f1a' : c.kind === 'plow' ? '#f0b400' : '#20242a'; mc.fillRect(X(c.x) - 2.5, Z(c.z) - 2.5, c.kind === 'car' ? 4 : 6, c.kind === 'car' ? 4 : 6); }
    mc.fillStyle = '#c2185b'; for (const r of p.rides) mc.fillRect(X(r.x) - 3, Z(r.z) - 3, 6, 6);
    mc.fillStyle = '#1d6fd1'; for (const d of w.docks) mc.fillRect(X(d.lx) - 3, Z(d.lz) - 3, 6, 6);
    mc.save(); mc.translate(S / 2, S / 2); mc.rotate(p.yaw);
    mc.fillStyle = '#12151a'; mc.strokeStyle = '#ffffff'; mc.lineWidth = 2; mc.beginPath(); mc.moveTo(8, 0); mc.lineTo(-6, -6); mc.lineTo(-6, 6); mc.closePath(); mc.stroke(); mc.fill(); mc.restore();
  }

  function stats() {
    const s = frames.slice().sort((a, b) => a - b);
    if (s.length) { fpsMed = 1 / s[s.length >> 1]; fpsLow = 1 / s[Math.min(s.length - 1, Math.floor(s.length * 0.99))]; }
    $('sFps').textContent = fpsMed.toFixed(0) + ' / ' + fpsLow.toFixed(0);
    $('sDraw').textContent = renderer.drawCalls + ' calls, ' + renderer.boxes + ' boxes';
    $('sSim').textContent = simUs.toFixed(0) + ' µs';
    $('sRes').textContent = canvas.width + ' × ' + canvas.height;
    $('sFirst').textContent = p.firstTrickAt < 0 ? 'not yet' : p.firstTrickAt.toFixed(1) + ' s';
    $('sBest').textContent = p.best.toLocaleString('en-US');
    $('sBails').textContent = String(p.bails);
  }

  (window as any).__lab = {
    p, cam, get w() { return w; },
    quality(q: Quality) { setQuality(q, false); autoQ = false; },
    go(s: Season, wt: Weather, spawn: number) { setEnv(s, wt, spawn); menu.hidden = true; $('result').hidden = true; paused = false; stage.classList.remove('menuing'); },
    run(secs: number) { startRun(w, p, secs); },
    stats: () => { stats(); return { fpsMed, fpsLow, simUs, drawCalls: renderer.drawCalls, boxes: renderer.boxes, staticBoxes: boxesStatic }; },
  };
  requestAnimationFrame(frame);
}

start();
