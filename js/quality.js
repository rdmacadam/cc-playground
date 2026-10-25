// Adaptive quality: lowers render scale when frames run slow, recovers when fast.
// fastMs sits just above a 60 Hz frame so vsync-locked displays can recover.

export function createQualityGovernor({ levels = [1, 0.75, 0.5], slowMs = 20, slowFor = 2, fastMs = 18, fastFor = 5, maxFrameMs = 100 } = {}) {
  let ema = null, slow = 0, fast = 0, level = 0;
  return {
    get level() { return level; },
    update(rawMs) {
      // A frame after a hidden tab can be seconds long; it says nothing about rendering cost.
      const frameMs = Math.min(rawMs, maxFrameMs);
      ema = ema === null ? frameMs : ema + (frameMs - ema) * 0.1;
      const dt = frameMs / 1000;
      slow = ema > slowMs ? slow + dt : 0;
      fast = ema < fastMs ? fast + dt : 0;
      if (slow > slowFor && level < levels.length - 1) { level++; slow = 0; }
      if (fast > fastFor && level > 0) { level--; fast = 0; }
      return levels[level];
    },
  };
}
