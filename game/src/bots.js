// bots.js — nine bots (4 Ember teammates, 5 Ash enemies). States: route
// (follow the nav graph to a site), hold (watch a corner), engage (aim with
// error and a human reaction time, fire in bursts), react (a sound or a lost
// target pulls them over), plant / defuse (the objective). Bots buy better
// guns as rounds pass, call out what they see on the radio, and never
// aimbot: every shot is a probability roll, worse on the move and at range.
import * as THREE from 'three';
import { CFG } from './config.js';
import { PAL } from './palette.js';
import { giveWeapon } from './player.js';
import { damageAgent } from './combat.js';
import { hitscanShot, currentSpread } from './weapon.js';
import { playShot } from './audio.js';
import { losBlocked, resolveMove } from './world.js';
import { nearestNode, findPath, nodePos, SITE_NODE, SPAWN_NODE, HOLD_NODES } from './nav.js';
import { smokeBlocks, throwGrenade } from './grenade.js';

const _eye = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _tmp = new THREE.Vector3();
// Scratch vectors for bot hitscan (v6-full): origin and aim point, reused
// every shot instead of allocating (fix 5).
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();

function makeMesh(team) {
  // CS:GO-style operator (v7-visual): the v6 capsule humanoid, dressed
  // as a team-distinct soldier — CTs in dark blue, Ts in tan/khaki —
  // with a helmet, tactical vest, backpack, belt, and knee pads. The
  // torso keeps the old body box's bounding box (0.55 wide, y 0.44..1.46)
  // and the head keeps the old 0.32 cube's diameter, so the shootable
  // hitbox is the same shape in the same place — only the silhouette
  // changes. Every new part is visual only and is never added to
  // G.shootables; arms/legs/visor/pads keep their v6 roles.
  const g = new THREE.Group();
  const suit = team === 'atk' ? PAL.tSuit : PAL.ctSuit;
  const suitDark = team === 'atk' ? PAL.tDark : PAL.ctDark;
  const helm = team === 'atk' ? PAL.tHelm : PAL.ctHelm;
  const accent = team === 'atk' ? PAL.tAccent : PAL.ctAccent;
  const bodyMat = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.75 });
  const darkMat = new THREE.MeshStandardMaterial({ color: suitDark, roughness: 0.8 });
  const helmMat = new THREE.MeshStandardMaterial({ color: helm, roughness: 0.6 });
  const vestMat = new THREE.MeshStandardMaterial({ color: suitDark, roughness: 0.85 });
  const accMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, emissive: accent, emissiveIntensity: 0.3 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), bodyMat);
  head.position.y = 1.62;
  head.castShadow = true;
  // Helmet dome + brim over the head (bots face local -z).
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), helmMat);
  helmet.position.y = 1.66;
  helmet.castShadow = true;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), helmMat);
  brim.position.y = 1.66;
  // Visor slit on the face, under the brim.
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), accMat);
  visor.position.set(0, 1.64, -0.15);
  // Tactical vest: front + back plates hugging the torso, with two
  // magazine pouches on the chest.
  const vestF = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.05), vestMat);
  vestF.position.set(0, 1.02, -0.24);
  const vestB = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.05), vestMat);
  vestB.position.set(0, 1.02, 0.24);
  const pouchGeo = new THREE.BoxGeometry(0.12, 0.14, 0.05);
  const pouchL = new THREE.Mesh(pouchGeo, darkMat);
  pouchL.position.set(-0.11, 1.0, -0.28);
  const pouchR = new THREE.Mesh(pouchGeo, darkMat);
  pouchR.position.set(0.11, 1.0, -0.28);
  // Backpack + bedroll on the back.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.14), vestMat);
  pack.position.set(0, 1.08, 0.31);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 8), darkMat);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 1.32, 0.31);
  // Belt around the waist and knee pads on the legs.
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 12), darkMat);
  belt.position.y = 0.72;
  const kneeGeo = new THREE.SphereGeometry(0.08, 8, 6);
  const kneeL = new THREE.Mesh(kneeGeo, darkMat);
  kneeL.position.set(-0.13, 0.52, -0.08);
  const kneeR = new THREE.Mesh(kneeGeo, darkMat);
  kneeR.position.set(0.13, 0.52, -0.08);
  const padGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const padL = new THREE.Mesh(padGeo, accMat);
  padL.position.set(-0.3, 1.38, 0);
  const padR = new THREE.Mesh(padGeo, accMat);
  padR.position.set(0.3, 1.38, 0);
  // Arms angled forward-down toward the gun; base pitch -0.85.
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.34, 4, 8);
  const armL = new THREE.Mesh(armGeo, darkMat);
  armL.position.set(-0.3, 1.12, -0.16);
  armL.rotation.set(-0.85, 0, 0.25);
  const armR = new THREE.Mesh(armGeo, darkMat);
  armR.position.set(0.3, 1.12, -0.18);
  armR.rotation.set(-0.85, 0, -0.25);
  // Legs, feet on the ground.
  const legGeo = new THREE.CapsuleGeometry(0.09, 0.38, 4, 8);
  const legL = new THREE.Mesh(legGeo, darkMat);
  legL.position.set(-0.13, 0.28, 0);
  const legR = new THREE.Mesh(legGeo, darkMat);
  legR.position.set(0.13, 0.28, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.55), gunMat);
  gun.position.set(0.18, 1.22, -0.32);
  // Rifle furniture on the held gun: magazine under the receiver and a
  // barrel poking past the muzzle, so it reads as a rifle, not a box.
  const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), gunMat);
  gunMag.position.set(0.18, 1.12, -0.28);
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8), gunMat);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0.18, 1.24, -0.62);
  g.add(body, head, helmet, brim, visor, vestF, vestB, pouchL, pouchR,
    pack, roll, belt, kneeL, kneeR, padL, padR, armL, armR, legL, legR,
    gun, gunMag, gunBarrel);
  return { group: g, body, head, legL, legR, armL, armR };
}

export function createBots(G) {
  const bots = [];
  let id = 1;
  for (const team of ['atk', 'def']) {
    const names = CFG.botNames[team];
    for (let i = 0; i < names.length; i++) {
      const { group, body, head, legL, legR, armL, armR } = makeMesh(team);
      const b = {
        id: id++, team, isPlayer: false, name: names[i],
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        yaw: 0, pitch: 0, hp: CFG.player.hp, armor: 0, alive: true, kills: 0, deaths: 0,
        money: 0, kit: false, grenades: { he: 0, smoke: 0 },
        weapons: {}, cur: 'pistol', bloom: 0,
        mesh: group, legL, legR, armL, armR, state: 'route', path: [], pathI: 0,
        destNode: SPAWN_NODE[team], pathDest: null, holdT: 0, thinkT: G.rng() * 0.15,
        target: null, reactT: 0, burstLeft: 0, burstPause: 0, cool: 0,
        // Preallocated perception memory (v6-full, fix 5): lastSeen and
        // heardPos are scratch vectors filled by copy(), never cloned.
        // lastSeenSet / heard say whether the vector holds a real position.
        lastSeen: new THREE.Vector3(), lastSeenSet: false,
        lastSeenT: 0, heardPos: new THREE.Vector3(), heard: false, heardT: 0,
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
    b.heard = false; b.lastSeenSet = false;
    b.destNode = b.team === 'atk' ? SITE_NODE[b.site] : HOLD_NODES[(b.id * 2) % HOLD_NODES.length];
    b.path = findPath(nearestNode(b.pos.x, b.pos.z), b.destNode);
    b.pathI = 0;
    b.pathDest = b.destNode;
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
  // Hold fire without line of sight: the target memory lasts 1.5s, and
  // shooting through cover or smoke in that window was unfair.
  if (!canSee(G, b, t)) return;
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
  if (!st) return;
  // A reload already runs: let stepReloads finish it. Resetting the timer
  // here on every shot attempt meant a bot that emptied its magazine while
  // engaging never finished reloading.
  if (st.reloading > 0) return;
  if (st.mag <= 0) { // reload instead of shooting blanks
    st.reloading = w.reload;
    return;
  }
  st.mag--;
  // Shared hitscan (v6-full): the bot fires the same raycast the player
  // uses, aimed at the target's upper chest with a human error, so walls
  // stop the bullet and headshots are real geometry instead of a dice
  // roll. The error is sized so the geometric hit probability tracks the
  // old roll's curve: p(d) = 0.55 - 0.4*d/seeDist with the old
  // speed/crouch/move modifiers, because for a uniform error e over a
  // torso of half-area 0.1375 m^2, P(hit) = 0.1375/e^2. Same lethality,
  // real bullets. Weapon spread still applies via currentSpread.
  // Calibration (measured, ttk-probe 8 m rifle vs HP 100): the plain
  // 0.1375 constant ran at ~55% of the roll curve (TTK 8.5 s vs v5's
  // 4.7 s), because hitscanShot adds the weapon spread on top of the
  // aim error. Halving the constant (err x0.7) brings the effective hit
  // rate back to the v5 roll.
  const d = b.pos.distanceTo(t.pos);
  let p = 0.55 - (d / CFG.bot.seeDist) * 0.4;
  const tSpeed = Math.hypot(t.vel.x, t.vel.z);
  if (tSpeed > 3) p -= 0.1;
  if (t.crouching) p -= 0.05;
  if (Math.hypot(b.vel.x, b.vel.z) > 1) p -= 0.15;
  p = Math.max(0.05, Math.min(0.8, p));
  const err = Math.max(0.25, Math.min(1.6, Math.sqrt(0.0675 / p)));
  _origin.set(b.pos.x, b.pos.y + b.eyeH, b.pos.z);
  // Aim at the upper chest: spread can still clip the head box above it.
  _aim.set(
    t.pos.x + (G.rng() - 0.5) * 2 * err,
    t.pos.y + 1.05 + (G.rng() - 0.5) * 2 * err,
    t.pos.z + (G.rng() - 0.5) * 2 * err,
  );
  _tmp.subVectors(_aim, _origin).normalize();
  const hit = hitscanShot(G, b, _origin, _tmp, currentSpread(G, b));
  // The shot is heard: a ping on the enemy team's minimap.
  G.pings.push({ x: b.pos.x, z: b.pos.z, t: G.time });
  if (G.noise) G.noise(b.pos, CFG.bot.hearR);
  playShot(G, b.cur, b.pos);
  if (hit) {
    damageAgent(G, hit.agent, w.dmg * (hit.part === 'head' ? w.headMul : 1), hit.part, b);
  }
}

// Re-route immediately when the destination changes: finishing the old
// path first made bots ignore urgent objectives (plant response, dropped
// bomb) until the old route ended.
function setDest(G, b, node) {
  if (b.pathDest !== node) {
    b.destNode = node;
    b.path = findPath(nearestNode(b.pos.x, b.pos.z), node);
    b.pathI = 0;
    b.pathDest = node;
  } else if (b.pathI >= b.path.length) {
    b.path = findPath(nearestNode(b.pos.x, b.pos.z), node);
    b.pathI = 0;
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
    // Freeze time: bots stay at spawn. (Perception and shooting are
    // already gated on 'live'; movement was not.)
    if (G.round.state === 'freeze') { b.vel.set(0, 0, 0); b.mesh.position.copy(b.pos); continue; }
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
        if (b.target !== best) {
          radio(G, b, `Contact ${best.isPlayer ? 'player' : best.name} — ${b.site ?? 'mid'}`);
          // Reaction time starts once, on first sighting. Resetting it every
          // think tick (0.15s < reactionMin 0.25s) meant bots never fired.
          b.reactT = CFG.bot.reactionMin + G.rng() * (CFG.bot.reactionMax - CFG.bot.reactionMin);
        }
        b.target = best;
        // Preallocated copy (v6-full, fix 5): no clone() per sighting.
        b.lastSeen.copy(best.pos);
        b.lastSeenSet = true;
        b.lastSeenT = 0;
        b.state = 'engage';
      } else if (b.target) {
        b.lastSeenT += CFG.bot.thinkEvery;
        if (b.lastSeenT > 1.5) { b.target = null; b.state = 'react'; }
      }
    }
    // --- bomb logic overrides movement ---
    const bomb = G.bomb;
    if (b.team === 'atk' && bomb.state === 'planted') {
      // Attackers guard the planted bomb.
      if (b.state !== 'engage') { b.state = 'hold'; b.destNode = bomb.site === 'A' ? SITE_NODE.A : SITE_NODE.B; }
    } else if (b.team === 'def' && bomb.state === 'planted') {
      const d = Math.hypot(b.pos.x - bomb.pos.x, b.pos.z - bomb.pos.z);
      if (d < 1.6 && b.state !== 'engage') {
        b.state = 'defuse';
      } else if (b.state !== 'engage' && b.state !== 'defuse') {
        b.state = 'route';
        // Route to the node nearest the bomb, not the site node. The carrier
        // plants wherever it stands inside the 6x6 site, up to 4.2 m from
        // the site node, and routing to the site node alone left defenders
        // oscillating route<->hold at the node, never within the 1.6 m
        // defuse range.
        setDest(G, b, nearestNode(bomb.pos.x, bomb.pos.z));
      }
    } else if (b.team === 'atk' && bomb.carrier === b && bomb.state === 'carried') {
      if (b.state !== 'engage' && b.state !== 'plant') {
        b.state = 'route';
        setDest(G, b, SITE_NODE[b.site]);
      }
      const site = G.world.sites[b.site];
      if (Math.abs(b.pos.x - site.center.x) < site.size / 2 && Math.abs(b.pos.z - site.center.z) < site.size / 2) {
        if (b.state !== 'plant' && b.grenades.smoke > 0) {
          // Cover the plant: one smoke toward the site centre.
          const dx = site.center.x - b.pos.x, dz = site.center.z - b.pos.z;
          b.yaw = Math.atan2(-dx, -dz);
          throwGrenade(G, b, 'smoke');
        }
        b.state = 'plant';
        radio(G, b, `Planting at ${b.site}`);
      }
    } else if (b.team === 'atk' && !bomb.carrier && bomb.dropped && bomb.state === 'dropped') {
      if (b.state !== 'engage') {
        b.state = 'route';
        setDest(G, b, nearestNode(bomb.dropped.x, bomb.dropped.z));
        if (b.pos.distanceTo(bomb.dropped) < 1.2) {
          bomb.carrier = b; bomb.dropped = null; bomb.state = 'carried';
          radio(G, b, 'Picked up the charge');
        }
      }
    }
    // --- state behaviour ---
    // Plant/defuse progress is lost the moment the bot stops planting or
    // defusing: it must hold still and uninterrupted for the full time.
    if (b.state !== 'plant') b.plantT = 0;
    if (b.state !== 'defuse') b.defuseT = 0;
    if (b.state === 'engage' && b.target && b.target.alive) {
      const t = b.target;
      _tmp.set(t.pos.x - b.pos.x, 0, t.pos.z - b.pos.z);
      const targetYaw = Math.atan2(-_tmp.x, -_tmp.z);
      let dy = targetYaw - b.yaw;
      b.yaw += Math.atan2(Math.sin(dy), Math.cos(dy)) * Math.min(1, dt * 10);
      b.reactT -= dt;
      // Strafe slowly while shooting.
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = G.rng() < 0.5 ? -1 : 1; b.strafeT = 0.7 + G.rng() * 0.8; }
      b.vel.set(Math.cos(b.yaw) * b.strafe * 0.9, 0, -Math.sin(b.yaw) * b.strafe * 0.9);
      if (b.reactT <= 0 && G.round.state === 'live') botShoot(G, b, dt);
    } else if (b.state === 'route') {
      // Defender closing on a planted bomb: once close, steer straight at
      // the bomb instead of the next path node. The nearest node can still
      // sit >1.6 m from an off-centre plant, so node routing alone cannot
      // close the last metres; the direct walk finishes the job and there
      // is no route<->hold oscillation at the site node.
      if (b.team === 'def' && bomb.state === 'planted'
          && Math.hypot(b.pos.x - bomb.pos.x, b.pos.z - bomb.pos.z) < 6) {
        moveToward(G, b, bomb.pos.x, bomb.pos.z, dt, CFG.bot.walk);
      } else if (b.pathI < b.path.length) {
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
        setDest(G, b, HOLD_NODES[(b.id + G.round.num) % HOLD_NODES.length]);
      }
    } else if (b.state === 'react') {
      const goal = b.heard ? b.heardPos : (b.lastSeenSet ? b.lastSeen : null);
      if (goal) {
        if (moveToward(G, b, goal.x, goal.z, dt, CFG.bot.walk)) { b.state = 'hold'; b.holdT = 2; b.heard = false; }
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
    // Walk cycle (v6-visual): legs swing while moving, arms counter-swing
    // around their held-gun pose. Pure trig on existing state — no
    // allocation, no gameplay effect; idle bots return to the base pose.
    const spd = Math.hypot(b.vel.x, b.vel.z);
    const sw = spd > 0.5 ? Math.sin(G.time * 9 + b.id * 1.7) * 0.5 : 0;
    b.legL.rotation.x = sw;
    b.legR.rotation.x = -sw;
    b.armL.rotation.x = -0.85 - sw * 0.5;
    b.armR.rotation.x = -0.85 + sw * 0.5;
  }
}

// Collision + gravity for a bot (flat map: y stays 0).
function moveBot(G, b, dt) {
  resolveMove(b.pos, CFG.player.radius, 1.7, b.vel, dt, G.world.colliders);
  b.vel.y = 0;
  if (b.pos.y < 0) b.pos.y = 0;
}
