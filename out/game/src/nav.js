// nav.js — waypoint graph for the bots. Nodes sit at every junction, lane
// entry, site and spawn; edges follow the lanes (never through walls).
// Bots pathfind with BFS and walk node to node with a little jitter.
import * as THREE from 'three';

// [x, z] per node.
const NODES = [
  [0, 17], [-16, 12], [0, 12], [16, 12], // 0 spawn atk, 1 A entry, 2 mid entry, 3 B entry
  [-16, 4], [0, 4], [16, 4], // 4 A-long, 5 mid, 6 B-short
  [-12, -2], [0, -2], [12, -2], // 7 A conn, 8 mid conn, 9 B conn
  [-16, -8], [0, -8], [16, -8], // 10 A north, 11 mid north, 12 B north
  [-13, -12], [13, -12], // 13 site A, 14 site B
  [0, -17], [-8, -14], [8, -14], // 15 spawn def, 16 yard W, 17 yard E
];
const EDGES = [
  [0, 1], [0, 2], [0, 3],
  [1, 4], [2, 5], [3, 6],
  [4, 7], [5, 8], [6, 9],
  [7, 8], [8, 9], [7, 10], [8, 11], [9, 12],
  [10, 13], [12, 14], [11, 15],
  [13, 16], [14, 17], [16, 15], [17, 15], [16, 17],
  [10, 16], [12, 17],
];
export const SITE_NODE = { A: 13, B: 14 };
export const SPAWN_NODE = { atk: 0, def: 15 };
// Corners worth holding (defenders watch them, attackers clear them).
export const HOLD_NODES = [7, 9, 10, 12, 16, 17, 8];

const adj = NODES.map(() => []);
for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }

export function nodePos(i, out = new THREE.Vector3()) {
  return out.set(NODES[i][0], 0, NODES[i][1]);
}

export function nearestNode(x, z) {
  let best = 0; let bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i][0] - x; const dz = NODES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// BFS shortest path of node indices from `from` to `to` (inclusive).
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Array(NODES.length).fill(-1);
  const q = [from];
  prev[from] = from;
  for (let h = 0; h < q.length; h++) {
    const n = q[h];
    for (const m of adj[n]) {
      if (prev[m] === -1) {
        prev[m] = n;
        if (m === to) {
          const path = [to];
          let c = to;
          while (c !== from) { c = prev[c]; path.push(c); }
          return path.reverse();
        }
        q.push(m);
      }
    }
  }
  return [from];
}
