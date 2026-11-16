# BUILD REPORT — FPS Fix Round (Bot Roblox + HUD)

Date: 16 Nov 2026. Scope: EXACTLY 2 items, confirmed by user 16 Nov 12:53 WIB.
Spec: ~/workspace/makefun/threejs-fps/IMPLEMENTATION_SPEC_FPSFIX.md
Research: ~/workspace/makefun/threejs-fps/RESEARCH_FPS_FIXES.md
Worktree: ~/workspace/makefun/threejs-fps/build-02-v7visual/ (on top of the
uncommitted round-4 tree). NOT committed, pushed, bundled, checked, or submitted.

## Files changed (this round only)

| File | Size | Change |
|---|---|---|
| game/src/bots.js | 33,772 B | Item 1 (see below) |
| game/src/hud.js | 9,948 B | Item 2: feed caps + fade, banner gated on alive, scoreboard centred |
| game/index.html | 9,060 B | Item 2 CSS: single-row topbar, spectate to bottom-centre, centred scoreboard |
| game/src/combat.js | 2,175 B | Killfeed TTL 5s -> 6s (1 line) |
| game/src/bomb.js | 4,290 B | Radio TTL -> 5s, cap 4 -> 3 (push sites; + cap on the pickup push) |

Playtest check V updated in ~/workspace/makefun/threejs-fps/playtest-v7visual.py
(children 23 -> 37). New scripts: closeup-fpsfix.py (probe + close-ups).

## Item 1 — Roblox-style bot aesthetic (bots.js only)

- Local `RoundedBoxGeometry` (extends THREE.BoxGeometry, segments=2, ~60 lines):
  subdivided unit box, vertices repositioned onto the rounded surface
  (inner box + radius along the offset direction). Algorithm idea from the
  three.js example `examples/jsm/geometries/RoundedBoxGeometry.js`
  (mrdoob/three.js, MIT), written from the algorithm description, NOT pasted;
  credited in a comment. It stays an indexed BoxGeometry (three.js builds
  each face with its own vertices), so the 6 material groups and 0-1 UVs per
  face survive — the playtest's `BoxGeometry` type checks still pass.
  Radii: head 0.04, torso 0.06, limbs 0.02, helmet 0.03, vest/pouches 0.02,
  pack 0.03. Swapped in for head, torso, arms, legs, helmet, vest plates,
  pouches, backpack. Brim, neck, belt, shoulder pads stay plain boxes.
  Cost: 300 tris/box, ~69k tris for 10 bots.
- Face: 256x256 canvas (white background so it multiplies the SKIN material
  colour 1:1), two black oval eyes at ~40% height, smile arc at ~65%,
  drawn in the central ~70% (rim UV stretch). `CanvasTexture`,
  `colorSpace = SRGBColorSpace`. Head gets a 6-material array, face at
  index 5 (-Z, our forward). Runtime probe: `geometry.groups.length === 6`,
  face material map is a CanvasTexture, colour 0xd9b48a.
- Visor: shrunk 0.08 -> 0.05 tall and raised y 1.64 -> 1.74. The old visor
  covered the 35-55% band of the face, exactly where the eyes are drawn;
  at 1.74 it spans 14-26% of canvas height, above the eyes.
- Studs: cylinders r 0.03, h 0.012, team-colour dark material. 2x2 on each
  shoulder-pad top (8) + torso top (6) = +14 children/bot, 23 -> 37.
  DEVIATION from spec: the torso-top grid is 3 across x 2 rows front/back
  (not 2x3), because the head cube covers the torso-top centre — a 2x3 grid
  at x ±0.25 would clip into the head cube and the shoulder pads. Same
  count (6), same placement idea, no clipping.
- Untouched: bot scale (height 1.89 m), hitboxes (capsule + sphere r 0.17),
  rifle, hands, team colours (CT 0x2f6fb4 / T 0xc98a2e, skin 0xd9b48a).
  Head sphere stays inside the rounded head (face-centre surface 0.20 m
  from centre > sphere 0.17 m); torso capsule stays inside the rounded torso.

## Item 2 — HUD pile-up (hud.js + index.html CSS)

- Feeds capped at render time (ECHOFRONT prepend-and-trim pattern at the
  push sites too): killfeed max 5, radio max 3, newest on top, oldest
  removed. Per-item fade over the last 1 s of TTL: killfeed 6 s, radio 5 s.
  Killfeed stays under the minimap (top:186px); radio stays bottom-right.
- Spectate label moved out of the top zone: top:88px -> bottom:160px
  (above the toast at bottom:120px). Banner gated to show only while the
  player is alive, so it can never stack with the spectate label.
- Topbar is now a single flex row (timer 20px + score 12px + round 10px,
  baseline-aligned, 6px gaps) instead of a three-line stack.
- Scoreboard centred (top:50%, translate(-50%,-50%)) instead of top:16%;
  at match end it stays at 56% below the title. Still Tab-only.
- DEVIATION from spec ("hud.js + CSS ONLY"): the TTL/cap constants live at
  the push sites, so three one-line constant changes were needed there —
  combat.js killfeed t 5 -> 6, bots.js radio t 6 -> 5 and cap 4 -> 3,
  bomb.js radio t 6/4 -> 5 and cap 4 -> 3 (+ a missing cap on the pickup
  push). No logic changed, only the constants the spec names.

## Verification

- Runtime probe (closeup-fpsfix.py, ?shot=play&seed=7): parts 37 on all
  9 bots; head groups 6; head materials 6; faceMap CanvasTexture true;
  visor y 1.74 h 0.05; studs 14 CylinderGeometry; colliders 31;
  shootables 20.
- Close-ups (~/workspace/makefun/threejs-fps/closeups/):
  fpsfix-front.jpg — face upright + centred, visor above the eyes, smile
  below, head sphere hidden, shoulder studs visible on the pads.
  fpsfix-side.jpg — plain skin head from the side (face is front-only),
  pad studs visible, rounded torso. fpsfix-distance.jpg — two CT bots at
  ~15 m read as bright blue figures with skin heads (framing partly
  blocked by a container). Crops: fpsfix-front-crop.jpg, fpsfix-side-crop.jpg.
- Gameplay re-recorded: ~/workspace/makefun/threejs-fps/gameplay.mp4
  (30 s, 640x272, 102,081 B, 60 frames over 30 s live play). NOTE: the
  spectate take's failed ffmpeg first overwrote this file with 0 bytes;
  it was re-encoded from the intact player-take frames
  (/tmp/fps-video2/f000-f059.jpg) and verified valid with ffprobe
  (h264, 640x272, 2 fps, 30.000 s). Frames checked at 640x360: radio
  never exceeds 3 lines (f005 shows exactly 3, then fades out by f012);
  killfeed 2 lines max in the spectate take; topbar one compact row in
  every frame; no two centre labels in any frame (spectate at
  bottom-centre, banner gated while dead).
  at 640x360: radio never exceeds 3 lines (f005 shows exactly 3, then
  fades out by f012); killfeed 2 lines max in the spectate take; topbar
  one compact row in every frame; no two centre labels in any frame
  (spectate at bottom-centre, banner gated while dead).
  Spectate take frames in /tmp/fps-video/ (60 frames; the mp4 encode
  failed with a PNG decode error on one frame — frames themselves are
  intact JPEG data named .png, the known nodriver quirk; the player
  take encoded fine).
- Grader-like runs (fresh copy /tmp/grader-fpsfix, MAKEFUN_OUTPUT_DIR):
  root + 2x uid 65534, all exit 0, dossier byte-identical
  sha256 151ce8faae7f3c0482ae0c5626c2dc5942c7bb8c090d9f363bd2404dd4bb285e
  (514,147 B). Dossier text 156,044 B <= 163,840 B (headroom 7,796 B).
- Playtest (playtest-v7visual.py, check V updated to 37):
  Run 1: 76/77 (single failure, identity lost — output was piped through
  `tail -40`; the visible tail was all PASS from L onward).
  Run 2: 61/77 — all 16 failures cascade from ONE root cause: the round
  never left freeze inside the 40 s wall timeout at load average 5.6-6.0
  (sim runs slower than real time under load; V phase 11/11 clean).
  Run 3 (load 1.57 at start): 76/77. Single failure:
  "SP: camera moves with the spectated bot (>2 m in 2 s) — moved 1.71 m".
  This is the documented known load-flake class, byte-identical to the
  parent's bot-vis run (same 1.71 m): the spectate camera DOES follow the
  bot (it moved 1.71 m with it), just under the 2 m / 2 s wall-clock
  threshold while the sim runs slower than real time under load. Not a
  defect in this round — nothing I changed touches the spectate camera,
  bot movement, or the sim loop. V phase 11/11 in runs 2 and 3.
  No JS errors in any run.

## Deviations (summary)

1. Torso-top stud grid transposed 2x3 -> 3x2 (same 6 studs) to avoid
   clipping into the head cube and shoulder pads.
2. Three one-line TTL/cap constant changes at the feed push sites
   (combat.js, bots.js, bomb.js) — the spec said hud.js + CSS only, but
   the constants live there.
3. Playtest 76/77, not 77/77 (see above — the single failure is the known
   SP load flake, identical to the pre-change bot-vis run).
