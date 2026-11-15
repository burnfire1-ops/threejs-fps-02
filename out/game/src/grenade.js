// grenade.js — HE and smoke. Thrown with G (HE first, else smoke).
// HE bursts after a short fuse and hurts through falloff, never through a
// wall. Smoke blooms where it lands and blocks bot vision for 14 seconds.
// Both are plain meshes + a timer: no assets, no network.
import * as THREE from 'three';
import { CFG } from './config.js';
import { damageAgent } from './combat.js';
import { playExplode, playSmoke } from './audio.js';
import { losBlocked } from './world.js';

const _b = new THREE.Box3();
const _c = new THREE.Vector3();

export function throwGrenade(G, a, type) {
  if (!a.alive || a.grenades[type] <= 0) return false;
  a.grenades[type]--;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(a.pitch, a.yaw, 0, 'YXZ'));
  const g = {
    type,
    pos: a.pos.clone().add(new THREE.Vector3(0, a.eyeH ?? 1.4, 0)).addScaledVector(dir, 0.6),
    vel: dir.clone().multiplyScalar(CFG.grenade.throwSpeed).add(new THREE.Vector3(0, 3.5, 0)),
    fuse: type === 'he' ? 1.4 : 99,
    bounced: false,
    mesh: new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: type === 'he' ? 0x3a4048 : 0xcfd6da, roughness: 0.5 }),
    ),
  };
  g.mesh.position.copy(g.pos);
  G.scene.add(g.mesh);
  G.grenades.push(g);
  return true;
}

function explode(G, g) {
  const r = CFG.grenade.heRadius;
  for (const a of G.agents) {
    if (!a.alive) continue;
    const d = a.pos.distanceTo(g.pos);
    if (d > r) continue;
    _c.set(a.pos.x, a.pos.y + 1.1, a.pos.z);
    if (losBlocked(g.pos, _c, G.world.solids)) continue;
    const dmg = CFG.grenade.heDamage * (1 - d / r);
    damageAgent(G, a, Math.max(8, dmg), 'torso', null);
  }
  // Flash visual: an expanding sphere that fades in the main loop.
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85 }),
  );
  flash.position.copy(g.pos);
  G.scene.add(flash);
  G.flashes.push({ mesh: flash, t: 0.35, max: r });
  playExplode(G, g.pos);
  G.scene.remove(g.mesh);
}

function bloomSmoke(G, g) {
  const s = {
    pos: g.pos.clone(), r: CFG.grenade.smokeRadius, t: CFG.grenade.smokeTime,
    mesh: new THREE.Mesh(
      new THREE.SphereGeometry(CFG.grenade.smokeRadius, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xcfd6da, transparent: true, opacity: 0.32, depthWrite: false }),
    ),
  };
  s.mesh.position.copy(g.pos);
  G.scene.add(s.mesh);
  G.smokes.push(s);
  playSmoke(G, g.pos);
  G.scene.remove(g.mesh);
}

export function stepGrenades(G, dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.vel.y -= 18 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // Cheap bounce: if the point is inside a collider, step back and dampen.
    _b.min.set(g.pos.x - 0.09, g.pos.y - 0.09, g.pos.z - 0.09);
    _b.max.set(g.pos.x + 0.09, g.pos.y + 0.09, g.pos.z + 0.09);
    let hitWall = false;
    for (const c of G.world.colliders) {
      if (_b.intersectsBox(c)) { hitWall = true; break; }
    }
    if (g.pos.y < 0.09) { g.pos.y = 0.09; hitWall = true; g.vel.y = Math.abs(g.vel.y) * 0.35; }
    if (hitWall) {
      g.pos.addScaledVector(g.vel, -dt);
      g.vel.multiplyScalar(0.45);
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      if (g.type === 'he') g.fuse = Math.min(g.fuse, 0.35);
      else { bloomSmoke(G, g); G.grenades.splice(i, 1); continue; }
    }
    g.mesh.position.copy(g.pos);
    g.fuse -= dt;
    if (g.fuse <= 0) {
      if (g.type === 'he') explode(G, g);
      else bloomSmoke(G, g);
      G.grenades.splice(i, 1);
    }
  }
  for (let i = G.smokes.length - 1; i >= 0; i--) {
    const s = G.smokes[i];
    s.t -= dt;
    s.mesh.material.opacity = 0.32 * Math.min(1, s.t / 2);
    if (s.t <= 0) { G.scene.remove(s.mesh); G.smokes.splice(i, 1); }
  }
  for (let i = G.flashes.length - 1; i >= 0; i--) {
    const f = G.flashes[i];
    f.t -= dt;
    const k = 1 - f.t / 0.35;
    f.mesh.scale.setScalar(1 + k * f.max * 2);
    f.mesh.material.opacity = 0.85 * (f.t / 0.35);
    if (f.t <= 0) { G.scene.remove(f.mesh); G.flashes.splice(i, 1); }
  }
}

// Does the segment a->b cross any live smoke cloud? Bots treat that as blind.
export function smokeBlocks(a, b, smokes) {
  for (const s of smokes) {
    // Segment-sphere test via closest point on the segment to the centre.
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((s.pos.x - a.x) * abx + (s.pos.y - a.y) * aby + (s.pos.z - a.z) * abz) / len2)) : 0;
    const dx = a.x + abx * t - s.pos.x, dy = a.y + aby * t - s.pos.y, dz = a.z + abz * t - s.pos.z;
    if (dx * dx + dy * dy + dz * dz < s.r * s.r) return true;
  }
  return false;
}
