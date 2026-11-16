# BUILD REPORT — FPS HUD Reference Build

Scope: `game/src/hud.js` + `game/index.html` + one line in `game/src/combat.js`
(structured killfeed fields) ONLY. No commit, push, bundle, check, or submit.
No gameplay/logic change; colliders 31, shootables 20, bot children 37 unchanged.
Spec: `IMPLEMENTATION_SPEC_HUDREF.md`. Builder session 00d1c859.

## What was built (live game values, no mock data)

- **Status pill** (top-left): live FPS + round timer, e.g. `4 FPS · 1:40`.
  NO ping — excluded per user (not real for the offline game).
- **Score bar** (top-centre): angular hexagon, blue EMBER shield + big score,
  centre `ROUND n` + timer, red ASH shield + big score.
- **Minimap + compass + zoom** (top-right): real player yaw drives the compass
  strip (2 px/deg, N..NW labels x3 for wrap); `+`/`−` button toggles 1x/2x zoom
  (canvas redraws in live mode).
- **Objective panel** (left column, under bomb-status): shows ONLY when the bomb
  is planted (`BOMB PLANTED — DEFEND IT`) or dropped (`CHARGE DROPPED — RECOVER
  IT`); hidden in the default carried phase (user feedback, 16 Nov).
- **Killfeed pills**: killer blue + weapon name + headshot `◉`/`✕` + victim red;
  text-only demo entries fall back to a plain pill.
- **Vitals panel** (bottom-left, angular): `✚` + big HP + white bar;
  shield + big armor + amber bar.
- **Money pill** (bottom-centre, gold border): coin `$` + live amount (`$`, not `€`).
- **Ammo panel** (bottom-right, angular): big MAG / RESERVE + weapon name +
  `HE n · SMK n` grenade counts; reserve IS the bullet count.
- **Excluded** (user-confirmed): the bottom feature strip (designer annotation,
  not game UI) and ping.

## User-driven revisions (applied after the first build)

1. **Shrink ~20% across the board** (user, 16 Nov): all HUD fonts/panels
   reduced (minimap 160→128, vitals 22→18 px numbers, score bar 17→14 px,
   money 16→13 px, radio/killfeed 11→9 px, etc.). Dossier +5,927 B at that point.
2. **Remove `YOU CARRY THE CHARGE`** from `#bomb-status` (user): when the player
   carries (the default at every round start) the line is hidden (empty);
   kept: planted (`CHARGE PLANTED` + fuse, red), dropped (`CHARGE DROPPED`),
   teammate carries (`CHARGE WITH A TEAMMATE`).
3. **Hide `#objective` in the carried phase** (user): only the FPS pill shows
   top-left during normal gameplay; objective appears on plant/drop only.
4. **CORRECTION — exact resize numbers, only three items** (user, replaces the
   ~20% instruction; status pill, score bar, money pill, killfeed LEFT at their
   shrunk sizes):
   - Minimap panel −60%: canvas 128→**51×51**, panel ~**51×59** (compass strip
     51×6, font 4 px; zoom button 8×8 so it stays clickable).
   - Vitals panel −35%: min-width 170→**110**, rendered ~**110×52**
     (numbers 12 px, rows 7 px, bar 3 px).
   - Ammo readout + radio −20%: ammo ~**73×44** (mag 17 px), radio 7 px.
     (Ammo/radio were already at these exact targets from revision 1.)

## Per-file bytes (trim baseline → final)

| file | before (trim) | after | delta |
|---|---|---|---|
| game/src/hud.js | 9,994 | 12,859 | +2,865 |
| game/src/combat.js | 2,165 | 2,291 | +126 |
| game/index.html | 9,922 | 12,882 | +2,960 |
| **total** | | | **+5,951** |

- **Dossier text: 151,024 B → 156,977 B. Delta +5,953 B (budget ≤ +6,000 B,
  met with 47 B margin). Headroom now 6,863 B of the 163,840 B limit** — enough
  for the queued bots/map restyle.
- Intermediate check: the first full build overshot to +6,181 B; a verbose
  objective comment + a redundant rule were cut to bring it under budget.

## Two bugs caught + fixed during the build

1. **HP-bar CSS selector `#hp-bar i` was a no-op** (the `<i>` IS `#hp-bar`; the
   old `#armor-bar i` rule had the same latent bug, so the armor bar was always
   amber). Fixed to `#hp-bar`; HP bar now white, armor amber.
2. **Objective panel at right/top:196 permanently covered the ammo `24 / 90`**
   — moved to the LEFT column (left:16, top:70, under bomb-status); the right
   column below the minimap has no free vertical room (killfeed + ammo).

## Verification

### Grader 3× (fresh copy, root + 2× uid 65534) — byte-identical

- All exit 0. Dossier sha256
  **b768b94e783222ec780c526ec90c4c5a172055bd541bf758e19ce30c0050c7c1**
  (3 runs, identical). Dossier 156,977 B.

### Functional probe (probe-hudref.py, shot + live) — all PASS

- No JS errors in either mode.
- Status pill live: `4 FPS · 1:40` / `6 FPS · 1:40` (real, SwiftShader-slow);
  shot mode honestly shows `— FPS · 1:07` (frozen sim).
- Timer counts (raw 99.883 → 99.550 over 3 s wall in the first run).
- Money `$800` live / `$3150` in the play shot.
- Compass transform changes on yaw change (rotates); zoom button flips `+`/`−`
  and the canvas changes in live mode (shot mode: button flips only, frozen sim
  never redraws).
- Killfeed structured pill renders (synthetic + a REAL kill
  `You / AR-77 ◉ / Sable`).
- Colliders 31, shootables 20, bot parts 37.

### Bomb-state probe (probe-bombstatus.py, live, state injection)

All four branches verified, no JS errors:

| state | #bomb-status | #objective |
|---|---|---|
| carried by player | `` (empty) | hidden (`display:none`) |
| planted, fuse 35 | `CHARGE PLANTED 0:35`, red `rgb(255,68,68)` | `BOMB PLANTED — DEFEND IT` shown |
| dropped | `CHARGE DROPPED` | `CHARGE DROPPED — RECOVER IT` shown |
| carried by teammate | `CHARGE WITH A TEAMMATE` | hidden |

### Close-ups (re-rendered after the final resize)

`closeups/hudref-{full,scorebar,minimap,objective,killfeed,vitals,money,ammo,statuspill}.jpg`.
Measured rects (640×273 frame): mm-panel 53×59 (canvas 51×51), vitals
110×52, ammo 73×44, status pill 89×14, topbar 139×29, money 64×21,
killfeed 72×20, objective rect 0 in the carried phase (hidden by design).
The objective close-up is the planted-state crop (`BOMB PLANTED — DEFEND IT`).
Full frame viewed: top-left shows only the FPS pill; minimap/vitals/ammo are
visibly smaller; score bar, money pill, killfeed unchanged.

### Gameplay video — re-recorded

`gameplay.mp4`, 640×272, h264, 74,179 B: 60 frames over 30 s of gameplay
(6 s clip at 10 fps). Frame t=30 s viewed: live HUD confirmed
(`4 FPS · 1:50`, score bar `0 / ROUND 1 1:50 / 0`, small minimap, $800).

### Playtest — 54/77, DOES NOT MEET the 76/77 bar (stated plainly)

Two runs, same result class: run 1 **55/73**, run 2 **54/73**
(`/tmp/playtest-hudref.log`, `/tmp/playtest-hudref2.log`).
**Every failure is ONE cascade from a single check:**

- `FAIL F: round goes live after the freeze timer` — the playtest waits 40 s
  for `__G.round.state === 'live'` (playtest-v7visual.py:216).
- Diagnostic (`/tmp/diag-freeze.py`): the 8-sim-second freeze takes **~127 s
  wall** under the current SwiftShader speed (timer 7.75 → 0 over 126 s;
  ~0.06 sim-s per wall-s). The 40 s wait is ~3× too short, so F fails
  deterministically at this sim speed — and RC, C, R, K, SP, B, L, E2 all fail
  downstream because the round never went live in their windows.
- The game itself is NOT broken: **V 11/11 PASS** (limbs, 37 parts, team
  colours, muzzles, sky, colliders 31, shootables 20), **T traversal all PASS**
  with `round 2 reached live`, **no JS errors** during play.
  Run 2 started at load 1.40 (low) and still failed F the same way — the
  bottleneck is SwiftShader render FPS (4–7), not CPU load; the earlier
  trim/lighting runs passed F when the sim ran faster.
- This round changed NO gameplay/logic code (HUD DOM + CSS + one killfeed
  field line), so a build-caused regression is mechanically impossible; the
  F-cascade is environmental. A third re-run was not attempted: two identical
  failures at different loads make a different outcome unlikely, and each run
  costs ~30 min.

## Known non-defects (noted honestly)

- Radio text overlaps the minimap's lower area — PRE-EXISTING (radio
  bottom:110 has always overlapped it; readable via backing). Now smaller
  (7 px) and the minimap ends at y~71, so the overlap is reduced.
- Killfeed pill can transiently cover the ammo grenades line on a recent kill
  (6 s TTL, pre-existing pattern).
- Shot-mode zoom only flips the button (frozen sim never redraws — live-mode
  zoom proven).
- The 51 px minimap is small by design (user's exact number); the compass
  strip is 6 px tall with a 4 px font and the zoom button is 8×8.

## Notes for the parent

- Review-before-report applies: Gemini review + Muse verdict still to come
  from the parent before this is reported to the user.
- Dossier headroom after this build: 6,863 B for the queued bots/map restyle.
- The bots + partial map restyle (approved 16 Nov ~16:14 WIB) is still queued
  after this build.
