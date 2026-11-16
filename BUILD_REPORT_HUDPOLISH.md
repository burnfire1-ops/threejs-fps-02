# BUILD REPORT — FPS HUD POLISH ROUND 2 (+ Round bar & Money move, user 16 Nov ~15:06–15:08 WIB)

Worktree: `build-02-v7visual` (on top of the uncommitted round-4 tree + fix round).
Date: 16 Nov 2026 ~14:42–15:30 WIB. Builder session: e30a4e23.
Do NOT commit / push / bundle / check / submit (parent's job).

## What the user asked (from watching the gameplay video on the phone)

1. Topbar text white on the light sky = invisible ("jangan putih, ga keliatan").
2. Radio still reads piled up / cramped at the right edge.
3. HUD too big overall, fills too much of the screen.
4. ADDED 16 Nov ~15:06 WIB: the round needs a VISIBLE BAR (green arrow = topbar).
5. ADDED 16 Nov ~15:08 WIB (CORRECTED the money position): reference = Halyard
   entry @calm-owl-82 — one dark bar at top-centre with ROUND + score + timer
   (+ status), and money in a small dark bar at BOTTOM-CENTRE between the
   health panel (bottom-left) and the ammo panel (bottom-right). The first
   message's "above the vitals panel" instruction is SUPERSEDED by the
   Halyard example position. #bomb-status stays top-left.

## Files changed (ONLY these two)

| File | Size | Change |
|---|---|---|
| `game/index.html` | 10,307 B | All CSS below + topbar span order |
| `game/src/hud.js` | 10,156 B | Radio render: "[RADIO] " prefix dropped |

No other game file touched. Anchors/layout otherwise unchanged: minimap
size/position unchanged; spectate stays bottom-centre; scoreboard stays
centred; single-row topbar kept.

## Exact CSS / font values

**Topbar — one solid dark bar, top-centre (Halyard pattern):**
- `#topbar`: `top:12px; left:50%; transform:translateX(-50%); display:flex;
  align-items:baseline; gap:6px; background:rgba(20,22,26,.9);
  border:1px solid #3a4048; border-radius:4px; padding:5px 12px`
  (backing raised .78 → .85 → .9 across the round, at the user's "bar must
  be clearly visible" request).
- Span order in the DOM (reordered to the Halyard order): `#round-label`,
  `#score-line`, `#timer`.
- `#round-label`: 9px, **color:var(--ink) #e9e6df (was muted #98a0a8)**,
  font-weight:700, letter-spacing:2px, text-shadow `0 1px 3px #000, 0 0 6px #000`.
- `#score-line`: 11px, letter-spacing:1px, same text-shadow.
- `#timer`: 17px (was 20px), font-weight:700, same text-shadow.
- `#bomb-status`: 11px (was 12px), same text-shadow; stays top-left
  (`left:16px; top:44px`).

**Money — small dark bar, bottom-centre:**
- `#money`: `left:50%; transform:translateX(-50%); bottom:16px;
  font-size:16px (was 18px); font-weight:700; color:var(--accent);
  background:rgba(20,22,26,.85); border:1px solid #2c323a; border-radius:4px;
  padding:3px 10px; text-shadow:0 1px 3px #000, 0 0 6px #000`.
- (An intermediate "above the vitals panel" position, `bottom:88px`,
  was built, probed, then REPLACED per the user's Halyard correction.)

**Radio / killfeed — off the right edge, backed, shorter lines:**
- `#radio`, `#killfeed`: `right:24px` (was 16px); font-size 11px (radio was
  12px, killfeed 13px).
- Per-line backing: `#killfeed > div, #radio > div {
  background:rgba(20,22,26,.55); border-radius:3px; padding:1px 6px;
  margin:1px 0; text-shadow:0 1px 3px #000; }`
- hud.js: radio lines render WITHOUT the `"[RADIO] "` prefix (shorter lines).

**Fonts −15% (polish scale, all in `game/index.html`):**
- timer 20→17, hp-num 26→22, ammo-mag 30→26, ammo-res 15→13,
  weapon-name 12→11, vitals.row 14→12, radio/killfeed 12–13→11,
  banner 26→22, spectate/toast 13→12, money 18→16, bomb-status 12→11,
  score-line 12→11, round-label 10→9, `.panel` padding 8px 10px→6px 8px.
- Minimap UNCHANGED (160×160, right:16px, top:12px).

## Probe rects (nodriver, viewport 640×273, `?shot=play&seed=7`)

Probe script: `probe-money.py` (profile `/tmp/fps-money-profile`, warm).

| Element | Rect (x, y, w, h) | Check |
|---|---|---|
| `#topbar` | x 197.4–442.6, y 12–44 | One solid bar, top-centre; bg `rgba(20,22,26,.9)`, border `#3a4048` |
| `#round-label` | inside topbar | color `rgb(233,230,223)` = ink, 9px, bold |
| `#money` | x 284.9–355.1, y 230–257 | centre-x **320** (exact viewport centre); bg `rgba(20,22,26,.85)` |
| `#vitals` | x 16–226, y 193–257 | money clears it by **58.9 px**, no overlap |
| `#ammo` | x 559–624, y 200–257 | money clears it by **203.9 px**, no overlap |
| `#bomb-status` | x 16–168.5, y 44–57 | top-left, NOT moved |
| `#radio` | right edge **616** | spec ≤ 616 ✓ |
| `#killfeed` | right edge **616** | spec ≤ 616 ✓ |

Note: the first money position (`bottom:88px`, above vitals) probed at gap 0
(flush against the vitals panel top edge) and was then superseded by the
Halyard bottom-centre position; the 8 px gap from the `bottom:88px` fix
(`bottom:80px` → `bottom:88px`) is moot.

## Pixel scan (video frames)

Naive bright-pixel scan beyond x=620 flags the SCENE, not HUD text: the
minimap site markers (amber/teal, x ≤ 624) and bright sky/wall/floor in the
3D view light up the strip. Text-like partial-row bright clusters beyond
x=624 peak at 164 px in one frame — visually confirmed to be the yellow
container edge, not glyphs. Ground truth for HUD text position is the DOM
probe (radio/killfeed right edge 616, text inset a further 6 px by the
per-line padding). Viewed frames confirm no feed text touches the right edge.

## Close-ups (viewed, PASS)

- `closeups/hudpolish-topbar.jpg` — topbar dark pill readable over pale sky.
- `closeups/hudpolish-radio.jpg` — radio lines backed, no prefix, clear of edge.
- `closeups/hudpolish-distance.jpg` — distance shot, HUD clean.
- `closeups/hudpolish-money.png` — FINAL layout: topbar "ROUND 4 EMBER 2 — 1
  ASH 1:07" as one dark bar; "$3150" in a dark bar at bottom-centre between
  HEALTH/ARMOR (left) and ammo (right); "YOU CARRY THE CHARGE" top-left;
  radio 2 lines, no prefix.

## Video

`gameplay.mp4` — 30 s, 640×272, h264, 2 fps, 107,508 B, 60 frames over 30 s
of live play (re-recorded 16 Nov ~15:40 WIB AFTER the final money/topbar
change; re-encoded at 2 fps from the 60 frames captured by
`video-gameplay2.py` — the script itself encodes at 10 fps = 6 s, so the
30 s version is a re-encode of the same frames). Frame checks (frames 5 /
30 / 55 viewed): radio ≤ 3 lines (3 lines in frame 5, 0 after TTL fade),
topbar readable every frame, no two centre labels in any frame, money
"$800" in its dark bar at bottom-centre in every frame. Pixel scan: worst
text-like bright count beyond x=624 is 132 px (frame 14) — the yellow
container edge, not HUD text (see Pixel scan section).

## Grader (fresh copy, root + 2× uid 65534)

- Root exit 0; uid 65534 ×2 exit 0 (via `MAKEFUN_OUTPUT_DIR`; main.ts writes
  to `/output` by default, not to the positional arg).
- Dossiers byte-identical, sha256
  **4edc2309a7dfbf974dbcd53aa27e38acd8a4722226d363cfc5eb67f002600ee2**
  (515,622 B).
- Dossier text (`dossier.text`): **157,655 UTF-8 B ≤ 163,840** (headroom
  6,185 B; up 566 B from 157,089 — money bar CSS + topbar reorder + opacity).

## Playtest (playtest-v7visual.py, 77 checks)

- Run 1 (pre-money-move tree): **75/77**. V 11/11. No JS errors.
  - FAIL SP: spectate camera moved 1.73 m — KNOWN load-flake class.
  - FAIL L: open TTK=None — round went 'post' ~2 sim-s after setup, player
    alive (see L diagnosis below).
- Run 2 (pre-money-move tree): **75/77**. Same two failures (SP 1.71 m; L
  TTK=None, round 'post' at iter 8, ~2.3 sim-s after setup).
- Run 3 (FINAL tree, with money bottom-centre + reordered topbar):
  **75/77**. V 11/11. No JS errors.
  - FAIL SP: spectate camera moved 1.38 m — KNOWN load-flake class.
  - FAIL K: player died from bot fire, killer feed None — the documented
    timing-sensitive K class (BUILD_REPORT_FPSFIX.md: round clock expires
    before a bot lands the kill on the 1-HP player).
  - **L PASSED: open-field TTK 3.0 s** (matches the diagnostic exactly).

Three runs on this tree: 75/77, 75/77, 75/77 — the second failure ROTATES
(SP+L, SP+L, SP+K) across the three known timing-sensitive checks, while V
stays 11/11 and no JS errors appear in any run. No failure implicates the
polish changes (CSS + radio prefix). The strict bar (77/77, or 76/77 with
SP-only) was not hit by any single run; the rotating failures are the
playtest's own timing flakiness under load, documented in
BUILD_REPORT_FPSFIX.md for K and SP and diagnosed here for L.

### L diagnosis (NOT a build defect)

The L trial (open-field TTK, round 7) fails when the round leaves 'live'
~0.4–2.3 sim-seconds after the trial setup, before the bot can kill the
player. Evidence it is a trial/environment flake, not a regression:

- The polish round changed ONLY `game/index.html` (CSS) and `game/src/hud.js`
  (radio prefix). `rounds.js`, `bots.js`, `shots.js`, `combat.js` are
  untouched by this round; L PASSED on this exact game code in the fix-round
  runs (parent 76/77 SP-only; builder run 3 77/77 clean).
- The playtest's own code comment admits the L trial returned None before
  ("run-2/3 returned None with no diagnostics").
- Exact-flow diagnostic (`diag-L.py`, same freeze-skip + same setup, round 1):
  round stays live, timer 119.9 → 118.3, Sable shoots the player
  100 → 70 → 40 → 10 hp, player dies at ~3.0 sim-s, round ends correctly
  "ASH WINS — Team eliminated". TTK ≈ 3 s. The trial mechanics WORK on the
  current tree.
- A control run (`diag-L-control.py`, no skip, no setup) shows the freeze
  counting down normally; the game is healthy unprobed.
- (My first diagnostic variant used a REPEATED freeze-skip and produced a
  "Time expired" banner — that variant is NOT the playtest's flow and its
  result is my own artifact, discarded.)
- Open: the round-7-specific trigger was not isolated (candidates: leftover
  grenade/bomb state from the D phases, or a timer-poke race under load).
  The L check is timing-sensitive by construction (same class as the K check
  in BUILD_REPORT_FPSFIX.md).

## Verdict

Build complete: all three user complaints + the two added items (round bar,
money bottom-centre) are implemented and probe-verified. Grader clean and
byte-identical. Video re-recorded with the final HUD and frame-checked.
Playtest: 75/77 in all three runs (V 11/11, no JS errors); the second
failure rotates among the three known timing-sensitive checks (SP, L, K) —
none of them implicates this round's changes. The strict 77/77 (or 76/77
SP-only) bar was not hit by any single run; that is the playtest's timing
flakiness under load, not a build defect. Parent decides submit-readiness.
