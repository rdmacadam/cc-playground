// Control panel: built from the parameter registry, talks to main.js through callbacks.

import { SOURCES, MAX_ROUTES } from './modulators.js';

const SOURCE_LABELS = {
  lfo1: 'LFO 1', lfo2: 'LFO 2', lfo3: 'LFO 3', lfo4: 'LFO 4',
  bass: 'Bass', mid: 'Mid', treble: 'Treble', loudness: 'Loudness', beat: 'Beat', pitch: 'Pitch',
};
const RATE_MIN = 0.008, RATE_MAX = 4;
const rateFromUnit = u => RATE_MIN * Math.pow(RATE_MAX / RATE_MIN, u);
const unitFromRate = r => Math.log(r / RATE_MIN) / Math.log(RATE_MAX / RATE_MIN);
const fmtRate = r => (r < 1 ? `${Math.round(1 / r)} s` : `${r.toFixed(1)} Hz`);
const IDLE_MS = 4000;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
  return node;
}

const setFill = (input) => {
  const f = (input.value - input.min) / (input.max - input.min);
  input.style.setProperty('--fill', `${(f * 100).toFixed(2)}%`);
};

function section(title, open, ...body) {
  return el('details', { class: 'section', open }, el('summary', {}, title), el('div', { class: 'section-body' }, ...body));
}

export function createUI({ root, openButton, defs, state, matrix, presets, palettes, sandSupported, callbacks: cb }) {
  const rows = new Map();
  let openEditor = null;

  // ----- slider rows -----
  function sliderRow(def) {
    const input = el('input', {
      type: 'range', min: def.min, max: def.max, step: (def.max - def.min) / 1000,
      value: state.slider[def.id], 'aria-label': def.label, id: `p-${def.id}`,
    });
    const val = el('span', { class: 'val' });
    const modBtn = el('button', { class: 'mod-btn', type: 'button', title: 'Modulate', 'aria-label': `Modulate ${def.label}` }, '∿');
    const dot = el('span', { class: 'mod-dot' });
    const editor = el('div', { class: 'route-editor', hidden: true });
    const row = el('div', { class: 'row' },
      el('div', { class: 'row-head' }, el('label', { for: `p-${def.id}` }, def.label), val, modBtn),
      el('div', { class: 'track' }, input, dot),
      editor);

    input.addEventListener('input', () => { setFill(input); cb.onSlider(def.id, Number(input.value)); });
    const release = () => cb.onHold(def.id, false);
    input.addEventListener('pointerdown', () => cb.onHold(def.id, true));
    input.addEventListener('pointerup', release);
    input.addEventListener('pointercancel', release);
    input.addEventListener('blur', release);
    modBtn.addEventListener('click', () => toggleEditor(def.id));
    setFill(input);
    rows.set(def.id, { def, input, val, modBtn, dot, editor });
    return row;
  }

  function toggleEditor(id) {
    if (openEditor && openEditor !== id) rows.get(openEditor).editor.hidden = true;
    const r = rows.get(id);
    r.editor.hidden = !r.editor.hidden;
    openEditor = r.editor.hidden ? null : id;
    if (!r.editor.hidden) renderEditor(id);
  }

  function renderEditor(id) {
    const r = rows.get(id);
    const routes = matrix.routes[id] || [];
    r.editor.replaceChildren();
    for (const route of routes) {
      const depth = el('input', { type: 'range', min: -1, max: 1, step: 0.01, value: route.depth, 'aria-label': `${SOURCE_LABELS[route.source]} depth` });
      setFill(depth);
      depth.addEventListener('input', () => { setFill(depth); cb.onRoute(id, route.source, Number(depth.value)); });
      r.editor.append(el('div', { class: 'route' },
        el('span', { class: 'src' }, SOURCE_LABELS[route.source], route.tag === 'auto' ? el('em', {}, 'auto') : null),
        depth,
        el('button', { class: 'x', type: 'button', 'aria-label': 'Remove', onclick: () => { cb.onRoute(id, route.source, null); renderEditor(id); } }, '×')));
    }
    if (routes.length >= MAX_ROUTES) {
      r.editor.append(el('p', { class: 'route-note' }, `Max ${MAX_ROUTES} sources — remove one to add another.`));
    } else {
      const used = new Set(routes.map(x => x.source));
      const select = el('select', { 'aria-label': 'Modulation source' },
        SOURCES.filter(s => !used.has(s)).map(s => el('option', { value: s }, SOURCE_LABELS[s])));
      r.editor.append(el('div', { class: 'route-add' }, select,
        el('button', { class: 'small-btn', type: 'button', onclick: () => { cb.onRoute(id, select.value, 0.3); renderEditor(id); } }, 'Add')));
      if (!routes.length) r.editor.append(el('p', { class: 'route-note' }, 'Let an LFO or the sound move this slider.'));
    }
  }

  // ----- header -----
  const autopilotSwitch = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': 'Autopilot' });
  autopilotSwitch.addEventListener('click', () => {
    const on = autopilotSwitch.getAttribute('aria-checked') !== 'true';
    autopilotSwitch.setAttribute('aria-checked', String(on));
    cb.onAutopilot(on);
  });

  const head = el('div', { class: 'panel-head' },
    el('h1', {}, 'Chladni', el('small', {}, 'living figures')),
    el('button', { class: 'icon-btn', type: 'button', title: 'Surprise me', 'aria-label': 'Randomise', onclick: () => cb.onRandom() }, '🎲'),
    el('button', { class: 'icon-btn', type: 'button', title: 'Save image (S)', 'aria-label': 'Save image', onclick: () => cb.onCapture() }, '📷'),
    el('button', { class: 'icon-btn', type: 'button', title: 'Hide panel (H)', 'aria-label': 'Hide panel', onclick: () => setPanelHidden(true) }, '×'));

  // ----- presets -----
  const presetChips = presets.map((p, i) => el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => { markPreset(i); cb.onPreset(i); } }, p.name));
  const markPreset = i => presetChips.forEach((c, j) => c.setAttribute('aria-pressed', String(i === j)));

  // ----- palettes -----
  const swatch = p => `linear-gradient(135deg, ${p.hexes[2]}, ${p.hexes[1]} 45%, ${p.hexes[3]})`;
  const cycleChip = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', onclick: () => { setPalette(null); cb.onPalette(null); } },
    el('span', { class: 'swatch', style: 'background: conic-gradient(#ff4fd8, #1ec8b0, #ffb238, #3b2a8c, #ff4fd8)' }), 'Cycle');
  const paletteChips = palettes.map((p, i) => el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => { setPalette(i); cb.onPalette(i); } },
    el('span', { class: 'swatch', style: `background: ${swatch(p)}` }), p.name));
  function setPalette(i) {
    cycleChip.setAttribute('aria-pressed', String(i === null));
    paletteChips.forEach((c, j) => c.setAttribute('aria-pressed', String(i === j)));
  }

  // ----- display mode -----
  const modes = [['color', 'Color'], ['both', 'Color + Sand'], ['sand', 'Sand']];
  const modeButtons = modes.map(([m, label]) => el('button', {
    type: 'button', 'aria-pressed': String(m === 'color'), disabled: !sandSupported && m !== 'color',
    onclick: () => { setDisplay(m); cb.onDisplay(m); },
  }, label));
  function setDisplay(m) { modeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(modes[i][0] === m))); }

  // ----- sound -----
  const fileInput = el('input', { type: 'file', accept: 'audio/*', hidden: true });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) cb.onFile(fileInput.files[0]); fileInput.value = ''; });
  const micBtn = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => cb.onMic() }, '🎤 Mic');
  const fileBtn = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => fileInput.click() }, '🎵 Music file');
  const offBtn = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', onclick: () => cb.onAudioOff() }, 'Off');
  const meterKeys = ['bass', 'mid', 'treble', 'loudness', 'beat', 'pitch'];
  const meterBars = {};
  const meters = el('div', { class: 'meters' }, meterKeys.map(k => {
    const i = el('i');
    meterBars[k] = i;
    return el('div', { class: 'meter' }, el('div', { class: 'bar' }, i), el('span', {}, SOURCE_LABELS[k]));
  }));

  // ----- LFOs -----
  const lfoDots = [];
  const lfoCards = matrix.lfos.map((l, i) => {
    const shape = el('select', { 'aria-label': `LFO ${i + 1} shape` },
      ['sine', 'triangle', 'wander'].map(s => el('option', { value: s, selected: l.shape === s }, s[0].toUpperCase() + s.slice(1))));
    const rate = el('input', { type: 'range', min: 0, max: 1, step: 0.001, value: unitFromRate(l.rate), 'aria-label': `LFO ${i + 1} speed` });
    const depth = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: l.depth, 'aria-label': `LFO ${i + 1} depth` });
    const rateVal = el('span', { class: 'val' }, fmtRate(l.rate));
    const depthVal = el('span', { class: 'val' }, `${Math.round(l.depth * 100)}%`);
    const dot = el('i');
    lfoDots.push(dot);
    const push = () => {
      setFill(rate); setFill(depth);
      const r = rateFromUnit(Number(rate.value));
      rateVal.textContent = fmtRate(r);
      depthVal.textContent = `${Math.round(Number(depth.value) * 100)}%`;
      cb.onLfo(i, { shape: shape.value, rate: r, depth: Number(depth.value) });
    };
    shape.addEventListener('change', push);
    rate.addEventListener('input', push);
    depth.addEventListener('input', push);
    setFill(rate); setFill(depth);
    return el('div', { class: 'lfo' },
      el('div', { class: 'lfo-head' }, el('b', {}, `LFO ${i + 1}`), shape, el('span', { class: 'lfo-live' }, dot)),
      el('div', { class: 'row' }, el('div', { class: 'row-head' }, el('label', {}, 'Speed'), rateVal), el('div', { class: 'track' }, rate)),
      el('div', { class: 'row' }, el('div', { class: 'row-head' }, el('label', {}, 'Depth'), depthVal), el('div', { class: 'track' }, depth)));
  });

  const group = g => defs.filter(d => d.group === g).map(sliderRow);

  root.replaceChildren(
    head,
    el('div', { class: 'panel-scroll' },
      el('div', { class: 'autopilot' }, el('div', {}, el('b', {}, 'Autopilot'), el('span', {}, 'Let the figure dream by itself')), autopilotSwitch),
      section('Presets', true, el('div', { class: 'chips' }, presetChips)),
      section('Vibration', true, group('vibration')),
      section('Color', true, el('div', { class: 'chips', style: 'margin-bottom:8px' }, cycleChip, paletteChips), group('color')),
      section('Sand', false, el('div', { class: 'segmented' }, modeButtons),
        sandSupported ? group('sand') : el('p', { class: 'hint' }, 'Sand needs WebGL2 float textures, which this device lacks.')),
      section('Sound', false,
        el('div', { class: 'sound-buttons' }, micBtn, fileBtn, offBtn), fileInput, meters,
        el('p', { class: 'hint' }, 'Sing, talk or play music: bass swells the plate, beats flash, your pitch picks the figure. You can also drop an audio file anywhere.')),
      section('Modulators', false, lfoCards,
        el('p', { class: 'hint' }, 'Tap ∿ next to any slider to route an LFO or a sound band onto it (two sources per slider).'))));

  // ----- panel visibility & idle -----
  let pinnedHidden = false, idleTimer = 0, idle = false;
  function applyVisibility() {
    const hidden = pinnedHidden || idle;
    root.classList.toggle('is-hidden', hidden);
    openButton.classList.toggle('show', pinnedHidden && !idle);
    document.body.classList.toggle('idle', idle);
    document.getElementById('signature')?.style.setProperty('opacity', idle ? '0.55' : '1');
  }
  function setPanelHidden(h) { pinnedHidden = h; applyVisibility(); }
  function wake() {
    if (idle) { idle = false; applyVisibility(); }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (root.matches(':hover') || root.querySelector(':focus-visible')) {
        wake();
        return;
      }
      idle = true;
      applyVisibility();
    }, IDLE_MS);
  }
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(ev, wake, { passive: true });
  openButton.addEventListener('click', () => setPanelHidden(false));
  wake();

  // ----- per-frame update -----
  let tick = 0;
  function update(values, { sources = {}, offsets = {} } = {}) {
    if (tick++ % 2) return;
    for (const r of rows.values()) {
      const v = values[r.def.id];
      r.val.textContent = r.def.format ? r.def.format(v) : v.toFixed(2);
      const routes = matrix.routes[r.def.id] || [];
      const active = routes.length > 0 && Math.abs(offsets[r.def.id] || 0) > 1e-4;
      r.modBtn.classList.toggle('has-routes', routes.length > 0);
      r.dot.classList.toggle('on', active);
      if (active) {
        const f = (v - r.def.min) / (r.def.max - r.def.min);
        r.dot.style.left = `calc(7.5px + (100% - 15px) * ${f.toFixed(4)})`;
      }
    }
    for (const k of meterKeys) meterBars[k].style.height = `${Math.round((sources[k] || 0) * 100)}%`;
    lfoDots.forEach((d, i) => { d.style.left = `${(50 + (sources[`lfo${i + 1}`] || 0) * 50).toFixed(1)}%`; });
  }

  function syncSliders() {
    for (const r of rows.values()) {
      r.input.value = state.slider[r.def.id];
      setFill(r.input);
    }
    if (openEditor) renderEditor(openEditor);
  }

  function setAudioMode(mode) {
    micBtn.setAttribute('aria-pressed', String(mode === 'mic'));
    fileBtn.setAttribute('aria-pressed', String(mode === 'file'));
    offBtn.setAttribute('aria-pressed', String(mode === 'off'));
    if (openEditor) renderEditor(openEditor);
  }

  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  function toast(msg, ms = 3200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function setAccent(colors) {
    const hex = c => `#${c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
    const s = document.documentElement.style;
    s.setProperty('--a1', hex(colors[3]));
    s.setProperty('--a2', hex(colors[1]));
    s.setProperty('--a3', hex(colors[4]));
  }

  return {
    update, syncSliders, setAudioMode, toast, setAccent, setPalette, setDisplay, markPreset,
    togglePanel: () => setPanelHidden(!pinnedHidden),
    setAutopilot: on => autopilotSwitch.setAttribute('aria-checked', String(on)),
  };
}
