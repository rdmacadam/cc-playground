# Chladni Living Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web page that renders Chladni figures as a living, melting
color field (with optional sand overlay), driven by sliders, LFO modulators,
an autopilot and optional mic/file audio.

**Architecture:** Pure-logic ES modules (params, modulators, palettes, audio
analysis, field math, quality governor) are unit-tested in Node. A thin
WebGL layer (GLSL ES 1.00 shaders so one shader set runs on WebGL2 and
WebGL1) renders: field+feedback pass → bloom → composite; sand particles live
in float textures (WebGL2 only). `main.js` wires everything in one rAF loop.

**Tech Stack:** HTML/CSS, vanilla JS ES modules, WebGL2 (WebGL1 fallback),
Web Audio API, `node --test`, Playwright (pre-installed Chromium).

**Spec:** `docs/superpowers/specs/2026-10-24-chladni-art-design.md`

## Global Constraints

- No framework, no build step, no runtime dependencies; page works when served statically.
- Pure modules must not touch `window`/`document` at import time (Node-importable).
- All shaders GLSL ES 1.00 (`gl_FragColor`, `texture2D`) — shared by WebGL2/WebGL1.
- Mic requested only on user click. No backend.
- Every parameter change eases (frame-rate independent); nothing snaps.
- Max 2 modulation sources per parameter; route depth bipolar −1…+1, in fractions of the parameter range.
- Palettes: Aurora, Ember, Abyss, Opal, Nebula; 5 colors each: deep, positive, negative, ribbon, highlight.
- Audio bands: Bass 20–250 Hz, Mid 250–2000, Treble 2000–8000; FFT 2048; Pitch mapped log over 80–1000 Hz.
- Adaptive quality: avg frame > 20 ms for 2 s → step render scale 1.0 → 0.75 → 0.5; DPR capped at 2.
- Keys: `H` panel, `F` fullscreen, `Space` pause, `S` save PNG.
- Commit messages end with the session's Co-Authored-By / Claude-Session lines.

## Review Focus

1. Hue Shift modulated past 360° must wrap, not stick at the clamp edge → test in Task 1 (`wrap` params).
2. Huge `dt` after a backgrounded tab (e.g. 30 s) must not overshoot or NaN the easing → test in Task 1.
3. Silence / all-zero spectrum must give 0 signals, never NaN (auto-gain divide-by-zero) → test in Task 3.
4. Adding a 3rd source to a parameter must be refused without corrupting existing routes → test in Task 2.
5. Window resize / phone rotation must reallocate FBOs without black frames or GL errors → E2E viewport-change check in Task 8.

---

### Task 1: Project scaffold + parameter registry

**Files:**
- Create: `package.json` (`"type":"module"`, scripts `test` = `node --test test/`, `e2e` = `node test/e2e/run.mjs`, `serve` = `node test/e2e/server.mjs`)
- Create: `js/params.js`, `test/params.test.js`, `.gitignore` (`node_modules`, `test/e2e/out`)

**Interfaces:**
- Produces:
  - `PARAMS: ParamDef[]`, `ParamDef = {id, label, group, min, max, default, smooth (s), wrap?: boolean, format?: (v)=>string}`
    ids/ranges/defaults: frequency 1–12 (4, smooth 0.8), amplitude 0–1 (0.6), chaos 0–1 (0.25), drift 0–1 (0.35), scatter 0–1 (0.35), hue 0–360 (0, wrap), flow 0–1 (0.4), melt 0–1 (0.6), glow 0–1.5 (0.8), density 0.1–1 (0.6). Groups: `vibration`, `color`, `sand`. Default smooth 0.35.
  - `clamp(v, lo, hi): number`
  - `createParamState(defs): {slider:{id:number}, value:{id:number}}` (both = defaults)
  - `setSlider(state, def, v): void` (clamped)
  - `effectiveTarget(def, slider, offset): number` = `slider + offset*(max-min)`, clamped, or wrapped into [min,max) when `def.wrap`
  - `stepParams(state, defs, offsets, dt): void` — eases `value` toward target with `k = 1 - exp(-dt/def.smooth)`; for wrap params ease along the shortest arc.
  - `getDef(id): ParamDef`

- [ ] **Step 1: Write failing tests** in `test/params.test.js`:
  - `clamp(5,0,1)===1`, `clamp(-1,0,1)===0`
  - `effectiveTarget(freqDef, 4, 0.5) === 9.5`; `effectiveTarget(ampDef, 0.9, 0.5) === 1`
  - Review Focus 1: `effectiveTarget(hueDef, 300, 0.25)` ≈ 30
  - after `stepParams` with dt=0.35 on amplitude from 0.6 to slider 1, value ≈ 0.6 + 0.4*(1-e⁻¹) (±1e-6)
  - Review Focus 2: `stepParams` with dt=30 lands exactly within 1e-9 of target and is finite
  - wrap easing: hue value 350, target 10 → after a small step value moves upward (wrapped), e.g. ∈ (350,360) ∪ [0,10]
- [ ] **Step 2:** Run `npm test` → FAIL (module missing)
- [ ] **Step 3:** Implement `js/params.js`
- [ ] **Step 4:** Run `npm test` → PASS
- [ ] **Step 5:** Commit `feat: parameter registry with easing and wrap`

### Task 2: Modulators (LFOs, routing, autopilot/audio patches, presets)

**Files:** Create `js/modulators.js`, `js/presets.js`, `test/modulators.test.js`

**Interfaces:**
- Consumes: `PARAMS`, `getDef` (Task 1)
- Produces:
  - `SOURCES = ['lfo1','lfo2','lfo3','lfo4','bass','mid','treble','loudness','beat','pitch']`
  - `lfoValue(shape:'sine'|'triangle'|'wander', phase:number, seed=0): number` in [−1,1]; period 1 in phase; `wander` = smooth (cosine-interpolated) hashed value noise, continuous.
  - `createModMatrix(): {lfos:[{shape, rate(Hz), depth(0–1), phase}×4], routes:{[paramId]: Route[]}}`, `Route={source, depth, tag:'auto'|'audio'|'user'}`
  - `addRoute(m, paramId, source, depth, tag='user'): boolean` — same source updates depth; refuses (false, unchanged) if 2 routes exist.
  - `removeRoute(m, paramId, source): void`
  - `advanceLfos(m, dt): void` (phase += rate*dt, mod 1)
  - `evaluateSources(m, audio={}): {[source]:number}` — LFO = `lfoValue*depth`, audio signals passed through (0 when missing).
  - `computeOffsets(m, sources, {skip=new Set(), disabledTags=new Set()}={}): {[paramId]: number}` — sum of `source*depth`.
  - `applyPatch(m, patch)` / `clearTag(m, tag)`; `AUTOPILOT_PATCH`, `AUDIO_PATCH` arrays of `{param, source, depth}` plus `AUTOPILOT_LFOS` settings:
    - LFOs: 1 wander 0.02 Hz, 2 sine 0.013, 3 sine 0.05, 4 triangle 0.03, depth 1
    - Autopilot: lfo1→frequency 0.22, lfo2→hue 0.5, lfo3→chaos 0.2, lfo3→amplitude 0.15, lfo4→flow 0.2, lfo4→scatter 0.15, lfo2→drift 0.15
    - Audio: bass→amplitude 0.35, bass→glow 0.3, beat→glow 0.35, beat→hue 0.04, mid→chaos 0.3, treble→scatter 0.3, pitch→frequency 0.35
  - `presets.js`: `PRESETS: {name, values:{paramId:number}, palette:number|null, display:'color'|'both'|'sand'}[]` — Still Pond, Silk Storm, Heartbeat, Madness, Opal Dream, Ember Lace; `randomValues(rng=Math.random): {paramId:number}` within curated ranges (chaos ≤ 0.7, melt 0.3–0.85, amplitude 0.35–0.95, others full range).

- [ ] **Step 1: Failing tests:** `lfoValue('sine',0.25)≈1`; triangle(0)=−1, (0.5)=1; wander continuous (|v(p)−v(p+1e-4)|<1e-2 over 1000 samples, all in [−1,1]); `addRoute` third source returns false and routes length stays 2 with original depths (Review Focus 4); same-source re-add updates depth; `computeOffsets` sums two routes; `skip` excludes param; `disabledTags:{'auto'}` excludes autopilot routes; applying AUTOPILOT_PATCH then AUDIO_PATCH leaves no param with >2 routes; every preset value inside its param range.
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: LFO modulators, routing matrix, patches, presets`

### Task 3: Palettes + audio analysis + quality governor (pure)

**Files:** Create `js/palettes.js`, `js/audio-analysis.js`, `js/quality.js`; tests `test/palettes.test.js`, `test/audio.test.js`, `test/quality.test.js`

**Interfaces:**
- Produces (palettes):
  - `PALETTES: {name, colors:[[r,g,b]×5]}[]` (0–1 floats, from hex) — Aurora `#05060f,#1ec8b0,#7b3fe4,#ff4fd8,#fff4fb`; Ember `#0a0302,#c2261b,#5a0b2e,#ffb238,#fff1c9`; Abyss `#01040c,#0b3a6e,#0a1b3f,#3ff3ff,#e8ffff`; Opal `#14121c,#f2c6de,#a6d8ef,#fff6e0,#ffffff`; Nebula `#07041a,#3b2a8c,#b8336a,#ffb057,#ffe9f1`
  - `rotateHue(rgb, deg): [r,g,b]` (RGB→HSL→RGB, outputs clamped 0–1)
  - `blendColors(a, b, t): colors` (per-channel lerp with smoothstep t)
  - `paletteAt(timeSec, {pinned=null, hold=40, fade=10, hueShift=0}): colors` — cycles through PALETTES; within each `hold+fade` window, blend in last `fade` seconds; pinned index returns that palette; hue applied last.
- Produces (audio-analysis):
  - `bandEnergy(spectrum:Uint8Array, sampleRate, fftSize, loHz, hiHz): number` 0–1 (mean of bins /255)
  - `envelope(prev, input, dt, attack=0.03, release=0.35): number`
  - `createAutoGain(decay=0.995→per-second 0.2, floor=0.02): {apply(v, dt): number}` — running peak, output `v/max(peak,floor)` clamped 0–1
  - `createBeatDetector({threshold=1.4, decay=0.25, minGap=0.18}): {update(energy, dt): number}` 0–1 pulse
  - `detectPitch(buf:Float32Array, sampleRate): number` Hz or 0 (RMS < 0.01 → 0; autocorrelation 80–1000 Hz)
  - `pitchToUnit(hz): number` 0–1 log-mapped 80→0, 1000→1; 0 for hz 0
  - `analyzeFrame(state, {freq, time, sampleRate, fftSize}, dt): {bass,mid,treble,loudness,beat,pitch}`; `createAnalysisState()`
- Produces (quality): `createQualityGovernor({levels=[1,0.75,0.5], slowMs=20, slowFor=2, fastMs=12, fastFor=5}): {update(frameMs): number /*scale*/, level}` — uses rolling EMA.

- [ ] **Step 1: Failing tests:** all palettes 5 colors in [0,1]; `rotateHue([1,0,0],120)≈[0,1,0]`; `rotateHue` of gray unchanged; `paletteAt(0)` = Aurora, `paletteAt(45)` (mid fade) ≠ Aurora and ≠ Ember, `paletteAt(50)` = Ember; pinned works; no NaN for hueShift 720. Audio: `bandEnergy` on spectrum with 255 only in bass bins → bass≈1, treble 0; Review Focus 3: `analyzeFrame` with all-zero spectrum/time data for 100 frames → every signal ===0 and finite; beat detector: steady 0.3 energy for 2 s then 0.9 → pulse >0.5; `detectPitch` on 220 Hz sine @44100 within ±3 Hz; silence → 0; `pitchToUnit(80)=0`, `(1000)=1`. Quality: 3 s of 30 ms frames → scale 0.75 then later 0.5; then 6 s of 8 ms → recovers one level.
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** Implement the three modules
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: palettes, audio analysis, quality governor`

### Task 4: Field math + shaders + WebGL helpers

**Files:** Create `js/field-math.js`, `js/gl.js`, `js/shaders/common.js`, `js/shaders/field.js`, `js/shaders/post.js`, `js/shaders/sand.js`; test `test/field-math.test.js`

**Interfaces:**
- Produces (field-math):
  - `MODE_PAIRS: [n,m][]` — ordered by n+m, n<m, pleasing set: `[1,2],[1,3],[2,3],[1,4],[2,5],[3,4],[1,5],[3,5],[2,7],[4,5],[3,7],[5,6],[4,7],[5,7],[6,7],[5,8],[7,8],[6,9],[7,9],[8,9]`
  - `modeAt(freq): {a:[n,m], b:[n,m], t}` freq 1–12 mapped linearly onto index 0…len−1, `t` fractional part
  - `chaosModes(freq): [n,m][3]` — pairs at index offsets +2, +4, −3 (clamped)
  - `chladni(x, y, n, m, wa=1, wb=1): number` = `wa·cos(nπx)cos(mπy) − wb·cos(mπx)cos(nπy)`
- Produces (gl.js): `createContext(canvas, {forceWebGL1}) → {gl, isWebGL2, floatRT:boolean /*16F renderable*/, floatTex32:boolean}`; `createProgram(gl, vs, fs) → {program, uniforms: Proxy name→location}` (throws Error with info log + numbered source); `createTarget(gl, w, h, {type})`, `createPingPong(gl, w, h, opts) → {read, write, swap(), resize(w,h)}`; `fullscreenQuad(gl) → draw(program)`.
- Shaders (GLSL ES 1.00 strings): `common.js` exports `FIELD_GLSL` (hash, value noise, `chladni`, `fieldAt(vec2 p)` using uniforms `u_modeA,u_modeB,u_modeT,u_chaosA,u_chaosB,u_chaosC,u_chaos,u_drift,u_time,u_amp,u_flow`); `field.js` exports `FIELD_VS, FIELD_FS` (color mapping per spec §4: deep/pos/neg smoothstep blends, ribbon `exp(-s²/w²)` with `w = mix(0.03,0.3,scatter)/(0.6+amp)`, highlight `pow(line,4)`, flow warp, feedback `mix(col, prev(uv+flowDisp), melt*0.96)`, `u_fieldMix` for sand-only); `post.js` exports `BRIGHT_FS, BLUR_FS, COMPOSITE_FS` (bloom×glow, ACES tonemap, vignette, grain+dither); `sand.js` exports `SAND_UPDATE_FS` (pos.xy, vel.zw; force = −∇|f| (central differences), jitter ∝ scatter·amp, damping 0.9, respawn on exit or 0.2%/frame), `SAND_DRAW_VS/FS` (soft additive point, size by DPR, ribbon tint).

- [ ] **Step 1: Failing tests:** `chladni(x,x,n,m)===0` (wa=wb) for random x; `chladni(0,0,n,m)===0`; antisymmetry `chladni(x,y)=−chladni(y,x)`; `modeAt(1)` → a=[1,2], t=0; `modeAt(12)` → last pair, t=0; `modeAt` t ∈[0,1) and monotone index; `chaosModes` returns valid pairs at both ends.
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** Implement field-math, gl.js, shaders (shaders verified in Task 8 E2E — compile errors surface there)
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: field math, GL helpers, shaders`

### Task 5: Renderer (field, bloom, composite, sand)

**Files:** Create `js/renderer.js`

**Interfaces:**
- Consumes: Task 4 gl helpers/shaders, `modeAt`, `chaosModes`
- Produces: `createRenderer(canvas, {forceWebGL1}) → {isWebGL2, sandSupported, resize(cssW, cssH, dpr, scale), render(frame), capture(): string /*dataURL*/, destroy()}` where `frame = {time, dt, params:{...values}, colors:[[r,g,b]×5], display:'color'|'both'|'sand', beat}`. Ping-pong RGBA16F (else RGBA8) at `scale·dpr`; bloom at ¼ res, 2 blur iterations; sand texture 256×256 (65 536) drawing `density·count` points; sand disabled when `!sandSupported`. `resize` reallocates FBOs only when size changes and clears them to the deep color. `capture()` re-renders composite and returns `canvas.toDataURL('image/png')` in the same task.

- [ ] **Step 1:** Implement renderer
- [ ] **Step 2:** Verified by Task 8 E2E (no unit test — GL only); `npm test` still PASS
- [ ] **Step 3:** Commit `feat: WebGL renderer with feedback, bloom, sand`

### Task 6: Audio input (browser)

**Files:** Create `js/audio.js`

**Interfaces:**
- Consumes: `analyzeFrame`, `createAnalysisState` (Task 3)
- Produces: `createAudioInput() → {startMic(): Promise<void>, startFile(file: File): Promise<void>, stop(), update(dt): signals|{}, get mode(): 'off'|'mic'|'file'}` — AudioContext created lazily on first start; FFT 2048, `smoothingTimeConstant 0.6`; file plays through destination (looping); mic not routed to speakers; errors rethrown with user-readable message.

- [ ] **Step 1:** Implement
- [ ] **Step 2:** `npm test` PASS (unchanged); manual mic test by user
- [ ] **Step 3:** Commit `feat: mic and file audio input`

### Task 7: Page, UI and main loop

**Files:** Create `index.html`, `css/style.css`, `js/ui.js`, `js/main.js`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `createUI({root, defs, state, matrix, presets, palettes, callbacks}) → {update(values, offsetsActive:Set), setAudioMode(mode), toast(msg), setAutopilot(bool)}`; callbacks: `onSlider(id,v)`, `onHold(id,bool)`, `onPreset(i)`, `onRandom()`, `onPalette(i|null)`, `onDisplay(mode)`, `onAutopilot(bool)`, `onMic()`, `onFile(file)`, `onAudioOff()`, `onCapture()`, `onRoute(paramId, source, depth|null)`, `onLfo(i, {shape,rate,depth})`.
  - Panel sections: header (title "Chladni", 🎲, 📷, autopilot toggle), Presets chips, Vibration, Color (palette swatch chips incl. "Cycle"), Sand (display segmented control, density), Sound (🎤, 🎵 file, off), Modulators (4 LFOs: shape select, rate log slider 0.008–4 Hz, depth). Each slider row: label, value readout, range input, "∿" button opening an inline route editor (source select + depth slider + remove; shows "max 2 sources" when full). Glowing dot on the track at the effective value when modulated.
  - Frosted glass (backdrop-filter blur 18px, translucent dark), right dock 320 px; ≤700 px wide → bottom sheet max-height 55vh, collapsible handle. Auto-hide after 4 s idle (not while pointer over panel or a control focused); show on pointermove/touch.
  - `main.js`: boot (`?gl=1` forces WebGL1); applies AUTOPILOT_LFOS/PATCH; rAF loop: dt clamped to 0.1 s; `advanceLfos` → audio `update` → `evaluateSources` → `computeOffsets({skip: held, disabledTags})` → `stepParams` → `paletteAt(time, {pinned, hueShift: values.hue})` → `renderer.render`; quality governor → `renderer.resize`; resize/orientation handler; keyboard (H/F/Space/S); drag-drop audio file; WebGL failure → `#fallback` message. Debug hook `window.__chladni = {ready, glVersion, frames, errors:[], setSlider(id,v), getValues(), capture()}`.

- [ ] **Step 1:** Implement page, CSS, UI, main
- [ ] **Step 2:** `npm run serve` and load in Chromium manually via Task 8 script; fix console errors
- [ ] **Step 3:** Commit `feat: page, control panel, main loop`

### Task 8: E2E smoke + screenshots, README

**Files:** Create `test/e2e/server.mjs` (static server, port from `PORT` or 5173), `test/e2e/run.mjs`, `README.md`

**Interfaces:**
- Consumes: `window.__chladni` (Task 7)

- [ ] **Step 1: Write E2E** (`run.mjs`, Playwright chromium, args `--use-angle=swiftshader --enable-unsafe-swiftshader`): for desktop 1440×900 and phone 390×844: load, wait `__chladni.ready`, assert no page errors / console errors, `glVersion===2`; screenshot to `test/e2e/out/`; sample canvas via `capture()` → decode in page, assert pixel stddev > 8 (non-empty, colorful); `setSlider('frequency', 9)` + wait 1.5 s → capture differs from before; frames advance over 2 s without input (autopilot changes image); Review Focus 5: change viewport 1440×900 → 900×1400, wait 0.5 s, no GL errors and non-black capture; `?gl=1` run: `glVersion===1`, no errors, non-empty capture. Exit code 1 on any failure.
- [ ] **Step 2:** Run `npm run e2e` → fix until PASS
- [ ] **Step 3:** Review screenshots for beauty; tune shader constants if dull/banded
- [ ] **Step 4:** README: what it is, how to run (`npx serve`/`npm run serve`, open file), controls, keys, audio notes (https/localhost for mic), tests
- [ ] **Step 5:** `npm test && npm run e2e` both PASS; commit `test: e2e smoke tests, screenshots; docs: README`; push; publish preview artifact
