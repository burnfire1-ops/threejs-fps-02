// STEAMWORKS — entry program for make.fun threejs-fps-02.
// Node 22, standard library only. Copies game/ and screenshots/ into the
// output directory and writes dossier.json with the kit's buildDossier.
// OUT is /output, or MAKEFUN_OUTPUT_DIR when that is set (local runs).
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// Resolve game/ and screenshots/ relative to this script's directory,
// not the current working directory: the grader runs `node /bot/main.ts`
// from a different cwd, where resolve('game') would fail with ENOENT.
const here = fileURLToPath(new URL('.', import.meta.url));

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
// Empty the output directory's CONTENTS, never the directory itself:
// the grader runs as a user who can write inside /output but cannot
// remove /output (its parent is not writable by them), so rmSync(out)
// fails with EPERM. The kit starter never removes the out dir either.
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) {
  rmSync(resolve(out, entry), { recursive: true, force: true });
}
cpSync(resolve(here, 'game'), resolve(out, 'game'), { recursive: true });
cpSync(resolve(here, 'screenshots'), resolve(out, 'screenshots'), { recursive: true });
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
