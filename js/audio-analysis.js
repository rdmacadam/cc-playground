// Pure audio analysis: turns analyser frames into smooth 0..1 control signals.

const BANDS = { bass: [20, 250], mid: [250, 2000], treble: [2000, 8000] };

export function bandEnergy(spectrum, sampleRate, fftSize, loHz, hiHz) {
  const hzPerBin = sampleRate / fftSize;
  const lo = Math.max(0, Math.round(loHz / hzPerBin));
  const hi = Math.min(spectrum.length - 1, Math.round(hiHz / hzPerBin));
  if (hi < lo) return 0;
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += spectrum[i];
  return sum / ((hi - lo + 1) * 255);
}

// Attack/release smoothing: fast rise, slow fall.
export function envelope(prev, input, dt, attack = 0.03, release = 0.35) {
  const tau = input > prev ? attack : release;
  return prev + (input - prev) * (1 - Math.exp(-dt / tau));
}

// Running-peak normalisation so quiet rooms and loud music both fill 0..1.
export function createAutoGain({ decayPerSec = 0.2, floor = 0.02 } = {}) {
  let peak = 0;
  return {
    apply(v, dt) {
      peak = Math.max(v, peak * Math.exp(-dt * decayPerSec));
      return Math.min(1, v / Math.max(peak, floor));
    },
  };
}

export function createBeatDetector({ threshold = 1.4, decay = 0.25, minGap = 0.18, minEnergy = 0.05 } = {}) {
  let avg = 0, pulse = 0, since = Infinity;
  return {
    update(energy, dt) {
      since += dt;
      pulse *= Math.exp(-dt / decay);
      if (energy > minEnergy && energy > avg * threshold && since > minGap) {
        pulse = 1;
        since = 0;
      }
      avg += (energy - avg) * (1 - Math.exp(-dt / 0.8));
      return pulse;
    },
  };
}

// Autocorrelation pitch detector; returns Hz or 0 when there is no clear pitch.
export function detectPitch(buf, sampleRate, minHz = 80, maxHz = 1000) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return 0;

  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / minHz));
  const r = new Float32Array(maxLag + 2);
  let best = 0;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += buf[i] * buf[i + lag];
    r[lag] = s / (n - lag);
    if (lag <= maxLag && r[lag] > best) best = r[lag];
  }
  if (best <= 0) return 0;
  // First local peak close to the global max avoids octave errors.
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      const a = r[lag - 1], b = r[lag], c = r[lag + 1];
      const denom = a - 2 * b + c;
      const shift = denom !== 0 ? 0.5 * (a - c) / denom : 0;
      return sampleRate / (lag + shift);
    }
  }
  return 0;
}

const LOG_LO = Math.log(80), LOG_HI = Math.log(1000);
export function pitchToUnit(hz) {
  if (!hz) return 0;
  return Math.min(1, Math.max(0, (Math.log(hz) - LOG_LO) / (LOG_HI - LOG_LO)));
}

export function createAnalysisState() {
  return {
    gains: { bass: createAutoGain(), mid: createAutoGain(), treble: createAutoGain(), loudness: createAutoGain() },
    beat: createBeatDetector(),
    out: { bass: 0, mid: 0, treble: 0, loudness: 0, beat: 0, pitch: 0 },
  };
}

export function analyzeFrame(state, { freq, time, sampleRate, fftSize }, dt) {
  const { out, gains } = state;
  const raw = {};
  for (const [k, [lo, hi]] of Object.entries(BANDS)) raw[k] = bandEnergy(freq, sampleRate, fftSize, lo, hi);
  let rms = 0;
  for (let i = 0; i < time.length; i++) rms += time[i] * time[i];
  raw.loudness = Math.sqrt(rms / (time.length || 1));

  for (const k of ['bass', 'mid', 'treble', 'loudness']) out[k] = envelope(out[k], gains[k].apply(raw[k], dt), dt);
  out.beat = state.beat.update(raw.bass, dt);
  const hz = detectPitch(time, sampleRate);
  // Hold the last pitch through brief gaps, drift back to 0 in silence.
  out.pitch = hz ? envelope(out.pitch, pitchToUnit(hz), dt, 0.15, 0.15) : envelope(out.pitch, 0, dt, 0.15, 1.5);
  return out;
}
