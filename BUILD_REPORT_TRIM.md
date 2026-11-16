# BUILD REPORT — FPS Dossier Trim / Golf Round

Date: 16 Nov 2026 ~17:20 WIB. Builder session: af46f768-a5b7-4a94-a738-07e1a78bc5b3.
Worktree: `~/workspace/makefun/threejs-fps/build-02-v7visual/` (v7-visual HEAD 8c39435 + uncommitted round-4 work).
Scope: `game/src/*.js` + `game/index.html` ONLY. No commit, push, bundle, check, or submit. No logic, constant, collider, shootable, or visual change — comments only.

## Result

- **Dossier text: 162,878 B → 151,024 B. Freed 11,854 B (target was ≥ 10,000 B). Headroom now 12,816 B of the 163,840 B limit.**
- Game files total: 161,407 B → 149,555 B (freed 11,852 B; the 2 B difference vs the dossier delta is the dossier wrapper).
- No code changed. Every edit was a comment deletion or shortening; `node --check` passes on all 17 JS files.

## Per-file before / after (wc -c)

| File | Before | After | Freed |
|---|---|---|---|
| game/src/audio.js | 3,585 | 3,523 | 62 |
| game/src/bomb.js | 4,290 | 4,266 | 24 |
| game/src/bots.js | 34,380 | 30,757 | 3,623 |
| game/src/combat.js | 2,175 | 2,165 | 10 |
| game/src/config.js | 2,696 | 2,688 | 8 |
| game/src/economy.js | 2,196 | 2,196 | 0 |
| game/src/grenade.js | 4,808 | 4,749 | 59 |
| game/src/hud.js | 10,156 | 9,994 | 162 |
| game/src/input.js | 2,080 | 2,069 | 11 |
| game/src/main.js | 8,479 | 8,336 | 143 |
| game/src/nav.js | 2,233 | 2,233 | 0 |
| game/src/palette.js | 2,211 | 1,913 | 298 |
| game/src/player.js | 6,476 | 6,204 | 272 |
| game/src/rounds.js | 5,056 | 4,843 | 213 |
| game/src/shots.js | 3,246 | 3,243 | 3 |
| game/src/weapon.js | 14,913 | 14,301 | 612 |
| game/src/world.js | 42,120 | 36,153 | 5,967 |
| game/index.html | 10,307 | 9,922 | 385 |
| **Total** | **161,407** | **149,555** | **11,852** |

## What was cut (comments only, with examples)

- **Pass 1 — shorten narration:** multi-line comment blocks compressed by deleting sentences, keeping the WHY. Example (bots.js operator block, 19 lines → 8): the user-feedback history and the "boxes are now rounded / studs sit on shoulder pads" narration went; the hitbox-unchanged note (torso capsule r 0.26 @ y 0.95, head sphere r 0.17 @ y 1.62) and the 37-children / playtest-V note stayed.
- **Pass 2 — second shortening:** the kept WHY notes were tightened further (e.g. world.js lighting block 11 lines → 3, keeping the hemi 2.0 → 0.75 / sun 3.2 → 3.8 / key:fill ~5:1 values; bots.js hitscan calibration 13 lines → 9, keeping the 0.1375 constant and the err x0.7 calibration).
- **Pass 3 — whole-line deletion of descriptive comments:** comments that only describe what the adjacent code visibly draws were deleted outright. Examples: world.js paint descriptions (container/wall/crate paint, stencil, vent grille, wall label, site letters, expansion joints, turbine, pipes, wall signs, steam vents, daylight haze), the wall-table one-word group labels (A-long, Mid, B-short, Connectors, Attacker yard, Defender yard), bots.js one-liners that restate the code (right/left hand wraps, backpack list, "attackers guard the planted bomb", "strafe slowly while shooting"), and index.html CSS history notes (Halyard provenance, "CORRECTED" note — the position fact itself kept in 2 lines).
- **Kept in full (WHY / trap notes):** the MultiplyBlending deviation note in world.js (11 lines, untouched — the documented proof that multiply renders as a white square in this vendored r187/SwiftShader build); the RoundedBoxGeometry attribution (three.js example, MIT, written from the description, not pasted) + face-on-index-5 note; all hitbox/collider/shootable/37-children/playtest-assert notes; the hitscan calibration (0.1375, err x0.7); the reaction-time bug note (resetting every 0.15 s < 0.25 s min meant bots never fired); the route-to-node defuse-range note; the door-header NEVER-in-colliders note; the env-map note (values trimmed, mechanism kept).
- **Honest note on method:** a few early edits were reflows that saved ~nothing (economy.js and nav.js headers: 0 B; shots.js: 3 B; combat.js: 10 B). The bulk of the saving came from whole-line deletions, not rewording — a reflowed comment at ~140 chars costs nearly as much as the two ~75-char lines it replaced.
- **No code golf was needed.** No blank-line, whitespace, or literal golf: the files have zero trailing whitespace, zero double blank lines, and only one long dash run. Comments alone cleared the target with 1,854 B to spare.

## Verification

### 1. Dossier bytes before / after
- Before (fresh copy, root run): 162,878 B (matches the lighting round's reported number).
- After (fresh copy, root run): **151,024 B**. Freed **11,854 B**.

### 2. Grader determinism after trim
- Fresh copy `/tmp/grader-trim-final` (worktree minus `.git`, `chmod -R a+rX` — the first attempt failed for uid 65534 with EACCES because the copy was mode 770; that was a permissions mistake in my own check setup, not a build defect; fixed by the chmod and re-run).
- Root: exit 0. uid 65534 (runuser nobody) run 1: exit 0. uid 65534 run 2: exit 0.
- Dossiers byte-identical: sha256 **ad3e4f65afea1fd5ccc15a187fa6c57b602ef324726fe821d4b9eb7467b771b5** (508,839 B).

### 3. Playtest — bar NOT met (75/77 and 74/77), all failures in known timing classes
- **Run 1** (`/tmp/playtest-trim.log`, ~15.7 min): **75/77**. FAIL SP: camera moved 1.39 m (spectate-camera flake class). FAIL L: open-field TTK=None (TTK timing class). V 11/11 (colliders 31, shootables 20, canvasTexMeshes 72). K PASSED (killer feed: Sable ✕ You). No JS errors.
- **Run 2** (`/tmp/playtest-trim2.log`, ~16.4 min): **74/77**. FAIL SP (1.39 m), FAIL K (killer feed None), FAIL L (TTK=None). V 11/11 (colliders 31, shootables 20). No JS errors. K passed in run 1 and failed in run 2 — the failure rotates run to run, exactly the pattern the polish round showed (builder 75/77 x3 with failures rotating SP+L, SP+L, SP+K; parent 75/77 SP+K).
- **The 76/77 bar was not met in either run. Stated plainly.** Every failure is confined to the three documented timing-flake classes (SP spectate-camera, K killer-feed, L TTK timing); no failure touches a code path this round changed — because this round changed NO code at all (comments only; renders pixel-identical, dossiers byte-identical), so a trim-caused regression is mechanically impossible.
- **Likely cause: machine load.** Load average was 4.28 during run 1 and 3.31 after run 2, on a 1.5-CPU cell — heavy contention while the SwiftShader playtest runs. The lighting parent run, where L passed (TTK 4.0 s), ran at load ~0.7-1.6. Under load the fixed-step sim runs slower than wall-clock, so the TTK measurement window expires before the bot kills (L TTK=None) and the spectate camera drifts (SP 1.39 m). A re-run under lower load is the honest way to clear the bar; it was not attempted here because the load stayed high through both runs.

### 4. Visuals unchanged (close-ups)
- Re-rendered with `closeup-lighting.py` (same `?shot=play&seed=7`, 640x273 viewport). Reference files were copied to `/tmp/ref-lighting-{distance,bot,sky}.jpg` before the run so the comparison is against the pre-trim renders.
- **Pixel comparison (PIL, all channels): distance mean abs diff 0.0 / max 0; bot 0.0 / 0; sky 0.0 / 0. All three renders are pixel-identical to the pre-trim references** (file sizes also identical: distance 26,980 B, bot 26,136 B).
- Lighting probe from the same run: no JS errors; env set, envMs 49.8 ms, envIntensity 0.65, exposure 1.15; 17 blobs visible (9 bot blobs); botParts 37; colliders 31; shootables 20; sun 3.8 / bias -0.0002 / normalBias 0.03 / radius 3 / near 1; hemi 0.75.
- Video: NOT re-recorded (visuals unchanged, per spec).

## Notes for the parent
- The dossier headroom is now 12,816 B — enough for the queued HUD reference build (several KB) and the bots/map restyle, with margin.
- No git state was touched (no commit/push/bundle/check/submit).
