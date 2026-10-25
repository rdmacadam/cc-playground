// Boot: wires params, modulators, audio, palettes, renderer and UI into one frame loop.

import { PARAMS, getDef, createParamState, setSlider, stepParams } from './params.js';
import {
  createModMatrix, addRoute, removeRoute, advanceLfos, evaluateSources, computeOffsets,
  applyPatch, clearTag, setRouteDepth, AUTOPILOT_PATCH, AUDIO_PATCH,
} from './modulators.js';
import { PRESETS, randomValues } from './presets.js';
import { PALETTES, paletteAt } from './palettes.js';
import { createQualityGovernor } from './quality.js';
import { createRenderer } from './renderer.js';
import { createAudioInput } from './audio.js';
import { createUI } from './ui.js';

const query = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
const debug = (window.__chladni = { ready: false, glVersion: 0, frames: 0, errors: [] });
window.addEventListener('error', e => debug.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', e => debug.errors.push(String(e.reason)));

function showFallback(message) {
  document.getElementById('fallback').hidden = false;
  document.getElementById('fallback-msg').textContent = message;
  document.getElementById('panel').hidden = true;
  document.getElementById('signature').hidden = true;
}

let renderer;
try {
  renderer = createRenderer(canvas, { forceWebGL1: query.get('gl') === '1' });
} catch (e) {
  debug.errors.push(String(e.message));
  console.error(e);
  showFallback(/WebGL is not available/.test(e.message) ? e.message : 'The renderer could not start on this device.');
  throw e;
}
debug.glVersion = renderer.isWebGL2 ? 2 : 1;

const state = createParamState(PARAMS);
const matrix = createModMatrix();
applyPatch(matrix, AUTOPILOT_PATCH, 'auto');
const audio = createAudioInput();
const quality = createQualityGovernor();
const held = new Set();
const settings = { pinned: null, display: 'color', paused: false };
let colors = paletteAt(0).map(c => c.slice());
let captureRequested = false;

function setValues(values) {
  for (const [id, v] of Object.entries(values)) setSlider(state, getDef(id), v);
  ui.syncSliders();
}

async function startAudio(start, mode, okMsg) {
  try {
    await start();
    clearTag(matrix, 'audio');
    const refused = applyPatch(matrix, AUDIO_PATCH, 'audio');
    ui.setAudioMode(mode);
    ui.toast(refused.length
      ? `${okMsg}. Sound could not reach ${[...new Set(refused.map(r => getDef(r.param).label))].join(', ')}: each slider takes two sources.`
      : okMsg, refused.length ? 5200 : 3200);
  } catch (e) {
    ui.setAudioMode(audio.mode);
    ui.toast(e.message || 'Audio could not start.');
  }
}

const ui = createUI({
  root: document.getElementById('panel'),
  openButton: document.getElementById('panel-open'),
  defs: PARAMS, state, matrix, presets: PRESETS, palettes: PALETTES,
  sandSupported: renderer.sandSupported,
  callbacks: {
    onSlider: (id, v) => setSlider(state, getDef(id), v),
    onHold: (id, on) => (on ? held.add(id) : held.delete(id)),
    onPreset: i => {
      const p = PRESETS[i];
      setValues(p.values);
      settings.pinned = p.palette;
      ui.setPalette(p.palette);
      if (renderer.sandSupported || p.display === 'color') {
        settings.display = p.display;
        ui.setDisplay(p.display);
      }
    },
    onRandom: () => { setValues(randomValues()); ui.markPreset(-1); },
    onPalette: i => { settings.pinned = i; },
    onDisplay: m => { settings.display = m; },
    // Switching autopilot off removes its routes, freeing their slots for sound or your own links.
    onAutopilot: on => {
      if (on) applyPatch(matrix, AUTOPILOT_PATCH, 'auto');
      else clearTag(matrix, 'auto');
      ui.syncSliders();
    },
    onMic: () => startAudio(() => audio.startMic(), 'mic', 'Listening — sing, speak or play something'),
    onFile: file => startAudio(() => audio.startFile(file), 'file', `Playing ${file.name}`),
    onAudioOff: () => { audio.stop(); clearTag(matrix, 'audio'); ui.setAudioMode('off'); },
    onCapture: () => { captureRequested = true; },
    onRoute: (id, source, depth) => {
      if (depth === null) removeRoute(matrix, id, source);
      else if ((matrix.routes[id] || []).some(r => r.source === source)) setRouteDepth(matrix, id, source, depth);
      else addRoute(matrix, id, source, depth, 'user');
    },
    onLfo: (i, cfg) => Object.assign(matrix.lfos[i], cfg),
  },
});

// ----- input -----
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  const k = e.key.toLowerCase();
  if (k === 'h') ui.togglePanel();
  else if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (k === ' ' && tag !== 'BUTTON' && tag !== 'SELECT') {
    e.preventDefault();
    settings.paused = !settings.paused;
    ui.toast(settings.paused ? 'Paused' : 'Flowing again', 1400);
  } else if (k === 's') captureRequested = true;
});

const dropHint = document.getElementById('drop-hint');
window.addEventListener('dragover', e => { e.preventDefault(); dropHint.classList.add('show'); });
window.addEventListener('dragleave', e => { if (!e.relatedTarget) dropHint.classList.remove('show'); });
window.addEventListener('drop', e => {
  e.preventDefault();
  dropHint.classList.remove('show');
  const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('audio/'));
  if (file) startAudio(() => audio.startFile(file), 'file', `Playing ${file.name}`);
  else ui.toast('Drop an audio file (mp3, wav, ogg…)');
});

canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ui.toast('Graphics were reset — reloading…'); });
canvas.addEventListener('webglcontextrestored', () => location.reload());

// Inside a hosted viewer (claude.ai artifact) saves go through its download prompt.
let hostDownloads = null;
window.claude?.use?.('downloads').then(d => { hostDownloads = d; }, () => {});

function dataUrlToBlob(dataUrl) {
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new Blob([buf], { type: 'image/png' });
}

function download(dataUrl) {
  const filename = `chladni-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  if (hostDownloads) {
    hostDownloads.save({ filename, data: dataUrlToBlob(dataUrl) })
      .then(() => ui.toast('Image saved', 1600))
      .catch(e => { if (e?.code !== 'declined') ui.toast('Saving images is not available here'); });
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  ui.toast('Image saved', 1600);
}

// ----- frame loop -----
let time = 0;
let last = performance.now();
let scale = 1;
let accentTimer = 0;
const sigSub = document.getElementById('sig-sub');
let lastName = '';

function paletteName() {
  if (settings.pinned !== null) return PALETTES[settings.pinned].name;
  const span = 50;
  return PALETTES[Math.floor(((time % (span * PALETTES.length)) / span))].name;
}

function frame(now) {
  requestAnimationFrame(frame);
  const frameMs = Math.max(0, now - last);
  last = now;
  const dt = Math.min(0.1, frameMs / 1000);
  const sdt = settings.paused ? 0 : dt;
  time += sdt;

  advanceLfos(matrix, sdt);
  const signals = audio.update(dt);
  const sources = evaluateSources(matrix, signals);
  const offsets = computeOffsets(matrix, sources, { skip: held });
  // Pause freezes time and LFOs, but sliders still glide: sculpt a still figure.
  stepParams(state, PARAMS, offsets, dt);
  const p = state.value;

  // Every palette change, pinned or cycling, melts over ~1.2 s.
  const target = paletteAt(time, { pinned: settings.pinned, hueShift: p.hue });
  const k = 1 - Math.exp(-dt / 1.2);
  colors = colors.map((c, i) => c.map((v, j) => v + (target[i][j] - v) * k));

  if (!document.hidden) scale = quality.update(frameMs);
  renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio, scale);
  renderer.render({ time, dt: sdt, params: p, colors, display: settings.display, beat: signals.beat || 0 });

  if (captureRequested) {
    captureRequested = false;
    download(renderer.capture());
  }

  ui.update(p, { sources, offsets });
  accentTimer -= dt;
  if (accentTimer <= 0) {
    accentTimer = 0.25;
    ui.setAccent(colors);
    const name = paletteName();
    if (name !== lastName) { lastName = name; sigSub.textContent = `living figures · ${name}`; }
  }

  debug.frames++;
  debug.ready = true;
}

Object.assign(debug, {
  setSlider: (id, v) => { setSlider(state, getDef(id), v); ui.syncSliders(); },
  getValues: () => ({ ...state.value }),
  capture: () => renderer.capture(),
  get scale() { return scale; },
  sandSupported: renderer.sandSupported,
  setDisplay: m => { settings.display = m; ui.setDisplay(m); },
  setPaused: on => { settings.paused = on; },
});

requestAnimationFrame(frame);
