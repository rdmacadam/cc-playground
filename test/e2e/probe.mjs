// Dev probe: renders the page with optional slider overrides and saves a screenshot.
import { createRequire } from 'node:module';
import { startServer } from './server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [,, query = '', out = 'probe.png', json = '{}', w = '1280', h = '800', wait = '5000'] = process.argv;
const server = await startServer(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 2000)));
page.on('console', m => m.type() === 'error' && console.log('console', m.text().slice(0, 600)));
await page.goto(`http://localhost:${server.address().port}/${query}`);
await page.waitForFunction(() => window.__chladni?.ready);
await page.evaluate(o => { for (const [k, v] of Object.entries(o)) k === 'display' ? __chladni.setDisplay(v) : __chladni.setSlider(k, v); }, JSON.parse(json));
for (let t = 0; t < +wait; t += 1000) { await page.mouse.move(300 + t / 50, 300); await page.waitForTimeout(1000); }
console.log(await page.evaluate(() => JSON.stringify({ gl: __chladni.glVersion, f: __chladni.frames, e: __chladni.errors, s: __chladni.scale })));
await page.screenshot({ path: out });
await browser.close(); server.close();
