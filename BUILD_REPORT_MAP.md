# BUILD REPORT — FPS map realism upgrade (option 3)

## What changed (only `game/src/world.js` + `game/src/palette.js`)
Worktree: `~/workspace/makefun/threejs-fps/build-02-v7visual/` (branch v7-visual).
`bots.js` / `weapon.js` (hands rebuild) and `rounds.js` / `shots.js` NOT touched.

### 1. Realistic textures (all canvas-generated, no external assets)
- **Walls** (`wallTexture`): concrete grime — vertical drip streaks, soft blotches,
  hairline cracks, scratches, rivet dots on the panel seams, heavier grime wash
  at the floor. Kept the seams, base band, top band, hazard kick strip.
- **Outer shell**: the 41 m shell walls now use a dedicated `shellMat` whose
  texture repeats 4x horizontally, so seams/grime stay crisp instead of
  stretching over the whole run (the wall close-up showed the shell as one
  blurry slab before this fix).
- **Floor** (`floorTexture`): expansion-joint grid (concrete slabs), forklift
  scuff arcs, dark puddles, cracks. Kept the zone washes, hazard frames,
  A/B stencils, chevrons, lane dashes.
- **Containers**: big stencil numbers replaced by industrial codes
  (`A-01`…`F-06`) + `KEEP CLEAR`. Kept ribs, grime, rust, graffiti.
- **Crates**: metal crates get a code (`A-01`…`D-04`) + yellow `DANGER`;
  wood crates get a code + up arrow on the middle plank. Kept planks, frame,
  nails, rivets.
- Site accents kept (warm amber A, cool teal B).

### 2. Environmental detail (all collider-free: `group` only, never `solids`/`colliders`)
- 4 leaning pallets (wood, against the outer walls at lane edges).
- 4 vent grilles (new canvas texture, on the outer walls at y 3.2).
- 4 cable runs (thin cylinders along the walls at y 4.15).
- 4 hanging lamps (cord + shade + emissive amber bulb) over the lane entries.
- 3 extra pipes: 2 verticals in the north corners + 1 horizontal along the
  north wall at y 3.9 (existing 3: spawn-divider top + 2 mid-divider).
- 4 wall signs (new canvas texture): 2 `DANGER` boards on divider faces,
  site arrows that point the right way (A arrow on the west wall points north
  toward A; B arrow on the north wall points east toward B).

### 3. Lighting + sky
- **Sky dome**: gradient canvas texture (deep blue zenith → pale horizon) on
  an upper-hemisphere sphere (r 90, BackSide, fog:false). `scene.background`
  stays `PAL.sky` 0x8ec4ea (the playtest asserts the colour); the dome is what
  the player sees.
- **Skyline silhouette**: 10 shapes outside the walls — 4 silos, 3 chimneys,
  3 rooflines — hazy blue-grey (`PAL.skyline`), fog applies so they blend.
  Chimneys thickened after the first screenshots (thin ones read as poles).
- **Sun**: warmer (`PAL.sun` 0xfff1d6 → 0xffe3ae), lower angle (18,30,12 →
  26,22,10), intensity 3.0 → 3.2 — longer, deeper shadows. Hemisphere ground
  bounce warmed (0x8a7a5e → 0x9a7a55). Fog kept (pale horizon 0xd6e8f7).

## New decor counts (for the parent to update playtest expectations)
Playtest V probe reads `__G.world.decor`. Unchanged: barrels 8, crates 8,
lintels 6, siteSigns 2, containerColors 6, floorTextured true, colliders 31,
shootables 20, sky 0x8ec4ea, fog 0xd6e8f7.
Changed / new:
- `pipesNew`: 3 → **6**
- `canvasTexMeshes`: 42 → **55** (new textures: sky, vent, labels, shell repeat)
- `pallets`: **4**, `vents`: **4**, `cables`: **4**, `lamps`: **4**,
  `wallSigns`: **4**, `skyline`: **10**, `skyDome`: **true**

## Verification
- **Local build**: exit 0. **Dossier text 148,953 B** (cap 163,840; baseline
  was 136,349; +12,604 B; headroom 14,887). `game/` 2,281,902 B (cap 48 MiB).
- **Grader-like runs** (root + 2x uid 65534, foreign cwd, read-only copy):
  all exit 0, dossiers byte-identical, sha256
  `8fa47e6178ee7342570eeb219812bba262827750f1e8bf3e24e098cc41310d9f`
  (same hash before and after the VM restart — deterministic).
- **Screenshots**: 4 re-rendered, all ≤256 KiB (01-start 52,348 B; 02-play
  70,165 B; 03-plant 92,688 B; 04-end 49,968 B) and VIEWED. The map reads as
  a realistic industrial site (textured walls/floor, labelled crates, props,
  gradient sky, warm light), not a flat grey box yard.
- **Close-ups**: 2 rendered with the closeup pattern (camera set directly)
  and VIEWED — `map-wall` (pallet + vent + panel seams + rivets + crack on
  the shell wall) and `map-lane` (hanging lamp, lane dashes, skyline, sky).
  Saved to `/tmp/fps-closeup/map-{wall,lane}.png` (ephemeral; re-renderable
  with `closeup-map.py`).
- **Playtest** (`playtest-v7visual.py`, 77 checks, 0 JS errors):
  - Run 1 (load 5.77): 75/77 — K + SP fail.
  - Run 2: killed mid-run by a VM restart (SIGTERM), incomplete.
  - Run 3 (load 2.6–7.3, Tiny Chess R13 running in parallel): 75/77 —
    SP + L fail. **K PASSED.**
  - Run 4 (load 1.05→6.1→1.26, R13 replay in parallel): **76/77 — only SP
    fails (camera moved 1.38 m)**. K passed, L passed (open TTK 3.0 s).
  - All V checks pass in every run (colliders 31, shootables 20, parts 23,
    vmHands 2, sky/fog hex unchanged).
- **K/SP/L failures are load artifacts, not code defects** (evidence):
  - The diff touches NO gameplay code (world.js + palette.js only). Hitscan
    (`hitscanShot`) and LOS (`losBlocked`) test `solids` + `shootables`
    only; no new decor is in `solids`, so nothing can block a bullet or a
    sightline.
  - Direct probes (`k-probe.py`, `k-probe2.py`): the exact R-then-K scenario
    kills the HP-1 player in <4 s on this code, both isolated and after the
    full R sequence (defender fires, hits land, mag 12→11, player dies).
  - SP is the known load-sensitive check: it measures the spectated bot's
    movement in 2 s of REAL time, and the sim runs slower than real time
    under load. It passed at 2.06 m (hands run 3) and 2.42 m (playtest 15)
    on quiet machines; it fails at 1.06–1.40 m whenever the cell is loaded
    (R12/R13 builders + SwiftShader). L failed once the same way (TTK=None
    under load 4.34) and passed at 3.0 s in run 4.
  - No quiet window was available for a 77/77 run: the R13 builder ran
    replays throughout (load 5–7 during the runs).

## Deviations
1. Two fix iterations after the first screenshots: (a) shell-wall texture
   repeat 4x (the wall close-up showed the 41 m shell as one blurry slab);
   (b) chimneys thickened (diameter 1.6–2.2 → 2.4–3.0; thin ones read as
   poles). Screenshots + close-ups re-rendered and re-viewed after both.
2. Stencil text on non-square faces is stretched horizontally by the box UVs
   (same as the old big numbers — e.g. `E-05` on the 4×2.2 m turbine block).
   All labels stay readable; no change made.
3. `closeup-map.py` and `k-probe.py` / `k-probe2.py` are new helper scripts
   in `~/workspace/makefun/threejs-fps/` (not in the worktree).
4. A VM restart mid-task wiped /tmp (playtest profiles, logs, grader
   copies). The dev server was restarted from the worktree
   (`node serve.ts --port 8094`) and the nodriver profile re-warmed manually;
   grader runs were re-done after the restart with the identical hash.
5. The playtest log's trailing `RuntimeError: Event loop is closed` is the
   known nodriver teardown artifact (after all checks print), not a game error.

## Files
- `game/src/world.js`, `game/src/palette.js` (patched)
- `screenshots/{01-start,02-play,03-plant,04-end}.png` (re-rendered)
- `BUILD_REPORT_MAP.md` (this file)
- NOT committed, bundled, checked, submitted, or pushed (parent does).
