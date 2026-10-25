// GLSL ES 1.00 shared by field and sand shaders. Mirrors js/field-math.js.

export const FULLSCREEN_VS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Fragment highp is optional in WebGL1; samplers default to lowp, which would round float state.
export const FRAG_PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp sampler2D;
#else
precision mediump float;
#endif
`;

export const FIELD_GLSL = `
uniform float u_time;
uniform vec2 u_modeA;
uniform vec2 u_modeB;
uniform float u_modeT;
uniform vec2 u_chaosA;
uniform vec2 u_chaosB;
uniform vec2 u_chaosC;
uniform vec2 u_chaosA2;
uniform vec2 u_chaosB2;
uniform vec2 u_chaosC2;
uniform float u_chaosT;
uniform float u_chaos;
uniform float u_drift;
uniform float u_amp;
uniform float u_flow;

const float PI = 3.14159265;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 flowVec(vec2 p) {
  float t = u_time * 0.06;
  return vec2(vnoise(p * 1.3 + vec2(t, 0.0)), vnoise(p * 1.3 + vec2(17.3, -t))) * 2.0 - 1.0;
}

float chladni(vec2 p, vec2 nm, float wa, float wb) {
  return wa * cos(nm.x * PI * p.x) * cos(nm.y * PI * p.y)
       - wb * cos(nm.y * PI * p.x) * cos(nm.x * PI * p.y);
}

// Slow drift rotation plus a two-level domain warp: lines become liquid silk.
vec2 warp(vec2 p) {
  float ang = u_drift * 0.3 * sin(u_time * 0.07);
  float c = cos(ang);
  float s = sin(ang);
  p = mat2(c, -s, s, c) * p;
  p += u_flow * 0.14 * flowVec(p + flowVec(p * 0.7) * 0.6);
  return p;
}

float fieldAt(vec2 p) {
  float t = u_time;
  float wa = 1.0 + 0.45 * u_drift * sin(t * 0.23);
  float wb = 1.0 + 0.45 * u_drift * sin(t * 0.31 + 1.7);
  vec2 q = p * (1.0 + 0.04 * u_amp * sin(t * 0.9));
  float f = mix(chladni(q, u_modeA, wa, wb), chladni(q, u_modeB, wa, wb), smoothstep(0.0, 1.0, u_modeT));
  float c = u_chaos;
  float k2 = smoothstep(0.0, 1.0, u_chaosT);
  vec2 qb = q * 1.07 + 0.1;
  vec2 qc = q.yx * 0.93;
  f += c * (0.45 + 0.25 * sin(t * 0.17 + 0.5)) * mix(chladni(q, u_chaosA, 1.0, 1.0), chladni(q, u_chaosA2, 1.0, 1.0), k2);
  f += c * (0.35 + 0.2 * sin(t * 0.13 + 2.1)) * mix(chladni(qb, u_chaosB, 1.0, 1.0), chladni(qb, u_chaosB2, 1.0, 1.0), k2);
  f += c * (0.25 + 0.15 * cos(t * 0.11)) * mix(chladni(qc, u_chaosC, 1.0, wa), chladni(qc, u_chaosC2, 1.0, wa), k2);
  return f / (1.0 + c * 0.9);
}
`;
