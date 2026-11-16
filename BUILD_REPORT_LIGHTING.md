# BUILD REPORT — FPS realistic lighting (round 4 tree)

Worktree: `build-02-v7visual` (on top of the uncommitted round-4 tree + fix round + HUD polish round).
Date: 16 Nov 2026 ~16:05–16:35 WIB. Builder session: 121dfc5f.
Do NOT commit / push / bundle / check / submit (parent's job).

## What the user asked

"Pencahayaannya tolong dibuat realistis — lu bisa research dulu aja" (16 Nov ~15:06 WIB).
Research: RESEARCH_LIGHTING.md. Spec: IMPLEMENTATION_SPEC_LIGHTING.md. All four
shortlist items built.

## Files changed (ONLY these three)

| File | Change |
|---|---|
| `game/src/world.js` | Env map (`applyDaylightEnv`), blob helper (`makeBlobShadow`), 8 static blobs, hemi/sun rebalance + sun shadow tuning |
| `game/src/bots.js` | Per-bot blob quad (scene-level, follows `b.pos`, hides on death) |
| `game/src/main.js` | `outputColorSpace` explicit, exposure 1.25 → 1.15, `applyDaylightEnv` call after `createWorld` |

No other game file touched (mtimes confirm: index.html/hud.js are the HUD polish
round's, all other game files predate this round). Colliders 31, shootables 20
unchanged. No gameplay logic changed. No new vendored files, no network fetch,
no post-processing passes.

## Exact parameter values

- **Env map** (`applyDaylightEnv`, world.js): procedural scene — bright sky panel
  above (40×40, RGB 0.55/0.80/1.35, y=+12), warm ground panel below (40×40,
  0.50/0.38/0.24, y=−12), hot sun panel toward the sun azimuth (7×7,
  7.0/5.4/3.4 at (9.2, 7.8, 3.5), matching the directional light at
  (26, 22, 10)), cool fill strip opposite (−10, 4, −7; 0.45/0.65/1.0).
  `PMREMGenerator.fromScene(env, 0.04)`, once at boot.
  `scene.environmentIntensity = 0.65`.
- **Rebalance**: hemisphere 2.0 → **0.75**, sun 3.2 → **3.8** (key:fill ~5:1, was
  1.6:1), exposure 1.25 → **1.15**, `renderer.outputColorSpace = SRGBColorSpace`
  explicit.
- **Sun shadow**: `bias −0.0002`, `normalBias 0.03`, `radius 3`,
  `camera.near 1`; map 2048 and frustum ±24 unchanged.
- **Blob shadows**: 17 quads total — 9 bot blobs (1.3×1.3, scene-level, follow
  `b.pos` at y 0.02, `visible = b.alive`) + 8 static blobs (turbine block
  4.8×3.8, tower base 5.0×5.0, mid pillar 2.0×2.0, crates 2.4×2.4 / 2.8×2.8 /
  2.8×2.2). One shared radial-gradient canvas texture + one shared material.

## DEVIATION — MultiplyBlending does NOT work here (documented, with proof)

The spec/research call for a radial-gradient quad with MultiplyBlending. The
first build used exactly that (black→white RGB gradient, `blending:
THREE.MultiplyBlending`). It rendered as a **bright white square** on the floor
(`lighting-distance.jpg` v1: white diamond under the (0,6) crate; `blobtest.jpg`:
multiply and normal quads rendered identically as white squares with a black
centre dot). Diagnosis, all verified:

- The texture itself is correct (canvas readback: centre (0,0,0,255), mid
  (155,155,155), edge (243,243,243); material `blending === 4` =
  `MultiplyBlending` confirmed in the live scene).
- Isolated test page (`/tmp/blobtest/index.html`, same vendored r187, same
  ACES 1.15 + sRGB pipeline): a MultiplyBlending quad and a NormalBlending
  quad with the same texture render **identically** — white square + black
  centre dot. So in this vendored build under SwiftShader, the multiply blend
  mode has no effect; the material renders as if NormalBlending.
- (Side note: the white square's black dot is tiny because the gradient's
  black core is only 2 px of 128 and the sRGB output encoding lifts the
  mid-tones — the texture was also mis-shaped for this pipeline.)

**Fix (applied):** the standard blob-shadow technique — NormalBlending +
black texture with an **alpha** falloff (centre alpha 0.55 → 0.28 at 50% →
0 at the edge), one shared material, `transparent: true, depthWrite: false`.
Re-rendered close-ups confirm soft dark contact shadows and no white squares.
The spec's intent (dark grounding blob) is met; only the blend mode changed.

## Probe (nodriver, `?shot=play&seed=7`, closeup-lighting.py)

- No JS errors (`errs: []`).
- `envMs: 62` (first run) / `96.2` (second run) — PMREM generation, well under
  the 150 ms budget and negligible vs the 120 s grader wall. Variance is
  SwiftShader load.
- `envSet: true`, `envIntensity: 0.65`, `exposure: 1.15`.
- Blobs: 17 total, 17 visible; bot blobs 9/9, all visible; `botParts: 37`
  (group child count unchanged — blobs are scene-level, not group children).
- Colliders 31, shootables 20. Sun `{intensity: 3.8, bias: -0.0002,
  normalBias: 0.03, radius: 3, near: 1}`, hemi 0.75.

## Close-ups (viewed, PASS)

- `closeups/lighting-distance.jpg` — mid-lane: no white diamond any more;
  floor under the (0,6) crate is normal grey concrete with a soft dark patch
  at the crate base; sunlit walls read with clear directional contrast.
- `closeups/lighting-bot.jpg` — bot close-up: soft dark contact shadow
  directly under the feet (blob) plus the bot's elongated sun shadow to the
  left; the bot reads grounded, not floating.
- `closeups/lighting-sky.jpg` — sky-facing: gradient sky, sun-lit walls, no
  artifacts; topbar readable over the sky.
- `closeups/lighting-videoframe.jpg` — frame t=12 s of the re-recorded video:
  round 1, mid-lane, pistol viewmodel, strong sun/shade contrast on the left
  wall, HUD intact.

## Grader (fresh copy, root + 2x uid 65534)

- Root exit 0; uid 65534 ×2 exit 0.
- Dossiers byte-identical, sha256
  **c55cb91a50686568bcefef93a7059fcecd10c5cc4dfd0dab2acb6beac522dadf**
  (520,950 B).
- Dossier text: **162,878 UTF-8 B ≤ 163,840** — **headroom only 962 B**.
  This round added 5,223 B over the polish tree (157,655 B). It fits, but the
  headroom is nearly gone: no further source growth is possible without
  trimming elsewhere. (The report file itself lives at the worktree root, not
  in `game/`, so it does not count toward the dossier.)

## Playtest (playtest-v7visual.py, 77 checks)

- **76/77.** V 11/11. No JS errors. L PASSED (open-field TTK 4.5 s).
- Single failure: **SP** — "camera moves with the spectated bot (>2 m in 2 s)
  — moved 1.06 m" — the documented known load-flake class. This meets the
  spec bar (76/77 acceptable only with the single failure in the SP class).
- V state: `parts: 37`, CT 0x2f6fb4, T 0xc98a2e, colliders 31, shootables 20,
  `canvasTexMeshes: 72` (up from the pre-lighting count — the 17 blobs each
  carry the shared canvas texture; the check is a lower bound, ≥10, so it
  still passes).

## Video

Re-recorded with the new lighting (the look changed enough to matter):
`gameplay.mp4` — 30 s, 640×272, h264, **106,142 B** (60 frames captured by
`video-gameplay2.py`, re-encoded at 2 fps like the polish round's clip).
Walkers Vex + Rook, round live. Frame t=12 s checked (see close-ups).

## Process notes

- **VM restart ~16:07 WIB** (6th today, uptime reset to 0): wiped /tmp
  (diagnostic scripts, the parent's playtest log, grader copies) and killed
  the dev server + the playtest profile. Recovered: worktree intact (all
  edits survived in ~/workspace), dev server restarted on :8094 (HTTP 200),
  profile re-warmed headless (`/json/version` responded) before the close-ups.
  The blob diagnostic scripts were lost with /tmp; their findings are recorded
  here, and the isolated test page (`/tmp/blobtest/`) is gone too — the
  evidence (blobtest.jpg, blob-D/E/F diff numbers) is preserved in this report.
- **Flag for the parent (not mine to act on):** the restart also killed the
  markdown-render-speed-02 v5 recorder (node PID 13329, sibling task) — the
  parent should check whether recording 01a1e368 survived.
- Cleanup: the throwaway blobtest HTTP server on :8095 was stopped after the
  test. `blobtest-shot.py` remains at `~/workspace/makefun/threejs-fps/` (NOT
  in the worktree, so it cannot leak into the dossier).

## Verdict

Build complete: env map + rebalance + shadow tuning + blob shadows all
implemented and verified. Grader clean and byte-identical. Playtest 76/77
(SP-only, meets the spec bar). Dossier fits with 962 B to spare — that is the
tightest constraint on any further round-4 work. Parent decides
submit-readiness.
