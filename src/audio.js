// All sound is synthesized with Web Audio, so there are no audio files to load or fail.
// The context is only created after a user gesture.

let ctx = null;
let master, musicBus, sfxBus;
let settings = { music: 60, sfx: 80, muted: false };
let musicTimer = null;
let musicStep = 0;
let windSource = null;
let wanted = false; // music should play when allowed

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.connect(master);
  sfxBus.connect(master);
  master.connect(ctx.destination);
  applyVolumes();
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.05);
  musicBus.gain.setTargetAtTime((settings.music / 100) * 0.35, t, 0.05);
  sfxBus.gain.setTargetAtTime((settings.sfx / 100) * 0.7, t, 0.05);
}

export function setAudioSettings(s) {
  settings = { music: s.music, sfx: s.sfx, muted: s.muted };
  applyVolumes();
}

// Call from a user gesture handler.
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

// Sound is a nicety: a failed note must never interrupt the game.
const safely = (play) => (options) => { try { play(options); } catch { /* skip this sound */ } };

const tone = safely(({ freq = 440, type = 'sine', dur = 0.2, vol = 0.5, attack = 0.005, slide = 0, delay = 0, bus = sfxBus }) => {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
});

let noiseBuffer = null;
const noise = safely(({ dur = 0.2, vol = 0.4, filter = 1200, q = 1, sweep = 0, type = 'bandpass', delay = 0 }) => {
  if (!ctx || ctx.state !== 'running') return;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(filter, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, filter + sweep), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
  src.stop(t + dur + 0.05);
});

export const sfx = {
  slash() { noise({ dur: 0.18, vol: 0.5, filter: 900, sweep: 3500, q: 2 }); },
  hit() { tone({ freq: 180, type: 'square', dur: 0.12, vol: 0.18, slide: -90 }); },
  soul() {
    [784, 988, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.28, vol: 0.22, delay: i * 0.07 }));
  },
  damage() {
    tone({ freq: 220, type: 'sawtooth', dur: 0.3, vol: 0.25, slide: -140 });
    noise({ dur: 0.2, vol: 0.25, filter: 400, type: 'lowpass' });
  },
  breach() {
    tone({ freq: 140, type: 'square', dur: 0.5, vol: 0.2, slide: -60 });
    tone({ freq: 147, type: 'square', dur: 0.5, vol: 0.15, slide: -60 });
  },
  seal() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.4, vol: 0.2, delay: i * 0.09 })); },
  warn() { tone({ freq: 330, type: 'sine', dur: 0.25, vol: 0.12, slide: -100 }); },
  step() { noise({ dur: 0.05, vol: 0.06, filter: 300, type: 'lowpass' }); },
  interact() { tone({ freq: 660, type: 'triangle', dur: 0.15, vol: 0.22 }); tone({ freq: 990, type: 'triangle', dur: 0.2, vol: 0.18, delay: 0.08 }); },
  denied() { tone({ freq: 200, type: 'triangle', dur: 0.14, vol: 0.18 }); tone({ freq: 160, type: 'triangle', dur: 0.18, vol: 0.18, delay: 0.1 }); },
  bell() {
    [0, 0.01].forEach((d, i) => tone({ freq: i ? 523 * 2.76 : 523, type: 'sine', dur: 2.2, vol: i ? 0.08 : 0.3, delay: d }));
  },
  spotted() { tone({ freq: 520, type: 'square', dur: 0.08, vol: 0.1 }); tone({ freq: 700, type: 'square', dur: 0.1, vol: 0.1, delay: 0.08 }); },
  victory() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.5, vol: 0.22, delay: i * 0.12 })); },
  defeat() { [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.45, vol: 0.22, delay: i * 0.18 })); },
  pulse() { tone({ freq: 140, type: 'sine', dur: 0.4, vol: 0.4, slide: 260 }); noise({ dur: 0.3, vol: 0.2, filter: 700, sweep: 1500 }); },
  rattle() { [0, 0.07, 0.14, 0.21].forEach((d) => noise({ dur: 0.05, vol: 0.3, filter: 2400, q: 4, delay: d })); },
  gunshot() { noise({ dur: 0.22, vol: 0.6, filter: 1400, sweep: 300, q: 1 }); tone({ freq: 120, type: 'square', dur: 0.12, vol: 0.2, slide: -80 }); },
  // The monsters.
  shriek() { noise({ dur: 0.9, vol: 0.32, filter: 1800, sweep: 4200, q: 8 }); tone({ freq: 880, type: 'sawtooth', dur: 0.8, vol: 0.06, slide: 500 }); },
  scuttle() { [0, 0.05, 0.1, 0.15, 0.2, 0.25].forEach((d) => noise({ dur: 0.03, vol: 0.18, filter: 3200, q: 6, delay: d })); },
  lunge() { noise({ dur: 0.25, vol: 0.35, filter: 600, sweep: 2600, q: 2 }); },
  smash() { noise({ dur: 0.35, vol: 0.45, filter: 400, type: 'lowpass' }); tone({ freq: 90, type: 'square', dur: 0.2, vol: 0.15, slide: -40 }); },
  growl() { tone({ freq: 70, type: 'sawtooth', dur: 0.9, vol: 0.12, slide: -20 }); noise({ dur: 0.8, vol: 0.12, filter: 220, type: 'lowpass' }); },
  coin() { tone({ freq: 880, type: 'triangle', dur: 0.1, vol: 0.2 }); tone({ freq: 1320, type: 'triangle', dur: 0.2, vol: 0.2, delay: 0.07 }); },
  click() { tone({ freq: 500, type: 'triangle', dur: 0.06, vol: 0.12 }); },
};

// ---- Music: a slow minor arpeggio over a soft pad, plus filtered-noise wind. ----

const NOTES = [57, 60, 64, 67, 65, 60, 64, 62, 57, 60, 64, 69, 67, 64, 62, 59];
const BASS = [45, 45, 41, 43];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function scheduleMusicStep() {
  if (!ctx || ctx.state !== 'running') return;
  const n = NOTES[musicStep % NOTES.length];
  tone({ freq: midi(n + 12), type: 'triangle', dur: 0.55, vol: 0.18, attack: 0.02, bus: musicBus });
  if (musicStep % 4 === 0) {
    const b = BASS[(musicStep / 4) % BASS.length];
    tone({ freq: midi(b), type: 'sine', dur: 1.6, vol: 0.35, attack: 0.15, bus: musicBus });
  }
  musicStep++;
}

function startWind() {
  if (!ctx || windSource) return;
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3; }
  windSource = ctx.createBufferSource();
  windSource.buffer = buf;
  windSource.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 500;
  const g = ctx.createGain();
  g.gain.value = 0.25;
  windSource.connect(f).connect(g).connect(musicBus);
  windSource.start();
}

export function startMusic() {
  wanted = true;
  if (!ensure() || musicTimer) return;
  startWind();
  musicTimer = setInterval(scheduleMusicStep, 420);
}

export function stopMusic() {
  wanted = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (windSource) { try { windSource.stop(); } catch { /* already stopped */ } windSource = null; }
}

// Suspend everything (pause / hidden tab) without forgetting whether music was wanted.
export function suspendAudio() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  if (wanted && !musicTimer) startMusic();
}
