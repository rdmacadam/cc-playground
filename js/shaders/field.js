// The hero layer: field → palette colors, blended with the flowing previous frame.

import { FIELD_GLSL, FULLSCREEN_VS } from './common.js';

export const FIELD_VS = FULLSCREEN_VS;

export const FIELD_FS = `
precision highp float;
${FIELD_GLSL}
uniform sampler2D u_prev;
uniform vec2 u_view;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_c4;
uniform float u_scatter;
uniform float u_melt;
uniform float u_fieldMix;
uniform float u_dither;
varying vec2 v_uv;

void main() {
  vec2 p = (v_uv * 2.0 - 1.0) * u_view;
  vec2 w = warp(p);
  float s = clamp(fieldAt(w) * 0.5, -1.0, 1.0);

  float width = mix(0.03, 0.3, u_scatter) / (0.6 + u_amp);
  float line = exp(-(s * s) / (width * width));
  float halo = exp(-(s * s) / (width * width * 9.0));

  // Antinode tones drift iridescently across the plate.
  float iri = 0.5 + 0.5 * sin(dot(w, vec2(1.3, 0.7)) * 1.7 + u_time * 0.05);
  vec3 pos = mix(u_c1, u_c2, iri * 0.35);
  vec3 neg = mix(u_c2, u_c1, iri * 0.35);
  float body = 0.55 + 0.45 * u_amp;

  vec3 col = u_c0;
  col = mix(col, pos, smoothstep(0.0, 0.95, s) * body);
  col = mix(col, neg, smoothstep(0.0, 0.95, -s) * body);
  col = mix(col, mix(col, u_c3, 0.5), halo * 0.6);
  col = mix(col, u_c3, line * (0.65 + 0.35 * u_amp));
  col += u_c4 * pow(line, 6.0) * (0.35 + 0.6 * u_amp);
  col = mix(u_c0 * 0.7, col, u_fieldMix);

  // Feedback: previous frame, nudged along the flow, melts into the new one.
  vec2 disp = flowVec(p * 0.8 + 3.1) * 0.0022 * (0.3 + u_flow);
  vec2 puv = (v_uv - 0.5) * 0.999 + 0.5 + disp;
  vec3 prev = texture2D(u_prev, puv).rgb;
  vec3 outc = mix(col, prev, u_melt * 0.94);
  outc += (hash21(gl_FragCoord.xy + fract(u_time) * 91.7) - 0.5) * u_dither;
  gl_FragColor = vec4(max(outc, 0.0), 1.0);
}`;
