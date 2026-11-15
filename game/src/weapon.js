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

export function createViewModel(camera) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6, metalness: 0.5 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.6 });
  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.42), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), mid);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.32);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), dark);
  grip.position.set(0, -0.13, 0.1);
  grip.rotation.x = 0.3;
  g.add(recv, barrel, grip);
  g.position.set(0.24, -0.22, -0.45);
  camera.add(g);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.19, -0.72);
  camera.add(flash);
  const flashLight = new THREE.PointLight(0xffc861, 0, 6);
  flashLight.position.set(0.24, -0.19, -0.72);
  camera.add(flashLight);
  return { group: g, flash, flashLight, kick: 0, bobT: 0 };
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
  const targets = [...G.world.solids, ...G.shootables];
  const hits = _ray.intersectObjects(targets, false);
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
  p.pitch += w.kick * (0.85 + G.rng() * 0.3);
  p.yaw += (G.rng() - 0.5) * w.kick * 0.4;
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
  if (a.isPlayer) G.hudWeaponFlash = 0.5;
}
