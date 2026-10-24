import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandEnergy, envelope, createAutoGain, createBeatDetector, detectPitch, pitchToUnit,
  analyzeFrame, createAnalysisState,
} from '../js/audio-analysis.js';

const SR = 44100, FFT = 2048, BINS = FFT / 2;
const binOf = hz => Math.round(hz * FFT / SR);

function spectrumWith(loHz, hiHz, v = 255) {
  const s = new Uint8Array(BINS);
  for (let i = binOf(loHz); i <= binOf(hiHz); i++) s[i] = v;
  return s;
}

test('bandEnergy isolates bands', () => {
  const s = spectrumWith(20, 250);
  assert.ok(bandEnergy(s, SR, FFT, 20, 250) > 0.95);
  assert.equal(bandEnergy(s, SR, FFT, 2000, 8000), 0);
});

test('envelope rises fast and falls slowly', () => {
  const up = envelope(0, 1, 0.03, 0.03, 0.35);
  const down = envelope(1, 0, 0.03, 0.03, 0.35);
  assert.ok(up > 0.6);
  assert.ok(down > 0.9);
});

test('auto gain normalises a quiet signal toward 1 and stays finite at 0', () => {
  const g = createAutoGain();
  let out = 0;
  for (let i = 0; i < 200; i++) out = g.apply(0.1, 1 / 60);
  assert.ok(out > 0.9);
  const g0 = createAutoGain();
  for (let i = 0; i < 200; i++) out = g0.apply(0, 1 / 60);
  assert.equal(out, 0);
});

test('silence yields all-zero finite signals', () => {
  const st = createAnalysisState();
  const freq = new Uint8Array(BINS), time = new Float32Array(FFT);
  let sig;
  for (let i = 0; i < 100; i++) sig = analyzeFrame(st, { freq, time, sampleRate: SR, fftSize: FFT }, 1 / 60);
  for (const k of ['bass', 'mid', 'treble', 'loudness', 'beat', 'pitch']) {
    assert.ok(Number.isFinite(sig[k]), k);
    assert.equal(sig[k], 0, k);
  }
});

test('beat detector fires on a bass jump', () => {
  const b = createBeatDetector();
  for (let i = 0; i < 120; i++) b.update(0.3, 1 / 60);
  const pulse = b.update(0.9, 1 / 60);
  assert.ok(pulse > 0.5, String(pulse));
});

test('detectPitch finds a 220 Hz sine and returns 0 for silence', () => {
  const buf = new Float32Array(FFT);
  for (let i = 0; i < FFT; i++) buf[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / SR);
  assert.ok(Math.abs(detectPitch(buf, SR) - 220) < 3);
  assert.equal(detectPitch(new Float32Array(FFT), SR), 0);
});

test('pitchToUnit maps 80..1000 Hz logarithmically', () => {
  assert.equal(pitchToUnit(80), 0);
  assert.equal(pitchToUnit(1000), 1);
  assert.equal(pitchToUnit(0), 0);
  assert.ok(Math.abs(pitchToUnit(Math.sqrt(80 * 1000)) - 0.5) < 1e-9);
});
