// End-to-end smoke tests in headless Chromium (SwiftShader WebGL). Exit code 1 on failure.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { startServer } from './server.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

let failures = 0;
async function check(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failures++;
    console.log(`not ok - ${name}\n  ${String(e.message).split('\n').join('\n  ')}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function open(query = '', viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    // Web fonts are optional (offline runs); everything else must be clean.
    if (m.type() === 'error' && !/fonts\.g/.test(m.location()?.url || '') && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto(base + query);
  await page.waitForFunction(() => window.__chladni?.ready && window.__chladni.frames > 5, null, { timeout: 20000 });
  return { page, errors };
}

// Decodes the canvas capture in the page and returns pixel statistics.
const stats = page => page.evaluate(async () => {
  const img = new Image();
  img.src = window.__chladni.capture();
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 160; c.height = 100;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const lum = [];
  let hueSpread = 0;
  for (let i = 0; i < d.length; i += 4) {
    lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    hueSpread += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
  }
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  return { mean, sd, chroma: hueSpread / lum.length, lum };
});
const diff = (a, b) => a.lum.reduce((s, v, i) => s + Math.abs(v - b.lum[i]), 0) / a.lum.length;

await check('desktop: loads WebGL2 without errors and paints a colorful figure', async () => {
  const { page, errors } = await open();
  await page.mouse.move(200, 200);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({ gl: __chladni.glVersion, errors: __chladni.errors }));
  assert(info.gl === 2, `expected WebGL2, got ${info.gl}`);
  assert(!errors.length && !info.errors.length, [...errors, ...info.errors].join('\n'));
  const s = await stats(page);
  assert(s.sd > 8, `canvas looks flat (luminance sd ${s.sd.toFixed(1)})`);
  assert(s.chroma > 15, `canvas looks gray (chroma ${s.chroma.toFixed(1)})`);
  await page.screenshot({ path: `${OUT}desktop.png` });
  await page.close();
});

await check('desktop: autopilot keeps the figure moving with no input', async () => {
  const { page } = await open();
  const f0 = await page.evaluate(() => __chladni.frames);
  const a = await stats(page);
  await page.waitForTimeout(2500);
  const b = await stats(page);
  const f1 = await page.evaluate(() => __chladni.frames);
  assert(f1 > f0 + 5, `frames did not advance (${f0} → ${f1})`);
  assert(diff(a, b) > 2, `image did not change (mean diff ${diff(a, b).toFixed(2)})`);
  await page.close();
});

await check('desktop: while paused, the frequency slider still reshapes the figure smoothly', async () => {
  const { page } = await open();
  await page.click('.switch'); // autopilot off
  await page.evaluate(() => __chladni.setPaused(true)); // freeze time; sliders still respond
  // Wait for the parameters to glide home from their autopilot offsets.
  await page.waitForFunction(() => {
    const v = __chladni.getValues();
    return Math.abs(v.frequency - 4) < 0.002 && Math.abs(v.chaos - 0.25) < 0.001 && Math.min(v.hue, 360 - v.hue) < 0.05;
  }, null, { timeout: 30000, polling: 250 });
  await page.waitForTimeout(1500); // let the feedback buffer converge
  const a = await stats(page);
  await page.waitForTimeout(800);
  const a2 = await stats(page);
  const v0 = await page.evaluate(() => __chladni.getValues().frequency);
  await page.evaluate(() => __chladni.setSlider('frequency', 10));
  await page.waitForTimeout(150);
  const mid = await page.evaluate(() => __chladni.getValues().frequency);
  await page.waitForFunction(() => Math.abs(__chladni.getValues().frequency - 10) < 0.01, null, { timeout: 30000, polling: 250 });
  await page.waitForTimeout(1500);
  const b = await stats(page);
  const v1 = await page.evaluate(() => __chladni.getValues().frequency);
  assert(mid > v0 && mid < 10, `frequency should glide, not snap (${v0} → ${mid})`);
  assert(Math.abs(v1 - 10) < 0.05, `frequency did not arrive (${v1})`);
  assert(diff(a, b) > 3 * diff(a, a2) + 2, `slider change not visible (${diff(a, b).toFixed(2)} vs baseline ${diff(a, a2).toFixed(2)})`);
  await page.close();
});

await check('desktop: sand mode renders particles without errors', async () => {
  const { page, errors } = await open();
  await page.evaluate(() => __chladni.setDisplay('both'));
  await page.waitForTimeout(2500);
  const s = await stats(page);
  assert(s.sd > 8, `flat canvas in sand mode (${s.sd.toFixed(1)})`);
  assert(!errors.length, errors.join('\n'));
  await page.screenshot({ path: `${OUT}desktop-sand.png` });
  await page.close();
});

await check('desktop: S key saves a PNG', async () => {
  const { page } = await open();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.keyboard.press('s')]);
  assert(/^chladni-.*\.png$/.test(download.suggestedFilename()), download.suggestedFilename());
  await page.close();
});

await check('rotation/resize reallocates buffers without errors or black frames', async () => {
  const { page, errors } = await open();
  await page.evaluate(() => __chladni.setSlider('melt', 0.85));
  await page.waitForTimeout(2500);
  const before = await stats(page);
  await page.setViewportSize({ width: 900, height: 1400 });
  // First frame rendered at the new size: no dark dip while the feedback buffer refills.
  await page.waitForFunction(() => document.getElementById('stage').height === 1400);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const first = await stats(page);
  assert(first.mean > 0.8 * before.mean, `dark flash after resize (mean ${before.mean.toFixed(1)} → ${first.mean.toFixed(1)})`);
  await page.waitForTimeout(800);
  const s = await stats(page);
  const size = await page.evaluate(() => [document.getElementById('stage').width, document.getElementById('stage').height]);
  assert(size[0] === 900 && size[1] === 1400, `canvas not resized: ${size}`);
  assert(s.mean > 5 && s.sd > 8, `black or flat frame after resize (mean ${s.mean.toFixed(1)})`);
  assert(!errors.length, errors.join('\n'));
  await page.close();
});

await check('phone: bottom-sheet panel and colorful canvas', async () => {
  const { page, errors } = await open('', { width: 390, height: 844 });
  await page.mouse.move(100, 100);
  await page.waitForTimeout(1500);
  const box = await page.locator('#panel').boundingBox();
  assert(box.y > 844 * 0.35 && box.width > 340, `panel not docked as bottom sheet: ${JSON.stringify(box)}`);
  const s = await stats(page);
  assert(s.sd > 8, `flat canvas on phone (${s.sd.toFixed(1)})`);
  assert(!errors.length, errors.join('\n'));
  await page.screenshot({ path: `${OUT}phone.png` });
  await page.close();
});

await check('panel auto-hides when idle and returns on pointer move', async () => {
  const { page } = await open();
  await page.mouse.move(400, 300);
  await page.waitForTimeout(5000);
  assert(await page.locator('#panel.is-hidden').count() === 1, 'panel did not hide after idle');
  await page.mouse.move(420, 320);
  await page.waitForTimeout(200);
  assert(await page.locator('#panel.is-hidden').count() === 0, 'panel did not return on move');
  await page.close();
});

await check('WebGL1 fallback (?gl=1) runs without errors, sand disabled', async () => {
  const { page, errors } = await open('?gl=1');
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({ gl: __chladni.glVersion, sand: __chladni.sandSupported }));
  assert(info.gl === 1, `expected WebGL1, got ${info.gl}`);
  assert(info.sand === false, 'sand should be disabled on WebGL1');
  const s = await stats(page);
  assert(s.sd > 8, `flat canvas on WebGL1 (${s.sd.toFixed(1)})`);
  assert(!errors.length, errors.join('\n'));
  await page.screenshot({ path: `${OUT}webgl1.png` });
  await page.close();
});

await browser.close();
server.close();
console.log(failures ? `\n${failures} e2e check(s) failed` : '\nall e2e checks passed');
process.exit(failures ? 1 : 0);
