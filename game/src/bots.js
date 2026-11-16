// bots.js — nine bots (4 Ember, 5 Ash). States: route, hold, engage, react, plant/defuse.
// No aimbot: every shot is a probability roll, worse on the move and at range.
import * as THREE from 'three';
import { CFG } from './config.js';
import { giveWeapon } from './player.js';
import { damageAgent } from './combat.js';
import { hitscanShot, currentSpread } from './weapon.js';
import { playShot } from './audio.js';
import { losBlocked, resolveMove, makeBlobShadow } from './world.js';
import { nearestNode, findPath, nodePos, SITE_NODE, SPAWN_NODE, HOLD_NODES } from './nav.js';
import { smokeBlocks, throwGrenade } from './grenade.js';

const _eye = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _tmp = new THREE.Vector3();
// Scratch vectors for bot hitscan: origin + aim point, reused every shot (no alloc).
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();

// RoundedBoxGeometry — local re-implementation; algorithm idea from the
// three.js example `examples/jsm/geometries/RoundedBoxGeometry.js`
// (mrdoob/three.js, MIT), written from the description, not pasted.
// A subdivided box whose vertices are repositioned onto the rounded
// surface; it stays indexed, so the 6 material groups and 0-1 UVs survive
// and the head keeps a 6-material array with the face on index 5 (-Z, forward); segments=2 -> 300 tris/box.
class RoundedBoxGeometry extends THREE.BoxGeometry {
  constructor(width, height, depth, segments = 2, radius = 0.1) {
    const s = segments * 2 + 1; // odd: a flat plane in the middle of each face
    super(1, 1, 1, s, s, s);
    radius = Math.min(width / 2, height / 2, depth / 2, radius);
    if (radius <= 0) return;
    const pos = this.attributes.position;
    const nor = this.attributes.normal;
    const inner = new THREE.Vector3(width / 2 - radius, height / 2 - radius, depth / 2 - radius);
    const off = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) * width;
      const vy = pos.getY(i) * height;
      const vz = pos.getZ(i) * depth;
      const cx = Math.max(-inner.x, Math.min(inner.x, vx));
      const cy = Math.max(-inner.y, Math.min(inner.y, vy));
      const cz = Math.max(-inner.z, Math.min(inner.z, vz));
      off.set(vx - cx, vy - cy, vz - cz);
      if (off.lengthSq() === 0) continue; // face centre: already on the surface
      off.normalize();
      pos.setXYZ(i, cx + off.x * radius, cy + off.y * radius, cz + off.z * radius);
      nor.setXYZ(i, off.x, off.y, off.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}

// Health bar above the head (robot look): a billboard sprite whose canvas is
// redrawn only when hp changes. Red fill = hp fraction on a dark bar.
function makeHpBar() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
  spr.scale.set(0.7, 0.09, 1);
  spr.position.set(0, 2.08, 0);
  return { spr, c, tex, last: -1 };
}
function drawHpBar(bar, hp) {
  if (hp === bar.last) return;
  bar.last = hp;
  const x = bar.c.getContext('2d');
  x.fillStyle = '#181818'; x.fillRect(0, 0, 64, 8);
  x.fillStyle = '#ff2a2a'; x.fillRect(1, 1, Math.max(0, 62 * hp / 100), 6);
  bar.tex.needsUpdate = true;
}

function makeMesh(team) {
  // Robot operator (ref #2): white rounded head + dark visor + glowing cyan
  // eyes, white chest plate + shoulder pads, blue arms + legs, red health bar.
  // Hitboxes UNCHANGED: torso capsule (r 0.26 at y 0.95) and head sphere
  // (r 0.17 at y 1.62) hide inside the torso box / head cube. The group keeps
  // exactly 40 direct children (23 base + 14 studs + 2 eyes + 1 health bar)
  // — the playtest's V check asserts it. Team read: the TORSO stays
  // team-coloured (CT blue 0x2f6fb4, T tan 0xc98a2e — the playtest asserts
  // these exact hex values) so friend/foe stays instant at distance; the
  // helmet is team-tinted too. The Roblox face is gone — the dark visor +
  // cyan eyes replace it. Arms are two-segment shoulder groups; the walk
  // swing (sw*0.2) keeps the hands on the gun.
  const g = new THREE.Group();
  // Bot visibility colours (botvis): bright team colours so the operator reads
  // at 15-20 m against the grey walls. CT stays blue-family, T stays
  // tan-family. Defined HERE, not in PAL: the playtest asserts the exact
  // torso hex values (see its V check).
  const CT = { suit: 0x2f6fb4, dark: 0x1c3d5e, helm: 0x4da3e8 };
  const TT = { suit: 0xc98a2e, dark: 0x6b4a1e, helm: 0xe8b13c };
  const suit = team === 'atk' ? TT.suit : CT.suit;
  const suitDark = team === 'atk' ? TT.dark : CT.dark;
  const helm = team === 'atk' ? TT.helm : CT.helm;
  const bodyMat = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.75 });
  const darkMat = new THREE.MeshStandardMaterial({ color: suitDark, roughness: 0.8 });
  const helmMat = new THREE.MeshStandardMaterial({ color: helm, roughness: 0.6 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.55 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x2f6fb4, roughness: 0.7 });
  const vestMat = new THREE.MeshStandardMaterial({ color: suitDark, roughness: 0.85 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 2, roughness: 0.4 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5 });
  const gunMid = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.6 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.4 });
  // Hitbox meshes (shootable, UNCHANGED): capsule torso + sphere head,
  // hidden inside the torso box / head cube below.
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), bodyMat);
  head.position.y = 1.62;
  head.castShadow = true;
  // Visible torso box (0.62 x 1.04 x 0.56 at y 0.95) contains the capsule
  // hitbox (0.52 wide, y 0.44..1.46) with a small margin; head cube (0.40)
  // contains the head sphere (0.34 wide). Torso is 0.06 wider than before
  // (botvis: broader silhouette) — still close to the hitbox, so a visual
  // edge hit is at most 0.05 off the capsule.
  const torsoBox = new THREE.Mesh(new RoundedBoxGeometry(0.62, 1.04, 0.56, 2, 0.06), bodyMat);
  torsoBox.position.y = 0.95;
  torsoBox.castShadow = true;
  // White rounded head (robot). The dark visor is a band across the eye line
  // (y 1.61-1.75) and the two glowing cyan eyes sit ON it, proud of its front
  // face so they read from any angle. The Roblox face is gone — the visor +
  // eyes replace it.
  const headCube = new THREE.Mesh(new RoundedBoxGeometry(0.40, 0.40, 0.40, 2, 0.04), whiteMat);
  headCube.position.y = 1.62;
  headCube.castShadow = true;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), darkMat);
  neck.position.y = 1.46;
  // Box helmet + brim on the head cube. Helmet at y 1.84 (sunk 0.03 into the head top so it never floats) — the playtest's V check looks for it.
  const helmet = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.10, 0.48, 2, 0.03), helmMat);
  helmet.position.y = 1.84;
  helmet.castShadow = true;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.16), helmMat);
  brim.position.set(0, 1.83, -0.20);
  // Visor: dark band across the eye line, holding the two glowing cyan eyes.
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.03), visorMat);
  visor.position.set(0, 1.68, -0.20);
  const eyeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.02);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.08, 1.68, -0.22);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.08, 1.68, -0.22);
  // White chest plate (robot): front + back plates + two chest magazine pouches. Plates sit 0.005 off the torso faces so no faces are coplanar (no z-fighting).
  const vestF = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.50, 0.05, 2, 0.02), whiteMat);
  vestF.position.set(0, 1.02, -0.31);
  const vestB = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.50, 0.05, 2, 0.02), whiteMat);
  vestB.position.set(0, 1.02, 0.31);
  const pouchGeo = new RoundedBoxGeometry(0.12, 0.14, 0.05, 2, 0.02);
  const pouchL = new THREE.Mesh(pouchGeo, darkMat);
  pouchL.position.set(-0.12, 1.0, -0.365);
  const pouchR = new THREE.Mesh(pouchGeo, darkMat);
  pouchR.position.set(0.12, 1.0, -0.365);
  const pack = new THREE.Mesh(new RoundedBoxGeometry(0.40, 0.42, 0.14, 2, 0.03), vestMat);
  pack.position.set(0, 1.08, 0.355);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.08, 0.60), darkMat);
  belt.position.y = 0.72;
  const padGeo = new THREE.BoxGeometry(0.18, 0.09, 0.22);
  const padL = new THREE.Mesh(padGeo, whiteMat);
  padL.position.set(-0.34, 1.48, 0);
  const padR = new THREE.Mesh(padGeo, whiteMat);
  padR.position.set(0.34, 1.48, 0);
  // Roblox studs: small cylinders on the shoulder-pad tops (2x2 each) and the
  // torso top face (3 across x 2 rows; the head cube covers the torso-top centre,
  // so the grid sits on the exposed ring). +14 children/bot (23 -> 37).
  const studGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 10);
  const studs = [];
  for (const px of [-0.34, 0.34]) {
    for (const dx of [-0.04, 0.04]) {
      for (const dz of [-0.05, 0.05]) {
        const s = new THREE.Mesh(studGeo, darkMat);
        s.position.set(px + dx, 1.531, dz);
        studs.push(s);
      }
    }
  }
  for (const sx of [-0.25, 0, 0.25]) {
    for (const sz of [-0.24, 0.24]) {
      const s = new THREE.Mesh(studGeo, darkMat);
      s.position.set(sx, 1.476, sz);
      studs.push(s);
    }
  }
  // Arms: two segments + gripping hands, SEPARATED from the torso (the old
  // single-box arms blended into it — same colour, and a piece clipped
  // through the chest). Each arm is a Group pivoted at the shoulder, OUTSIDE
  // the torso box (shoulders at x ±0.38; torso half-width 0.31 + arm
  // half-width 0.055). The upper arm drops down-forward IN FRONT of the
  // chest (z <= -0.33, clear of the torso front at -0.28 and the vest at
  // -0.335); the forearm bends at a visible elbow to the gun. Arms use the
  // robot BLUE material, matching the legs. Segments and hands
  // are placed between explicit bot-local points, so the walk swing rotates
  // the whole arm rigidly around the shoulder.
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x9c8a68, roughness: 0.8 });
  const armMat = blueMat; // robot blue, matching the legs
  // Place a box between two bot-local points as a child of `parent` (an arm group).
  // The long axis runs A->B; the transform is computed from the parent's current rotation, so the pose is exact at rest.
  function placeBetween(parent, a, b, w, mat) {
    const A = new THREE.Vector3(a[0], a[1], a[2]);
    const B = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = new THREE.Vector3().subVectors(B, A);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
    const R = new THREE.Matrix4().makeRotationFromEuler(parent.rotation);
    const Ri = R.clone().invert();
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, len, w, 2, 0.02), mat);
    m.position.copy(mid.sub(parent.position).applyMatrix4(Ri));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(Ri).multiply(q));
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function placeBox(parent, c, s, e, mat) {
    const R = new THREE.Matrix4().makeRotationFromEuler(parent.rotation);
    const Ri = R.clone().invert();
    const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), mat);
    m.position.copy(new THREE.Vector3(c[0], c[1], c[2]).sub(parent.position).applyMatrix4(Ri));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    m.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(Ri).multiply(q));
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  const armR = new THREE.Group();
  armR.position.set(0.38, 1.40, -0.08);
  const armL = new THREE.Group();
  armL.position.set(-0.38, 1.40, -0.08);
  // Right arm: upper arm down-forward, forearm across the chest to the pistol grip (elbow bend ~87 deg, clearly visible).
  placeBetween(armR, [0.38, 1.40, -0.08], [0.375, 1.20, -0.44], 0.11, armMat);
  placeBetween(armR, [0.375, 1.20, -0.44], [0.05, 1.16, -0.45], 0.10, armMat);
  // Left arm: upper arm down-forward, forearm reaching out to the forend (elbow bend ~64 deg, arm extended as a real forend hold).
  placeBetween(armL, [-0.38, 1.40, -0.08], [-0.38, 1.24, -0.55], 0.11, armMat);
  placeBetween(armL, [-0.38, 1.24, -0.55], [0.04, 1.21, -0.76], 0.10, armMat);
  // Gripping hands (3 tan boxes each): palm + finger block + thumb. The palm sits
  // behind the grip/forend and the fingers wrap its front, so the hand overlaps the
  // gun on both sides. All hand boxes sit clear in front of the vest (z <= -0.37).
  placeBox(armR, [0.07, 1.17, -0.405], [0.11, 0.11, 0.07], [-0.3, 0, 0], gloveMat);
  placeBox(armR, [0.04, 1.15, -0.465], [0.10, 0.09, 0.06], [-0.3, 0, 0], gloveMat);
  placeBox(armR, [0.10, 1.20, -0.42], [0.04, 0.08, 0.05], [-0.3, 0, 0], gloveMat);
  placeBox(armL, [0.04, 1.25, -0.72], [0.11, 0.10, 0.08], [0, 0, 0], gloveMat);
  placeBox(armL, [0.04, 1.185, -0.72], [0.10, 0.08, 0.07], [0, 0, 0], gloveMat);
  placeBox(armL, [0.095, 1.24, -0.70], [0.04, 0.07, 0.05], [0, 0, 0], gloveMat);
  // Box legs with a hip pivot: the geometry is translated so the box spans local
  // y -0.55..0 and the mesh sits at the hip (y 0.55), so the walk-cycle swing rotates
  // around the hip and the feet stay on the ground. Leg tops overlap the torso box bottom (y 0.43), no gap.
  // Legs use the robot BLUE material so the walk cycle reads against the grey ground.
  const legGeo = new RoundedBoxGeometry(0.16, 0.55, 0.14, 2, 0.02);
  legGeo.translate(0, -0.275, 0);
  const legL = new THREE.Mesh(legGeo, blueMat);
  legL.position.set(-0.16, 0.55, 0);
  const legR = new THREE.Mesh(legGeo, blueMat);
  legR.position.set(0.16, 0.55, 0);
  // Box rifle held centred on the chest: receiver + barrel + magazine + stock +
  // front sight, all boxes. The gun sits 0.10 further forward (z -0.48) so the hands
  // wrap it CLEAR of the vest. The pistol grip and forend hang off the gun mesh so
  // the group keeps exactly 40 direct children (23 base + 14 studs + 2 eyes + 1 health bar).
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.42), gunMat);
  gun.position.set(0.04, 1.26, -0.48);
  const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), gunMid);
  gunBarrel.position.set(0.04, 1.28, -0.78);
  const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.08), gunMat);
  gunMag.position.set(0.04, 1.16, -0.42);
  gunMag.rotation.x = 0.15;
  const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.16), gunMat);
  gunStock.position.set(0, 0, 0.26);
  gun.add(gunStock);
  const gunSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), gunMid);
  gunSight.position.set(0, 0.08, -0.17);
  gun.add(gunSight);
  const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.06), gunMat);
  gunGrip.position.set(0, -0.095, 0.05);
  gunGrip.rotation.x = -0.3;
  gun.add(gunGrip);
  const gunForend = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.24), gunMid);
  gunForend.position.set(0, -0.045, -0.26);
  gun.add(gunForend);
  const hpBar = makeHpBar();
  g.add(body, head, torsoBox, headCube, helmet, brim, visor, eyeL, eyeR, vestF, vestB,
    pouchL, pouchR, pack, belt, padL, padR, neck, armL, armR, legL, legR,
    gun, gunBarrel, gunMag, hpBar.spr, ...studs);
  return { group: g, body, head, legL, legR, armL, armR, hpBar };
}

export function createBots(G) {
  const bots = [];
  let id = 1;
  for (const team of ['atk', 'def']) {
    const names = CFG.botNames[team];
    for (let i = 0; i < names.length; i++) {
      const { group, body, head, legL, legR, armL, armR, hpBar } = makeMesh(team);
      const b = {
        id: id++, team, isPlayer: false, name: names[i],
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        yaw: 0, pitch: 0, hp: CFG.player.hp, armor: 0, alive: true, kills: 0, deaths: 0,
        money: 0, kit: false, grenades: { he: 0, smoke: 0 },
        weapons: {}, cur: 'pistol', bloom: 0,
        mesh: group, legL, legR, armL, armR, hpBar, state: 'route', path: [], pathI: 0,
        destNode: SPAWN_NODE[team], pathDest: null, holdT: 0, thinkT: G.rng() * 0.15,
        target: null, reactT: 0, burstLeft: 0, burstPause: 0, cool: 0,
        // Preallocated perception memory: lastSeen and heardPos are scratch vectors
        // filled by copy(), never cloned. lastSeenSet / heard say whether the vector holds a real position.
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
      // Blob contact shadow (lighting round): a scene-level quad, NOT a child of the
      // bot group — the playtest asserts 37 group children. It follows the bot's feet and hides when the bot dies.
      b.blob = makeBlobShadow(1.3, 1.3);
      G.scene.add(b.blob);
      bots.push(b);
    }
  }
  return bots;
}

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
    if (b.blob) { b.blob.position.set(b.pos.x, 0.02, b.pos.z); b.blob.visible = true; }
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
  G.radio.unshift({ text: `${b.name}: ${text}`, t: 5, team: b.team });
  if (G.radio.length > 3) G.radio.pop();
}

function botShoot(G, b, dt) {
  const t = b.target;
  if (!t || !t.alive) return;
  // Hold fire without line of sight: the target memory lasts 1.5s, and shooting through cover or smoke in that window was unfair.
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
  // A reload already runs: let stepReloads finish it. Resetting the timer per shot attempt meant a bot that emptied its magazine never finished reloading.
  if (st.reloading > 0) return;
  if (st.mag <= 0) { // reload instead of shooting blanks
    st.reloading = w.reload;
    return;
  }
  st.mag--;
  // Shared hitscan: the bot fires the same raycast the player uses, aimed at the upper chest
  // with a human error, so walls stop the bullet and headshots are real geometry, not a dice
  // roll. The error is sized so the geometric hit probability tracks the old roll's curve
  // (p(d) = 0.55 - 0.4*d/seeDist, same speed/crouch/move modifiers): for a uniform error e
  // over a torso of half-area 0.1375 m^2, P(hit) = 0.1375/e^2. Weapon spread still applies
  // via currentSpread. Calibration (measured, ttk-probe 8 m rifle vs HP 100): the plain
  // 0.1375 constant ran at ~55% of the roll curve (TTK 8.5 s vs 4.7 s), because hitscanShot
  // adds weapon spread on top of the aim error. Halving the constant (err x0.7) brings the
  // hit rate back to the roll.
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
  G.pings.push({ x: b.pos.x, z: b.pos.z, t: G.time });
  if (G.noise) G.noise(b.pos, CFG.bot.hearR);
  playShot(G, b.cur, b.pos);
  if (hit) {
    damageAgent(G, hit.agent, w.dmg * (hit.part === 'head' ? w.headMul : 1), hit.part, b);
  }
}

// Re-route immediately when the destination changes: finishing the old path first made bots ignore urgent objectives until the old route ended.
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
    // Blob shadow follows the feet (runs for dead bots too, so it hides at the death spot).
    if (b.blob) { b.blob.position.set(b.pos.x, 0.02, b.pos.z); b.blob.visible = b.alive; }
    // Health bar: hidden when dead, redrawn only when hp changed.
    if (b.hpBar) { b.hpBar.spr.visible = b.alive; drawHpBar(b.hpBar, b.hp); }
    if (!b.alive) continue;
    // Freeze time: bots stay at spawn. (Perception and shooting are already gated on 'live'; movement was not.)
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
          // Reaction time starts once, on first sighting. Resetting it every think tick (0.15s < reactionMin 0.25s) meant bots never fired.
          b.reactT = CFG.bot.reactionMin + G.rng() * (CFG.bot.reactionMax - CFG.bot.reactionMin);
        }
        b.target = best;
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
      if (b.state !== 'engage') { b.state = 'hold'; b.destNode = bomb.site === 'A' ? SITE_NODE.A : SITE_NODE.B; }
    } else if (b.team === 'def' && bomb.state === 'planted') {
      const d = Math.hypot(b.pos.x - bomb.pos.x, b.pos.z - bomb.pos.z);
      if (d < 1.6 && b.state !== 'engage') {
        b.state = 'defuse';
      } else if (b.state !== 'engage' && b.state !== 'defuse') {
        b.state = 'route';
        // Route to the node nearest the bomb, not the site node. The carrier plants
        // wherever it stands inside the 6x6 site (up to 4.2 m from the site node), and
        // routing to the site node alone left defenders oscillating route<->hold, never within the 1.6 m defuse range.
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
    // Plant/defuse progress is lost the moment the bot stops planting or defusing: it must hold still and uninterrupted for the full time.
    if (b.state !== 'plant') b.plantT = 0;
    if (b.state !== 'defuse') b.defuseT = 0;
    if (b.state === 'engage' && b.target && b.target.alive) {
      const t = b.target;
      _tmp.set(t.pos.x - b.pos.x, 0, t.pos.z - b.pos.z);
      const targetYaw = Math.atan2(-_tmp.x, -_tmp.z);
      let dy = targetYaw - b.yaw;
      b.yaw += Math.atan2(Math.sin(dy), Math.cos(dy)) * Math.min(1, dt * 10);
      b.reactT -= dt;
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = G.rng() < 0.5 ? -1 : 1; b.strafeT = 0.7 + G.rng() * 0.8; }
      b.vel.set(Math.cos(b.yaw) * b.strafe * 0.9, 0, -Math.sin(b.yaw) * b.strafe * 0.9);
      if (b.reactT <= 0 && G.round.state === 'live') botShoot(G, b, dt);
    } else if (b.state === 'route') {
      // Defender closing on a planted bomb: once close, steer straight at the bomb
      // instead of the next path node. The nearest node can still sit >1.6 m from an
      // off-centre plant, so node routing alone cannot close the last metres; the direct
      // walk finishes the job with no route<->hold oscillation at the site node.
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
    // Walk cycle: legs swing while moving, arms counter-swing gently (sw*0.2) around
    // their held-gun pose. The swing is 0.75 rad (was 0.5): the feet lift ~0.15 m
    // and step ~0.37 m, so the stride reads at distance — and the blue legs make it
    // visible against the grey ground. The body bobs ~0.03 m on the same phase.
    // The hands are 0.6-0.8 m from the shoulder pivot, so the arm swing stays small
    // or the hands would slide off the gun. Pure trig on existing state — no
    // allocation, no gameplay effect; idle bots return to the base pose.
    const spd = Math.hypot(b.vel.x, b.vel.z);
    const ph = G.time * 9 + b.id * 1.7;
    const sw = spd > 0.5 ? Math.sin(ph) * 0.75 : 0;
    b.legL.rotation.x = sw;
    b.legR.rotation.x = -sw;
    b.armL.rotation.x = -sw * 0.2;
    b.armR.rotation.x = sw * 0.2;
    b.mesh.position.y = spd > 0.5 ? Math.abs(Math.sin(ph)) * 0.03 : 0;
  }
}

// Collision + gravity for a bot (flat map: y stays 0).
function moveBot(G, b, dt) {
  resolveMove(b.pos, CFG.player.radius, 1.7, b.vel, dt, G.world.colliders);
  b.vel.y = 0;
  if (b.pos.y < 0) b.pos.y = 0;
}
