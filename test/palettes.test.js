import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, rotateHue, blendColors, paletteAt } from '../js/palettes.js';

const close = (a, b, eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const same = (pa, pb) => pa.every((c, i) => close(c, pb[i]));

test('five named palettes with five valid colors each', () => {
  assert.deepEqual(PALETTES.map(p => p.name), ['Aurora', 'Ember', 'Abyss', 'Opal', 'Nebula']);
  for (const p of PALETTES) {
    assert.equal(p.colors.length, 5);
    for (const c of p.colors) for (const v of c) assert.ok(v >= 0 && v <= 1);
  }
  assert.ok(close(PALETTES[0].colors[3], [1, 0x4f / 255, 0xd8 / 255]));
});

test('rotateHue turns red into green at 120 degrees and leaves gray alone', () => {
  assert.ok(close(rotateHue([1, 0, 0], 120), [0, 1, 0]));
  assert.ok(close(rotateHue([0.4, 0.4, 0.4], 77), [0.4, 0.4, 0.4]));
  assert.ok(close(rotateHue([1, 0, 0], 360), [1, 0, 0]));
});

test('blendColors endpoints and midpoint', () => {
  const a = [[0, 0, 0]], b = [[1, 1, 1]];
  assert.ok(close(blendColors(a, b, 0)[0], [0, 0, 0]));
  assert.ok(close(blendColors(a, b, 1)[0], [1, 1, 1]));
  assert.ok(close(blendColors(a, b, 0.5)[0], [0.5, 0.5, 0.5]));
});

test('paletteAt holds, crossfades, then reaches the next palette', () => {
  assert.ok(same(paletteAt(0), PALETTES[0].colors));
  assert.ok(same(paletteAt(39), PALETTES[0].colors));
  const mid = paletteAt(45);
  assert.ok(!same(mid, PALETTES[0].colors) && !same(mid, PALETTES[1].colors));
  assert.ok(same(paletteAt(50), PALETTES[1].colors));
  assert.ok(same(paletteAt(250), PALETTES[0].colors)); // wraps after 5 palettes
});

test('pinned palette and hue shift never produce NaN', () => {
  assert.ok(same(paletteAt(123, { pinned: 2 }), PALETTES[2].colors));
  for (const c of paletteAt(17, { hueShift: 720 })) for (const v of c) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
});
