// audio.js — every sound is synthesized with WebAudio: no audio files, so the
// no-network gate is trivially satisfied. The context starts on the first user
// gesture; until then calls are silent no-ops.
let ctx = null;
let master = null;
let muted = false;

function ac(G) {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(G, freq, dur, type = 'sine', vol = 0.5, slideTo = 0) {
  const c = ac(G);
  if (!c || muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

function noise(G, dur, filterFreq, vol = 0.5, type = 'lowpass') {
  const c = ac(G);
  if (!c || muted) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

// Distance attenuation for world sounds (bots, explosions): full up close, a floor of 0.12 past 40 m.
function volAt(G, pos) {
  if (!pos) return 1;
  const d = G.player.pos.distanceTo(pos);
  return Math.max(0.12, 1 - d / 45);
}

const SHOT = {
  pistol: [0.09, 1800, 0.5], smg: [0.07, 2200, 0.4], shotgun: [0.22, 900, 0.8],
  rifle: [0.1, 1500, 0.55], lmg: [0.12, 1100, 0.6], sniper: [0.28, 700, 0.9],
};

export function playShot(G, key, pos) {
  const [dur, freq, vol] = SHOT[key] ?? SHOT.rifle;
  const v = vol * volAt(G, pos);
  noise(G, dur, freq, v);
  tone(G, key === 'sniper' ? 90 : 160, 0.07, 'square', v * 0.4, 60);
}
export function playReload(G) { tone(G, 500, 0.06, 'square', 0.25); setTimeout(() => tone(G, 700, 0.06, 'square', 0.25), 120); }
export function playDry(G) { tone(G, 1200, 0.03, 'square', 0.2); }
export function playHit(G, head) { tone(G, head ? 2400 : 1800, 0.05, 'sine', 0.4); }
export function playExplode(G, pos) {
  const v = volAt(G, pos);
  noise(G, 1.1, 300, 0.9 * v);
  tone(G, 70, 0.9, 'sine', 0.8 * v, 30);
}
export function playSmoke(G, pos) { noise(G, 0.5, 600, 0.3 * volAt(G, pos), 'bandpass'); }
export function playBeep(G, fuse) { tone(G, fuse > 10 ? 1100 : 1600, 0.06, 'square', 0.3); }
export function playPlant(G) { tone(G, 880, 0.1, 'sine', 0.4); setTimeout(() => tone(G, 1320, 0.12, 'sine', 0.4), 140); }
export function playDefuse(G) { tone(G, 1320, 0.1, 'sine', 0.4); setTimeout(() => tone(G, 1760, 0.14, 'sine', 0.4), 140); }
export function playRoundWin(G) { tone(G, 523, 0.14, 'sine', 0.45); setTimeout(() => tone(G, 784, 0.2, 'sine', 0.45), 150); }
export function playRoundLose(G) { tone(G, 392, 0.16, 'sine', 0.4); setTimeout(() => tone(G, 262, 0.24, 'sine', 0.4), 170); }
export function toggleMute() { muted = !muted; return muted; }
