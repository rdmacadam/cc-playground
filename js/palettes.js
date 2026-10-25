// Curated palettes and their slow, melting crossfades.
// Each palette: [deep, positive, negative, ribbon, highlight].

export const hexToRgb = hex => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const make = (name, hexes) => ({ name, hexes, colors: hexes.map(hexToRgb) });

export const PALETTES = [
  make('Aurora', ['#05060f', '#1ec8b0', '#7b3fe4', '#ff4fd8', '#fff4fb']),
  make('Ember', ['#0a0302', '#c2261b', '#5a0b2e', '#ffb238', '#fff1c9']),
  make('Abyss', ['#01040c', '#0b3a6e', '#0a1b3f', '#3ff3ff', '#e8ffff']),
  make('Opal', ['#0f0d18', '#c48bb4', '#6fa6cf', '#fff1e0', '#ffffff']),
  make('Nebula', ['#07041a', '#3b2a8c', '#b8336a', '#ffb057', '#ffe9f1']),
];

const clamp01 = v => Math.min(1, Math.max(0, v));
const smoothstep = t => t * t * (3 - 2 * t);

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = t => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export function rotateHue(rgb, deg) {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h + deg / 360, s, l]).map(clamp01);
}

export function blendColors(a, b, t) {
  const k = smoothstep(clamp01(t));
  return a.map((ca, i) => ca.map((v, j) => v + (b[i][j] - v) * k));
}

export function paletteAt(timeSec, { pinned = null, hold = 40, fade = 10, hueShift = 0 } = {}) {
  let colors;
  if (pinned !== null && PALETTES[pinned]) {
    colors = PALETTES[pinned].colors;
  } else {
    const span = hold + fade;
    const n = PALETTES.length;
    const t = ((timeSec % (span * n)) + span * n) % (span * n);
    const idx = Math.floor(t / span);
    const local = t - idx * span;
    const from = PALETTES[idx].colors;
    colors = local < hold ? from : blendColors(from, PALETTES[(idx + 1) % n].colors, (local - hold) / fade);
  }
  return hueShift ? colors.map(c => rotateHue(c, hueShift)) : colors;
}
