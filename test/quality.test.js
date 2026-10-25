import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQualityGovernor } from '../js/quality.js';

test('quality steps down under slow frames and recovers when fast', () => {
  const q = createQualityGovernor();
  assert.equal(q.update(16), 1);
  let scale = 1;
  for (let t = 0; t < 3000; t += 30) scale = q.update(30);
  assert.equal(scale, 0.75);
  for (let t = 0; t < 3000; t += 30) scale = q.update(30);
  assert.equal(scale, 0.5);
  for (let t = 0; t < 6000; t += 8) scale = q.update(8);
  assert.equal(scale, 0.75);
});

test('a single long hitch does not drop quality', () => {
  const q = createQualityGovernor();
  q.update(500);
  let s = 1;
  for (let t = 0; t < 1000; t += 16) s = q.update(16);
  assert.equal(s, 1);
});

test('coming back from a hidden tab (one 30 s frame) does not drop quality', () => {
  const q = createQualityGovernor();
  for (let i = 0; i < 300; i++) q.update(16.7);
  let s = q.update(30000);
  for (let i = 0; i < 60; i++) s = q.update(16.7);
  assert.equal(s, 1);
});

test('a vsync-locked 60 Hz display recovers after a slow patch', () => {
  const q = createQualityGovernor();
  for (let t = 0; t < 3000; t += 30) q.update(30);
  assert.equal(q.update(30), 0.75);
  let s = 0.75;
  for (let i = 0; i < 60 * 10; i++) s = q.update(16.7);
  assert.equal(s, 1);
});
