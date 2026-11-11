// Headless smoke test and stills of the city. Usage: node tools/shots.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'reports'); mkdirSync(out, { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui}</style></head><body>${readFileSync(join(root, 'dist/index.html'), 'utf8')}</body></html>`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts }); const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', r => r.request().url().startsWith('http://lab.test/') ? r.fulfill({ contentType: 'text/html', body: html }) : r.abort());
  await page.goto('http://lab.test/'); await page.waitForFunction(() => !!window.__lab, null, { timeout: 20000 });
  return { ctx, page };
}
const view = (page, x, y, z, yaw, pitch = 0.3) => page.evaluate(([x, y, z, yaw, pitch]) => { const l = window.__lab; Object.assign(l.p, { x, y, z, yaw, vx: 0, vy: 0, vz: 0, grounded: true, mode: 'foot', state: 'normal' }); l.p.safe = [x, y, z, yaw]; l.p.safeOld = [x, y, z, yaw]; l.cam.yaw = yaw; l.cam.user = 0; l.cam.pitch = pitch; }, [x, y, z, yaw, pitch]);
const d = await open({ width: 1280, height: 720 }); const p = d.page;
await p.waitForTimeout(600); await p.screenshot({ path: join(out, 'city-station.png') });
await view(p, 0, 0, 150, -Math.PI / 2, 0.22); await p.waitForTimeout(700); await p.screenshot({ path: join(out, 'city-mainstreet.png') });
await view(p, -12, 0.1, -108, -Math.PI / 2 - 0.5, 0.25); await p.waitForTimeout(700); await p.screenshot({ path: join(out, 'city-giraffe.png') });
await view(p, -50, 0, -128, -0.5, 0.3); await p.waitForTimeout(700); await p.screenshot({ path: join(out, 'city-park.png') });
await p.keyboard.press('Digit5'); await p.waitForTimeout(300); await p.keyboard.press('KeyQ'); await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.screenshot({ path: join(out, 'city-kayak.png') }); await p.keyboard.up('KeyW');
await p.keyboard.press('Digit4'); await p.waitForTimeout(300); await p.keyboard.down('KeyW'); await p.waitForTimeout(1600); await p.keyboard.press('Space'); await p.waitForTimeout(2200); await p.screenshot({ path: join(out, 'city-lot.png') }); await p.keyboard.up('KeyW');
await view(p, 98, 1.1, 140, -Math.PI / 2, 0.25); await p.waitForTimeout(600); await p.screenshot({ path: join(out, 'city-platform.png') });
await p.click('#statsBtn'); await p.waitForTimeout(1200);
const state = await p.evaluate(() => window.__lab.stats());
await d.ctx.close();
const m = await open({ width: 390, height: 780 }, { hasTouch: true, isMobile: true });
await m.page.waitForTimeout(600); await m.page.screenshot({ path: join(out, 'city-phone.png') });
const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
await m.ctx.close(); await browser.close();
const report = { errors, overflow, state };
writeFileSync(join(out, 'city-smoke.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
if (errors.length || overflow) process.exit(1);
