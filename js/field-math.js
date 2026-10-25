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

const chaosSet = i => [pair(i + 2), pair(i + 4), pair(i - 3)];

// Extra modes for Chaos, crossfaded the same way as the main mode so they never pop.
export function chaosModesAt(freq) {
  const x = position(freq);
  const i = Math.floor(x);
  return { a: chaosSet(i), b: chaosSet(i + 1), t: x - i };
}

export function chladni(x, y, n, m, wa = 1, wb = 1) {
  const P = Math.PI;
  return wa * Math.cos(n * P * x) * Math.cos(m * P * y) - wb * Math.cos(m * P * x) * Math.cos(n * P * y);
}

const smoothstep = t => t * t * (3 - 2 * t);

// JS mirror of fieldAt() in js/shaders/common.js (without the flow warp), used by tests.
export function fieldValue(x, y, { freq, chaos = 0, drift = 0.35, amp = 0.6, time = 0 }) {
  const wa = 1 + 0.45 * drift * Math.sin(time * 0.23);
  const wb = 1 + 0.45 * drift * Math.sin(time * 0.31 + 1.7);
  const z = 1 + 0.04 * amp * Math.sin(time * 0.9);
  const qx = x * z, qy = y * z;
  const m = modeAt(freq);
  const k = smoothstep(m.t);
  let f = chladni(qx, qy, ...m.a, wa, wb) * (1 - k) + chladni(qx, qy, ...m.b, wa, wb) * k;
  const c = chaosModesAt(freq);
  const k2 = smoothstep(c.t);
  const mixPair = (j, fn) => fn(c.a[j]) * (1 - k2) + fn(c.b[j]) * k2;
  f += chaos * (0.45 + 0.25 * Math.sin(time * 0.17 + 0.5)) * mixPair(0, ([n, mm]) => chladni(qx, qy, n, mm));
  f += chaos * (0.35 + 0.2 * Math.sin(time * 0.13 + 2.1)) * mixPair(1, ([n, mm]) => chladni(qx * 1.07 + 0.1, qy * 1.07 + 0.1, n, mm));
  f += chaos * (0.25 + 0.15 * Math.cos(time * 0.11)) * mixPair(2, ([n, mm]) => chladni(qy * 0.93, qx * 0.93, n, mm, 1, wa));
  return f / (1 + chaos * 0.9);
}
