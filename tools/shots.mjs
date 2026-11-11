// Headless smoke test and stills of every season. Usage: node tools/shots.mjs [only]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'reports'); mkdirSync(out, { recursive: true });
const only = process.argv[2];
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui}</style></head><body>${readFileSync(join(root, 'dist/index.html'), 'utf8')}</body></html>`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts }); const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', r => r.request().url().startsWith('http://lab.test/') ? r.fulfill({ contentType: 'text/html', body: html }) : r.abort());
  await page.goto('http://lab.test/'); await page.waitForFunction(() => !!window.__lab, null, { timeout: 30000 });
  await page.evaluate(q => window.__lab.quality(q), process.env.Q || 'high');
  return { ctx, page };
}
const view = (page, x, y, z, yaw, pitch = 0.3) => page.evaluate(([x, y, z, yaw, pitch]) => { const l = window.__lab; Object.assign(l.p, { x, y, z, yaw, vx: 0, vy: 0, vz: 0, grounded: true, mode: 'foot', state: 'normal' }); l.p.tow.rope = false; l.p.tow.active = false; l.p.safe = [x, y, z, yaw]; l.p.safeOld = [x, y, z, yaw]; l.cam.yaw = yaw; l.cam.user = 0; l.cam.pitch = pitch; }, [x, y, z, yaw, pitch]);
const go = (page, s, w, sp) => page.evaluate(([s, w, sp]) => window.__lab.go(s, w, sp), [s, w, sp]);
const shot = async (page, name, wait = 900) => { await page.waitForTimeout(wait); await page.screenshot({ path: join(out, name + '.png') }); };
const d = await open({ width: 960, height: 540 }); const p = d.page;
const N = -Math.PI / 2, S = Math.PI / 2;
const sets = {
  menu: async () => { await shot(p, 'menu', 1200); },
  quick: async () => {
    await go(p, 'summer', 'sunny', 0); await view(p, 0, 0, -62, S, 0.2); await shot(p, 'q-summer-row', 1500);
    await view(p, 0, 0, -128, S, 0.12); await shot(p, 'q-summer-trusses');
    await go(p, 'winter', 'snowy', 3); await p.keyboard.down('KeyW'); await shot(p, 'q-winter-tow', 5000); await p.keyboard.up('KeyW');
    await go(p, 'fall', 'sunny', 1); await view(p, -50, 0, -128, 0.2, 0.25); await shot(p, 'q-fall-park');
  },
  winter: async () => {
    await go(p, 'winter', 'snowy', 3); await p.keyboard.down('KeyW'); await shot(p, 'winter-tow', 5500); await p.keyboard.up('KeyW');
    await go(p, 'winter', 'sunny', 3); await p.keyboard.down('KeyW'); await p.keyboard.down('KeyA'); await p.waitForTimeout(4200); await p.keyboard.up('KeyA'); await shot(p, 'winter-sunny-tow', 600); await p.keyboard.up('KeyW');
    await view(p, 0, 0, -62, S, 0.2); await shot(p, 'winter-row');
    await go(p, 'winter', 'snowy', 4); await p.keyboard.press('KeyQ'); await p.keyboard.down('KeyW'); await shot(p, 'winter-plow', 5000); await p.keyboard.up('KeyW');
    await view(p, 0, 0.1, -150, N + 3.14, 0.16); await shot(p, 'winter-trusses');
  },
  summer: async () => {
    await go(p, 'summer', 'sunny', 0); await shot(p, 'summer-station', 1200);
    await view(p, 0, 0, -62, S, 0.2); await shot(p, 'summer-row');
    await view(p, 0, 0, -128, S, 0.12); await shot(p, 'summer-trusses');
    await view(p, -92, 0, 176, N, 0.22); await shot(p, 'summer-grandunion');
    await go(p, 'summer', 'sunny', 4); await p.keyboard.press('KeyQ'); await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.down('KeyD'); await shot(p, 'summer-mower', 5000); await p.keyboard.up('KeyW'); await p.keyboard.up('KeyD');
    await view(p, 30, 0, -168, N, 0.25); await shot(p, 'summer-marina');
    await view(p, -30, 0.1, 76, S, 0.4); await shot(p, 'summer-volo');
    await view(p, -120, 0, -20, 3.14, 0.25); await shot(p, 'summer-marketplace');
  },
  fall: async () => {
    await go(p, 'fall', 'blustery', 1); await p.keyboard.down('KeyW'); await shot(p, 'fall-row', 3500); await p.keyboard.up('KeyW');
    await go(p, 'fall', 'sunny', 1); await view(p, -50, 0, -128, 0.2, 0.25); await shot(p, 'fall-park');
  },
  spring: async () => {
    await go(p, 'spring', 'rainy', 0); await p.keyboard.down('KeyW'); await shot(p, 'spring-rain', 4500); await p.keyboard.up('KeyW');
    await go(p, 'spring', 'sunny', 1); await view(p, 0, 0, 60, N, 0.2); await shot(p, 'spring-sunny');
  },
};
for (const k of Object.keys(sets)) if (!only || only === k) await sets[k]();
const state = await p.evaluate(() => window.__lab.stats());
await d.ctx.close();
let overflow = false;
if (!only || only === 'phone') {
  const m = await open({ width: 390, height: 780 }, { hasTouch: true, isMobile: true });
  await m.page.waitForTimeout(800); await m.page.screenshot({ path: join(out, 'phone-menu.png') });
  await m.page.evaluate(() => window.__lab.go('winter', 'snowy', 3)); await m.page.waitForTimeout(3500); await m.page.screenshot({ path: join(out, 'phone-winter.png') });
  overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await m.ctx.close();
}
await browser.close();
const report = { errors, overflow, state };
writeFileSync(join(out, 'smoke.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
if (errors.length || overflow) process.exit(1);
