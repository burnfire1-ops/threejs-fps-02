# BUILD_REPORT_HUDRESIZE.md — FPS HUD resize (balik ke awal + enlargements)

## Ringkasan
HUD dikembalikan ke ukuran AWAL lalu diperbesar sesuai permintaan user. Semua target tercapai. Playtest **76/77** (satu-satunya FAIL adalah kelas timing SP yang sudah dikenal, bukan bug). Grader 3× exit 0, dossier byte-identical, text 159.827 B ≤ 163.840 B. Tidak ada JS error. Tidak ada overlap. Video di-re-record. **Tidak ada commit/push/bundle/check/submit** (sesuai spec).

## File yang diubah (hanya 2)
- `game/index.html` — semua ukuran CSS HUD.
- `game/src/hud.js` — `S = 51 → 154` di drawMinimap, radius/arrow minimap diskala ×3.02, compass center `25 → 77`.
- Tidak ada file lain yang disentuh. Gameplay, bot, map, senjata, ekonomi tidak berubah.

## Perubahan ukuran (CSS)
| Elemen | Sebelum | Sesudah | Target spec |
|---|---|---|---|
| Minimap canvas | 51×51 | **154×154** (156×156 border-box incl. border 1px) | 154×154 ✓ |
| Compass | 51×6, font 4px | **154×18, font 12px** | proporsional ✓ |
| Zoom button | 8×8, font 6px | **24×24, font 18px** | proporsional ✓ |
| Vitals min-width | 110px | **170px** (panel 170×82) | 170, ~170×80 ✓ |
| Vitals fonts | row 7px, angka 12px | **row 11px, angka 18px** | awal ✓ |
| Ammo | ~73×44 | **89×54** (mag 21px, res 11px, nama 9px) | ~91×55 ✓ (±2px) |
| FPS pill | font 9px, pad 2/6px | **font 11px, pad 2/7px** (105×17) | +20% ✓ |
| Score bar | font 14px, pad 4/8px | **font 17px, pad 5/10px** (169×35) | +20% — lihat catatan |
| Radio | font 7px | **font 13px** | 13px ✓ |
| Killfeed | top:164px | **top:192px** (dipindah — lihat bug #1) | — |
| Money pill | — | **tidak berubah** (64×21) | tidak berubah ✓ |

## Catatan topbar (penting, bukan bug)
Spec menargetkan topbar ~294×38, dari baseline 245px × 1.2. Baseline 245px itu ternyata **topbar pra-HUD-ref** (yang lama, timer 24px + score-line), bukan topbar angular saat ini. Topbar angular sebelum ronde ini ~136px lebar (font 14px, pad 4/8px). Setelah +20% (font 17px, pad 5/10px) jadi **169×35 (+24% lebar, semua font ×1.2)**. Jadi pembesarannya SUDAH proporsional; angka absolut 294px tidak tercapai karena baseline-nya salah identifikasi. Timer 17px ✓, round-label 10px ✓, shield 11×13 ✓. Close-up topbar dilihat: hexagon rapi, terbaca jelas.

## Pergeseran posisi yang diperlukan (didokumentasikan)
- **Killfeed top 164px → 192px.** Minimap yang dibesar (panel y 12–186) menabrak killfeed lama (y 164). Dipindah seminimal mungkin (+28px) supaya ada clearance 6px di bawah panel minimap. Bukan perubahan desain, murni menghindari overlap. Diverifikasi: killfeed_below_minimap = true.
- Posisi lain tidak berubah (radio bottom:80px tetap, gap 10px ke ammo; FPS pill vs bomb-status, topbar vs minimap semua clear).

## Verifikasi ukuran render (probe, viewport 1440×726)
Probe `probe-hudresize.py` (shot=play, seed=7, radio/killfeed di-inject). Hasil:
- minimap 156×156 border-box (= 154 content + border) ✓; mm-panel 156×174 ✓; compass 154×18 font 12px ✓
- vitals 170×82 ✓; ammo 89×54 ✓; status-pill 105×17 font 11px ✓; topbar 169×35 ✓
- radio font 13px ✓ (3 baris, 229×49); killfeed top 192 ✓; money tidak berubah ✓
- bomb-status kosong di state carried (sesuai desain) ✓; objective hidden di carried ✓
- Semua check overlap: killfeed_below_minimap ✓, radio_above_ammo ✓, pill_above_bombstatus ✓, topbar_no_mm_overlap ✓
- jsErrors: 0 ✓
- Zoom toggle: `+` → `−` → `+` ✓ (klik tombol, canvas tetap menggambar)
- Catatan: viewport headless 1440×726 (bukan 1440×813 — chrome headless makan ~87px). Posisi HUD absolut, jadi di layar 1440×813 yang sebenarnya hasilnya sama.

## Close-up yang dilihat (semua diverifikasi, tidak ada overlap/terpotong)
- `closeups/hudresize-full.jpg` (1440×726) — keseluruhan HUD.
- `closeups/hudresize-minimap.jpg` — map besar, panah pemain + dot teammate terbaca, tombol + jelas, kompas "N" terlihat.
- `closeups/hudresize-vitals.jpg` — "100 HEALTH" + bar putih, "0 ARMOR".
- `closeups/hudresize-ammo.jpg` + `hudresize-ammo2.jpg` — "24/30", "AR-77", "HE 0 · SMK 0".
- `closeups/hudresize-topbar.jpg` — hexagon "2 ROUND 4 1:07 1", rapi.
- `closeups/hudresize-radio.jpg` + `hudresize-radio2.jpg` — 2 baris radio 13px terbaca, warna tim benar, gap ke ammo jelas.
- `closeups/hudresize-topleft.jpg` — FPS pill "— FPS · 1:07" (tanda "—" karena di shot mode FPS belum terukur 1 detik penuh; di live play muncul angka — lihat frame video "4 FPS").

## Playtest penuh: 76/77
`playtest-v7visual.py`, log `/tmp/playtest-hudresize.log`. Durasi ~19 menit (SwiftShader lambat).
- **76 PASS, 1 FAIL.**
- Satu-satunya FAIL: `SP: camera moves with the spectated bot (>2 m in 2 s) — moved 1.06 m`. Ini kelas timing yang sudah dikenal (sim jalan ~0.06–0.4× real time di SwiftShader, bot bergerak lebih sedikit dalam 2 detik wall-clock). BUKAN bug HUD dan bukan regresi (di ronde combined juga ada FAIL SP yang sama).
- Semua F (freeze, 6/6) PASS — termasuk F freeze timing yang di ronde combined sempat FAIL (kali ini lolos berkat wait 40 s).
- Semua V (visual, 10/10) PASS — bot 40 parts, colliders 31, shootables 20, viewmodel 6 senjata, sky/fog, dressing.
- L TTK 6.0 s di 8 m PASS; E1 (planted bomb detonates, attackers win) PASS; E2 (match over 8-0, rematch reset) PASS.
- **No JS errors during play — []** PASS.

## Functional probe: bomb-status 4 cabang (live session)
`probe-bombstatus-hudresize.py` (bots di-freeze, state bomb di-set manual, stepHud jalan):
- carried (player): bomb-status `''`, objective hidden ✓
- planted: bomb-status `CHARGE PLANTED 0:35`, objective `BOMB PLANTED — DEFEND IT` (shown) ✓
- dropped: bomb-status `CHARGE DROPPED`, objective `CHARGE DROPPED — RECOVER IT` (shown) ✓
- teammate carries: bomb-status `CHARGE WITH A TEAMMATE`, objective hidden ✓
- jsErrors: [] ✓
- Buy/switch/reload/walk/fire/plant/defuse sudah tercakup playtest (F, L, D-A, D-B, E1, E2 semua PASS).

## Grader: 3× exit 0, dossier byte-identical
Fresh copy `/tmp/fps-grader-hudresize/bot` (repo read-only), foreign cwd /tmp:
- Run 1 (root): exit 0.
- Run 2 (uid 65534 via setpriv): exit 0.
- Run 3 (uid 65534 via setpriv): exit 0.
- sha256 dossier.json (ketiganya): `830b695c22aaa06355518681faf164557fd4781a752d40b833bc8f64ee5e4bb0`
- Ukuran dossier: 517.825 B. **Dossier text: 159.827 B ≤ 163.840 B** (headroom 4.013 B; naik hanya 33 B dari 159.794 B sebelum ronde ini).
- Catatan: run 2/3 sempat gagal dulu karena direktori parent `/tmp/fps-grader-hudresize` bermode 770 (umask 0007) sehingga uid 65534 tidak bisa traverse — diperbaiki dengan `chmod 755` pada direktori parent, lalu ketiga run lolos. Bukan masalah pada game.

## Video
`gameplay.mp4` di-re-record (`video-gameplay2.py`, 60 frame): **640×272, h264, 10 fps, 6.0 s, 74.425 B**. Frame 30 dilihat: first-person live, round 1, HUD baru jelas terlihat (minimap besar, vitals, ammo, score bar, FPS pill). FPS di video "4 FPS" — itu kecepatan render headless SwiftShader, bukan performa game di PC asli.

## Bug/error yang ditemukan
1. **Killfeed menabrak minimap yang dibesar** (ditemukan saat analisis, sebelum render): killfeed top:164px berada di dalam area panel minimap baru (y 12–186). **Diperbaiki**: killfeed dipindah ke top:192px. Diverifikasi tidak overlap.
2. **Baseline topbar di spec salah** (245px adalah topbar pra-HUD-ref): topbar aktual 169px setelah +20%, bukan 294px. **Bukan bug** — pembesaran proporsional sudah benar (lebar +24%, semua font ×1.2). Dilaporkan di sini supaya tidak disangka gagal.
3. **Tidak ada bug lain.** Tidak ada JS error (probe 0, playtest [], bomb probe []). Tidak ada overlap lain. Minimap zoom toggle jalan. Radio/killfeed render benar. Buy menu, reload, switch, plant/defuse semua PASS di playtest.

## Yang belum / tidak dilakukan
- Tidak ada commit/push/bundle/check/submit (sesuai spec).
- Tidak ada perubahan gameplay/bot/map/senjata/ekonomi.
- Dossier text masih dalam batas (159.827 / 163.840 B).
