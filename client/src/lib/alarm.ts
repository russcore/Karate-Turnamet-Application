// Shared Web Audio alarm used by the bout timer and the tatami break timer.
let audioCtx: AudioContext | null = null;

export function ensureAudio(): void {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    else void audioCtx.resume();
  } catch {
    /* audio unavailable */
  }
}

export function playAlarm(): void {
  try {
    ensureAudio();
    const ctx = audioCtx!;
    void ctx.resume();
    const beep = (offset: number, freq: number, dur = 0.25) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + offset);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + dur);
      o.start(ctx.currentTime + offset);
      o.stop(ctx.currentTime + offset + dur);
    };
    beep(0, 880);
    beep(0.35, 880);
    beep(0.7, 1200, 0.5);
  } catch {
    /* audio unavailable */
  }
  try {
    (navigator as any).vibrate?.([300, 120, 300]);
  } catch {
    /* no vibrate */
  }
}
