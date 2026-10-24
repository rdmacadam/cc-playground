// Hand-tuned starting points and a curated randomiser.

import { PARAMS } from './params.js';

export const PRESETS = [
  { name: 'Still Pond', palette: 2, display: 'color',
    values: { frequency: 2.5, amplitude: 0.45, chaos: 0.05, drift: 0.15, scatter: 0.55, flow: 0.25, melt: 0.8, glow: 0.6 } },
  { name: 'Silk Storm', palette: 0, display: 'color',
    values: { frequency: 6.5, amplitude: 0.8, chaos: 0.45, drift: 0.7, scatter: 0.3, flow: 0.75, melt: 0.7, glow: 1.0 } },
  { name: 'Heartbeat', palette: 1, display: 'both',
    values: { frequency: 4, amplitude: 0.55, chaos: 0.2, drift: 0.3, scatter: 0.25, flow: 0.4, melt: 0.55, glow: 0.9 } },
  { name: 'Madness', palette: 4, display: 'both',
    values: { frequency: 10.5, amplitude: 0.95, chaos: 0.85, drift: 0.95, scatter: 0.2, flow: 0.9, melt: 0.5, glow: 1.3 } },
  { name: 'Opal Dream', palette: 3, display: 'color',
    values: { frequency: 5, amplitude: 0.5, chaos: 0.15, drift: 0.25, scatter: 0.7, flow: 0.5, melt: 0.85, glow: 0.5 } },
  { name: 'Ember Lace', palette: 1, display: 'sand',
    values: { frequency: 8, amplitude: 0.7, chaos: 0.1, drift: 0.2, scatter: 0.15, flow: 0.2, melt: 0.6, glow: 1.1, density: 0.9 } },
];

// Curated ranges keep random figures beautiful; unlisted params use their full range.
const RANDOM_RANGES = {
  chaos: [0, 0.7],
  melt: [0.3, 0.85],
  amplitude: [0.35, 0.95],
  glow: [0.4, 1.2],
};

export function randomValues(rng = Math.random) {
  const out = {};
  for (const p of PARAMS) {
    if (p.id === 'density') continue;
    const [lo, hi] = RANDOM_RANGES[p.id] || [p.min, p.max];
    out[p.id] = lo + (hi - lo) * rng();
  }
  return out;
}
