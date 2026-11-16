# BUILD REPORT — FPS bot hands rebuild (round 4, hands)

Date: 16 Nov 2026 ~20:30 WIB. Worktree: `build-02-v7visual/` (branch v7-visual, HEAD 8c39435 + uncommitted v7-visual fix + bot rebuild).
Spec: `~/workspace/makefun/threejs-fps/IMPLEMENTATION_SPEC_HANDS.md`.
Task: fix the user-confirmed defect — bot arms/hands look MERGED with the body (left arm blends into the torso; a piece of the arm clips through the torso front as a stray blue cube on the chest, circled in `closeups/hands-side.png`).

## What changed (only `game/src/bots.js` and `game/src/weapon.js` touched)

### bots.js — arms, hands, rifle, walk cycle
- **Arms rebuilt as two segments with a visible elbow**, in `darkMat` (suitDark — visibly darker than the torso suit colour, so the arm reads as a separate limb). Arm groups are pivots at the shoulders (±0.36, 1.40, −0.08), rotation (0,0,0) at build. New helpers `placeBetween(parent, a, b, w, mat)` (segment between two bot-local points) and `placeBox(parent, c, s, e, mat)` (box at bot-local centre/orientation) convert to arm-group-local space via the group's rotation-matrix inverse, so the walk swing rotates the whole arm rigidly around the shoulder.
  - Right: upper (0.36,1.40,−0.08)→(0.375,1.20,−0.44), forearm →(0.05,1.16,−0.45), elbow bend ~87°.
  - Left: upper (−0.36,1.40,−0.08)→(−0.38,1.24,−0.55), forearm →(0.04,1.21,−0.76), elbow bend ~64°.
  - All arm segments stay at x ≥ 0.29 or z ≤ −0.33 — clear of the torso box (x ±0.28, z ±0.28). **The stray chest cube is gone by construction.**
- **Hands: 3 tan boxes per hand (0x9c8a68)** — palm + finger block wrapping the gun's front + thumb, all rotation.x=−0.3 to match the grip. Right hand on the pistol grip (palm (0.07,1.17,−0.405), fingers (0.04,1.15,−0.465), thumb (0.10,1.20,−0.42)); left hand on the forend (palm (0.04,1.25,−0.72), fingers (0.04,1.185,−0.72), thumb (0.095,1.24,−0.70)). All hand boxes sit clear in front of the vest (z ≤ −0.37; vest front −0.335).
- **Rifle moved 0.10 forward** (gun z −0.38 → −0.48; barrel (0.04,1.28,−0.78), mag (0.04,1.16,−0.42)) so the hands wrap it CLEAR of the vest. Added **pistol grip** (child of gun, local (0,−0.095,0.05), 0.05×0.15×0.06, rx=−0.3) and **forend** (child of gun, local (0,−0.045,−0.26), 0.06×0.05×0.24). Grip/forend are children of the gun mesh (like gunStock/gunSight) — bot group stays exactly 23 direct children. The gun's rear/stock stays buried in the chest (shouldered, dark-on-dark, invisible) as before.
- **Walk cycle** (`stepBots`): old base pitches (−1.15/−0.7 + sw*0.5) would have rotated the new arm groups −1.15/−0.7 rad and destroyed the pose. Now a gentle swing around 0: `armL.rotation.x = −sw*0.2`, `armR.rotation.x = +sw*0.2` (sw ≤ 0.5). Hands stay on the gun while walking; legs unchanged.

### weapon.js — viewmodel hands
- `gripHand` (used by all 6 viewmodels): palm slightly larger (0.085×0.095×0.085); **finger block moved DOWN so it wraps UNDER the gun part** ((0,−0.055,−0.02), rx 0.35) instead of extending the palm forward (was (0,−0.01,−0.06), reading as one long tan brick); **thumb enlarged and more prominent** (0.035×0.06×0.06 at −side*0.055). Palm is still the direct child — 2 glove-coloured direct children per weapon group, unchanged. Muzzle anchors and weapon stats untouched.

### Constraints — all hold
- Hitboxes UNCHANGED (CapsuleGeometry(0.26, 0.5) at y 0.95 + SphereGeometry(0.17) at y 1.62 in G.shootables). Colliders 31, shootables 20 (V probe). Bot group exactly 23 direct children (V probe). Total height ~1.89 m. Team colours unchanged (CT 0x2b4a6e, T 0x8a6f3c). Visual-only: no gameplay/stat/economy/map/collider change.
- `rounds.js` / `shots.js` diffs are ONLY the pre-existing approved cooldown inits (`cooldown: 0`, from the v7-visual fix) — not touched by this task.

## Verification

### Local build + grader-like runs — PASS
- `node main.ts` exit 0. Dossier text **136,349 chars** (cap 163,840).
- 4 grader-like runs, all exit 0, dossiers **byte-identical sha256 319d089f4bbed47ef9079a207951a9a47a666d8def7da7ec7da625d249929381**:
  - run 0: root, from the worktree; run 1: root, foreign cwd (/tmp), read-only copy (`chmod -R a+rX` + `a-w`); runs 2–3: uid 65534 (`su nobody`), foreign cwd, read-only copy, empty writable /output.
  - (Note: `/output` needed `chmod 777` first — it was root-owned 2770, so the nobody runs could not write into it. Test-harness setup, not a build defect.)

### Playtest — 77/77 CLEAN (run 3), 0 JS errors
- Run 1 (`/tmp/hands-playtest.log`): **76/77**, 0 JS errors. Only failure SP (camera moved 1.38 m). Machine load 2.22 at start.
- Run 2 (`/tmp/hands-playtest2.log`): **76/77**, 0 JS errors. Only failure SP, again exactly 1.38 m. Cause found: a parallel Tiny Chess R12 replay (`python3 r7/replay_ref.py r12/golf_only.py`, PID 11207, ~42% CPU) was saturating the 1.5-CPU cell together with Chrome's SwiftShader GPU process (~90% CPU); load hit 7.11. The SP check measures camera movement over 2 s WALL time while the spectated bot walks a fixed route — under frame starvation the game clock advances less in 2 s, so the bot covers less ground. My diff touches no movement, game-loop, or spectate code. (The identical 1.38 m in both loaded runs is itself evidence of determinism under the same load profile.)
- Run 3 (`/tmp/hands-playtest3.log`, after the replay finished, load 0.99): **77/77, 0 JS errors**. SP PASSED at 2.06 m. This confirms SP is a load artifact, not a code defect — same as playtest 15 (77/77, SP 2.42 m) on the pre-hands code.
- V checks 11/11 in all runs: 23 parts/bot, helmet/vest/pack, 6 viewmodel groups + 2 gloved hands each, colliders 31, shootables 20.

### Close-ups — viewed, defect fixed
- Re-rendered with `closeup-hands.py` (parent tool). Two camera fixes were needed vs the original script: the front camera was moved to (0.955, 1.62, 4.5) pitch −0.2 (the original (0.5, 1.62, 3.5) put a yellow pillar between camera and bot), and the viewmodel camera pitch 0.35 → 0.0 → −0.15 (pitch 0.35 pushed the viewmodel out of the bottom of the frame). Final renders in `~/workspace/makefun/threejs-fps/closeups/` (copies of `/tmp/fps-closeup/`).
  - **hands-front**: both arms read as separate dark limbs with visible elbow bends; tan hands visible gripping the rifle at chest centre; stray chest cube GONE.
  - **hands-side**: dark arm clearly separated from the torso, hand on the gun, stray cube GONE. (From this exact side angle the forearm's x-component is along the view direction, so the elbow reads subtler than in the front view — the front view proves the bend is there.)
  - **hands-viewmodel**: AR-77 fully in frame; right hand reads as palm + finger block under the grip + thumb, not a single brick. Left hand (forend) is out of frame at this angle, as before.

### Dossier screenshots — re-rendered + viewed
- `shots-v7visual.py`, all 4 shotReady=True: 01-start.png 47,842 B; 02-play.png 63,983 B; 03-plant.png 85,300 B; 04-end.png 45,302 B — all ≤ 256 KiB. Viewed: start screen, play (distant CT bot with tan hands on rifle), plant (CT bot at left edge, PLANTING… bar, site A), end scoreboard (Ember 8–5). All correct.

## Deviations
1. Close-up camera angles adjusted (see above) — the parent's script positions, not the code. Front/side/viewmodel framings are better; the bot and pose are unchanged.
2. Playtest needed 3 runs to reach 77/77 (runs 1–2: 76/77, SP only, under a CPU-saturated cell). No code change between runs — run 3 on the quiet machine is clean.
3. `pkill -f "playtest-v7visual"` killed my own exec shell once (pattern matched my own command line — the known AGENTS.md trap). No work lost; used the bracket trick afterwards.

## Not done (parent's job)
No push, bundle, check, submit, or commit. Worktree remains uncommitted: `game/src/bots.js`, `game/src/weapon.js`, `game/src/rounds.js`, `game/src/shots.js` (latter two pre-existing), 4 screenshots. New bundle + check will be needed for the round-4 submit (previous bundle was for 8c39435).
