// weapon.js — six weapons, hitscan shooting, recoil and spread that punish
// firing on the move, reloads, and a simple view model with muzzle flash.
// The player shoots by raycast (head vs torso matters); bots shoot through
// bots.js with a probability model, but share ammo, spread and damage here.
import * as THREE from 'three';
import { CFG } from './config.js';
import { damageAgent } from './combat.js';
import { playShot, playReload, playDry } from './audio.js';

const _dir = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _ray = new THREE.Raycaster();
// Preallocated target list for hitscan (v6-full, fix 5): the old code built
// a fresh [...solids, ...shootables] array on every pellet. This scratch
// array is filled once per shot and reused; intersectObjects never keeps
// the array, so reuse is safe.
const _targets = [];

// Spread in radians: still base, grows with speed and with bloom from firing,
// halves while aiming. Standing still to aim pays off; spraying on the run does not.
export function currentSpread(G, a) {
  const w = CFG.weapons[a.cur];
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const move = Math.min(1, speed / CFG.player.walk);
  let s = w.spreadStill + (w.spreadMove - w.spreadStill) * move;
  s += (a.bloom ?? 0);
  if (a.aiming) s *= 0.5;
  return s;
}

// Per-weapon view models (v7-visual, CS:GO-style): one group per gun,
// each built from boxes/cylinders with a readable silhouette — pistol
// slide, SMG suppressor, shotgun pump, rifle magazine, LMG drum, sniper
// scope — plus two gloved hands gripping it. Only the current gun's
// group is visible; switching only toggles .visible, so the hot loop
// still allocates nothing. The flash plane/light stay single and move
// to the current muzzle. All stats live in CFG.weapons (untouched).
function vmBox(mat, w, h, d, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  return m;
}
function vmTube(mat, r, len, x, y, z, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  if (rz) { m.rotation.z = rz; } else { m.rotation.x = Math.PI / 2; }
  m.position.set(x, y, z);
  return m;
}

export function createViewModel(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6, metalness: 0.5 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.6 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4f2e, roughness: 0.85 });
  const groups = {};
  const muzzle = {};
  const base = (g) => { g.position.set(0.24, -0.22, -0.45); camera.add(g); return g; };
  // Two gloved hands: right on the grip, left on the forend.
  const hands = (g, gz, fz) => {
    g.add(vmBox(glove, 0.07, 0.09, 0.12, 0.03, -0.06, gz));
    g.add(vmBox(glove, 0.07, 0.09, 0.12, -0.05, -0.03, fz));
  };
  let g = new THREE.Group(); // P9 pistol: compact slide + grip.
  g.add(vmBox(dark, 0.07, 0.09, 0.26, 0, 0.03, -0.12));
  g.add(vmBox(dark, 0.06, 0.15, 0.09, 0, -0.1, 0.06, 0.25));
  hands(g, 0.06, -0.2);
  groups.pistol = base(g); muzzle.pistol = -0.32;
  g = new THREE.Group(); // VK-9 SMG: receiver + long mag + suppressor.
  g.add(vmBox(dark, 0.08, 0.11, 0.34, 0, 0.02, -0.1));
  g.add(vmBox(dark, 0.05, 0.18, 0.07, 0, -0.1, -0.05));
  g.add(vmTube(mid, 0.025, 0.18, 0, 0.03, -0.36));
  g.add(vmBox(dark, 0.06, 0.09, 0.14, 0, 0.01, 0.14));
  hands(g, 0.1, -0.22);
  groups.smg = base(g); muzzle.smg = -0.48;
  g = new THREE.Group(); // M590 shotgun: thick barrel + pump + tube mag.
  g.add(vmBox(dark, 0.09, 0.12, 0.4, 0, 0.02, -0.08));
  g.add(vmTube(mid, 0.028, 0.34, 0, 0.04, -0.36));
  g.add(vmBox(wood, 0.08, 0.09, 0.16, 0, -0.03, -0.3));
  g.add(vmTube(mid, 0.02, 0.3, 0, -0.03, -0.34));
  g.add(vmBox(wood, 0.07, 0.11, 0.16, 0, -0.01, 0.16));
  hands(g, 0.12, -0.3);
  groups.shotgun = base(g); muzzle.shotgun = -0.56;
  g = new THREE.Group(); // AR-77 rifle: receiver + angled mag + sight.
  g.add(vmBox(dark, 0.09, 0.12, 0.44, 0, 0.02, -0.1));
  g.add(vmBox(mid, 0.06, 0.2, 0.09, 0, -0.11, -0.06, 0.15));
  g.add(vmTube(mid, 0.02, 0.3, 0, 0.03, -0.42));
  g.add(vmBox(dark, 0.02, 0.06, 0.02, 0, 0.1, -0.5));
  g.add(vmBox(dark, 0.07, 0.1, 0.16, 0, 0.01, 0.16));
  hands(g, 0.1, -0.28);
  groups.rifle = base(g); muzzle.rifle = -0.58;
  g = new THREE.Group(); // MG-60 LMG: big receiver + drum + bipod hint.
  g.add(vmBox(dark, 0.11, 0.14, 0.5, 0, 0.02, -0.1));
  g.add(vmTube(mid, 0.09, 0.08, 0, -0.1, -0.05, Math.PI / 2));
  g.add(vmTube(mid, 0.025, 0.4, 0, 0.04, -0.46));
  g.add(vmTube(dark, 0.012, 0.2, -0.05, -0.08, -0.42));
  g.add(vmTube(dark, 0.012, 0.2, 0.05, -0.08, -0.42));
  hands(g, 0.12, -0.3);
  groups.lmg = base(g); muzzle.lmg = -0.68;
  g = new THREE.Group(); // LR-50 sniper: long barrel + big scope + bolt.
  g.add(vmBox(dark, 0.08, 0.11, 0.5, 0, 0.02, -0.08));
  g.add(vmTube(mid, 0.035, 0.24, 0, 0.11, -0.1));
  g.add(vmBox(dark, 0.02, 0.05, 0.02, 0, 0.07, -0.02));
  g.add(vmBox(dark, 0.02, 0.05, 0.02, 0, 0.07, -0.18));
  g.add(vmTube(mid, 0.016, 0.42, 0, 0.03, -0.5));
  g.add(vmBox(mid, 0.06, 0.02, 0.02, 0.06, 0.05, -0.02));
  g.add(vmBox(dark, 0.07, 0.1, 0.18, 0, 0, 0.18));
  hands(g, 0.12, -0.32);
  groups.sniper = base(g); muzzle.sniper = -0.74;
  for (const k of Object.keys(groups)) groups[k].visible = k === 'pistol';
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.19, -0.85);
  camera.add(flash);
  const flashLight = new THREE.PointLight(0xffc861, 0, 6);
  flashLight.position.set(0.24, -0.19, -0.85);
  camera.add(flashLight);
  return { groups, group: groups.pistol, muzzle, flash, flashLight, kick: 0, bobT: 0 };
}

// Show one weapon's view model and move the flash to its muzzle.
// Called from switchWeapon; no allocation, only .visible toggles.
export function setViewWeapon(G, key) {
  const vm = G.viewModel;
  if (!vm || !vm.groups[key]) return;
  for (const k of Object.keys(vm.groups)) vm.groups[k].visible = k === key;
  vm.group = vm.groups[key];
  vm.group.position.set(0.24, -0.22, -0.45);
  vm.flash.position.set(0.24, -0.19, -0.45 + vm.muzzle[key] - 0.08);
  vm.flashLight.position.copy(vm.flash.position);
}

// One hitscan ray. Returns the agent hit (or null). Walls stop the bullet.
// Friendly fire is off: a teammate's hitbox never stops the ray.
export function hitscanShot(G, shooter, origin, dir, spread) {
  const dx = (G.rng() - 0.5) * 2 * spread;
  const dy = (G.rng() - 0.5) * 2 * spread;
  // Perturb a scratch copy: mutating the caller's vector made each shotgun
  // pellet start from the previous pellet's already-randomised direction.
  _shotDir.copy(dir);
  _shotDir.x += dx; _shotDir.y += dy; _shotDir.z += (G.rng() - 0.5) * 2 * spread;
  _shotDir.normalize();
  _ray.set(origin, _shotDir);
  _ray.far = 120;
  _targets.length = 0;
  for (let i = 0; i < G.world.solids.length; i++) _targets.push(G.world.solids[i]);
  for (let i = 0; i < G.shootables.length; i++) _targets.push(G.shootables[i]);
  const hits = _ray.intersectObjects(_targets, false);
  for (const h of hits) {
    const ud = h.object.userData;
    if (ud.agent !== undefined) {
      if (ud.agent === shooter || !ud.agent.alive) continue;
      if (ud.agent.team === shooter.team) continue; // friendly fire off
      return { agent: ud.agent, part: ud.part ?? 'torso' };
    }
    return null; // a wall stops the bullet
  }
  return null;
}

// Player trigger pull. Called every fixed step while the trigger is held.
export function tryFire(G, dt) {
  const p = G.player;
  if (!p.alive || G.round.state !== 'live') return;
  const st = p.weapons[p.cur];
  if (!st || st.reloading > 0) return;
  const w = CFG.weapons[p.cur];
  st.cooldown -= dt;
  if (st.cooldown > 0) return;
  if (!G.input.mouseDown && !G.input.mouseClicked) return;
  if (!w.auto && !G.input.mouseClicked) return;
  if (st.mag <= 0) { playDry(G); startReload(G, p); return; }
  // Fire.
  G.input.mouseClicked = false;
  st.cooldown = w.gap;
  st.mag--;
  p.bloom = Math.min(0.03, (p.bloom ?? 0) + w.kick * 0.5);
  // Recoil per shot is unchanged (same kick magnitude as v5); it now
  // lands in the recoverable recoil offset instead of permanently
  // displacing the aim.
  p.recoilPitch += w.kick * (0.85 + G.rng() * 0.3);
  p.recoilYaw += (G.rng() - 0.5) * w.kick * 0.4;
  p.lastShotT = G.time;
  G.viewModel.kick = 1;
  G.viewModel.flash.material.opacity = 0.9;
  G.viewModel.flashLight.intensity = 6;
  G.pings.push({ x: p.pos.x, z: p.pos.z, t: G.time });
  if (G.noise) G.noise(p.pos, CFG.bot.hearR);
  playShot(G, p.cur);
  G.camera.getWorldPosition(_origin);
  G.camera.getWorldDirection(_dir);
  const spread = currentSpread(G, p);
  for (let i = 0; i < w.pellets; i++) {
    const hit = hitscanShot(G, p, _origin, _dir, spread);
    if (hit) {
      const dmg = w.dmg * (hit.part === 'head' ? w.headMul : 1);
      damageAgent(G, hit.agent, dmg, hit.part, p);
      G.hudHit = hit.part;
      G.hudHitT = 0.12;
    }
  }
  if (st.mag === 0) startReload(G, p);
}

export function startReload(G, a) {
  const st = a.weapons[a.cur];
  const w = CFG.weapons[a.cur];
  if (!st || st.reloading > 0 || st.mag >= w.mag || st.reserve <= 0) return;
  st.reloading = w.reload;
  if (a.isPlayer) playReload(G);
}

export function stepReloads(G, dt) {
  for (const a of G.agents) {
    const st = a.weapons[a.cur];
    if (!st || st.reloading <= 0) continue;
    st.reloading -= dt;
    if (st.reloading <= 0) {
      const w = CFG.weapons[a.cur];
      const need = w.mag - st.mag;
      const take = Math.min(need, st.reserve);
      st.mag += take;
      st.reserve -= take;
      st.reloading = 0;
    }
  }
}

export function stepViewModel(G, dt) {
  const vm = G.viewModel;
  const p = G.player;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  vm.bobT += dt * speed * 1.6;
  const bob = Math.min(1, speed / CFG.player.walk) * 0.012;
  vm.kick = Math.max(0, vm.kick - dt * 7);
  vm.group.position.set(
    0.24 + Math.sin(vm.bobT) * bob,
    -0.22 + Math.abs(Math.cos(vm.bobT)) * bob + vm.kick * 0.03,
    -0.45 + vm.kick * 0.09,
  );
  vm.group.rotation.x = vm.kick * 0.12;
  vm.flash.material.opacity = Math.max(0, vm.flash.material.opacity - dt * 18);
  vm.flashLight.intensity = Math.max(0, vm.flashLight.intensity - dt * 90);
  // Bloom recovers when not firing.
  p.bloom = Math.max(0, (p.bloom ?? 0) - dt * 0.02);
}

export function switchWeapon(G, a, key) {
  if (!a.weapons[key] || a.cur === key) return;
  a.cur = key;
  const st = a.weapons[key];
  st.reloading = 0;
  if (a.isPlayer) {
    G.hudWeaponFlash = 0.5;
    setViewWeapon(G, key);
  }
}
