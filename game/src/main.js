// main.js — boot, the fixed-step loop, and the one place the whole game
// state lives (G). Simulation runs at 60 Hz, decoupled from rendering;
// the HUD reads G but never writes the sim. ?shot=start|play|plant|end
// &seed=N renders one deterministic frame for screenshots, then freezes.
import * as THREE from 'three';
import { CFG } from './config.js';
import { PAL } from './palette.js';
import { createWorld } from './world.js';
import { createPlayer, giveWeapon, stepPlayer } from './player.js';
import { createViewModel, tryFire, stepReloads, stepViewModel, switchWeapon, startReload, currentSpread } from './weapon.js';
import { createBots, stepBots } from './bots.js';
import { createBomb, stepBomb, stepPlayerInteract, plantBomb, defuseBomb } from './bomb.js';
import { createRounds, startRound, stepRounds, endRound } from './rounds.js';
import { buyItem } from './economy.js';
import { stepGrenades, throwGrenade } from './grenade.js';
import { initHud, stepHud } from './hud.js';
import { createInput, bindInput } from './input.js';
import { toggleMute } from './audio.js';
import { applyShot } from './shots.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = (parseInt(params.get('seed') ?? '1', 10) || 1) >>> 0;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.canvas);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
scene.add(camera);

const G = {
  scene, camera, renderer,
  rng: mulberry32(shotMode ? seed : (Math.random() * 0x7fffffff) | 0),
  time: 0, menuOpen: true, buyOpen: false,
  input: createInput(),
  shootables: [], grenades: [], smokes: [], flashes: [], pings: [],
  killFeed: [], radio: [],
  hudHit: null, hudHitT: 0, dmgFlash: 0, dmgDir: 0, dmgDirT: 0,
  econFlash: 0, toast: '', toastT: 0, spreadNow: 0.01, playerDied: false,
  world: null, player: null, bots: [], agents: [], viewModel: null, bomb: null, round: null,
  // Bots hear shots and deaths through this (radius in metres).
  noise(pos, r) {
    for (const b of G.bots) {
      if (!b.alive || b.pos.distanceTo(pos) > r) continue;
      b.heardPos = pos.clone();
      b.heardT = 0;
      if (b.state === 'hold' || b.state === 'route') b.state = 'react';
    }
  },
  endRound(w, reason) { endRound(G, w, reason); },
  plantBomb(a, s) { plantBomb(G, a, s); },
  defuseBomb(a) { defuseBomb(G, a); },
};

G.world = createWorld(scene);
G.player = createPlayer(G.world, 'atk');
giveWeapon(G.player, 'pistol');
G.player.cur = 'pistol';
G.bots = createBots(G);
G.agents = [G.player, ...G.bots];
G.viewModel = createViewModel(camera);
G.bomb = createBomb(G);
G.round = createRounds();
startRound(G);
initHud();
bindInput(G, renderer.domElement);

// --- input callbacks (input.js only forwards DOM events) ---
G.onReload = () => startReload(G, G.player);
G.onBuyToggle = () => { if (G.round.state === 'freeze') G.buyOpen = !G.buyOpen; };
G.onGrenade = () => {
  const p = G.player;
  if (G.round.state !== 'live' || !p.alive) return;
  if (!throwGrenade(G, p, 'he')) throwGrenade(G, p, 'smoke');
};
G.onMute = () => {
  const m = toggleMute();
  G.toast = m ? 'Sound muted' : 'Sound on';
  G.toastT = 1.5;
};
G.onDigit = (d) => {
  const p = G.player;
  if (G.buyOpen && G.round.state === 'freeze') {
    const map = { 1: 'pistol', 2: 'smg', 3: 'shotgun', 4: 'rifle', 5: 'lmg', 6: 'sniper', 7: 'armor', 8: 'he', 9: 'smoke', 0: 'kit' };
    const msg = buyItem(G, map[d]);
    if (msg) { G.toast = msg; G.toastT = 2; }
    return;
  }
  const order = CFG.buyOrder;
  const key = order[parseInt(d, 10) - 1];
  if (key) switchWeapon(G, p, key);
};
G.onLock = () => {
  renderer.domElement.requestPointerLock();
  G.menuOpen = false;
};
G.onLockChange = (locked) => {
  if (!locked && G.round.state !== 'over' && !shotMode) G.menuOpen = true;
};
document.getElementById('overlay').addEventListener('click', () => G.onLock());

function step(dt) {
  G.time += dt;
  // Decay presentation timers.
  G.hudHitT = Math.max(0, G.hudHitT - dt);
  G.dmgFlash = Math.max(0, G.dmgFlash - dt * 1.2);
  G.dmgDirT = Math.max(0, G.dmgDirT - dt);
  G.econFlash = Math.max(0, G.econFlash - dt);
  G.toastT = Math.max(0, G.toastT - dt);
  if (G.round.banner) G.round.banner.t -= dt;
  for (const k of G.killFeed) k.t -= dt;
  for (let i = G.killFeed.length - 1; i >= 0; i--) if (G.killFeed[i].t <= 0) G.killFeed.splice(i, 1);
  for (const m of G.radio) m.t -= dt;
  for (let i = G.radio.length - 1; i >= 0; i--) if (G.radio[i].t <= 0) G.radio.splice(i, 1);
  for (let i = G.pings.length - 1; i >= 0; i--) if (G.time - G.pings[i].t > 2.5) G.pings.splice(i, 1);
  // Steam breathes.
  G.world.steam.forEach((s, i) => {
    const k = 1 + 0.18 * Math.sin(G.time * 0.9 + i * 1.7);
    s.scale.set(k, k * 0.6 * (1 + 0.1 * Math.sin(G.time * 0.6 + i)), k);
  });
  if (G.world.drum) G.world.drum.rotateY(dt * 1.2);
  if (G.menuOpen || G.round.state === 'over') return;
  stepPlayer(G, dt);
  tryFire(G, dt);
  stepBots(G, dt);
  stepGrenades(G, dt);
  stepBomb(G, dt);
  stepPlayerInteract(G, dt);
  stepRounds(G, dt);
  stepReloads(G, dt);
  stepViewModel(G, dt);
  G.spreadNow = currentSpread(G, G.player);
  if (G.playerDied) {
    G.toast = 'You are down — your team fights on';
    G.toastT = 3;
    G.playerDied = false;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- screenshot harness: deterministic, then freeze the sim but keep
// rendering (a canvas rendered once and never again composites black).
if (shotMode) {
  applyShot(G, shotMode);
  for (let i = 0; i < 45; i++) step(1 / 60);
  stepHud(G, 0);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
  const frozen = () => { requestAnimationFrame(frozen); renderer.render(scene, camera); };
  requestAnimationFrame(frozen);
} else {
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; }
    stepHud(G, dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}
window.__G = G; // debug handle (live review / self-test)
window.__gameReady = true;
