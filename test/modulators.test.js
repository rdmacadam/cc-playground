import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCES, lfoValue, createModMatrix, addRoute, removeRoute, advanceLfos, evaluateSources,
  computeOffsets, applyPatch, clearTag, setRouteDepth, AUTOPILOT_PATCH, AUDIO_PATCH, AUTOPILOT_LFOS,
} from '../js/modulators.js';
import { PRESETS, randomValues } from '../js/presets.js';
import { PARAMS, getDef } from '../js/params.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('sine and triangle LFO shapes', () => {
  assert.ok(near(lfoValue('sine', 0.25), 1));
  assert.ok(near(lfoValue('sine', 0), 0));
  assert.ok(near(lfoValue('triangle', 0), -1));
  assert.ok(near(lfoValue('triangle', 0.5), 1));
  assert.ok(near(lfoValue('triangle', 1.25), lfoValue('triangle', 0.25)));
});

test('wander LFO is continuous and bounded', () => {
  for (let i = 0; i < 1000; i++) {
    const p = i * 0.0137;
    const a = lfoValue('wander', p, 3), b = lfoValue('wander', p + 1e-4, 3);
    assert.ok(a >= -1 && a <= 1, String(a));
    assert.ok(Math.abs(a - b) < 1e-2);
  }
  assert.notEqual(lfoValue('wander', 0.3, 1), lfoValue('wander', 0.3, 2));
});

test('matrix has 4 LFOs and SOURCES lists LFOs + audio signals', () => {
  const m = createModMatrix();
  assert.equal(m.lfos.length, 4);
  assert.deepEqual(SOURCES, ['lfo1', 'lfo2', 'lfo3', 'lfo4', 'bass', 'mid', 'treble', 'loudness', 'beat', 'pitch']);
});

test('a third source on one parameter is refused without touching existing routes', () => {
  const m = createModMatrix();
  assert.equal(addRoute(m, 'chaos', 'lfo1', 0.3), true);
  assert.equal(addRoute(m, 'chaos', 'bass', -0.2), true);
  assert.equal(addRoute(m, 'chaos', 'mid', 0.5), false);
  assert.deepEqual(m.routes.chaos.map(r => [r.source, r.depth]), [['lfo1', 0.3], ['bass', -0.2]]);
});

test('re-adding the same source updates its depth; removeRoute removes', () => {
  const m = createModMatrix();
  addRoute(m, 'chaos', 'lfo1', 0.3);
  addRoute(m, 'chaos', 'lfo1', 0.6);
  assert.equal(m.routes.chaos.length, 1);
  assert.equal(m.routes.chaos[0].depth, 0.6);
  removeRoute(m, 'chaos', 'lfo1');
  assert.equal((m.routes.chaos || []).length, 0);
});

test('depth is clamped to -1..1', () => {
  const m = createModMatrix();
  addRoute(m, 'chaos', 'lfo1', 4);
  assert.equal(m.routes.chaos[0].depth, 1);
});

test('computeOffsets sums routes and honours skip and disabledTags', () => {
  const m = createModMatrix();
  addRoute(m, 'chaos', 'lfo1', 0.5, 'auto');
  addRoute(m, 'chaos', 'bass', 0.25, 'audio');
  addRoute(m, 'flow', 'lfo1', 1, 'user');
  const src = { lfo1: 0.5, bass: 1 };
  assert.ok(near(computeOffsets(m, src).chaos, 0.5));
  assert.ok(near(computeOffsets(m, src, { disabledTags: new Set(['auto']) }).chaos, 0.25));
  assert.equal(computeOffsets(m, src, { skip: new Set(['chaos']) }).chaos || 0, 0);
  assert.ok(near(computeOffsets(m, src).flow, 0.5));
});

test('evaluateSources scales LFOs by depth and passes audio through (0 if missing)', () => {
  const m = createModMatrix();
  m.lfos[0] = { shape: 'sine', rate: 1, depth: 0.5, phase: 0.25 };
  const s = evaluateSources(m, { bass: 0.7 });
  assert.ok(near(s.lfo1, 0.5));
  assert.equal(s.bass, 0.7);
  assert.equal(s.pitch, 0);
});

test('advanceLfos moves phase by rate*dt modulo 1', () => {
  const m = createModMatrix();
  m.lfos[0] = { shape: 'sine', rate: 0.5, depth: 1, phase: 0.9 };
  advanceLfos(m, 0.4);
  assert.ok(near(m.lfos[0].phase, 0.1));
});

test('autopilot + audio patches never exceed 2 sources per parameter', () => {
  const m = createModMatrix();
  applyPatch(m, AUTOPILOT_PATCH, 'auto');
  applyPatch(m, AUDIO_PATCH, 'audio');
  for (const [id, routes] of Object.entries(m.routes)) {
    assert.ok(routes.length <= 2, id);
    assert.ok(getDef(id), id);
  }
  assert.equal(AUTOPILOT_LFOS.length, 4);
  clearTag(m, 'audio');
  for (const routes of Object.values(m.routes)) assert.ok(routes.every(r => r.tag === 'auto'));
});

test('presets and random values stay inside parameter ranges', () => {
  assert.equal(PRESETS.length, 6);
  const all = [...PRESETS.map(p => p.values), ...Array.from({ length: 50 }, () => randomValues())];
  for (const values of all) {
    for (const [id, v] of Object.entries(values)) {
      const d = getDef(id);
      assert.ok(d && v >= d.min && v <= d.max, `${id}=${v}`);
    }
  }
  const r = randomValues(() => 0.999);
  assert.ok(r.chaos <= 0.7);
  for (const p of PRESETS) assert.ok(['color', 'both', 'sand'].includes(p.display));
  assert.ok(PARAMS.length > 0);
});

test('editing a route depth keeps its tag so the autopilot switch still controls it', () => {
  const m = createModMatrix();
  applyPatch(m, AUTOPILOT_PATCH, 'auto');
  setRouteDepth(m, 'hue', 'lfo2', 0.3);
  const r = m.routes.hue.find(x => x.source === 'lfo2');
  assert.equal(r.depth, 0.3);
  assert.equal(r.tag, 'auto');
});

test('applyPatch reports routes it could not place', () => {
  const m = createModMatrix();
  applyPatch(m, AUTOPILOT_PATCH, 'auto');
  addRoute(m, 'amplitude', 'lfo1', 0.2, 'user');
  const refused = applyPatch(m, AUDIO_PATCH, 'audio');
  assert.deepEqual(refused.map(r => `${r.param}:${r.source}`), ['amplitude:bass']);
  assert.deepEqual(applyPatch(createModMatrix(), AUTOPILOT_PATCH, 'auto'), []);
});
