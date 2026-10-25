import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODE_PAIRS, modeAt, chaosModesAt, chladni, fieldValue } from '../js/field-math.js';

test('nodal line on the diagonal when weights are equal', () => {
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 2 - 1;
    const [n, m] = MODE_PAIRS[i % MODE_PAIRS.length];
    assert.ok(Math.abs(chladni(x, x, n, m)) < 1e-12);
  }
  assert.equal(chladni(0, 0, 2, 5), 0);
});

test('field is antisymmetric under swapping x and y', () => {
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1;
    assert.ok(Math.abs(chladni(x, y, 3, 5) + chladni(y, x, 3, 5)) < 1e-12);
  }
});

test('mode pairs are distinct n<m', () => {
  assert.equal(MODE_PAIRS.length, 20);
  for (const [n, m] of MODE_PAIRS) assert.ok(n < m);
});

test('modeAt maps 1..12 onto the pair list with a fractional crossfade', () => {
  assert.deepEqual(modeAt(1), { a: [1, 2], b: [1, 3], t: 0 });
  const end = modeAt(12);
  assert.deepEqual(end.a, MODE_PAIRS.at(-1));
  assert.equal(end.t, 0);
  let lastIdx = -1;
  for (let f = 1; f <= 12; f += 0.01) {
    const { a, t } = modeAt(f);
    const idx = MODE_PAIRS.findIndex(p => p[0] === a[0] && p[1] === a[1]);
    assert.ok(t >= 0 && t < 1);
    assert.ok(idx >= lastIdx);
    lastIdx = idx;
  }
  assert.deepEqual(modeAt(-5), modeAt(1));
});

test('chaosModesAt returns two sets of three valid pairs and a crossfade', () => {
  for (const f of [1, 6, 12]) {
    const { a, b, t } = chaosModesAt(f);
    assert.equal(a.length, 3);
    assert.equal(b.length, 3);
    assert.ok(t >= 0 && t < 1);
    for (const p of [...a, ...b]) assert.ok(MODE_PAIRS.includes(p));
  }
});

test('field never pops as frequency sweeps, even at high chaos', () => {
  const pts = Array.from({ length: 40 }, (_, i) => [Math.sin(i * 1.7) * 0.9, Math.cos(i * 2.3) * 0.9]);
  for (const chaos of [0.25, 0.85]) {
    let worst = 0;
    for (let f = 1; f < 12; f += 0.0005) {
      for (const [x, y] of pts) {
        const d = Math.abs(fieldValue(x, y, { freq: f + 0.0005, chaos, time: 3 }) - fieldValue(x, y, { freq: f, chaos, time: 3 }));
        worst = Math.max(worst, d);
      }
    }
    assert.ok(worst < 0.05, `chaos ${chaos}: max jump ${worst.toFixed(3)} for a 0.0005 frequency step`);
  }
});
