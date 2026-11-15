// bots.js — nine bots (4 Ember teammates, 5 Ash enemies). States: route
// (follow the nav graph to a site), hold (watch a corner), engage (aim with
// error and a human reaction time, fire in bursts), react (a sound or a lost
// target pulls them over), plant / defuse (the objective). Bots buy better
// guns as rounds pass, call out what they see on the radio, and never
// aimbot: every shot is a probability roll, worse on the move and at range.
import * as THREE from 'three';
import { CFG } from './config.js';
import { giveWeapon } from './player.js';
import { damageAgent } from './combat.js';
import { playShot } from './audio.js';
import { losBlocked, resolveMove } from './world.js';
import { nearestNode, findPath, nodePos, SITE_NODE, SPAWN_NODE, HOLD_NODES } from './nav.js';
import { smokeBlocks } from './grenade.js';

const _eye = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function makeMesh(team) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0x8a6f3c : 0x2e6f6a, roughness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0xc9a24d : 0x4d9a92, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.32), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), headMat);
  head.position.y = 1.6;
  head.castShadow = true;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5 }));
  gun.position.set(0.2, 1.25, -0.3);
  g.add(body, head, gun);
  return { group: g, body, head };
}

export function createBots(G) {
  const bots = [];
  let id = 1;
  for (const team of ['atk', 'def']) {
    const names = CFG.botNames[team];
    for (let i = 0; i < names.length; i++) {
      const { group, body, head } = makeMesh(team);
      const b = {
        id: id++, team, isPlayer: false, name: names[i],
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        yaw: 0, pitch: 0, hp: CFG.player.hp, armor: 0, alive: true, kills: 0, deaths: 0,
        money: 0, kit: false, grenades: { he: 0, smoke: 0 },
        weapons: {}, cur: 'pistol', bloom: 0,
        mesh: group, state: 'route', path: [], pathI: 0,
        destNode: SPAWN_NODE[team], holdT: 0, thinkT: Math.random() * 0.15,
        target: null, reactT: 0, burstLeft: 0, burstPause: 0, cool: 0,
        lastSeen: null, lastSeenT: 0, heardPos: null, heardT: 0,
        plantT: 0, defuseT: 0, radioCd: 0, strafe: 1, strafeT: 0,
        site: team === 'atk' ? (i % 2 === 0 ? 'A' : 'B') : null,
        eyeH: 1.55,
      };
      body.userData = { agent: b, part: 'torso' };
      head.userData = { agent: b, part: 'head' };
      G.shootables.push(body, head);
      G.scene.add(group);
      bots.push(b);
    }
  }
  return bots;
}

// Round-start kit: spawn positions, guns by round number, fresh state.
export function resetBotsForRound(G) {
  const r = G.round.num;
  for (const b of G.bots) {
    const spawn = G.world.spawns[b.team][(b.id - 1) % 5];
    b.pos.copy(spawn);
    b.vel.set(0, 0, 0);
    b.hp = CFG.player.hp;
    b.armor = r >= 2 ? 100 : 0;
    b.alive = true;
    b.mesh.visible = true;
    b.weapons = {};
    const gun = r === 1 ? 'pistol' : r === 2 ? (b.id % 2 ? 'smg' : 'rifle')
      : r === 3 ? (b.id % 3 === 0 ? 'sniper' : 'rifle') : (b.id % 4 === 0 ? 'lmg' : 'rifle');
    giveWeapon(b, 'pistol');
    giveWeapon(b, gun);
    b.cur = gun;
    b.grenades = { he: r >= 2 ? 1 : 0, smoke: r >= 2 && b.team === 'atk' ? 1 : 0 };
    b.kit = b.team === 'def' && r >= 2;
    b.state = 'route';
    b.target = null;
    b.plantT = 0; b.defuseT = 0; b.burstLeft = 0; b.cool = 0;
    b.destNode = b.team === 'atk' ? SITE_NODE[b.site] : HOLD_NODES[(b.id * 2) % HOLD_NODES.length];
    b.path = findPath(nearestNode(b.pos.x, b.pos.z), b.destNode);
    b.pathI = 0;
    b.mesh.position.copy(b.pos);
    b.yaw = b.team === 'atk' ? 0 : Math.PI;
  }
}

function canSee(G, b, e) {
  _eye.set(b.pos.x, b.pos.y + 1.55, b.pos.z);
  _chest.set(e.pos.x, e.pos.y + 1.1, e.pos.z);
  const d = _eye.distanceTo(_chest);
  if (d > CFG.bot.seeDist) return false;
  const dx = _chest.x - _eye.x, dz = _chest.z - _eye.z;
  const ang = Math.atan2(-dx, -dz) - b.yaw;
  const norm = Math.atan2(Math.sin(ang), Math.cos(ang));
  if (Math.abs(norm) > CFG.bot.fov / 2) return false;
  if (losBlocked(_eye, _chest, G.world.solids)) return false;
  if (smokeBlocks(_eye, _chest, G.smokes)) return false;
  return true;
}

function radio(G, b, text) {
  if (b.radioCd > 0) return;
  b.radioCd = 6 + G.rng() * 4;
  G.radio.unshift({ text: `${b.name}: ${text}`, t: 6, team: b.team });
  if (G.radio.length > 4) G.radio.pop();
}

function botShoot(G, b, dt) {
  const t = b.target;
  if (!t || !t.alive) return;
  b.cool -= dt;
  if (b.cool > 0) return;
  if (b.burstLeft <= 0) {
    b.burstPause -= dt;
    if (b.burstPause > 0) return;
    b.burstLeft = CFG.bot.burstMin + Math.floor(G.rng() * (CFG.bot.burstMax - CFG.bot.burstMin + 1));
    b.burstPause = CFG.bot.burstPauseMin + G.rng() * (CFG.bot.burstPauseMax - CFG.bot.burstPauseMin);
  }
  const w = CFG.weapons[b.cur];
  b.cool = w.gap * 1.6;
  b.burstLeft--;
  const st = b.weapons[b.cur];
  if (!st || st.mag <= 0) { // reload instead of shooting blanks
    st.reloading = w.reload;
    return;
  }
  st.mag--;
  // Hit roll: close and still is deadly, far and moving is not.
  const d = b.pos.distanceTo(t.pos);
  let p = 0.55 - (d / CFG.bot.seeDist) * 0.4;
  const tSpeed = Math.hypot(t.vel.x, t.vel.z);
  if (tSpeed > 3) p -= 0.1;
  if (t.crouching) p -= 0.05;
  if (Math.hypot(b.vel.x, b.vel.z) > 1) p -= 0.15;
  p = Math.max(0.05, Math.min(0.8, p));
  // The shot is heard: a ping on the enemy team's minimap.
  G.pings.push({ x: b.pos.x, z: b.pos.z, t: G.time });
  if (G.noise) G.noise(b.pos, CFG.bot.hearR);
  playShot(G, b.cur, b.pos);
  if (G.rng() < p) {
    const head = G.rng() < 0.12;
    damageAgent(G, t, w.dmg * (head ? w.headMul : 1), head ? 'head' : 'torso', b);
  }
}

function moveToward(G, b, tx, tz, dt, speed) {
  const dx = tx - b.pos.x, dz = tz - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) { b.vel.set(0, 0, 0); return true; }
  b.vel.set((dx / d) * speed, 0, (dz / d) * speed);
  const targetYaw = Math.atan2(-dx, -dz);
  let dy = targetYaw - b.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  b.yaw += dy * Math.min(1, dt * 8);
  return d < 0.7;
}

export function stepBots(G, dt) {
  for (const b of G.bots) {
    if (!b.alive) continue;
    b.radioCd -= dt;
    b.thinkT -= dt;
    // --- perception, staggered (only live rounds: no fighting in freeze) ---
    if (b.thinkT <= 0 && G.round.state === 'live') {
      b.thinkT = CFG.bot.thinkEvery;
      let best = null; let bd = Infinity;
      for (const e of G.agents) {
        if (e === b || e.team === b.team || !e.alive) continue;
        if (canSee(G, b, e)) {
          const d = b.pos.distanceTo(e.pos);
          if (d < bd) { bd = d; best = e; }
        }
      }
      if (best) {
        if (b.target !== best) radio(G, b, `Contact ${best.isPlayer ? 'player' : best.name} — ${b.site ?? 'mid'}`);
        b.target = best;
        b.lastSeen = best.pos.clone();
        b.lastSeenT = 0;
        b.reactT = CFG.bot.reactionMin + G.rng() * (CFG.bot.reactionMax - CFG.bot.reactionMin);
        b.state = 'engage';
      } else if (b.target) {
        b.lastSeenT += CFG.bot.thinkEvery;
        if (b.lastSeenT > 1.5) { b.target = null; b.state = 'react'; }
      }
    }
    // --- bomb logic overrides movement ---
    const bomb = G.bomb;
    if (b.team === 'atk' && bomb.planted && bomb.state === 'planted') {
      // Attackers guard the planted bomb.
      if (b.state !== 'engage') { b.state = 'hold'; b.destNode = bomb.site === 'A' ? SITE_NODE.A : SITE_NODE.B; }
    } else if (b.team === 'def' && bomb.planted && bomb.state === 'planted') {
      const siteNode = bomb.site === 'A' ? SITE_NODE.A : SITE_NODE.B;
      const d = Math.hypot(b.pos.x - bomb.pos.x, b.pos.z - bomb.pos.z);
      if (d < 1.6 && b.state !== 'engage') {
        b.state = 'defuse';
      } else if (b.state !== 'engage' && b.state !== 'defuse') {
        b.state = 'route';
        b.destNode = siteNode;
        if (b.pathI >= b.path.length) b.path = findPath(nearestNode(b.pos.x, b.pos.z), siteNode);
      }
    } else if (b.team === 'atk' && bomb.carrier === b && bomb.state === 'carried') {
      if (b.state !== 'engage' && b.state !== 'plant') {
        b.state = 'route';
        b.destNode = SITE_NODE[b.site];
        if (b.pathI >= b.path.length) b.path = findPath(nearestNode(b.pos.x, b.pos.z), SITE_NODE[b.site]);
      }
      const site = G.world.sites[b.site];
      if (Math.abs(b.pos.x - site.center.x) < site.size / 2 && Math.abs(b.pos.z - site.center.z) < site.size / 2) {
        b.state = 'plant';
        radio(G, b, `Planting at ${b.site}`);
      }
    } else if (b.team === 'atk' && !bomb.carrier && bomb.dropped && bomb.state === 'dropped') {
      if (b.state !== 'engage') {
        b.state = 'route';
        b.destNode = nearestNode(bomb.dropped.x, bomb.dropped.z);
        if (b.pathI >= b.path.length) b.path = findPath(nearestNode(b.pos.x, b.pos.z), b.destNode);
        if (b.pos.distanceTo(bomb.dropped) < 1.2) {
          bomb.carrier = b; bomb.dropped = null; bomb.state = 'carried';
          radio(G, b, 'Picked up the charge');
        }
      }
    }
    // --- state behaviour ---
    if (b.state === 'engage' && b.target && b.target.alive) {
      const t = b.target;
      _tmp.set(t.pos.x - b.pos.x, 0, t.pos.z - b.pos.z);
      const targetYaw = Math.atan2(-_tmp.x, -_tmp.z);
      let dy = targetYaw - b.yaw;
      b.yaw += Math.atan2(Math.sin(dy), Math.cos(dy)) * Math.min(1, dt * 10);
      b.reactT -= dt;
      // Strafe slowly while shooting.
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.7 + G.rng() * 0.8; }
      b.vel.set(Math.cos(b.yaw) * b.strafe * 0.9, 0, -Math.sin(b.yaw) * b.strafe * 0.9);
      if (b.reactT <= 0 && G.round.state === 'live') botShoot(G, b, dt);
    } else if (b.state === 'route') {
      if (b.pathI < b.path.length) {
        const n = nodePos(b.path[b.pathI], _tmp);
        if (moveToward(G, b, n.x, n.z, dt, CFG.bot.walk)) b.pathI++;
      } else {
        b.state = 'hold';
        b.holdT = 2 + G.rng() * 3;
      }
    } else if (b.state === 'hold') {
      b.vel.set(0, 0, 0);
      b.yaw += dt * 0.35; // slow scan
      b.holdT -= dt;
      if (b.holdT <= 0) {
        b.holdT = 3 + G.rng() * 4;
        b.yaw += (G.rng() - 0.5) * 2;
      }
      // Attackers holding a site they reached without the bomb rotate on.
      if (b.team === 'atk' && b.destNode === SITE_NODE[b.site] && bomb.carrier !== b && bomb.state === 'carried') {
        b.state = 'route';
        b.destNode = HOLD_NODES[(b.id + G.round.num) % HOLD_NODES.length];
        b.path = findPath(nearestNode(b.pos.x, b.pos.z), b.destNode);
        b.pathI = 0;
      }
    } else if (b.state === 'react') {
      const goal = b.heardPos ?? b.lastSeen;
      if (goal) {
        if (moveToward(G, b, goal.x, goal.z, dt, CFG.bot.walk)) { b.state = 'hold'; b.holdT = 2; b.heardPos = null; }
      } else b.state = 'hold';
    } else if (b.state === 'plant') {
      b.vel.set(0, 0, 0);
      b.plantT += dt;
      if (b.plantT >= CFG.bomb.plantTime && G.round.state === 'live') {
        b.plantT = 0;
        b.state = 'hold';
        if (G.plantBomb) G.plantBomb(b, b.site);
      }
    } else if (b.state === 'defuse') {
      b.vel.set(0, 0, 0);
      b.defuseT += dt;
      const need = b.kit ? CFG.bomb.defuseKitTime : CFG.bomb.defuseTime;
      if (b.defuseT >= need && G.round.state === 'live') {
        b.defuseT = 0;
        b.state = 'hold';
        if (G.defuseBomb) G.defuseBomb(b);
      }
    }
    // --- integrate movement + mesh ---
    moveBot(G, b, dt);
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.y = b.yaw;
  }
}

// Collision + gravity for a bot (flat map: y stays 0).
function moveBot(G, b, dt) {
  resolveMove(b.pos, CFG.player.radius, 1.7, b.vel, dt, G.world.colliders);
  b.vel.y = 0;
  if (b.pos.y < 0) b.pos.y = 0;
}
