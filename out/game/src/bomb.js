// bomb.js — the objective. Attackers carry the charge, hold E for 3 s
// inside a site to plant it; the 40 s fuse beeps faster as it runs out and
// the blast wins the round. Defenders hold E for 5 s (2.5 s with a kit) to
// defuse. A dead carrier drops the charge; any attacker can pick it up.
import * as THREE from 'three';
import { CFG } from './config.js';
import { playBeep, playExplode, playPlant, playDefuse } from './audio.js';

export function createBomb(G) {
  const mesh = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }),
  );
  light.position.set(0, 0.14, 0);
  mesh.add(box, light);
  mesh.visible = false;
  G.scene.add(mesh);
  return {
    state: 'carried', carrier: G.player, dropped: null,
    site: null, pos: new THREE.Vector3(), fuse: 0,
    plantProgress: 0, defuseProgress: 0, beepT: 0,
    mesh, light,
  };
}

export function plantBomb(G, agent, site) {
  const b = G.bomb;
  if (b.state === 'planted') return;
  b.state = 'planted';
  b.site = site;
  b.carrier = null;
  b.dropped = null;
  b.pos.copy(agent.pos);
  b.pos.y = 0.1;
  b.fuse = CFG.bomb.fuse;
  b.beepT = 0;
  b.mesh.position.copy(b.pos);
  b.mesh.visible = true;
  b.plantProgress = 0;
  playPlant(G);
  G.radio.unshift({ text: `Charge planted at ${site}`, t: 6, team: 'atk' });
  if (G.radio.length > 4) G.radio.pop();
}

export function defuseBomb(G, agent) {
  const b = G.bomb;
  if (b.state !== 'planted') return;
  b.state = 'gone';
  b.mesh.visible = false;
  b.defuseProgress = 0;
  playDefuse(G);
  if (G.endRound) G.endRound('def', 'defuse');
}

function detonate(G) {
  const b = G.bomb;
  b.state = 'gone';
  b.mesh.visible = false;
  playExplode(G, b.pos);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }),
  );
  flash.position.copy(b.pos);
  G.scene.add(flash);
  G.flashes.push({ mesh: flash, t: 0.5, max: 8 });
  if (G.endRound) G.endRound('atk', 'detonation');
}

export function stepBomb(G, dt) {
  const b = G.bomb;
  // Player picks up a dropped charge by walking over it.
  if (b.state === 'dropped' && b.dropped && G.player.alive && G.player.team === 'atk') {
    if (G.player.pos.distanceTo(b.dropped) < 1.2) {
      b.state = 'carried';
      b.carrier = G.player;
      b.dropped = null;
      G.radio.unshift({ text: 'You picked up the charge', t: 4, team: 'atk' });
    }
  }
  if (b.state === 'dropped' && b.dropped) {
    b.mesh.position.copy(b.dropped);
    b.mesh.visible = true;
  }
  if (b.state !== 'planted') return;
  b.fuse -= dt;
  // Beeps accelerate: every 1 s early, every 0.25 s in the last 10 s.
  b.beepT -= dt;
  if (b.beepT <= 0) {
    b.beepT = b.fuse > 10 ? 1 : 0.25;
    playBeep(G, b.fuse);
  }
  b.light.material.color.setHex(Math.sin(G.time * (b.fuse > 10 ? 6 : 18)) > 0 ? 0xff4444 : 0x551111);
  if (b.fuse <= 0) detonate(G);
}

// Player holding E: plant (attacker, carrying, inside a site) or defuse
// (defender, bomb planted, close to it). Called every fixed step.
export function stepPlayerInteract(G, dt) {
  const b = G.bomb;
  const p = G.player;
  const holding = G.input.keys.has('KeyE');
  if (!p.alive || !holding || G.round.state !== 'live') {
    b.plantProgress = Math.max(0, b.plantProgress - dt * 2);
    b.defuseProgress = Math.max(0, b.defuseProgress - dt * 2);
    return;
  }
  if (p.team === 'atk' && b.carrier === p && b.state === 'carried') {
    const site = Object.entries(G.world.sites).find(([, s]) =>
      Math.abs(p.pos.x - s.center.x) < s.size / 2 && Math.abs(p.pos.z - s.center.z) < s.size / 2);
    if (site) {
      b.plantProgress += dt;
      if (b.plantProgress >= CFG.bomb.plantTime) plantBomb(G, p, site[0]);
      return;
    }
  }
  if (p.team === 'def' && b.state === 'planted') {
    if (p.pos.distanceTo(b.pos) < 1.8) {
      b.defuseProgress += dt;
      const need = p.kit ? CFG.bomb.defuseKitTime : CFG.bomb.defuseTime;
      if (b.defuseProgress >= need) defuseBomb(G, p);
    }
  }
}
