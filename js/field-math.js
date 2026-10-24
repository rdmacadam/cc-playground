// Chladni plate math, mirrored in GLSL (js/shaders/common.js).

export const MODE_PAIRS = [
  [1, 2], [1, 3], [2, 3], [1, 4], [2, 5], [3, 4], [1, 5], [3, 5], [2, 7], [4, 5],
  [3, 7], [5, 6], [4, 7], [5, 7], [6, 7], [5, 8], [7, 8], [6, 9], [7, 9], [8, 9],
];

const last = MODE_PAIRS.length - 1;
const pair = i => MODE_PAIRS[Math.min(last, Math.max(0, i))];

const position = freq => (Math.min(12, Math.max(1, freq)) - 1) / 11 * last;

// Fractional frequency crossfades between neighbouring mode pairs, so the figure morphs.
export function modeAt(freq) {
  const x = position(freq);
  const i = Math.floor(x);
  return { a: pair(i), b: pair(i + 1), t: x - i };
}

export function chaosModes(freq) {
  const i = Math.round(position(freq));
  return [pair(i + 2), pair(i + 4), pair(i - 3)];
}

export function chladni(x, y, n, m, wa = 1, wb = 1) {
  const P = Math.PI;
  return wa * Math.cos(n * P * x) * Math.cos(m * P * y) - wb * Math.cos(m * P * x) * Math.cos(n * P * y);
}
