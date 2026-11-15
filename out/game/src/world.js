// world.js — the STEAMWORKS map: a decommissioned geothermal plant, 40x40 m.
// Two bomb sites (A Turbine Hall NW, B Cooling Tower NE), three lanes
// (A-long west, mid centre, B-short east), attackers spawn south, defenders
// spawn north. Walls are boxes; every box is both mesh and collider.
// Also owns shared movement collision (agents are AABBs) and wall raycasts.
import * as THREE from 'three';
import { PAL } from './palette.js';

const _b = new THREE.Box3();
const _v = new THREE.Vector3();

// [cx, cz, w, d, h, colour] — interior walls and cover. Outer shell added below.
const WALLS = [
  // Spawn divider (z=12) with three lane entries.
  [-19, 12, 2, 1, 4.6], [-8.5, 12, 11, 1, 4.6], [8.5, 12, 11, 1, 4.6], [19, 12, 2, 1, 4.6],
  // Mid dividers (x=+-8) with a connector gap at z -2..2.
  [-8, 7, 1, 10, 4.6], [-8, -5, 1, 6, 4.6], [8, 7, 1, 10, 4.6], [8, -5, 1, 6, 4.6],
  // Mid exit wall (z=-8) with a central gap.
  [-5, -8, 6, 1, 4.6], [5, -8, 6, 1, 4.6],
];
const COVER = [
  // A-long
  [-16, 4, 1.6, 1.6, 1.2], [-16, -6, 2, 1, 1.4],
  // Mid
  [0, 6, 2, 2, 1.2], [0, -2, 1, 1, 4.6],
  // B-short
  [16, 4, 1.6, 1.6, 1.2], [16, -6, 2, 1, 1.4],
  // Connectors
  [-12, -2, 1.6, 1.6, 1.2], [12, -2, 1.6, 1.6, 1.2],
  // Attacker yard
  [-6, 15, 2, 1.4, 1.2], [6, 15, 2, 1.4, 1.2],
  // Site A turbine block + crates (turbine block wears the warm accent).
  [-14, -15, 4, 3, 2.2, PAL.turbine], [-10.5, -14.5, 1.4, 1.4, 1.1], [-16.5, -10, 1.4, 1.4, 1.1],
  // Site B tower base + crates (tower base wears the cool accent).
  [14, -15, 4, 4, 2.6, PAL.coolant], [10.5, -14.5, 1.4, 1.4, 1.1], [16.5, -10, 1.4, 1.4, 1.1],
  // Defender yard
  [0, -17, 2, 1.4, 1.2],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  const mats = {};
  const mat = (c) => (mats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0.08 }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const colliders = [];
  const solids = [];
  const addBox = (cx, cz, w, d, h, color, y0 = 0) => {
    const m = new THREE.Mesh(boxGeo, mat(color));
    m.scale.set(w, h, d);
    m.position.set(cx, y0 + h / 2, cz);
    m.castShadow = h > 1.5;
    m.receiveShadow = true;
    group.add(m);
    solids.push(m);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - w / 2, y0, cz - d / 2),
      new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2),
    ));
    return m;
  };
  // Floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat(PAL.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // Outer shell.
  addBox(0, -20, 41, 1, 4.6, PAL.wall);
  addBox(0, 20, 41, 1, 4.6, PAL.wall);
  addBox(-20, 0, 1, 41, 4.6, PAL.wall);
  addBox(20, 0, 1, 41, 4.6, PAL.wall);
  // Walls alternate two close shades so the long runs read as panels,
  // not one flat slab (v6-full, fix 3; geometry and colliders unchanged).
  WALLS.forEach(([cx, cz, w, d, h], i) => addBox(cx, cz, w, d, h, i % 2 ? PAL.wallAlt : PAL.wall));
  for (const [cx, cz, w, d, h, col] of COVER) addBox(cx, cz, w, d, h, col ?? PAL.wallTop);
  // Turbine (site A): warm block + spinning drum visual; Cooling tower (site B).
  // Both glow faintly from within (v6-full, fix 3): the sites read as
  // machines, not grey boxes.
  const drumMat = new THREE.MeshStandardMaterial({ color: PAL.turbine, roughness: 0.55, metalness: 0.4, emissive: 0x7a4d08, emissiveIntensity: 0.5 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 12), drumMat);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(-14, 3.6, -15);
  drum.castShadow = true;
  group.add(drum);
  const towerMat = new THREE.MeshStandardMaterial({ color: PAL.coolant, roughness: 0.6, metalness: 0.3, emissive: 0x0a3d38, emissiveIntensity: 0.6 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 5.5, 12, 1, true), towerMat);
  tower.position.set(14, 2.75, -15);
  group.add(tower);
  // Pipes along the west and east walls (visual, above head height).
  for (const x of [-19.2, 19.2]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 38, 8), mat(PAL.pipe));
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 3.9, 0);
    group.add(pipe);
  }
  // Site plant zones: floor markings + glow strips.
  const sites = {
    A: { center: new THREE.Vector3(-13, 0, -12), size: 6, color: PAL.siteA },
    B: { center: new THREE.Vector3(13, 0, -12), size: 6, color: PAL.siteB },
  };
  for (const s of Object.values(sites)) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(s.size, s.size),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.16 }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(s.center.x, 0.02, s.center.z);
    group.add(mark);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(s.size, 0.08, 0.18),
      new THREE.MeshBasicMaterial({ color: s.color }));
    strip.position.set(s.center.x, 0.05, s.center.z - s.size / 2);
    group.add(strip);
  }
  // Lane guide strips (v6-full, fix 3): flat floor paint along the three
  // lanes, tinted by the site they lead to. Visual only (flat planes, no
  // colliders, no solids): they cannot block movement or bullets.
  const laneMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false });
  for (const [x, c] of [[-16, PAL.siteA], [0, 0xcfd6da], [16, PAL.siteB]]) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 21), laneMat(c));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(x, 0.015, 1.5);
    group.add(lane);
  }
  // Site corner brackets (v6-full, fix 3): flat floor paint marking the
  // plant zone corners, in the site colour. Visual only.
  for (const s of Object.values(sites)) {
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const corner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.4, depthWrite: false }));
      corner.rotation.x = -Math.PI / 2;
      corner.position.set(s.center.x + dx, 0.025, s.center.z + dz);
      group.add(corner);
    }
  }
  // Steam vents: translucent puffs that pulse (animated in main loop).
  const steamMat = new THREE.MeshBasicMaterial({ color: PAL.steam, transparent: true, opacity: 0.12, depthWrite: false });
  const steam = [];
  for (const [x, z, s] of [[-14, -13, 2.2], [14, -13, 2.6], [-16, 4, 1.4], [16, 4, 1.4], [0, -2, 1.6], [0, 8, 1.6], [-6, 15, 1.4]]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), steamMat.clone());
    puff.position.set(x, 1.6, z);
    group.add(puff);
    steam.push(puff);
  }
  // Lighting: hemisphere + warm key with shadows + two site point lights.
  // v6-full (fix 3): brighter overall, plus a warm mid-lane lamp and a
  // cool attacker-yard lamp so the dark middle and south stop reading
  // as black voids.
  scene.add(new THREE.HemisphereLight(0x8fa3b8, 0x1a1c20, 1.6));
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(18, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  group.add(sun);
  const lampA = new THREE.PointLight(PAL.siteA, 26, 16);
  lampA.position.set(-13, 3.4, -12);
  group.add(lampA);
  const lampB = new THREE.PointLight(PAL.siteB, 26, 16);
  lampB.position.set(13, 3.4, -12);
  group.add(lampB);
  const lampMid = new THREE.PointLight(0xffd9a0, 12, 14);
  lampMid.position.set(0, 3.4, 4);
  group.add(lampMid);
  const lampYard = new THREE.PointLight(PAL.siteB, 10, 12);
  lampYard.position.set(0, 3.4, 16);
  group.add(lampYard);
  scene.add(group);
  scene.fog = new THREE.Fog(PAL.canvas, 30, 75);
  const spawns = {
    atk: [[-4, 17], [-2, 18], [0, 16.5], [2, 18], [4, 17]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    def: [[-4, -17], [-2, -18], [0, -15], [2, -18], [4, -17]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
  };
  return { group, colliders, solids, spawns, sites, steam, drum };
}

// Move an AABB agent (feet position `p`, half extents `r`, height `h`) by
// velocity `v` over dt, sliding along walls. Returns true if it hit a wall.
export function resolveMove(p, r, h, v, dt, colliders) {
  let hit = false;
  for (const axis of ['x', 'z']) {
    p[axis] += v[axis] * dt;
    _b.min.set(p.x - r, p.y, p.z - r);
    _b.max.set(p.x + r, p.y + h, p.z + r);
    for (const c of colliders) {
      if (_b.intersectsBox(c)) {
        p[axis] -= v[axis] * dt;
        v[axis] = 0;
        hit = true;
        break;
      }
    }
  }
  // Vertical: ground plane only (the map is flat; cover is climbed over nothing).
  p.y += v.y * dt;
  if (p.y < 0) { p.y = 0; v.y = 0; }
  return hit;
}

// True when the segment a->b is blocked by a wall (for bot vision).
const _ray = new THREE.Raycaster();
export function losBlocked(a, b, solids) {
  _v.subVectors(b, a);
  const dist = _v.length();
  if (dist < 0.01) return false;
  _ray.set(a, _v.normalize());
  _ray.far = dist;
  return _ray.intersectObjects(solids, false).length > 0;
}
