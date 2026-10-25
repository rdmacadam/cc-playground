// Bloom and final composite: glow, vignette, tone mapping, grain and dither.

import { FULLSCREEN_VS, FRAG_PRECISION } from './common.js';

export const POST_VS = FULLSCREEN_VS;

export const COPY_FS = `
${FRAG_PRECISION}
uniform sampler2D u_src;
varying vec2 v_uv;
void main() {
  gl_FragColor = vec4(texture2D(u_src, v_uv).rgb, 1.0);
}`;

export const BRIGHT_FS = `
${FRAG_PRECISION}
uniform sampler2D u_src;
uniform vec2 u_texel;
varying vec2 v_uv;
void main() {
  vec3 c = 0.25 * (texture2D(u_src, v_uv + u_texel * vec2(-1.0, -1.0)).rgb
                 + texture2D(u_src, v_uv + u_texel * vec2(1.0, -1.0)).rgb
                 + texture2D(u_src, v_uv + u_texel * vec2(-1.0, 1.0)).rgb
                 + texture2D(u_src, v_uv + u_texel * vec2(1.0, 1.0)).rgb);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * smoothstep(0.42, 1.1, l), 1.0);
}`;

export const BLUR_FS = `
${FRAG_PRECISION}
uniform sampler2D u_src;
uniform vec2 u_dir;
varying vec2 v_uv;
void main() {
  vec3 c = texture2D(u_src, v_uv).rgb * 0.2270270;
  c += texture2D(u_src, v_uv + u_dir * 1.3846154).rgb * 0.3162162;
  c += texture2D(u_src, v_uv - u_dir * 1.3846154).rgb * 0.3162162;
  c += texture2D(u_src, v_uv + u_dir * 3.2307692).rgb * 0.0702703;
  c += texture2D(u_src, v_uv - u_dir * 3.2307692).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

export const COMPOSITE_FS = `
${FRAG_PRECISION}
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_glow;
uniform float u_beat;
uniform float u_time;
uniform vec2 u_res;
varying vec2 v_uv;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 c = texture2D(u_scene, v_uv).rgb;
  c += texture2D(u_bloom, v_uv).rgb * u_glow * (1.0 + u_beat * 0.8);
  vec2 q = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  c *= mix(0.5, 1.0, smoothstep(1.0, 0.25, length(q)));
  c = aces(c * 1.05);
  c = pow(c, vec3(0.95));
  vec2 px = v_uv * u_res;
  c += (hash(px + fract(u_time * 7.13) * 113.0) - 0.5) * 0.03;
  c += (hash(px * 1.7 + 5.3) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;
