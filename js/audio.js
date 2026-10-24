// Browser audio input (microphone or a dropped file) feeding the pure analyser.

import { analyzeFrame, createAnalysisState } from './audio-analysis.js';

const FFT_SIZE = 2048;

export function createAudioInput() {
  let ac = null, analyser = null, source = null, stream = null, element = null;
  let mode = 'off';
  let state = createAnalysisState();
  let freq = null, time = null;

  function ensureContext() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not supported in this browser.');
      ac = new AC();
      analyser = ac.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6;
      freq = new Uint8Array(analyser.frequencyBinCount);
      time = new Float32Array(analyser.fftSize);
    }
    return ac.resume();
  }

  function disconnect() {
    source?.disconnect();
    source = null;
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    if (element) {
      element.pause();
      URL.revokeObjectURL(element.src);
      element = null;
    }
    analyser?.disconnect();
    state = createAnalysisState();
  }

  async function startMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone needs a secure page (https or localhost).');
    }
    await ensureContext();
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      throw new Error(e.name === 'NotAllowedError'
        ? 'Microphone permission was denied.'
        : 'No microphone could be opened.');
    }
    disconnect();
    stream = s;
    source = ac.createMediaStreamSource(stream);
    source.connect(analyser); // never to the speakers: no feedback howl
    mode = 'mic';
  }

  async function startFile(file) {
    await ensureContext();
    disconnect();
    element = new Audio();
    element.src = URL.createObjectURL(file);
    element.loop = true;
    source = ac.createMediaElementSource(element);
    source.connect(analyser);
    analyser.connect(ac.destination);
    try {
      await element.play();
    } catch {
      disconnect();
      mode = 'off';
      throw new Error('That audio file could not be played.');
    }
    mode = 'file';
  }

  function stop() {
    disconnect();
    mode = 'off';
  }

  function update(dt) {
    if (mode === 'off' || !analyser) return {};
    analyser.getByteFrequencyData(freq);
    analyser.getFloatTimeDomainData(time);
    return analyzeFrame(state, { freq, time, sampleRate: ac.sampleRate, fftSize: FFT_SIZE }, dt);
  }

  return { startMic, startFile, stop, update, get mode() { return mode; } };
}
