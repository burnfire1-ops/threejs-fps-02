// player.js — the human agent: WASD movement with acceleration, crouch, jump, aim (right mouse narrows FOV and steadies the shot), health/armor.
// Movement resolves against the world's colliders; the camera follows the eyes. Bots reuse the same collision through world.resolveMove.
import * as THREE from 'three';
import { CFG } from './config.js';
import { resolveMove } from './world.js';

export function createPlayer(world, team = 'atk') {
  const spawn = world.spawns[team][2];
  return {
    id: 0, team, isPlayer: true, name: 'You',
    pos: spawn.clone(), vel: new THREE.Vector3(),
    yaw: team === 'atk' ? 0 : Math.PI, pitch: 0, // atk faces north (-z), def faces south
    hp: CFG.player.hp, armor: 0, alive: true, kills: 0, deaths: 0,
    money: CFG.economy.start, kit: false,
    grenades: { he: 0, smoke: 0 },
    weapons: {}, cur: 'pistol',
    crouching: false, aiming: false, onGround: true,
    eyeH: CFG.player.eyeStand, fov: 70,
    // Recoil recovery: the kick from each shot accumulates in recoilPitch/recoilYaw
    // instead of permanently moving the aim, and decays back toward zero shortly after the last shot.
    recoilPitch: 0, recoilYaw: 0, lastShotT: -99,
  };
}

// Player hitbox: the shared hitscan raycasts G.shootables, and the player
// was never in it — only bot body/head meshes were, so bot rays passed straight
// through the player and hit nothing. The hitbox is invisible (colorWrite /
// depthWrite off, so it draws nothing but still raycasts) and follows the
// player, shrinking when crouched.
export function createPlayerHitbox(G, p) {
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.32), mat);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mat);
  head.position.y = 1.6;
  body.userData = { agent: p, part: 'torso' };
  head.userData = { agent: p, part: 'head' };
  g.add(body, head);
  g.position.copy(p.pos);
  G.scene.add(g);
  G.shootables.push(body, head);
  p.hitbox = g;
  return g;
}

// Give the player a weapon's ammo state (called on spawn / on buy).
export function giveWeapon(p, key) {
  const w = CFG.weapons[key];
  p.weapons[key] = { mag: w.mag, reserve: w.reserve, reloading: 0, cooldown: 0 };
}

export function stepPlayer(G, dt) {
  const p = G.player;
  const inp = G.input;
  if (!p.alive) {
    // Spectator camera: follow a living teammate instead of freezing at the death spot.
    // When the watched bot dies, move to the next living teammate; if none is alive,
    // the camera stays put. Presentation only: the sim, death rules and round flow are untouched.
    let t = G.spectate;
    if (!t || !t.alive || t.team !== p.team) {
      t = G.bots.find((b) => b.team === p.team && b.alive) ?? null;
      G.spectate = t;
    }
    if (t) {
      const cam = G.camera;
      cam.position.set(t.pos.x, t.pos.y + t.eyeH, t.pos.z);
      cam.rotation.set(0, t.yaw, 0, 'YXZ');
    }
    return;
  }
  if (G.round.state === 'post') return;
  const c = CFG.player;
  // Freeze time: no movement (CS freeze), but the player can still look around and use the buy menu.
  const frozen = G.round.state === 'freeze';
  // Crouch + aim from input.
  p.crouching = inp.keys.has('ControlLeft') || inp.keys.has('KeyC');
  p.aiming = inp.mouseRight;
  const speed = (p.crouching ? c.crouch : c.walk) * (p.aiming ? 0.7 : 1)
    * (CFG.weapons[p.cur]?.moveSpeed ?? c.walk) / c.walk;
  // Wish direction from keys, relative to yaw.
  const f = frozen ? 0 : (inp.keys.has('KeyW') ? 1 : 0) - (inp.keys.has('KeyS') ? 1 : 0);
  const s = frozen ? 0 : (inp.keys.has('KeyD') ? 1 : 0) - (inp.keys.has('KeyA') ? 1 : 0);
  const sin = Math.sin(p.yaw); const cos = Math.cos(p.yaw);
  let wx = -sin * f + cos * s;
  let wz = -cos * f - sin * s;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  p.vel.x += wx * c.accel * dt;
  p.vel.z += wz * c.accel * dt;
  // Friction when no input, then clamp horizontal speed.
  const fr = wl > 0 ? 1 : Math.max(0, 1 - c.friction * dt);
  p.vel.x *= fr; p.vel.z *= fr;
  const hs = Math.hypot(p.vel.x, p.vel.z);
  if (hs > speed) { p.vel.x *= speed / hs; p.vel.z *= speed / hs; }
  // Gravity + jump.
  p.vel.y -= c.gravity * dt;
  if (!frozen && inp.keys.has('Space') && p.onGround && p.pos.y <= 0.01) {
    p.vel.y = c.jump;
    p.onGround = false;
  }
  const wasY = p.pos.y;
  resolveMove(p.pos, c.radius, p.crouching ? 1.1 : 1.7, p.vel, dt, G.world.colliders);
  p.onGround = p.pos.y <= 0.001 && wasY >= p.pos.y;
  // Mouse look.
  p.yaw -= inp.mouseDX * 0.0022;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - inp.mouseDY * 0.0022));
  inp.mouseDX = 0; inp.mouseDY = 0;
  // Recoil recovery: once firing stops for a beat, the accumulated kick decays back toward
  // the pre-shot aim. During a spray the delay never elapses, so recoil still climbs; only the permanent offset is gone.
  if (G.time - p.lastShotT > 0.12) {
    const rec = Math.exp(-dt * 4);
    p.recoilPitch *= rec;
    p.recoilYaw *= rec;
    if (Math.abs(p.recoilPitch) < 0.0002) p.recoilPitch = 0;
    if (Math.abs(p.recoilYaw) < 0.0002) p.recoilYaw = 0;
  }
  // Eye height eases between stand and crouch.
  const targetEye = p.crouching ? c.eyeCrouch : c.eyeStand;
  p.eyeH += (targetEye - p.eyeH) * Math.min(1, dt * 12);
  // Camera follows the eyes; FOV eases when aiming. The recoil offset rides on top of the mouse aim and recovers with it.
  const cam = G.camera;
  cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
  cam.rotation.set(
    Math.max(-1.5, Math.min(1.5, p.pitch + p.recoilPitch)),
    p.yaw + p.recoilYaw, 0, 'YXZ');
  // The invisible hitbox follows the player and shrinks when crouched, so bot hitscan
  // (and the player's own shots, which skip the shooter) see the same body the bots do.
  if (p.hitbox) {
    p.hitbox.position.copy(p.pos);
    p.hitbox.scale.set(1, p.eyeH / c.eyeStand, 1);
  }
  const targetFov = p.aiming ? 45 : 70;
  if (Math.abs(cam.fov - targetFov) > 0.1) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();
  }
  p.fov = cam.fov;
}
