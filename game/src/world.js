// world.js — the STEAMWORKS map: a decommissioned geothermal plant, 40x40 m. Two bomb
// sites (A Turbine Hall NW, B Cooling Tower NE), three lanes (A-long west, mid centre,
// B-short east). Every wall box is both mesh and collider. Also owns shared movement collision (AABB agents) and wall raycasts.
import * as THREE from 'three';
import { PAL } from './palette.js';

const _b = new THREE.Box3();
const _v = new THREE.Vector3();

// --- Procedural paint (v6-visual) -------------------------------------
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
    const code = ['A-01', 'B-02', 'C-03', 'D-04', 'E-05', 'F-06'][idx % 6];
    x.save();
    x.translate(w / 2, h / 2);
    x.rotate(-0.08);
    x.font = 'bold 64px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,0.32)';
    x.fillText(code, 0, -14);
    x.font = 'bold 22px sans-serif';
    x.fillStyle = 'rgba(255,255,255,0.30)';
    x.fillText('KEEP CLEAR', 0, 34);
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
function wallTexture(base, idx) {
  return canvasTex(256, 256, (x, w, h) => {
    const rnd = srand(0x9a11 + idx * 104729);
    x.fillStyle = css(base);
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const g = x.createRadialGradient(rnd() * w, rnd() * h, 4, rnd() * w, rnd() * h, 50 + rnd() * 60);
      g.addColorStop(0, 'rgba(0,0,0,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
    x.fillStyle = 'rgba(0,0,0,0.20)';
    for (let i = 1; i < 4; i++) x.fillRect((i * w) / 4 - 2, 0, 4, h);
    x.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 1; i < 4; i++) for (let ry = 16; ry < h - 16; ry += 42) {
      x.beginPath(); x.arc((i * w) / 4, ry, 2, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 9; i++) {
      const sx = rnd() * w;
      x.fillStyle = 'rgba(30,25,18,0.16)';
      x.fillRect(sx, 0, 2 + rnd() * 3, 30 + rnd() * 110);
    }
    x.strokeStyle = 'rgba(0,0,0,0.30)';
    x.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      let px = rnd() * w, py = rnd() * h * 0.5;
      x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 5; j++) { px += (rnd() - 0.5) * 26; py += 12 + rnd() * 22; x.lineTo(px, py); }
      x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 6; i++) {
      const sy = rnd() * h;
      x.beginPath(); x.moveTo(rnd() * w, sy); x.lineTo(rnd() * w, sy + (rnd() - 0.5) * 30); x.stroke();
    }
    const bg = x.createLinearGradient(0, h - 90, 0, h);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(20,16,10,0.35)');
    x.fillStyle = bg;
    x.fillRect(0, h - 90, w, 90);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0, h - 30, w, 30);
    x.fillStyle = 'rgba(255,255,255,0.08)';
    x.fillRect(0, 0, w, 12);
    // Clean-street yellow band at chest height (~38% up the 4.6 m wall).
    x.fillStyle = css(PAL.hazard);
    x.globalAlpha = 0.92;
    x.fillRect(0, h * 0.60, w, 20);
    x.globalAlpha = 0.85;
    x.fillRect(0, h - 8, w, 8);
    x.globalAlpha = 1;
    for (let i = 0; i < 350; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
      x.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  });
}
function crateTexture(kind, idx) {
  return canvasTex(256, 256, (x, w, h) => {
    const rnd = srand(0xc4a7e + idx * 31337);
    if (kind === 'wood') {
      // Yellow crate (clean-street accent): the dark wood frame stays, so the
      // planks read as a crate, not a flat yellow box. Pallets share this texture.
      x.fillStyle = css(PAL.hazard);
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        const y = (i * h) / 4;
        x.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.07)';
        x.fillRect(0, y, w, h / 4);
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.fillRect(0, y, w, 3);
      }
      x.fillStyle = css(PAL.woodDark);
      x.fillRect(0, 0, 14, h);
      x.fillRect(w - 14, 0, 14, h);
      x.fillRect(0, 0, w, 14);
      x.fillRect(0, h - 14, w, 14);
      x.fillStyle = 'rgba(0,0,0,0.4)';
      for (const [nx, ny] of [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24]]) {
        x.beginPath(); x.arc(nx, ny, 4, 0, Math.PI * 2); x.fill();
      }
      x.save();
      x.translate(w / 2, h / 2);
      x.font = 'bold 40px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = 'rgba(255,255,255,0.30)';
      x.fillText(['A-01', 'B-02', 'C-03', 'D-04'][idx % 4], 0, -24);
      x.fillStyle = 'rgba(255,255,255,0.30)';
      x.beginPath();
      x.moveTo(0, 44); x.lineTo(-16, 62); x.lineTo(-6, 62); x.lineTo(-6, 78);
      x.lineTo(6, 78); x.lineTo(6, 62); x.lineTo(16, 62);
      x.closePath(); x.fill();
      x.restore();
      for (let i = 0; i < 250; i++) {
        x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
        x.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    } else {
      x.fillStyle = css(PAL.metal);
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 1; i < 4; i++) x.fillRect((i * w) / 4 - 2, 0, 4, h);
      x.fillStyle = css(PAL.metalDark);
      x.fillRect(0, 0, w, 10);
      x.fillRect(0, h - 10, w, 10);
      x.fillStyle = 'rgba(255,255,255,0.25)';
      for (const [rx, ry] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) {
        x.beginPath(); x.arc(rx, ry, 4, 0, Math.PI * 2); x.fill();
      }
      x.save();
      x.translate(w / 2, h / 2);
      x.font = 'bold 58px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = 'rgba(255,255,255,0.32)';
      x.fillText(['A-01', 'B-02', 'C-03', 'D-04'][idx % 4], 0, -12);
      x.font = 'bold 24px sans-serif';
      x.fillStyle = 'rgba(216,180,0,0.55)';
      x.fillText('DANGER', 0, 34);
      x.restore();
      for (let i = 0; i < 250; i++) {
        x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
        x.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    }
  });
}
function signTexture(letter, color) {
  return canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = css(PAL.trimDark);
    x.fillRect(0, 0, w, h);
    x.fillStyle = css(PAL.hazard);
    x.fillRect(0, 0, w, 16);
    x.fillRect(0, h - 16, w, 16);
    x.font = 'bold 150px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = css(color);
    x.fillText(letter, w / 2, h / 2 - 18);
    x.font = 'bold 44px sans-serif';
    x.fillStyle = 'rgba(233,230,223,0.9)';
    x.fillText('BOMBSITE', w / 2, h - 62);
  });
}
// The scene's background stays PAL.sky (the playtest asserts it); the dome is what the player sees.
function skyTexture() {
  return canvasTex(64, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4f8fd0');
    g.addColorStop(0.55, '#8ec4ea');
    g.addColorStop(0.85, '#cfe4f5');
    g.addColorStop(1, '#d6e8f7');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
}
function ventTexture() {
  return canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = css(PAL.trimDark);
    x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 0; i < 5; i++) x.fillRect(14, 14 + i * 22, w - 28, 9);
    x.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 5; i++) x.fillRect(14, 14 + i * 22, w - 28, 2);
    x.fillStyle = 'rgba(255,255,255,0.25)';
    for (const [rx, ry] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]]) {
      x.beginPath(); x.arc(rx, ry, 3, 0, Math.PI * 2); x.fill();
    }
  });
}
function labelTexture(kind, letter) {
  return canvasTex(256, 128, (x, w, h) => {
    if (kind === 'danger') {
      x.fillStyle = '#16181c';
      x.fillRect(0, 0, w, h);
      x.fillStyle = css(PAL.hazard);
      for (let i = -h; i < w + h; i += 32) {
        x.beginPath();
        x.moveTo(i, h); x.lineTo(i + 16, 0); x.lineTo(i + 32, 0); x.lineTo(i + 16, h);
        x.closePath(); x.fill();
      }
      x.fillStyle = '#16181c';
      x.fillRect(18, 34, w - 36, 60);
      x.font = 'bold 44px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = '#e9e6df';
      x.fillText('DANGER', w / 2, 65);
    } else {
      x.fillStyle = css(PAL.trimDark);
      x.fillRect(0, 0, w, h);
      x.fillStyle = css(PAL.hazard);
      x.fillRect(0, 0, w, 10);
      x.fillRect(0, h - 10, w, 10);
      x.fillStyle = letter === 'A' ? css(PAL.siteA) : css(PAL.siteB);
      x.beginPath();
      x.moveTo(150, 24); x.lineTo(150, 48); x.lineTo(216, 64); x.lineTo(150, 80);
      x.lineTo(150, 104); x.lineTo(96, 104); x.lineTo(96, 24);
      x.closePath(); x.fill();
      x.font = 'bold 64px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(letter, 56, 66);
    }
  });
}
// Canvas (cx, cy) maps straight to world (x = cx/1024*40-20, z = cy/1024*40-20): canvas top is world north.
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
    x.strokeStyle = 'rgba(0,0,0,0.16)';
    x.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      x.beginPath(); x.moveTo((i * S) / 4, 0); x.lineTo((i * S) / 4, S); x.stroke();
      x.beginPath(); x.moveTo(0, (i * S) / 4); x.lineTo(S, (i * S) / 4); x.stroke();
    }
    x.strokeStyle = 'rgba(0,0,0,0.14)';
    x.lineWidth = 9;
    for (let i = 0; i < 5; i++) {
      const cx0 = rnd() * S, cy0 = rnd() * S, r = 90 + rnd() * 160;
      x.beginPath();
      x.arc(cx0, cy0, r, rnd() * Math.PI, rnd() * Math.PI + 0.9 + rnd() * 0.9);
      x.stroke();
    }
    for (let i = 0; i < 3; i++) {
      x.fillStyle = 'rgba(15,20,28,0.22)';
      x.beginPath();
      x.ellipse(rnd() * S, rnd() * S, 50 + rnd() * 60, 26 + rnd() * 30, rnd() * Math.PI, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = 'rgba(0,0,0,0.28)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      let px = rnd() * S, py = rnd() * S;
      x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 6; j++) { px += (rnd() - 0.5) * 120; py += (rnd() - 0.5) * 120; x.lineTo(px, py); }
      x.stroke();
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
    x.font = 'bold 200px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(240,168,48,0.68)';
    x.fillText('A', X(-13), Z(-12));
    x.fillStyle = 'rgba(62,198,184,0.68)';
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

// Rounded-box geometry (v6-visual): a subdivided box whose corner vertices are pulled
// onto a sphere of radius r around the inner box, so the silhouette reads bevelled while
// the bounding box — and the Box3 collider built from the same [cx, cz, w, d, h] — is
// identical. Cached per dimension; only the mesh changes, never the collider.
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
  [-16, 4, 1.6, 1.6, 1.2], [-16, -6, 2, 1, 1.4],
  [0, 6, 2, 2, 1.2], [0, -2, 1, 1, 4.6],
  [16, 4, 1.6, 1.6, 1.2], [16, -6, 2, 1, 1.4],
  [-12, -2, 1.6, 1.6, 1.2], [12, -2, 1.6, 1.6, 1.2],
  [-6, 15, 2, 1.4, 1.2], [6, 15, 2, 1.4, 1.2],
  // Site A turbine block + crates (turbine block wears the warm accent).
  [-14, -15, 4, 3, 2.2, PAL.turbine], [-10.5, -14.5, 1.4, 1.4, 1.1], [-16.5, -10, 1.4, 1.4, 1.1],
  // Site B tower base + crates (tower base wears the cool accent).
  [14, -15, 4, 4, 2.6, PAL.coolant], [10.5, -14.5, 1.4, 1.4, 1.1], [16.5, -10, 1.4, 1.4, 1.1],
  [0, -17, 2, 1.4, 1.2],
];

// Blob contact shadow (lighting round): one shared radial-gradient
// texture; each blob is a flat quad at y 0.02, so feet and crate bases
// ground into the floor without a second shadow pass. The gradient is
// BLACK with an ALPHA falloff (opaque-ish centre -> transparent edge)
// under NormalBlending — the standard blob-shadow technique. NOTE: the
// first version used MultiplyBlending with a black->white RGB gradient,
// but in this vendored three.js build (r187, SwiftShader) a multiply
// quad renders as its texture shown directly — a bright white square —
// so multiply is unusable here; verified with an isolated test page
// (multiply and normal quads rendered identically). Normal + alpha is
// what actually darkens the floor.
let _blobTex = null;
let _blobMat = null;
export function makeBlobShadow(w, d) {
  if (!_blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    _blobTex = new THREE.CanvasTexture(c);
  }
  _blobMat ??= new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, blending: THREE.NormalBlending, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), _blobMat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.y = 0.02;
  m.renderOrder = 1;
  m.userData.blob = true;
  return m;
}

// Procedural daylight environment map (lighting round): a tiny scene of emissive panels
// — bright sky above, warm ground below, one hot panel at the sun's azimuth, one cool strip
// opposite — baked once at boot through PMREMGenerator into scene.environment, so every
// standard material finally has something to reflect. No HDR file, no network, no examples/jsm import. Returns the generation time in ms.
export function applyDaylightEnv(scene, renderer) {
  const t0 = performance.now();
  const env = new THREE.Scene();
  const panel = (w, h, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    env.add(m);
    return m;
  };
  const sky = panel(40, 40, new THREE.Color(0.55, 0.8, 1.35));
  sky.position.y = 12; sky.rotation.x = Math.PI / 2; // faces down
  const ground = panel(40, 40, new THREE.Color(0.5, 0.38, 0.24));
  ground.position.y = -12; ground.rotation.x = -Math.PI / 2; // faces up
  const sunPanel = panel(7, 7, new THREE.Color(7.0, 5.4, 3.4));
  sunPanel.position.set(9.2, 7.8, 3.5); sunPanel.lookAt(0, 0, 0);
  const fill = panel(20, 6, new THREE.Color(0.45, 0.65, 1.0));
  fill.position.set(-10, 4, -7); fill.lookAt(0, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 0.65;
  pmrem.dispose();
  return performance.now() - t0;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  const mats = {};
  const mat = (c) => (mats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0.08 }));
  const containerMats = {};
  const containerMat = (color, idx) => (containerMats[color] ??= new THREE.MeshStandardMaterial({
    map: containerTexture(color, idx), roughness: 0.85, metalness: 0.12,
  }));
  const wallMats = [wallTexture(PAL.wall, 0), wallTexture(PAL.wallAlt, 1)].map(
    (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0.08 }));
  // The outer shell is 41 m long: its texture repeats 4x so the panel seams stay crisp. Horizontal tiling only — base/top bands and hazard strip stay put.
  const shellTex = wallTexture(PAL.wall, 0);
  shellTex.wrapS = shellTex.wrapT = THREE.RepeatWrapping;
  shellTex.repeat.set(4, 1);
  const shellMat = new THREE.MeshStandardMaterial({ map: shellTex, roughness: 0.92, metalness: 0.08 });
  const colliders = [];
  const solids = [];
  // Every box is a rounded mesh (same bounding box) over the same Box3 collider it always had: the bevel is visual only.
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  addBox(0, -20, 41, 1, 4.6, PAL.wall, 0, shellMat);
  addBox(0, 20, 41, 1, 4.6, PAL.wall, 0, shellMat);
  addBox(-20, 0, 1, 41, 4.6, PAL.wall, 0, shellMat);
  addBox(20, 0, 1, 41, 4.6, PAL.wall, 0, shellMat);
  WALLS.forEach(([cx, cz, w, d, h], i) => addBox(cx, cz, w, d, h, i % 2 ? PAL.wallAlt : PAL.wall, 0, wallMats[i % 2]));
  // Cover props wear container paint, cycling the palette so no two neighbours share a colour;
  // turbine/tower keep amber/teal accents. Small 1.4 m crates wear CS:GO-style wood/metal paint instead (alternating). Same boxes, same colliders — only the texture swaps.
  const crateMats = {};
  const crateMat = (kind, idx) => (crateMats[`${kind}${idx}`] ??= new THREE.MeshStandardMaterial({
    map: crateTexture(kind, idx), roughness: 0.9, metalness: kind === 'metal' ? 0.25 : 0.05,
  }));
  let crateCount = 0;
  COVER.forEach(([cx, cz, w, d, h, col], i) => {
    const color = col ?? PAL.container[i % PAL.container.length];
    if (!col && w <= 1.6 && d <= 1.6 && h <= 1.4) {
      const kind = crateCount % 2 === 0 ? 'wood' : 'metal';
      addBox(cx, cz, w, d, h, color, 0, crateMat(kind, crateCount));
      crateCount++;
    } else {
      addBox(cx, cz, w, d, h, color, 0, containerMat(color, i));
    }
  });
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
  for (const x of [-19.2, 19.2]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 38, 8), mat(PAL.pipe));
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 3.9, 0);
    group.add(pipe);
  }
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
  // They sit at y 3.4..4.6, above every agent's head, and are NEVER added to solids/colliders: they cannot block movement or bullets. [cx, cz, w, d] per lintel.
  const lintelMat = mat(PAL.trimDark);
  let lintelCount = 0;
  for (const [lx, lz, lw, ld] of [
    [-16, 12, 4, 1.2], [0, 12, 6, 1.2], [16, 12, 4, 1.2],
    [0, -8, 4, 1.2], [-8, 0, 1.2, 4], [8, 0, 1.2, 4],
  ]) {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(lw, 1.2, ld), lintelMat);
    lintel.position.set(lx, 4.0, lz);
    lintel.castShadow = true;
    group.add(lintel);
    lintelCount++;
  }
  // Bombsite signs (v7-visual): big "A / BOMBSITE" and "B / BOMBSITE" boards
  // on the north wall above each site, like CS:GO site signage. Flat planes, visual only.
  let signCount = 0;
  for (const [letter, sx, color] of [['A', -13, PAL.siteA], ['B', 13, PAL.siteB]]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5),
      new THREE.MeshStandardMaterial({ map: signTexture(letter, color), roughness: 0.8 }));
    sign.position.set(sx, 3.3, -19.44);
    group.add(sign);
    signCount++;
  }
  // Barrels on crate tops (v6-visual): cylinders sitting exactly on existing
  // cover footprints — no new walkable-space intrusion. Visual only (not in
  // `solids`, so no LOS or gameplay change). [x, z, crate-top-y, colour-index]
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
  // collider-free (group only, never solids/colliders), so nothing blocks
  // movement, bullets, or sightlines. Counts in the decor object below.
  let palletCount = 0;
  const palletMat = crateMat('wood', 9);
  for (const [px, pz, rz] of [[-19.32, -6, 0.2], [-19.32, 8, 0.2], [19.32, -6, -0.2], [19.32, 8, -0.2]]) {
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 1.3), palletMat);
    pallet.position.set(px, 0.55, pz);
    pallet.rotation.z = rz;
    group.add(pallet);
    palletCount++;
  }
  let ventCount = 0;
  const ventMat = new THREE.MeshStandardMaterial({ map: ventTexture(), roughness: 0.9, metalness: 0.2 });
  for (const [vx, vy, vz, ry] of [[-8, 3.2, -19.44, 0], [8, 3.2, 19.44, Math.PI], [-19.44, 3.2, 4, Math.PI / 2], [19.44, 3.2, -4, -Math.PI / 2]]) {
    const vent = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), ventMat);
    vent.position.set(vx, vy, vz);
    vent.rotation.y = ry;
    group.add(vent);
    ventCount++;
  }
  let cableCount = 0;
  const cableMat = mat(PAL.trimDark);
  for (const [cx, cy, cz, rx, rz] of [[0, 4.15, -19.3, 0, Math.PI / 2], [0, 4.15, 19.3, 0, Math.PI / 2], [-19.3, 4.15, 0, Math.PI / 2, 0], [19.3, 4.15, 0, Math.PI / 2, 0]]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 38, 6), cableMat);
    cable.rotation.x = rx;
    cable.rotation.z = rz;
    cable.position.set(cx, cy, cz);
    group.add(cable);
    cableCount++;
  }
  let lampCount = 0;
  const shadeMat = mat(PAL.trimDark);
  const bulbMat = new THREE.MeshBasicMaterial({ color: PAL.lamp });
  for (const [lx, lz] of [[-16, 12], [0, 12], [16, 12], [0, -8]]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), cableMat);
    cord.position.set(lx, 3.65, lz);
    group.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 10), shadeMat);
    shade.position.set(lx, 3.32, lz);
    group.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), bulbMat);
    bulb.position.set(lx, 3.22, lz);
    group.add(bulb);
    lampCount++;
  }
  let pipeCount = 3;
  for (const [px, pz] of [[-19.35, -19.35], [19.35, -19.35]]) {
    const vp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.6, 8), pipeMat);
    vp.position.set(px, 2.3, pz);
    group.add(vp);
    pipeCount++;
  }
  const pipeNorth = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 38, 8), pipeMat);
  pipeNorth.rotation.z = Math.PI / 2;
  pipeNorth.position.set(0, 3.9, -19.2);
  group.add(pipeNorth);
  pipeCount++;
  let wallSignCount = 0;
  const dangerMat = new THREE.MeshStandardMaterial({ map: labelTexture('danger'), roughness: 0.85 });
  const arrowAMat = new THREE.MeshStandardMaterial({ map: labelTexture('arrow', 'A'), roughness: 0.85 });
  const arrowBMat = new THREE.MeshStandardMaterial({ map: labelTexture('arrow', 'B'), roughness: 0.85 });
  for (const [sx, sy, sz, ry, sm] of [
    [-5, 2.2, 12.52, 0, dangerMat], [5, 2.2, -7.44, 0, dangerMat],
    [-19.44, 2.2, 0, Math.PI / 2, arrowAMat], [8, 2.2, -19.44, 0, arrowBMat],
  ]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), sm);
    sign.position.set(sx, sy, sz);
    sign.rotation.y = ry;
    group.add(sign);
    wallSignCount++;
  }
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
  // Visual only (flat planes, no colliders, no solids).
  const laneMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false });
  for (const [x, c] of [[-16, PAL.siteA], [0, 0xcfd6da], [16, PAL.siteB]]) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 21), laneMat(c));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(x, 0.015, 1.5);
    group.add(lane);
  }
  for (const s of Object.values(sites)) {
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const corner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.4, depthWrite: false }));
      corner.rotation.x = -Math.PI / 2;
      corner.position.set(s.center.x + dx, 0.025, s.center.z + dz);
      group.add(corner);
    }
  }
  const steamMat = new THREE.MeshBasicMaterial({ color: PAL.steam, transparent: true, opacity: 0.12, depthWrite: false });
  const steam = [];
  for (const [x, z, s] of [[-14, -13, 2.2], [14, -13, 2.6], [-16, 4, 1.4], [16, 4, 1.4], [0, -2, 1.6], [0, 8, 1.6], [-6, 15, 1.4]]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), steamMat.clone());
    puff.position.set(x, 1.6, z);
    group.add(puff);
    steam.push(puff);
  }
  // (scene.background stays PAL.sky — the playtest asserts it). Hazy
  // industrial silhouettes rise above the walls, all collider-free, outside the shell.
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  group.add(skyDome);
  const skylineMat = new THREE.MeshStandardMaterial({ color: PAL.skyline, roughness: 1, metalness: 0 });
  let skylineCount = 0;
  for (const [sx, sz, w, h, d, cyl] of [
    [-30, -28, 5, 12, 5, 1], [28, -32, 6, 15, 6, 1], [-34, 20, 5, 10, 5, 1], [32, 26, 5.5, 13, 5.5, 1],
    [-26, 30, 2.6, 22, 2.6, 1], [30, -18, 3.0, 19, 3.0, 1], [0, -36, 2.4, 24, 2.4, 1],
    [-38, 0, 16, 7, 8, 0], [38, 6, 14, 6, 8, 0], [0, 38, 18, 8, 8, 0],
  ]) {
    const shape = cyl
      ? new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 10), skylineMat)
      : new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skylineMat);
    shape.position.set(sx, h / 2, sz);
    group.add(shape);
    skylineCount++;
  }
  // Lighting round: the env map adds ambient light, so the hemisphere comes
  // down 2.0 -> 0.75 and the sun goes up 3.2 -> 3.8 (key dominates fill ~5:1,
  // was 1.6:1), so sun shadows read and the yard stops looking washed out.
  scene.add(new THREE.HemisphereLight(0xbfd9f2, 0x9a7a55, 0.75));
  const sun = new THREE.DirectionalLight(PAL.sun, 3.8);
  sun.position.set(26, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Shadow tuning (lighting round): no more acne on the flat floor, softer edges, shadows glued to feet.
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  group.add(sun);
  const lampA = new THREE.PointLight(PAL.siteA, 18, 16);
  lampA.position.set(-13, 3.4, -12);
  group.add(lampA);
  const lampB = new THREE.PointLight(PAL.siteB, 18, 16);
  lampB.position.set(13, 3.4, -12);
  group.add(lampB);
  const lampMid = new THREE.PointLight(0xffd9a0, 12, 14);
  lampMid.position.set(0, 3.4, 4);
  group.add(lampMid);
  const lampYard = new THREE.PointLight(PAL.siteB, 10, 12);
  lampYard.position.set(0, 3.4, 16);
  group.add(lampYard);
  // Blob contact shadows (lighting round): soft grounding under the floor-standing
  // machines and the big crates. Bots get theirs in bots.js (scene-level quads that follow b.pos). [x, z, w, d].
  for (const [bx, bz, bw, bd] of [
    [-14, -15, 4.8, 3.8], [14, -15, 5.0, 5.0], [0, -2, 2.0, 2.0],
    [-16, 4, 2.4, 2.4], [0, 6, 2.8, 2.8], [16, 4, 2.4, 2.4],
    [-6, 15, 2.8, 2.2], [6, 15, 2.8, 2.2],
  ]) {
    const blob = makeBlobShadow(bw, bd);
    blob.position.set(bx, 0.02, bz);
    group.add(blob);
  }
  scene.add(group);
  scene.fog = new THREE.Fog(PAL.skyHorizon, 35, 95);
  const spawns = {
    atk: [[-4, 17], [-2, 18], [0, 16.5], [2, 18], [4, 17]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    def: [[-4, -17], [-2, -18], [0, -15], [2, -18], [4, -17]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
  };
  return {
    group, colliders, solids, spawns, sites, steam, drum,
    // Visual-only decor counts, for the playtest to assert the new look rendered.
    // Nothing here feeds the sim.
    decor: { barrels: barrelCount, pipesNew: pipeCount, floorTextured: true, containerColors: PAL.container.length, crates: crateCount, lintels: lintelCount, siteSigns: signCount, pallets: palletCount, vents: ventCount, cables: cableCount, lamps: lampCount, wallSigns: wallSignCount, skyline: skylineCount, skyDome: true },
  };
}

// Move an AABB agent (feet `p`, half extents `r`, height `h`) by velocity `v` over dt, sliding along walls. Returns true if it hit a wall.
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
  p.y += v.y * dt;
  if (p.y < 0) { p.y = 0; v.y = 0; }
  return hit;
}

const _ray = new THREE.Raycaster();
export function losBlocked(a, b, solids) {
  _v.subVectors(b, a);
  const dist = _v.length();
  if (dist < 0.01) return false;
  _ray.set(a, _v.normalize());
  _ray.far = dist;
  return _ray.intersectObjects(solids, false).length > 0;
}
