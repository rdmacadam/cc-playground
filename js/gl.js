// Minimal WebGL plumbing shared by the renderer. Works with WebGL2 and WebGL1.

const CONTEXT_OPTS = {
  alpha: false, antialias: false, depth: false, stencil: false,
  premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
};

export function createContext(canvas, { forceWebGL1 = false } = {}) {
  let gl = forceWebGL1 ? null : canvas.getContext('webgl2', CONTEXT_OPTS);
  const isWebGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', CONTEXT_OPTS) || canvas.getContext('experimental-webgl', CONTEXT_OPTS);
  if (!gl) return null;
  let floatRT = false;
  if (isWebGL2) {
    floatRT = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_float_blend');
  }
  const ctx = { gl, isWebGL2, floatRT, floatTex32: floatRT };
  // Some drivers advertise the extension but still reject the attachment.
  if (floatRT) {
    const probeColor = createTarget(ctx, 4, 4, { kind: 'color' });
    const probeState = createTarget(ctx, 4, 4, { kind: 'state' });
    ctx.floatRT = probeColor.complete && probeState.complete;
    ctx.floatTex32 = probeState.complete;
    destroyTarget(gl, probeColor);
    destroyTarget(gl, probeState);
  }
  return ctx;
}

function numbered(src) {
  return src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}: ${l}`).join('\n');
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed:\n${log}\n${numbered(src)}`);
  }
  return sh;
}

export function createProgram(gl, vsSrc, fsSrc) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.bindAttribLocation(program, 0, 'a_pos');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed:\n${gl.getProgramInfoLog(program)}`);
  }
  const cache = new Map();
  const loc = name => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
    return cache.get(name);
  };
  return { program, loc };
}

// Sets uniforms by value shape: number → float, array → vecN, {texture, unit} → sampler.
export function setUniforms(gl, prog, values) {
  for (const [name, v] of Object.entries(values)) {
    const l = prog.loc(name);
    if (l === null) continue;
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v && v.texture !== undefined) {
      gl.activeTexture(gl.TEXTURE0 + v.unit);
      gl.bindTexture(gl.TEXTURE_2D, v.texture);
      gl.uniform1i(l, v.unit);
    } else if (v.length === 2) gl.uniform2fv(l, v);
    else if (v.length === 3) gl.uniform3fv(l, v);
    else if (v.length === 4) gl.uniform4fv(l, v);
  }
}

function formatFor(ctx, kind) {
  const { gl, isWebGL2, floatRT, floatTex32 } = ctx;
  if (kind === 'state' && isWebGL2 && floatTex32) return { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST };
  if (kind === 'color' && isWebGL2 && floatRT) return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR };
  return { internal: isWebGL2 ? gl.RGBA8 : gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR };
}

export function createTarget(ctx, w, h, { kind = 'color', data = null } = {}) {
  const { gl } = ctx;
  const f = formatFor(ctx, kind);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, f.type, data);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, fbo, w, h, complete };
}

export function destroyTarget(gl, t) {
  if (!t) return;
  gl.deleteTexture(t.texture);
  gl.deleteFramebuffer(t.fbo);
}

export function clearTarget(gl, t, rgb) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
  gl.viewport(0, 0, t.w, t.h);
  gl.clearColor(rgb[0], rgb[1], rgb[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function createPingPong(ctx, w, h, opts = {}) {
  const pp = {
    read: createTarget(ctx, w, h, opts),
    write: createTarget(ctx, w, h, opts),
    swap() { [pp.read, pp.write] = [pp.write, pp.read]; },
    destroy() { destroyTarget(ctx.gl, pp.read); destroyTarget(ctx.gl, pp.write); },
  };
  return pp;
}

export function fullscreenTriangle(gl) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return function draw(target, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : w, target ? target.h : h);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}
