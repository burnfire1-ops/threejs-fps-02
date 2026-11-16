// weapon.js — six weapons, hitscan shooting, recoil and spread, reloads, view model with muzzle flash.
// Player shoots by raycast (head vs torso matters); bots share ammo, spread and damage here.
import * as THREE from 'three';
import { CFG } from './config.js';
import { damageAgent } from './combat.js';
import { playShot, playReload, playDry } from './audio.js';

const _dir = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _ray = new THREE.Raycaster();
// Preallocated hitscan target list: filled once per shot and reused (the old
// code built a fresh [...solids, ...shootables] array per pellet); intersectObjects
// never keeps the array, so reuse is safe.
const _targets = [];

// Spread: base, grows with speed + bloom, halves while aiming.
export function currentSpread(G, a) {
  const w = CFG.weapons[a.cur];
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const move = Math.min(1, speed / CFG.player.walk);
  let s = w.spreadStill + (w.spreadMove - w.spreadStill) * move;
  s += (a.bloom ?? 0);
  if (a.aiming) s *= 0.5;
  return s;
}

// Per-weapon view models (v7-visual fix): DETAILED viewmodels — multi-part
// receivers, barrels, magazines, stocks, sights, and a VISIBLE TAN-GLOVED
// HAND gripping each weapon (right hand on the pistol grip, left on the
// forend/pump), sleeve forearm angling down-back so the weapon does not float.
// Glove tan (0x9c8a68) so it reads against the dark gun. Only the current
// gun's group is visible; switching only toggles .visible, so the hot loop
// still allocates nothing. The flash plane/light stay single and move to the
// current muzzle (muzzle anchor points UNCHANGED). All stats live in CFG.weapons.
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
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.35, metalness: 0.75 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x9c8a68, roughness: 0.9 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4f2e, roughness: 0.85 });
  const groups = {};
  const muzzle = {};
  const base = (g) => { g.position.set(0.24, -0.18, -0.45); camera.add(g); return g; };
  // A gloved hand gripping a horizontal part: the palm is the direct child of
  // the weapon group (the playtest counts one glove-coloured direct child per
  // hand); finger block, thumb, and sleeve hang off the palm so the hand moves
  // as one. side: +1 right, -1 left. Fingers curl UNDER the gun part (below the
  // palm, rotated), so the hand reads as gripping, not one tan brick; the thumb
  // is a distinct block on the outer side.
  const gripHand = (g, x, y, z, side) => {
    const palm = vmBox(glove, 0.085, 0.095, 0.085, x, y, z);
    palm.add(vmBox(glove, 0.075, 0.055, 0.06, 0, -0.055, -0.02, 0.35));
    palm.add(vmBox(glove, 0.035, 0.06, 0.06, -side * 0.055, 0.005, -0.02));
    const fa = vmBox(sleeve, 0.09, 0.09, 0.22, side * 0.04, -0.12, 0.12, 0.5);
    fa.rotation.z = -side * 0.18;
    palm.add(fa);
    g.add(palm);
  };
  let g = new THREE.Group(); // P9 pistol: slide + frame + sights + grip.
  g.add(vmBox(dark, 0.07, 0.07, 0.24, 0, 0.05, -0.12));
  g.add(vmBox(steel, 0.05, 0.015, 0.2, 0, 0.09, -0.12));
  g.add(vmBox(steel, 0.02, 0.03, 0.02, 0, 0.1, -0.02));
  g.add(vmBox(steel, 0.015, 0.03, 0.015, 0, 0.1, -0.22));
  g.add(vmBox(mid, 0.06, 0.06, 0.2, 0, 0.0, -0.08));
  g.add(vmBox(dark, 0.05, 0.03, 0.07, 0, -0.05, -0.1));
  g.add(vmBox(steel, 0.015, 0.04, 0.015, 0, -0.05, -0.1));
  g.add(vmBox(dark, 0.06, 0.14, 0.08, 0, -0.1, 0.06, 0.25));
  g.add(vmBox(steel, 0.065, 0.02, 0.09, 0, -0.17, 0.08, 0.25));
  gripHand(g, 0.02, -0.09, 0.06, 1);
  gripHand(g, -0.02, -0.17, 0.05, -1);
  groups.pistol = base(g); muzzle.pistol = -0.32;
  g = new THREE.Group(); // VK-9 SMG: two-tone receiver + long mag + can.
  g.add(vmBox(dark, 0.08, 0.09, 0.3, 0, 0.0, -0.06));
  g.add(vmBox(mid, 0.07, 0.06, 0.3, 0, 0.07, -0.06));
  g.add(vmBox(dark, 0.05, 0.2, 0.07, 0, -0.12, -0.04, 0.08));
  g.add(vmBox(steel, 0.055, 0.02, 0.075, 0, -0.22, -0.03, 0.08));
  g.add(vmTube(mid, 0.028, 0.2, 0, 0.03, -0.32));
  g.add(vmTube(steel, 0.03, 0.02, 0, 0.03, -0.4));
  g.add(vmBox(dark, 0.05, 0.08, 0.14, 0, 0.02, 0.16));
  g.add(vmBox(dark, 0.05, 0.1, 0.06, 0, -0.09, -0.2));
  g.add(vmBox(steel, 0.02, 0.03, 0.02, 0, 0.11, -0.02));
  g.add(vmBox(steel, 0.015, 0.03, 0.015, 0, 0.11, -0.2));
  g.add(vmBox(steel, 0.03, 0.02, 0.03, 0.06, 0.05, -0.1));
  gripHand(g, 0.02, -0.09, 0.1, 1);
  gripHand(g, -0.02, -0.06, -0.2, -1);
  groups.smg = base(g); muzzle.smg = -0.48;
  g = new THREE.Group(); // M590 shotgun: barrel + tube mag + wood pump.
  g.add(vmBox(dark, 0.09, 0.12, 0.32, 0, 0.02, -0.04));
  g.add(vmTube(mid, 0.03, 0.36, 0, 0.05, -0.34));
  g.add(vmTube(mid, 0.022, 0.3, 0, -0.03, -0.3));
  g.add(vmBox(wood, 0.08, 0.09, 0.16, 0, -0.03, -0.28));
  g.add(vmBox(dark, 0.085, 0.02, 0.03, 0, -0.03, -0.24));
  g.add(vmBox(dark, 0.085, 0.02, 0.03, 0, -0.03, -0.32));
  g.add(vmBox(wood, 0.07, 0.11, 0.18, 0, -0.01, 0.18, -0.1));
  g.add(vmBox(dark, 0.05, 0.03, 0.07, 0, -0.05, -0.1));
  g.add(vmBox(steel, 0.015, 0.04, 0.015, 0, -0.05, -0.1));
  g.add(vmBox(steel, 0.015, 0.02, 0.015, 0, 0.09, -0.5));
  gripHand(g, 0.02, -0.09, 0.12, 1);
  gripHand(g, -0.02, -0.03, -0.28, -1);
  groups.shotgun = base(g); muzzle.shotgun = -0.56;
  g = new THREE.Group(); // AR-77 rifle: two receivers + railed handguard.
  g.add(vmBox(dark, 0.09, 0.09, 0.2, 0, -0.01, 0.0));
  g.add(vmBox(mid, 0.08, 0.07, 0.3, 0, 0.06, -0.08));
  g.add(vmBox(mid, 0.08, 0.09, 0.22, 0, 0.03, -0.32));
  g.add(vmBox(steel, 0.06, 0.015, 0.05, 0, 0.085, -0.24));
  g.add(vmBox(steel, 0.06, 0.015, 0.05, 0, 0.085, -0.32));
  g.add(vmBox(steel, 0.06, 0.015, 0.05, 0, 0.085, -0.4));
  g.add(vmTube(mid, 0.018, 0.18, 0, 0.04, -0.5));
  g.add(vmBox(steel, 0.04, 0.04, 0.06, 0, 0.04, -0.57));
  g.add(vmBox(dark, 0.06, 0.2, 0.09, 0, -0.11, -0.06, 0.15));
  g.add(vmBox(steel, 0.065, 0.02, 0.095, 0, -0.21, -0.04, 0.15));
  g.add(vmBox(dark, 0.07, 0.1, 0.16, 0, 0.02, 0.18));
  g.add(vmBox(dark, 0.075, 0.04, 0.05, 0, 0.02, 0.26));
  g.add(vmBox(dark, 0.06, 0.12, 0.07, 0, -0.09, 0.06, 0.3));
  g.add(vmBox(steel, 0.02, 0.05, 0.02, 0, 0.1, -0.42));
  g.add(vmBox(steel, 0.02, 0.04, 0.02, 0, 0.11, -0.18));
  g.add(vmBox(steel, 0.03, 0.02, 0.03, 0.06, 0.05, -0.1));
  gripHand(g, 0.02, -0.08, 0.06, 1);
  gripHand(g, -0.02, -0.03, -0.32, -1);
  groups.rifle = base(g); muzzle.rifle = -0.58;
  g = new THREE.Group(); // MG-60 LMG: big receiver + drum + bipod.
  g.add(vmBox(dark, 0.11, 0.14, 0.44, 0, 0.02, -0.06));
  g.add(vmBox(mid, 0.09, 0.05, 0.4, 0, 0.1, -0.06));
  g.add(vmTube(mid, 0.1, 0.07, 0, -0.1, -0.02, Math.PI / 2));
  g.add(vmTube(mid, 0.025, 0.38, 0, 0.04, -0.44));
  g.add(vmTube(dark, 0.035, 0.2, 0, 0.04, -0.36));
  g.add(vmTube(dark, 0.012, 0.2, -0.05, -0.08, -0.42));
  g.add(vmTube(dark, 0.012, 0.2, 0.05, -0.08, -0.42));
  g.add(vmBox(dark, 0.07, 0.1, 0.16, 0, 0.02, 0.2));
  g.add(vmBox(mid, 0.08, 0.04, 0.2, 0, 0.11, -0.06));
  g.add(vmBox(dark, 0.06, 0.12, 0.07, 0, -0.09, 0.1, 0.3));
  gripHand(g, 0.02, -0.08, 0.1, 1);
  gripHand(g, -0.02, -0.03, -0.3, -1);
  groups.lmg = base(g); muzzle.lmg = -0.68;
  g = new THREE.Group(); // LR-50 sniper: long barrel + big scope + bolt.
  g.add(vmBox(dark, 0.08, 0.11, 0.42, 0, 0.02, -0.04));
  g.add(vmTube(mid, 0.016, 0.42, 0, 0.03, -0.48));
  g.add(vmBox(steel, 0.035, 0.035, 0.05, 0, 0.03, -0.68));
  g.add(vmTube(mid, 0.035, 0.24, 0, 0.11, -0.06));
  g.add(vmTube(mid, 0.045, 0.06, 0, 0.11, -0.2));
  g.add(vmBox(dark, 0.03, 0.04, 0.04, 0, 0.07, -0.02));
  g.add(vmBox(dark, 0.03, 0.04, 0.04, 0, 0.07, -0.12));
  g.add(vmBox(steel, 0.05, 0.02, 0.02, 0.06, 0.05, 0.0));
  g.add(vmBox(steel, 0.03, 0.03, 0.03, 0.08, 0.05, 0.0));
  g.add(vmBox(wood, 0.07, 0.1, 0.18, 0, 0, 0.2));
  g.add(vmBox(wood, 0.06, 0.04, 0.12, 0, 0.06, 0.2));
  g.add(vmBox(dark, 0.05, 0.12, 0.07, 0, -0.09, -0.08, 0.1));
  g.add(vmTube(dark, 0.01, 0.18, -0.04, -0.06, -0.44));
  g.add(vmTube(dark, 0.01, 0.18, 0.04, -0.06, -0.44));
  gripHand(g, 0.02, -0.08, 0.1, 1);
  gripHand(g, -0.02, -0.03, -0.32, -1);
  groups.sniper = base(g); muzzle.sniper = -0.74;
  for (const k of Object.keys(groups)) groups[k].visible = k === 'pistol';
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.15, -0.85);
  camera.add(flash);
  const flashLight = new THREE.PointLight(0xffc861, 0, 6);
  flashLight.position.set(0.24, -0.15, -0.85);
  camera.add(flashLight);
  // Hands map: per weapon, the two glove palms (R = +x, L = -x) and the left
  // palm's base position, so the reload animation can move it and return it.
  const hands = {};
  for (const k of Object.keys(groups)) {
    const ps = groups[k].children.filter((c) => c.material === glove);
    hands[k] = { R: ps.find((c) => c.position.x > 0), L: ps.find((c) => c.position.x < 0) };
    hands[k].L0 = hands[k].L.position.clone();
  }
  return { groups, group: groups.pistol, muzzle, flash, flashLight, kick: 0, bobT: 0, hands, switchT: 0, reach: 0 };
}

// Show one weapon's view model; move the flash to its muzzle. No allocation, only .visible toggles.
export function setViewWeapon(G, key) {
  const vm = G.viewModel;
  if (!vm || !vm.groups[key]) return;
  for (const k of Object.keys(vm.groups)) vm.groups[k].visible = k === key;
  vm.group = vm.groups[key];
  vm.group.position.set(0.24, -0.18, -0.45);
  vm.switchT = 1; // dip the viewmodel down and raise it again (weapon switch)
  vm.flash.position.set(0.24, -0.15, -0.45 + vm.muzzle[key] - 0.08);
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
  // Recoil per shot is unchanged (same kick magnitude as v5); it now lands in
  // the recoverable recoil offset instead of permanently displacing the aim.
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
  // Weapon switch: the whole viewmodel dips down and tilts, then raises (~0.45 s).
  vm.switchT = Math.max(0, (vm.switchT ?? 0) - dt * 2.2);
  const swp = 1 - vm.switchT;
  const dip = Math.sin(Math.PI * swp) * 0.07;
  // Plant/defuse: the hands reach forward toward the bomb (smooth ramp).
  const planting = G.bomb.plantProgress > 0 || G.bomb.defuseProgress > 0;
  vm.reach = (vm.reach ?? 0) + ((planting ? 1 : 0) - (vm.reach ?? 0)) * Math.min(1, dt * 6);
  vm.group.position.set(
    0.24 + Math.sin(vm.bobT) * bob,
    -0.18 + Math.abs(Math.cos(vm.bobT)) * bob + vm.kick * 0.03 - dip,
    -0.45 + vm.kick * 0.09 - vm.reach * 0.06,
  );
  vm.group.rotation.x = vm.kick * 0.12 + Math.sin(Math.PI * swp) * 0.12 - vm.reach * 0.08;
  vm.flash.material.opacity = Math.max(0, vm.flash.material.opacity - dt * 18);
  vm.flashLight.intensity = Math.max(0, vm.flashLight.intensity - dt * 90);
  // Reload: the left hand leaves the forend, drops to the magazine, and returns
  // (sin envelope over the reload). The right hand stays on the grip. The hand
  // snaps back to its base position when the reload ends or is cancelled.
  const h = vm.hands && vm.hands[p.cur];
  if (h) {
    const st = p.weapons[p.cur];
    const w = CFG.weapons[p.cur];
    const rp = st && st.reloading > 0 ? 1 - st.reloading / w.reload : 0;
    const e = Math.sin(Math.PI * rp);
    h.L.position.set(
      h.L0.x + (0 - h.L0.x) * e,
      h.L0.y + (-0.13 - h.L0.y) * e,
      h.L0.z + (-0.08 - h.L0.z) * e,
    );
  }
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
