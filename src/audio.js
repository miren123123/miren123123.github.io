export function createAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx;

  function ac() {
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, slide = 0) {
    const c = ac();
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, gain, hp = 800) {
    const c = ac();
    const t = c.currentTime;
    const length = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hp;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    src.start(t);
  }

  return {
    unlock: ac,
    shot() {
      noise(0.09, 0.35, 400);
      tone(180, 0.08, 'square', 0.08, -100);
    },
    dry() {
      tone(90, 0.04, 'square', 0.04);
    },
    hit() {
      tone(880, 0.05, 'square', 0.05);
    },
    kill() {
      tone(520, 0.09, 'sawtooth', 0.05, -200);
    },
    hurt() {
      noise(0.12, 0.2, 120);
      tone(110, 0.15, 'sine', 0.08, -40);
    },
    pickup() {
      tone(660, 0.07, 'sine', 0.06);
      tone(990, 0.09, 'sine', 0.04);
    },
    tick() {
      tone(740, 0.04, 'square', 0.03);
    },
    success() {
      tone(523, 0.12, 'sine', 0.06);
      tone(659, 0.14, 'sine', 0.05);
      tone(784, 0.2, 'sine', 0.05);
    },
    fail() {
      tone(196, 0.25, 'sawtooth', 0.06, -80);
    },
    click() {
      tone(440, 0.04, 'square', 0.03);
    },
    step() {
      noise(0.04, 0.05, 200);
    },
  };
}
