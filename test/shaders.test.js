import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_FS } from '../js/shaders/field.js';
import { BRIGHT_FS, BLUR_FS, COMPOSITE_FS } from '../js/shaders/post.js';
import { SAND_UPDATE_FS, SAND_DRAW_VS, SAND_DRAW_FS } from '../js/shaders/sand.js';

test('fragment shaders fall back to mediump on GPUs without fragment highp', () => {
  for (const src of [FIELD_FS, BRIGHT_FS, BLUR_FS, COMPOSITE_FS, SAND_UPDATE_FS, SAND_DRAW_FS]) {
    assert.match(src, /#ifdef GL_FRAGMENT_PRECISION_HIGH/);
    assert.match(src, /precision mediump float;/);
  }
});

test('shaders that read float state ask for highp samplers', () => {
  for (const src of [FIELD_FS, SAND_UPDATE_FS, SAND_DRAW_VS]) assert.match(src, /precision highp sampler2D;/);
});
