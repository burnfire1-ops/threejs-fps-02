// STEAMWORKS — entry program for make.fun threejs-fps-02.
// Node 22, standard library only. Copies game/ and screenshots/ into the
// output directory and writes dossier.json with the kit's buildDossier.
// OUT is /output, or MAKEFUN_OUTPUT_DIR when that is set (local runs).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-threejs.ts';

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve('game'), resolve(out, 'game'), { recursive: true });
cpSync(resolve('screenshots'), resolve(out, 'screenshots'), { recursive: true });
writeFileSync(
  resolve(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
console.log(`wrote ${resolve(out, 'dossier.json')}`);
