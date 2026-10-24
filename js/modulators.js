// Modulation matrix: LFOs and audio signals routed onto parameters.
// Offsets are in fractions of a parameter's range (see params.effectiveTarget).

import { clamp } from './params.js';

export const SOURCES = ['lfo1', 'lfo2', 'lfo3', 'lfo4', 'bass', 'mid', 'treble', 'loudness', 'beat', 'pitch'];
export const AUDIO_SOURCES = SOURCES.slice(4);
export const MAX_ROUTES = 2;

const TAU = Math.PI * 2;

function hash(i, seed) {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// Smooth value noise: cosine interpolation between hashed knots, 4 knots per cycle.
function wander(phase, seed) {
  const x = phase * 4;
  const i = Math.floor(x);
  const f = x - i;
  const t = (1 - Math.cos(f * Math.PI)) / 2;
  return hash(i, seed) * (1 - t) + hash(i + 1, seed) * t;
}

export function lfoValue(shape, phase, seed = 0) {
  const p = phase - Math.floor(phase);
  switch (shape) {
    case 'triangle': return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
    case 'wander': return wander(phase, seed);
    default: return Math.sin(p * TAU);
  }
}

export const AUTOPILOT_LFOS = [
  { shape: 'wander', rate: 0.02, depth: 1 },
  { shape: 'sine', rate: 0.013, depth: 1 },
  { shape: 'sine', rate: 0.05, depth: 1 },
  { shape: 'triangle', rate: 0.03, depth: 1 },
];

export const AUTOPILOT_PATCH = [
  { param: 'frequency', source: 'lfo1', depth: 0.22 },
  { param: 'hue', source: 'lfo2', depth: 0.5 },
  { param: 'chaos', source: 'lfo3', depth: 0.2 },
  { param: 'amplitude', source: 'lfo3', depth: 0.15 },
  { param: 'flow', source: 'lfo4', depth: 0.2 },
  { param: 'scatter', source: 'lfo4', depth: 0.15 },
  { param: 'drift', source: 'lfo2', depth: 0.15 },
];

export const AUDIO_PATCH = [
  { param: 'amplitude', source: 'bass', depth: 0.35 },
  { param: 'glow', source: 'bass', depth: 0.3 },
  { param: 'glow', source: 'beat', depth: 0.35 },
  { param: 'hue', source: 'beat', depth: 0.04 },
  { param: 'chaos', source: 'mid', depth: 0.3 },
  { param: 'scatter', source: 'treble', depth: 0.3 },
  { param: 'frequency', source: 'pitch', depth: 0.35 },
];

export function createModMatrix() {
  return {
    lfos: AUTOPILOT_LFOS.map((l, i) => ({ ...l, phase: i * 0.27 })),
    routes: {},
  };
}

export function addRoute(m, paramId, source, depth, tag = 'user') {
  const routes = (m.routes[paramId] ||= []);
  const d = clamp(depth, -1, 1);
  const existing = routes.find(r => r.source === source);
  if (existing) {
    existing.depth = d;
    existing.tag = tag;
    return true;
  }
  if (routes.length >= MAX_ROUTES) return false;
  routes.push({ source, depth: d, tag });
  return true;
}

export function removeRoute(m, paramId, source) {
  if (!m.routes[paramId]) return;
  m.routes[paramId] = m.routes[paramId].filter(r => r.source !== source);
}

export function applyPatch(m, patch, tag) {
  for (const { param, source, depth } of patch) addRoute(m, param, source, depth, tag);
}

export function clearTag(m, tag) {
  for (const id of Object.keys(m.routes)) m.routes[id] = m.routes[id].filter(r => r.tag !== tag);
}

export function advanceLfos(m, dt) {
  for (const l of m.lfos) l.phase = (l.phase + l.rate * dt) % 1;
}

export function evaluateSources(m, audio = {}) {
  const out = {};
  m.lfos.forEach((l, i) => { out[`lfo${i + 1}`] = lfoValue(l.shape, l.phase, i + 1) * l.depth; });
  for (const s of AUDIO_SOURCES) out[s] = audio[s] || 0;
  return out;
}

export function computeOffsets(m, sources, { skip = new Set(), disabledTags = new Set() } = {}) {
  const out = {};
  for (const [id, routes] of Object.entries(m.routes)) {
    if (skip.has(id)) continue;
    let sum = 0;
    for (const r of routes) if (!disabledTags.has(r.tag)) sum += (sources[r.source] || 0) * r.depth;
    out[id] = sum;
  }
  return out;
}
