// world.js — the STEAMWORKS map: a decommissioned geothermal plant, 40x40 m.
// Two bomb sites (A Turbine Hall NW, B Cooling Tower NE), three lanes
// (A-long west, mid centre, B-short east), attackers spawn south, defenders
// spawn north. Walls are boxes; every box is both mesh and collider.
// Also owns shared movement collision (agents are AABBs) and wall raycasts.
import * as THREE from 'three';
import { PAL } from './palette.js';

const _b = new THREE.Box3();
const _v = new THREE.Vector3();

// --- Procedural paint (v6-visual) -------------------------------------
// Every texture is generated in code from a canvas — no external assets,
// no network. Colours stay inside the palette so the scene stays
// coherent with the dusk-blue sky and the amber/teal site accents.
const css = (c) => '#' + c.toString(16).padStart(6, '0');
function srand(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Container paint: base colour, panel ribs, top light + bottom grime,
// speckle, rust streaks, a big faded stencil number, and two spray
// scribbles (graffiti) in a bright contrasting colour.
function containerTexture(base, idx) {
  return canvasTex(256, 256, (x, w, h) => {
    const rnd = srand(0xc0ffee + idx * 7919);
    x.fillStyle = css(base);
    x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 1; i < 4; i++) x.fillRect((i * w) / 4 - 2, 0, 4, h);
    x.fillStyle = 'rgba(255,255,255,0.10)';
    x.fillRect(0, 0, w, 14);
    x.fillStyle = 'rgba(0,0,0,0.22)';
    x.fillRect(0, h - 22, w, 22);
    for (let i = 0; i < 500; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
      x.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    for (let i = 0; i < 7; i++) {
      const sx = rnd() * w;
      x.fillStyle = 'rgba(70,40,20,0.20)';
      x.fillRect(sx, 0, 3 + rnd() * 4, 40 + rnd() * 90);
    }
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-0.08);
    x.font = 'bold 92px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,0.28)';
    x.fillText(String(10 + idx * 7), 0, 0);
    x.restore();
    const gcol = ['#e8f4ff', '#ffd23e', '#ff5d8f'][idx % 3];
    x.strokeStyle = gcol;
    x.globalAlpha = 0.75;
    x.lineWidth = 5;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(18, h - 58);
    x.bezierCurveTo(60, h - 90, 90, h - 30, 130, h - 62);
    x.bezierCurveTo(160, h - 84, 190, h - 44, 228, h - 66);
    x.stroke();
    x.beginPath();
    x.moveTo(40, h - 40);
    x.bezierCurveTo(90, h - 70, 150, h - 26, 210, h - 48);
    x.stroke();
    x.globalAlpha = 1;
  });
}
// Wall paint: panel seams, a darker base band (baseboard) and a lighter
// top band (cap rail), a hazard kick strip at the very bottom, speckle.
function wallTexture(base, idx) {
  return canvasTex(256, 256, (x, w, h) => {
    const rnd = srand(0x9a11 + idx * 104729);
    x.fillStyle = css(base);
    x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(0,0,0,0.20)';
    for (let i = 1; i < 4; i++) x.fillRect((i * w) / 4 - 2, 0, 4, h);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0, h - 30, w, 30);
    x.fillStyle = 'rgba(255,255,255,0.08)';
    x.fillRect(0, 0, w, 12);
    x.fillStyle = css(PAL.hazard);
    x.globalAlpha = 0.85;
    x.fillRect(0, h - 8, w, 8);
    x.globalAlpha = 1;
    for (let i = 0; i < 350; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
      x.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  });
}
// Floor paint (1024px, one texture for the whole 40x40 floor): concrete
// with speckle and oil stains, amber/teal zone washes at the sites,
// dashed lane lines, hazard frames around both sites, big A/B stencils,
// chevrons at the lane entries. Canvas (cx, cy) maps straight to world
// (x = cx/1024*40-20, z = cy/1024*40-20): canvas top is world north.
function floorTexture() {
  const S = 1024;
  return canvasTex(S, S, (x) => {
    const rnd = srand(0xf10012);
    const X = (wx) => ((wx + 20) / 40) * S;
    const Z = (wz) => ((wz + 20) / 40) * S;
    x.fillStyle = css(PAL.floor);
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
      const s = 2 + rnd() * 5;
      x.fillRect(rnd() * S, rnd() * S, s, s);
    }
    for (let i = 0; i < 14; i++) {
      x.fillStyle = 'rgba(0,0,0,0.10)';
      x.beginPath();
      x.ellipse(rnd() * S, rnd() * S, 30 + rnd() * 70, 20 + rnd() * 50, rnd() * Math.PI, 0, Math.PI * 2);
      x.fill();
    }
    const wash = (wx, wz, r, col) => {
      const g = x.createRadialGradient(X(wx), Z(wz), 0, X(wx), Z(wz), r);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(X(wx) - r, Z(wz) - r, r * 2, r * 2);
    };
    x.globalAlpha = 0.16;
    wash(-13, -12, 230, '#f0a830');
    wash(13, -12, 230, '#3ec6b8');
    wash(0, 16, 200, '#c98a4a');
    x.globalAlpha = 1;
    x.strokeStyle = 'rgba(233,230,223,0.55)';
    x.lineWidth = 5;
    x.setLineDash([26, 22]);
    for (const lx of [-16, 0, 16]) {
      x.beginPath();
      x.moveTo(X(lx), Z(18));
      x.lineTo(X(lx), Z(-8));
      x.stroke();
    }
    x.setLineDash([]);
    x.strokeStyle = 'rgba(233,230,223,0.28)';
    x.lineWidth = 3;
    for (const lx of [-2.5, 2.5]) {
      x.beginPath();
      x.moveTo(X(lx), Z(18));
      x.lineTo(X(lx), Z(-8));
      x.stroke();
    }
    const hazardFrame = (cx, cz, half) => {
      const px = X(cx - half), py = Z(cz - half);
      const pw = X(cx + half) - px, ph = Z(cz + half) - py;
      x.save();
      x.beginPath();
      x.rect(px, py, pw, ph);
      x.rect(px + 14, py + 14, pw - 28, ph - 28);
      x.clip('evenodd');
      x.fillStyle = css(PAL.hazard);
      x.fillRect(px, py, pw, ph);
      x.fillStyle = '#16181c';
      for (let i = -ph; i < pw + ph; i += 28) {
        x.beginPath();
        x.moveTo(px + i, py + ph); x.lineTo(px + i + 14, py);
        x.lineTo(px + i + 28, py); x.lineTo(px + i + 14, py + ph);
        x.closePath(); x.fill();
      }
      x.restore();
    };
    hazardFrame(-13, -12, 3.6);
    hazardFrame(13, -12, 3.6);
    x.font = 'bold 150px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(240,168,48,0.5)';
    x.fillText('A', X(-13), Z(-12));
    x.fillStyle = 'rgba(62,198,184,0.5)';
    x.fillText('B', X(13), Z(-12));
    x.fillStyle = 'rgba(233,230,223,0.4)';
    for (const lx of [-16, 0, 16]) {
      for (const lz of [14, 10]) {
        x.beginPath();
        x.moveTo(X(lx), Z(lz) - 16);
        x.lineTo(X(lx) - 14, Z(lz) + 10);
        x.lineTo(X(lx) + 14, Z(lz) + 10);
        x.closePath(); x.fill();
      }
    }
  });
}

// Rounded-box geometry (v6-visual): a subdivided box whose corner
// vertices are pulled onto a sphere of radius r around the inner box,
// so the silhouette reads bevelled while the bounding box — and the
// Box3 collider built from the same [cx, cz, w, d, h] — is identical.
// Cached per dimension; only the mesh changes, never the collider.
const _rbGeoCache = new Map();
function roundedBoxGeo(w, h, d, r) {
  const key = `${w}|${h}|${d}|${r}`;
  let geo = _rbGeoCache.get(key);
  if (geo) return geo;
  geo = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const pos = geo.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const qx = Math.abs(v.x) - hx, qy = Math.abs(v.y) - hy, qz = Math.abs(v.z) - hz;
    if (qx > 0 || qy > 0 || qz > 0) {
      const cx = Math.max(qx, 0), cy = Math.max(qy, 0), cz = Math.max(qz, 0);
      const len = Math.hypot(cx, cy, cz) || 1;
      const s = r / len;
      v.x = Math.sign(v.x) * (hx + cx * s);
      v.y = Math.sign(v.y) * (hy + cy * s);
      v.z = Math.sign(v.z) * (hz + cz * s);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  _rbGeoCache.set(key, geo);
  return geo;
}

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
  // Textured materials, cached per colour: container paint for cover
  // props, wall paint for walls and the outer shell.
  const containerMats = {};
  const containerMat = (color, idx) => (containerMats[color] ??= new THREE.MeshStandardMaterial({
    map: containerTexture(color, idx), roughness: 0.85, metalness: 0.12,
  }));
  const wallMats = [wallTexture(PAL.wall, 0), wallTexture(PAL.wallAlt, 1)].map(
    (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0.08 }));
  const colliders = [];
  const solids = [];
  // Every box is a rounded mesh (same bounding box) over the same Box3
  // collider it always had: the bevel is visual only.
  const addBox = (cx, cz, w, d, h, color, y0 = 0, material = null) => {
    const m = new THREE.Mesh(roundedBoxGeo(w, h, d, 0.09), material ?? mat(color));
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
  // Floor: painted concrete (one canvas texture, see floorTexture).
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // Outer shell.
  addBox(0, -20, 41, 1, 4.6, PAL.wall, 0, wallMats[0]);
  addBox(0, 20, 41, 1, 4.6, PAL.wall, 0, wallMats[0]);
  addBox(-20, 0, 1, 41, 4.6, PAL.wall, 0, wallMats[0]);
  addBox(20, 0, 1, 41, 4.6, PAL.wall, 0, wallMats[0]);
  // Walls alternate two close shades so the long runs read as panels,
  // not one flat slab (v6-full, fix 3; geometry and colliders unchanged).
  WALLS.forEach(([cx, cz, w, d, h], i) => addBox(cx, cz, w, d, h, i % 2 ? PAL.wallAlt : PAL.wall, 0, wallMats[i % 2]));
  // Cover props wear container paint: each prop takes the next colour of
  // the container palette, so no two neighbours share a colour. The
  // turbine block and tower base keep their amber/teal accents.
  COVER.forEach(([cx, cz, w, d, h, col], i) => {
    const color = col ?? PAL.container[i % PAL.container.length];
    addBox(cx, cz, w, d, h, color, 0, containerMat(color, i));
  });
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
  // More high pipes (v6-visual): one spanning the spawn divider and one
  // down each mid divider, all embedded in the walls at 4.0 m and only
  // visible where they cross the lane entries overhead. Above head
  // height, so they never meet an agent.
  const pipeMat = mat(PAL.pipe);
  const pipeTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 38, 8), pipeMat);
  pipeTop.rotation.z = Math.PI / 2;
  pipeTop.position.set(0, 4.0, 12);
  group.add(pipeTop);
  for (const x of [-8, 8]) {
    const pipeMid = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 20, 8), pipeMat);
    pipeMid.rotation.x = Math.PI / 2;
    pipeMid.position.set(x, 4.0, 2);
    group.add(pipeMid);
  }
  // Barrels on crate tops (v6-visual): cylinders sitting exactly on
  // existing cover footprints — no new walkable-space intrusion. They
  // are visual only (not in `solids`, so no LOS or gameplay change).
  // [x, z, crate-top-y, container-colour-index]
  const barrelSpots = [
    [-10.5, -14.5, 1.1, 0], [10.5, -14.5, 1.1, 1], [16.5, -10, 1.1, 2],
    [-16.5, -10, 1.1, 1], [0, -17, 1.2, 0], [-6, 15, 1.2, 2],
    [6, 15, 1.2, 1], [0, 6, 1.2, 0],
  ];
  const barrelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.85, 12);
  let barrelCount = 0;
  for (const [bx, bz, topY, ci] of barrelSpots) {
    const bmat = new THREE.MeshStandardMaterial({
      map: containerTexture(PAL.container[ci], 20 + ci), roughness: 0.85, metalness: 0.12,
    });
    const barrel = new THREE.Mesh(barrelGeo, bmat);
    barrel.position.set(bx, topY + 0.425, bz);
    barrel.castShadow = true;
    group.add(barrel);
    barrelCount++;
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
  return {
    group, colliders, solids, spawns, sites, steam, drum,
    // Visual-only decor counts (v6-visual), for the playtest to assert
    // the new look actually rendered. Nothing here feeds the sim.
    decor: { barrels: barrelCount, pipesNew: 3, floorTextured: true, containerColors: PAL.container.length },
  };
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
