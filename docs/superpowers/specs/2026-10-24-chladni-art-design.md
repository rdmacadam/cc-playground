# Chladni Figures — Living Visual Art: Design Spec

**Date:** 2026-10-24
**Status:** Awaiting review

## 1. Intent

A web page that renders Chladni figures (the patterns sand forms on a vibrating
plate) as a piece of living visual art: melting colors, smooth gradients,
always in motion. It serves two roles at once:

- **Art piece** — moves by itself (autopilot), fascinating to watch full-screen,
  "a reminder of the craziness of the world".
- **Toy** — live sliders and modulators to play with the figure; optional
  reaction to music or voice.

**Priorities (in order):** visual beauty of the color gradients → smoothness
(60 fps, no popping) → compatibility (desktop + phone, modern browsers).

**Success criteria**
- Opens and is visibly alive within a second, with no interaction needed.
- Every parameter change glides; nothing snaps or flickers.
- Sustains ~60 fps on a typical laptop and a recent phone (adaptive quality
  may reduce resolution/particles to get there).
- Mic or audio file makes the figure visibly breathe with the sound.

## 2. Decisions

| Topic | Decision |
|---|---|
| Stack | Plain WebGL2 + vanilla ES modules, no framework, no build step |
| Backend | None — static site (mic needs https or localhost) |
| Hero layer | Liquid color field |
| Sand | Optional particle overlay; display modes: Color / Color + Sand / Sand |
| Color | Curated palettes that crossfade + Hue Shift slider |
| "Variance" | Split into Chaos, Drift, Scatter sliders |
| Movement | 4 LFO modulators + audio bands as modulation sources |

## 3. Architecture

```
index.html            page shell, canvas, control panel markup
css/style.css         frosted-glass UI, typography, responsive layout
js/main.js            boot; wires modules; frame loop; adaptive quality
js/gl.js              WebGL helpers: compile/link, textures, FBOs, ping-pong
js/field.js           Chladni field + color + feedback + bloom passes
js/sand.js            GPU particle layer (state in float textures)
js/params.js          parameter registry: ranges, defaults, easing, offsets
js/modulators.js      LFOs + audio sources → per-parameter offsets
js/audio.js           mic / file input → bass, mid, treble, loudness, beat, pitch
js/palettes.js        curated palettes, blending, hue rotation
js/ui.js              builds panel from params.js; modulator routing UI
js/shaders/*.js       GLSL sources exported as strings (works from file://)
test/*.test.js        node --test unit tests for pure logic
test/e2e/*.mjs        Playwright smoke + screenshot tests
```

Pure logic (`params`, `modulators`, `palettes`, audio analysis functions) has
no DOM/WebGL dependency so it can be unit-tested in Node.

**Per-frame data flow**
1. `audio.js` computes smoothed band signals (if audio enabled).
2. `modulators.js` evaluates LFOs + audio signals → offset per parameter.
3. `params.js` computes `target = clamp(slider + offsets)` and eases the
   current value toward it (exponential smoothing, frame-rate independent).
4. `field.js` renders the field into a ping-pong FBO, blending with the
   displaced previous frame, then bloom + finishing to screen.
5. `sand.js` (if enabled) updates particles and draws them additively on top.

**Error handling**
- No WebGL2 → WebGL1 path with reduced features (no float-texture particles →
  sand disabled; feedback at 8-bit with dithering). No WebGL at all → styled
  message.
- Shader compile failure → logged with source line, fallback message.
- Mic denied / unavailable → toast; audio sources output 0; autopilot continues.
- Adaptive quality: rolling average frame time > 20 ms for 2 s → lower render
  scale (1.0 → 0.75 → 0.5) and particle count; recover when headroom returns.

## 4. Visuals

**Field.** Normalised plate coordinates `x, y ∈ [-1, 1]`:

`f(x,y) = cos(nπx)·cos(mπy) − cos(mπx)·cos(nπy)` (with weight `a`, `b`
variations driven by Drift).

- **Frequency** (continuous, ~1–12) maps to mode pair `(n, m)` via a
  predefined ordered list of visually pleasing pairs; fractional position
  crossfades between neighbouring pairs → morphing, never popping.
- **Amplitude** — line sharpness, glow intensity, breathing.
- **Chaos** — mixes in 2–4 extra modes with increasing weight.
- **Drift** — slow time animation of phases and mode weights.
- **Scatter** — width/softness of nodal glow; sand cling looseness.

**Color pipeline**
1. Map field value to palette: nodal lines (`|f|≈0`) → luminous ribbon color;
   positive / negative antinodes → two complementary tones; smooth gradients
   between.
2. **Flow** — curl-like noise domain warp so lines look like liquid silk.
3. **Melt** — feedback: blend with previous frame sampled slightly along the
   flow field → ink-in-water smearing; Melt controls persistence.
4. Palette auto-crossfade every 30–60 s (or pinned); **Hue Shift** rotates all.
5. Finishing: bloom on bright ribbons (**Glow**), vignette, film grain +
   dithering (prevents banding).

**Palettes (initial):** Aurora (teal/violet/magenta), Ember (deep red/gold),
Abyss (ink blue/cyan glow), Opal (pearl/iridescent pastels), Nebula
(indigo/rose/amber). Each palette = 5 colors: background-deep,
antinode-positive, antinode-negative, ribbon, highlight.

**Sand.** ~65k particles on desktop (fewer on mobile / low quality). Each
particle moves down the gradient of `|f|` toward nodal lines plus jitter
scaled by Scatter and Amplitude; drawn as soft additive points tinted by the
palette ribbon color.

## 5. Controls & Modulators

| Group | Controls |
|---|---|
| Vibration | Frequency, Amplitude, Chaos, Drift, Scatter |
| Color | Palette picker + auto-cycle toggle, Hue Shift, Flow, Melt, Glow |
| Sand | Display mode, Particle density |

- Every slider has a "∿" button to route a modulation source to it. Max 2
  sources per slider; one source may drive many sliders, each with its own
  depth (bipolar, −1…+1).
- **Sources:** LFO 1–4 (shape: sine / triangle / wander; speed ≈ 0.008–4 Hz;
  depth), Bass, Mid, Treble, Loudness, Beat, Pitch.
- Modulated sliders show a glowing dot at the current effective value.
- **Autopilot** (on by default): a pre-made patch of slow LFOs so the piece is
  alive immediately. Grabbing a slider pauses autopilot for that slider while
  held.
- **Presets:** Still Pond, Silk Storm, Heartbeat (audio), Madness, plus two
  more; 🎲 randomise within curated ranges.
- **Panel:** frosted glass, right dock (bottom sheet ≤ 700 px wide); auto-hides
  after idle, returns on pointer move / tap. Keys: `H` hide panel, `F`
  fullscreen, `Space` pause, `S` save PNG. 📷 button saves current frame.

## 6. Audio

- Inputs: microphone (requested only on click) or audio file (drag-drop /
  picker, plays through speakers).
- `AnalyserNode`, FFT 2048. Signals normalised 0–1: Bass 20–250 Hz, Mid
  250–2k, Treble 2k–8k, Loudness; Beat = bass energy exceeding recent average
  by a threshold, short decay; Pitch = dominant frequency (autocorrelation on
  time-domain data) mapped to 0–1 over ~80–1000 Hz.
- Each signal has attack/release smoothing (fast rise, slow fall) and
  auto-gain (running peak normalisation).
- Default audio patch when enabled: Bass → Amplitude, Glow; Beat → bloom
  pulse + small Hue nudge; Mid → Chaos; Treble → Scatter; Pitch → Frequency.

## 7. Testing

- **Unit (`node --test`, no deps):** params clamping/easing/offset combining;
  LFO shapes, periods, depth, routing limits; palette blend and hue rotation
  (valid, no NaN); audio band energy, beat detection, attack/release on
  synthetic spectra; JS mirror of the field function (nodal lines where
  predicted, e.g. `f(x,x)=0` on the diagonal when weights are equal).
- **E2E (Playwright, pre-installed Chromium):** loads without console errors;
  shaders compile (WebGL2, and forced WebGL1 fallback); desktop and phone
  screenshots show a non-empty colorful canvas and correct panel layout;
  slider change alters the image; frames change over time with autopilot;
  PNG capture works.
- **Manual:** beauty/smoothness review via screenshots; real-device mic test
  by the user (container has no microphone).

## 8. Out of Scope (YAGNI)

- Backend, accounts, saving presets to a server.
- Video/GIF export (PNG only).
- Non-square plate shapes (circular plates) — possible later.
- Audio output/synthesis (we listen, we don't make sound).

## 9. Delivery

Commits on branch `ccr-1c9051df-8ne74h`; a published preview link for
immediate viewing; GitHub Pages optional later.
