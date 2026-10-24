// WebGL renderer: field + feedback → (sand) → bloom → composite to screen.

import {
  createContext, createProgram, setUniforms, createTarget, destroyTarget,
  clearTarget, createPingPong, fullscreenTriangle,
} from './gl.js';
import { FIELD_VS, FIELD_FS } from './shaders/field.js';
import { POST_VS, BRIGHT_FS, BLUR_FS, COMPOSITE_FS } from './shaders/post.js';
import { SAND_UPDATE_VS, SAND_UPDATE_FS, SAND_DRAW_VS, SAND_DRAW_FS } from './shaders/sand.js';
import { modeAt, chaosModes } from './field-math.js';

const SAND_SIDE = 256;

// Plate coordinates: the shorter screen side spans [-1, 1].
const viewFor = (w, h) => (w >= h ? [w / h, 1] : [1, h / w]);

export function createRenderer(canvas, { forceWebGL1 = false } = {}) {
  const ctx = createContext(canvas, { forceWebGL1 });
  if (!ctx) throw new Error('WebGL is not available on this device.');
  const { gl, isWebGL2 } = ctx;
  const sandSupported = isWebGL2 && ctx.floatTex32 && gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;

  const draw = fullscreenTriangle(gl);
  const field = createProgram(gl, FIELD_VS, FIELD_FS);
  const bright = createProgram(gl, POST_VS, BRIGHT_FS);
  const blur = createProgram(gl, POST_VS, BLUR_FS);
  const composite = createProgram(gl, POST_VS, COMPOSITE_FS);

  let sand = null;
  if (sandSupported) {
    const count = SAND_SIDE * SAND_SIDE;
    const init = new Float32Array(count * 4);
    const idx = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      init.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random(), Math.random()], i * 4);
      idx.set([((i % SAND_SIDE) + 0.5) / SAND_SIDE, (Math.floor(i / SAND_SIDE) + 0.5) / SAND_SIDE], i * 2);
    }
    const state = {
      read: createTarget(ctx, SAND_SIDE, SAND_SIDE, { kind: 'state', data: init }),
      write: createTarget(ctx, SAND_SIDE, SAND_SIDE, { kind: 'state', data: init }),
    };
    const indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    sand = {
      count, state, indexBuf,
      update: createProgram(gl, SAND_UPDATE_VS, SAND_UPDATE_FS),
      draw: createProgram(gl, SAND_DRAW_VS, SAND_DRAW_FS),
    };
  }

  let scene = null, bloomA = null, bloomB = null;
  let size = { cssW: 0, cssH: 0, w: 0, h: 0, rw: 0, rh: 0 };
  let lastDeep = [0, 0, 0];
  let lastFrame = null;

  function allocate(rw, rh) {
    scene?.destroy();
    destroyTarget(gl, bloomA);
    destroyTarget(gl, bloomB);
    scene = createPingPong(ctx, rw, rh, { kind: 'color' });
    const bw = Math.max(1, rw >> 2), bh = Math.max(1, rh >> 2);
    bloomA = createTarget(ctx, bw, bh, { kind: 'color' });
    bloomB = createTarget(ctx, bw, bh, { kind: 'color' });
    clearTarget(gl, scene.read, lastDeep);
    clearTarget(gl, scene.write, lastDeep);
  }

  function resize(cssW, cssH, dpr, scale) {
    const d = Math.min(dpr || 1, 2);
    const w = Math.max(1, Math.floor(cssW * d));
    const h = Math.max(1, Math.floor(cssH * d));
    const rw = Math.max(1, Math.floor(w * scale));
    const rh = Math.max(1, Math.floor(h * scale));
    if (w !== size.w || h !== size.h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (rw !== size.rw || rh !== size.rh) allocate(rw, rh);
    size = { cssW, cssH, w, h, rw, rh };
  }

  function fieldUniforms(time, p) {
    const m = modeAt(p.frequency);
    const [ca, cb, cc] = chaosModes(p.frequency);
    return {
      u_time: time, u_modeA: m.a, u_modeB: m.b, u_modeT: m.t,
      u_chaosA: ca, u_chaosB: cb, u_chaosC: cc,
      u_chaos: p.chaos, u_drift: p.drift, u_amp: p.amplitude, u_flow: p.flow,
      u_view: viewFor(size.rw, size.rh),
    };
  }

  function compositePass(frame) {
    gl.useProgram(composite.program);
    setUniforms(gl, composite, {
      u_scene: { texture: scene.read.texture, unit: 0 },
      u_bloom: { texture: bloomA.texture, unit: 1 },
      u_glow: frame.params.glow, u_beat: frame.beat || 0, u_time: frame.time,
      u_res: [size.w, size.h],
    });
    draw(null, size.w, size.h);
  }

  function render(frame) {
    if (!scene) return;
    const { time, dt, params: p, colors, display } = frame;
    lastDeep = colors[0];
    lastFrame = frame;
    gl.disable(gl.BLEND);
    const fu = fieldUniforms(time, p);

    // 1. Field + feedback.
    gl.useProgram(field.program);
    setUniforms(gl, field, {
      ...fu,
      u_prev: { texture: scene.read.texture, unit: 0 },
      u_c0: colors[0], u_c1: colors[1], u_c2: colors[2], u_c3: colors[3], u_c4: colors[4],
      u_scatter: p.scatter, u_melt: p.melt,
      u_fieldMix: display === 'sand' ? 0.12 : 1,
      u_dither: ctx.floatRT ? 0 : 1.5 / 255,
    });
    draw(scene.write);

    // 2. Sand: step the simulation, then splat grains into the scene so they melt too.
    if (sand && display !== 'color') {
      gl.useProgram(sand.update.program);
      setUniforms(gl, sand.update, {
        ...fu,
        u_view: viewFor(size.rw, size.rh),
        u_state: { texture: sand.state.read.texture, unit: 0 },
        u_dt: Math.min(dt, 1 / 30), u_scatter: p.scatter, u_seed: (time * 0.618) % 97,
      });
      draw(sand.state.write);
      [sand.state.read, sand.state.write] = [sand.state.write, sand.state.read];

      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.write.fbo);
      gl.viewport(0, 0, size.rw, size.rh);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(sand.draw.program);
      const pixelScale = size.rw / Math.max(1, size.cssW);
      setUniforms(gl, sand.draw, {
        u_state: { texture: sand.state.read.texture, unit: 0 },
        u_view: viewFor(size.rw, size.rh),
        u_size: Math.max(1, 1.6 * pixelScale),
        u_color: colors[3].map((v, i) => v * 0.7 + colors[4][i] * 0.3),
        u_intensity: display === 'sand' ? 0.18 : 0.09,
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, sand.indexBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, Math.floor(sand.count * p.density));
      gl.disable(gl.BLEND);
    }
    scene.swap();

    // 3. Bloom at quarter resolution.
    gl.useProgram(bright.program);
    setUniforms(gl, bright, { u_src: { texture: scene.read.texture, unit: 0 }, u_texel: [1 / size.rw, 1 / size.rh] });
    draw(bloomA);
    gl.useProgram(blur.program);
    for (let i = 0; i < 2; i++) {
      const r = 1 + i;
      setUniforms(gl, blur, { u_src: { texture: bloomA.texture, unit: 0 }, u_dir: [r / bloomA.w, 0] });
      draw(bloomB);
      setUniforms(gl, blur, { u_src: { texture: bloomB.texture, unit: 0 }, u_dir: [0, r / bloomA.h] });
      draw(bloomA);
    }

    // 4. Composite to screen.
    compositePass(frame);
  }

  // Re-draws the composite and reads it back in the same task (no preserveDrawingBuffer needed).
  function capture() {
    if (lastFrame) compositePass(lastFrame);
    return canvas.toDataURL('image/png');
  }

  function destroy() {
    scene?.destroy();
    destroyTarget(gl, bloomA);
    destroyTarget(gl, bloomB);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  return {
    gl, isWebGL2, sandSupported, floatRT: ctx.floatRT,
    resize, render, capture, destroy,
    get size() { return size; },
  };
}
