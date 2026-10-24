import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS, clamp, getDef, createParamState, setSlider, effectiveTarget, stepParams } from '../js/params.js';

test('clamp bounds values', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test('registry has the spec parameters with defaults inside range', () => {
  const ids = PARAMS.map(p => p.id);
  for (const id of ['frequency', 'amplitude', 'chaos', 'drift', 'scatter', 'hue', 'flow', 'melt', 'glow', 'density']) {
    assert.ok(ids.includes(id), id);
  }
  for (const p of PARAMS) assert.ok(p.default >= p.min && p.default <= p.max, p.id);
  assert.equal(getDef('frequency').default, 4);
  assert.equal(getDef('hue').wrap, true);
});

test('effectiveTarget adds offset in range fractions and clamps', () => {
  assert.equal(effectiveTarget(getDef('frequency'), 4, 0.5), 9.5);
  assert.equal(effectiveTarget(getDef('amplitude'), 0.9, 0.5), 1);
});

test('effectiveTarget wraps hue past 360', () => {
  assert.ok(Math.abs(effectiveTarget(getDef('hue'), 300, 0.25) - 30) < 1e-9);
  assert.ok(Math.abs(effectiveTarget(getDef('hue'), 10, -0.25) - 280) < 1e-9);
});

test('setSlider clamps', () => {
  const s = createParamState(PARAMS);
  setSlider(s, getDef('chaos'), 7);
  assert.equal(s.slider.chaos, 1);
});

test('stepParams eases exponentially, frame-rate independent', () => {
  const s = createParamState(PARAMS);
  setSlider(s, getDef('amplitude'), 1);
  stepParams(s, PARAMS, {}, 0.35);
  const expected = 0.6 + 0.4 * (1 - Math.exp(-1));
  assert.ok(Math.abs(s.value.amplitude - expected) < 1e-6);
  const s2 = createParamState(PARAMS);
  setSlider(s2, getDef('amplitude'), 1);
  for (let i = 0; i < 35; i++) stepParams(s2, PARAMS, {}, 0.01);
  assert.ok(Math.abs(s2.value.amplitude - expected) < 1e-6);
});

test('stepParams with a huge dt lands on target without overshoot or NaN', () => {
  const s = createParamState(PARAMS);
  setSlider(s, getDef('frequency'), 11);
  stepParams(s, PARAMS, { frequency: 0.05 }, 30);
  for (const p of PARAMS) assert.ok(Number.isFinite(s.value[p.id]), p.id);
  assert.ok(Math.abs(s.value.frequency - 11.55) < 1e-9);
});

test('wrapped params ease along the shortest arc', () => {
  const s = createParamState(PARAMS);
  s.value.hue = 350;
  setSlider(s, getDef('hue'), 10);
  stepParams(s, PARAMS, {}, 0.05);
  const v = s.value.hue;
  assert.ok((v > 350 && v < 360) || (v >= 0 && v < 10), String(v));
});
