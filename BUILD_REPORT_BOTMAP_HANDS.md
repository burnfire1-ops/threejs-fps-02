# BUILD REPORT — FPS round-4 combined: bot + map restyle + leg walk + interactive hands

**Worktree:** `build-02-v7visual/` (branch `v7-visual`, HEAD `8c39435` + uncommitted round-4 work)
**Spec:** `~/workspace/makefun/threejs-fps/IMPLEMENTATION_SPEC_BOTMAP_HANDS.md`
**Date:** 16 Nov 2026, ~20:11–22:40 WIB (builder session `e5ff3df1`)
**Status:** DONE, parent-verified. NO commit, push, bundle, check, or submit.

## What was built

### Part A — bots.js: robot restyle (ref #2)
White rounded head (single whiteMat `0xf2f2f2`, RoundedBox 0.40), dark visor box at y 1.68, two glowing cyan eyes (emissive `0x00e5ff`, intensity 2), blue torso (team-coloured: CT `0x2f6fb4`, T `0xc98a2e`), white chest plate + white shoulder pads, blue arms, blue legs, red health bar (canvas sprite, y 2.08, redrawn only on hp change, hidden when dead). Roblox face removed (makeFaceTexture, faceTex, skinMat, SKIN, accMat deleted; no leftover refs). Hitboxes identical (torso CapsuleGeometry 0.26/0.5 at y 0.95, head SphereGeometry 0.17 at y 1.62), height ~1.89 m. Children count 40/bot (23 base + 14 studs + 2 eyes + 1 hpBar sprite). legL/legR/armL/armR field names kept.

### Part A2 — world.js + palette.js: clean grey street
palette: floor `0x3d424b`→`0x6e7276`, wall `0x525c6a`→`0x70747a`, wallAlt `0x465061`→`0x63676d`, wallTop `0x57637a`→`0x767a80`. Sky unchanged `0x8ec4ea`. world.js wallTexture: clean-street yellow band at h*0.60 (height 20, alpha 0.92, PAL.hazard) + existing bottom 8px strip kept. crateTexture wood kind: base fill PAL.wood→PAL.hazard (yellow), dark wood frame kept. Layout, 3 lanes, 31 colliders, 20 shootables UNCHANGED. Lighting-round work kept (env map, hemisphere 0.75, sun 3.8, blob shadows).

### Part B — bots.js: walk cycle reads clearly
Leg swing `0.5`→`0.75` rad (`sw = sin(ph) * 0.75`, ph = G.time*9 + b.id*1.7), body bob `abs(sin(ph)) * 0.03` m while walking, arm counter-swing `±sw*0.2`. Kept `spd > 0.5` gate. No speed/route/gameplay change.

### Part C — weapon.js: interactive viewmodel hands
- **Reload (priority 1):** left hand moves from its base (L0) toward the magazine `(0, -0.13, -0.08)` on a `sin(PI*rp)` envelope, snaps back when reload ends/cancelled. Right hand stays on the grip. Durations from CFG.weapons (pistol 1.4, smg 1.8, shotgun 2.6, rifle 1.9, lmg 3.2, sniper 2.8 s).
- **Switch (priority 2):** `setViewWeapon` sets `vm.switchT = 1`; decays `dt*2.2`, dip `sin(PI*(1-switchT)) * 0.07` down + tilt 0.12 rad, ~0.45 s.
- **Recoil (priority 3):** existing `G.viewModel.kick` reused: group z +kick*0.09, y +kick*0.03, rotation.x kick*0.12, decay dt*7. Hands never leave frame, never block crosshair.
- **Movement bob (priority 4):** existing bob kept (`vm.bobT += dt*speed*1.6`, amplitude `min(1, speed/walk)*0.012`).
- **Plant/defuse reach (priority 5):** `reach` ramps toward 1 while `plantProgress > 0 || defuseProgress > 0` (rate dt*6); group z -reach*0.06, rotation.x -reach*0.08.

## Per-file deltas (dossier budget)

| file | before | after | delta |
|---|---|---|---|
| game/src/bots.js | 30,757 B | 31,610 B | +853 B |
| game/src/palette.js | 1,913 B | 1,896 B | −17 B |
| game/src/world.js | 36,153 B | 36,454 B | +301 B |
| game/src/weapon.js | 14,301 B | 15,981 B | +1,680 B |
| **dossier text** | **156,977 B** | **159,794 B** | **+2,817 B** |

Limit 163,840 B. Headroom now **4,046 B** (was 6,863 B). **Nothing was cut.** If a future round goes over budget, cut in this order: bot restyle, map restyle, leg tuning, then hands (reload, switch, recoil, bob, plant/defuse).

## Verification

### Grader (fresh copy, root + 2× uid 65534)
- Fresh copy `/tmp/fps-grader-botmap2` (chmod -R a+rX first). Root exit 0, uid 65534 run 1 exit 0, uid 65534 run 2 exit 0.
- Dossiers byte-identical: sha256 `0bdab5bd368ae44838e0f725cd42a5f86a18b0804315dbf18f7e7c3376e201c4` (all three), 517,792 B each.
- Dossier text 159,794 B ≤ 163,840 B.

### Functional probe (probe-hands.py, LIVE mode, real CDP key presses)
Server :8094, headless Chrome 157, warmed profile. All pass, no JS errors:
- static: freeze, colliders 31, shootables 20, parts [40×9], ctSuit `0x2f6fb4`, tSuit `0xc98a2e`, vmGroups 6, vmHands 2, jsErrors [].
- buy: rifle bought ($2,700, money 5,000→2,300), ownsRifle true.
- **switch dip:** mid-dip switchT=0.63, groupY −0.244 (base −0.18, dip 0.064 m ≈ max 0.07).
- **reload:** started (reloading 1.73 s), left hand moved max disp 0.166 m toward the magazine (palm −0.007/−0.094/−0.167 vs base −0.03/−0.32).
- **walk:** leg −0.148→0.393 rad in 2 s (dLeg 0.541), body bob dY 0.0098 m, spd 4.2.
- **fire:** kick 0.417 (decaying from 1), group z −0.4125 (recoil offset), ammo 30→26 (auto-fire consumed rounds).
- **plant reach:** reach 0.41 ramping, plantProgress 2.73, group z −0.4746 (forward), rotation.x −0.0328.
- round went live (live=True).

Two probe-harness notes (NOT game defects):
1. The first probe run failed because `G.menuOpen` was true (the click-to-play menu was up), and `step()` returns early while it is true — so stepRounds/stepReloads/stepViewModel never ran. The probe now sets `menuOpen = false` via evaluate (harness shortcut; the game itself is unchanged).
2. After buying, `buyItem` sets `p.cur = 'rifle'` without switching the viewmodel, and `switchWeapon` early-returns when `a.cur === key` — so a lone `4` does nothing. The probe switches via pistol first (1, then 4). This is a pre-existing game quirk, out of scope for this round.

### Close-ups (all viewed by the builder)
| file | sha256 (first 16) | size |
|---|---|---|
| closeups/botmap-close.jpg | f267bf6237c17c60c | 74,997 B |
| closeups/botmap-walk.jpg | 968b3589e4e2f6b4 | 79,869 B |
| closeups/botmap-lane.jpg | a18b40c583f235745 | 79,185 B |
| closeups/botmap-hands-switch.jpg | d4ef7c1f1d7ebb46 | 80,241 B |
| closeups/botmap-hands-reload.jpg | f4bf6d5de9ca4b93 | 78,459 B |
| closeups/botmap-hands-fire.jpg | 5f14db5920b6dd6f | 74,855 B |

- botmap-close: white rounded head/helmet, blue torso, white chest plate, dark visor band, red health bar above head. Cyan eyes read in code (emissive 2) but are not clearly distinct in this frame.
- botmap-walk: bot from rear/side at ~7 m, blue legs mid-stride (posed 0.75 rad), white head, red health bar. Face/eyes not visible from the rear angle.
- botmap-lane: grey walls + horizontal yellow stripe, yellow crates, white ground lane lines, blue sky, site A sign.
- hands (switch/reload/fire): rifle viewmodel + tan-gloved hands clearly visible, open mid lane, no black panel. The first hand shots were obscured by the spawn-structure overhang filling the top of the frame (a world object at spawn, also present in the accepted buy-menu reference shot); re-taken from the open mid lane (player moved to (0,0,8)) after DOM inspection proved it is rendered in the canvas, not a DOM overlay.

### Gameplay video
`gameplay.mp4` re-recorded: 362,957 B, 640×272, h264, 6 s clip (60 frames captured over 30 s of gameplay at 10 fps, spectate camera following a bot). Frame check confirms the new map (grey walls, yellow stripe, yellow crates, blue sky) and live play. Note: the first encode failed because nodriver writes JPEG content into `.png`-named files (ffmpeg's PNG decoder rejects them); fixed by renaming frames to `.jpg` and re-encoding. The failed attempt briefly left a 0-byte gameplay.mp4; the good file above replaces it.

### Playtest (playtest-v7visual.py, venv python, server :8094)
- Run 1: **60/77**. Run 2 (full log saved to `/tmp/playtest-botmap-full.log`): **61/77**.
- All 16 failures in run 2 cascade from a single root cause, **FAIL F: round goes live after the freeze timer**. The freeze is 8 sim-s; at SwiftShader 4–7 FPS on this VM it needs ~127 s wall, but the playtest waits only 40 s. Because the round never went live in that window, the dependent checks could not run: RC recoil ×2 (player could not fire), C defenders-move ×1 (bots do not move in freeze), R reload ×4 (bot could not empty a magazine), K player-died ×1 (no bot fire), SP spectate ×4 (player never died), B bomb ×3 (bomb logic never progressed). Every one of those 16 failure details names the freeze state (`round: 'freeze'`, `spd: 0`, `mag 12`, `carrier: 'You'`).
- **No failure outside the known timing classes (F/SP/K/L/E2).** L passes in full in run 2 (open-field TTK 2.0 s at 8 m; wall-cover check passes). E1 all pass (plant, no early end, detonation). E2 all pass (match over 8-0, rematch resets). No JS errors. All 10 V checks pass (parts 40, ctSuit `0x2f6fb4`, tSuit `0xc98a2e`, vmGroups 6, vmHands 2, muzzles pistol −0.32 / sniper −0.74, sky `0x8ec4ea`, fog `0xd6e8f7`, colliders 31, shootables 20, canvasTexMeshes 72).
- The 60 vs 61 difference between runs is the L open-field TTK (None in run 1, 2.0 s in run 2) — a timing flake, not a code change. The score is below the usual ~75/77 ceiling because the F cascade is wider this run: the VM was under heavy parallel load (markdown v5 fix retry running alongside), which pushed SwiftShader FPS further down and made the freeze wait fail harder. This is environmental, NOT a defect. Do NOT chase 77/77 by changing gameplay.

## What was NOT done
- No commit, push, bundle, check, or submit (per task).
- No cut was needed (headroom 4,046 B remains).
- The buy-then-switch viewmodel quirk (buyItem sets p.cur without switching) was NOT fixed — pre-existing, out of scope; noted above for a future round.
- The cyan eyes are verified in code (emissive 2) but are subtle in the close-up frame; no change made.

## Files touched (worktree, uncommitted)
- `game/src/bots.js`, `game/src/palette.js`, `game/src/world.js`, `game/src/weapon.js`
- `playtest-v7visual.py` (test file only, outside worktree: parts check 37→40)
- New verification scripts (outside worktree): `probe-hands.py`, `retake-hands.py`, `closeup-botmap.py`, `retake-walk.py`, `id-panel.py`
- `closeups/botmap-{close,walk,lane,hands-switch,hands-reload,hands-fire}.jpg`, `gameplay.mp4`
- This report: `build-02-v7visual/BUILD_REPORT_BOTMAP_HANDS.md`
