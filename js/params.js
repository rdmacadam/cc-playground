// Parameter registry: single source of truth for every live-tweakable value.
// Pure module (no DOM) so it can be unit-tested in Node.

const pct = v => `${Math.round(v * 100)}%`;

export const PARAMS = [
  { id: 'frequency', label: 'Frequency', group: 'vibration', min: 1, max: 12, default: 4, smooth: 0.8, format: v => v.toFixed(2) },
  { id: 'amplitude', label: 'Amplitude', group: 'vibration', min: 0, max: 1, default: 0.6, format: pct },
  { id: 'chaos', label: 'Chaos', group: 'vibration', min: 0, max: 1, default: 0.25, format: pct },
  { id: 'drift', label: 'Drift', group: 'vibration', min: 0, max: 1, default: 0.35, format: pct },
  { id: 'scatter', label: 'Scatter', group: 'vibration', min: 0, max: 1, default: 0.35, format: pct },
  { id: 'hue', label: 'Hue Shift', group: 'color', min: 0, max: 360, default: 0, wrap: true, smooth: 0.5, format: v => `${Math.round(v)}°` },
  { id: 'flow', label: 'Flow', group: 'color', min: 0, max: 1, default: 0.4, format: pct },
  { id: 'melt', label: 'Melt', group: 'color', min: 0, max: 1, default: 0.6, format: pct },
  { id: 'glow', label: 'Glow', group: 'color', min: 0, max: 1.5, default: 0.8, format: v => v.toFixed(2) },
  { id: 'density', label: 'Particle density', group: 'sand', min: 0.1, max: 1, default: 0.6, format: pct },
].map(p => ({ smooth: 0.35, ...p }));

const BY_ID = Object.fromEntries(PARAMS.map(p => [p.id, p]));

export const getDef = id => BY_ID[id];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const wrapInto = (v, lo, hi) => {
  const span = hi - lo;
  return lo + ((((v - lo) % span) + span) % span);
};

export function createParamState(defs) {
  const slider = {};
  const value = {};
  for (const d of defs) slider[d.id] = value[d.id] = d.default;
  return { slider, value };
}

export function setSlider(state, def, v) {
  state.slider[def.id] = def.wrap ? wrapInto(v, def.min, def.max) : clamp(v, def.min, def.max);
}

export function effectiveTarget(def, slider, offset = 0) {
  const v = slider + offset * (def.max - def.min);
  return def.wrap ? wrapInto(v, def.min, def.max) : clamp(v, def.min, def.max);
}

export function stepParams(state, defs, offsets, dt) {
  for (const d of defs) {
    const target = effectiveTarget(d, state.slider[d.id], offsets[d.id] || 0);
    const k = 1 - Math.exp(-Math.max(0, dt) / d.smooth);
    const cur = state.value[d.id];
    if (d.wrap) {
      const span = d.max - d.min;
      let delta = target - cur;
      delta -= span * Math.round(delta / span);
      state.value[d.id] = k >= 1 - 1e-12 ? target : wrapInto(cur + delta * k, d.min, d.max);
    } else {
      state.value[d.id] = k >= 1 - 1e-12 ? target : cur + (target - cur) * k;
    }
  }
}
