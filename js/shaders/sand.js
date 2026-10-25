// Sand particles: state lives in a float texture (xy = plate position, z = seed, w = age).

import { FIELD_GLSL, FULLSCREEN_VS, FRAG_PRECISION } from './common.js';

export const SAND_UPDATE_VS = FULLSCREEN_VS;

export const SAND_UPDATE_FS = `
${FRAG_PRECISION}
${FIELD_GLSL}
uniform sampler2D u_state;
uniform vec2 u_view;
uniform float u_dt;
uniform float u_scatter;
uniform float u_seed;
varying vec2 v_uv;

float energy(vec2 p) {
  float f = fieldAt(warp(p));
  return f * f;
}

void main() {
  vec4 st = texture2D(u_state, v_uv);
  vec2 p = st.xy;
  float e = 0.004;
  vec2 grad = vec2(energy(p + vec2(e, 0.0)) - energy(p - vec2(e, 0.0)),
                   energy(p + vec2(0.0, e)) - energy(p - vec2(0.0, e))) / (2.0 * e);
  float f = abs(fieldAt(warp(p)));

  // Overdamped motion: grains slide downhill toward the still nodal lines,
  // and get shaken harder where the plate moves most (the antinodes).
  float r1 = hash21(v_uv * 913.7 + u_seed);
  float r2 = hash21(v_uv * 271.3 + u_seed + 3.1);
  vec2 jitter = (vec2(r1, r2) - 0.5) * 2.0 * (0.03 + 0.45 * u_scatter) * (0.15 + f) * (0.4 + u_amp);
  vec2 v = -grad * 0.008 * (0.4 + u_amp) + jitter;
  float speed = length(v);
  if (speed > 1.5) v *= 1.5 / speed;
  p += v * u_dt;
  float age = st.w + u_dt;

  bool outside = abs(p.x) > u_view.x * 1.05 || abs(p.y) > u_view.y * 1.05;
  float respawn = hash21(v_uv * 57.1 + u_seed * 1.37);
  if (outside || respawn < 0.002) {
    p = (vec2(hash21(v_uv + u_seed + 7.7), hash21(v_uv * 3.3 + u_seed)) * 2.0 - 1.0) * u_view;
    age = 0.0;
  }
  gl_FragColor = vec4(p, st.z, age);
}`;

export const SAND_DRAW_VS = `
precision highp float;
precision highp sampler2D;
attribute vec2 a_pos;
uniform sampler2D u_state;
uniform vec2 u_view;
uniform float u_size;
varying float v_fade;
void main() {
  vec4 st = texture2D(u_state, a_pos);
  gl_Position = vec4(st.xy / u_view, 0.0, 1.0);
  gl_PointSize = u_size * (0.7 + 0.6 * st.z);
  v_fade = clamp(st.w * 2.0, 0.0, 1.0);
}`;

export const SAND_DRAW_FS = `
${FRAG_PRECISION}
uniform vec3 u_color;
uniform float u_intensity;
varying float v_fade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(u_color * a * u_intensity * v_fade, 1.0);
}`;
