// player.js — the human agent: WASD movement with acceleration, crouch,
// jump, aim (right mouse narrows FOV and steadies the shot), health/armor.
// Movement resolves against the world's colliders; the camera follows the
// eyes. Bots reuse the same collision through world.resolveMove.
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
  };
}

// Give the player a weapon's ammo state (called on spawn / on buy).
export function giveWeapon(p, key) {
  const w = CFG.weapons[key];
  p.weapons[key] = { mag: w.mag, reserve: w.reserve, reloading: 0 };
}

export function stepPlayer(G, dt) {
  const p = G.player;
  const inp = G.input;
  if (!p.alive || G.round.state === 'post') return;
  const c = CFG.player;
  // Freeze time: no movement (CS freeze), but the player can still look
  // around and use the buy menu.
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
  // Eye height eases between stand and crouch.
  const targetEye = p.crouching ? c.eyeCrouch : c.eyeStand;
  p.eyeH += (targetEye - p.eyeH) * Math.min(1, dt * 12);
  // Camera follows the eyes; FOV eases when aiming.
  const cam = G.camera;
  cam.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
  cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
  const targetFov = p.aiming ? 45 : 70;
  if (Math.abs(cam.fov - targetFov) > 0.1) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();
  }
  p.fov = cam.fov;
}
