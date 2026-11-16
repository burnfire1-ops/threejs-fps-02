// hud.js — every DOM readout, push-only: the HUD never touches the sim.
// Health/armor/ammo/timer/score/money, kill feed, radio, banner, buy menu,
// minimap (teammates always, enemies only where heard firing), bomb status,
// plant/defuse progress, damage direction.
import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);
const els = {};
let mmCtx = null;
let mmZoom = 1; // minimap zoom, toggled by the "+" button (1x/2x)
let fpsN = 0, fpsT = 0, fpsV = 0; // FPS meter: frames counted per second

export function initHud() {
  for (const id of ['overlay', 'endoverlay', 'end-title', 'end-score', 'crosshair', 'hitmarker',
    'dmg', 'dmgdir', 'hp-num', 'hp-bar', 'armor-num', 'armor-bar', 'ammo-mag', 'ammo-res',
    'weapon-name', 'grenades', 'timer', 'score-atk', 'score-def', 'round-label', 'money', 'money-num',
    'status-pill', 'objective', 'compass-inner', 'mm-zoom', 'killfeed', 'radio',
    'banner', 'buymenu', 'buy-grid', 'buy-money', 'bomb-status', 'progress', 'progress-fill',
    'progress-label', 'scoreboard', 'scoreboard-body', 'toast', 'minimap', 'buy-hint', 'spectate']) {
    els[id] = $(id);
  }
  mmCtx = els.minimap?.getContext('2d') ?? null;
  // Compass labels: N..NW every 45 deg, three copies (deg -360..720) so the
  // strip wraps when the heading crosses north. 2 px per degree, 2160 px wide.
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const inner = els['compass-inner'];
  if (inner) {
    inner.style.width = '2160px';
    for (let c = -1; c <= 1; c++) for (let i = 0; i < 8; i++) {
      const s = document.createElement('span');
      s.textContent = dirs[i];
      s.style.left = `${(c * 360 + i * 45 + 360) * 2}px`;
      inner.appendChild(s);
    }
  }
  els['mm-zoom']?.addEventListener('click', () => {
    mmZoom = mmZoom === 1 ? 2 : 1;
    els['mm-zoom'].textContent = mmZoom === 1 ? '+' : '−';
  });
}

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function drawMinimap(G) {
  if (!mmCtx) return;
  const c = mmCtx, S = 154, k = S / (42 / mmZoom);
  // Zoomed in, the map centres on the player; zoomed out it shows the whole map.
  const ox = mmZoom === 1 ? S / 2 : S / 2 - G.player.pos.x * k;
  const oy = mmZoom === 1 ? S / 2 : S / 2 - G.player.pos.z * k;
  c.fillStyle = '#101216';
  c.fillRect(0, 0, S, S);
  // Walls (colliders) as light slabs.
  c.fillStyle = '#3a4048';
  for (const col of G.world.colliders) {
    const x = ox + col.min.x * k, y = oy + col.min.z * k;
    const w = (col.max.x - col.min.x) * k, h = (col.max.z - col.min.z) * k;
    c.fillRect(x, y, Math.max(1, w), Math.max(1, h));
  }
  // Sites.
  for (const [key, s] of Object.entries(G.world.sites)) {
    c.fillStyle = key === 'A' ? CFG.teams.atk.css : CFG.teams.def.css;
    c.globalAlpha = 0.5;
    c.fillRect(ox + (s.center.x - 3) * k, oy + (s.center.z - 3) * k, 6 * k, 6 * k);
    c.globalAlpha = 1;
  }
  // Bomb.
  if (G.bomb.state === 'planted') {
    c.fillStyle = Math.sin(G.time * 8) > 0 ? '#ff4444' : '#881111';
    c.beginPath(); c.arc(ox + G.bomb.pos.x * k, oy + G.bomb.pos.z * k, 12, 0, 7); c.fill();
  } else if (G.bomb.state === 'dropped' && G.bomb.dropped) {
    c.fillStyle = '#ff8800';
    c.beginPath(); c.arc(ox + G.bomb.dropped.x * k, oy + G.bomb.dropped.z * k, 9, 0, 7); c.fill();
  }
  // Teammates always; enemies only where they were heard firing.
  for (const a of G.agents) {
    if (!a.alive) continue;
    const x = ox + a.pos.x * k, y = oy + a.pos.z * k;
    if (a.isPlayer) {
      c.save();
      c.translate(x, y);
      c.rotate(-a.yaw);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(0, -18); c.lineTo(12, 15); c.lineTo(-12, 15); c.closePath(); c.fill();
      c.restore();
    } else if (a.team === G.player.team) {
      c.fillStyle = a.team === 'atk' ? CFG.teams.atk.css : CFG.teams.def.css;
      c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill();
    }
  }
  for (const pg of G.pings) {
    const age = G.time - pg.t;
    if (age > 2) continue;
    c.fillStyle = `rgba(255,68,68,${1 - age / 2})`;
    c.beginPath(); c.arc(ox + pg.x * k, oy + pg.z * k, 11, 0, 7); c.fill();
  }
}

export function stepHud(G, dt) {
  const p = G.player;
  const r = G.round;
  // Overlays.
  if (els.overlay) els.overlay.style.display = G.menuOpen ? 'flex' : 'none';
  if (els.endoverlay) {
    els.endoverlay.style.display = r.state === 'over' ? 'flex' : 'none';
    if (r.state === 'over' && els['end-title']) {
      els['end-title'].textContent = r.banner?.text ?? '';
      els['end-score'].textContent = `EMBER ${r.scoreAtk} — ${r.scoreDef} ASH · press R for a rematch`;
    }
  }
  // Crosshair gap follows spread (pixels).
  if (els.crosshair) {
    const spread = G.spreadNow ?? 0.01;
    const gap = 6 + spread * 900;
    els.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    els.crosshair.style.opacity = p.alive && r.state === 'live' ? '1' : '0.25';
  }
  if (els.hitmarker) {
    els.hitmarker.style.opacity = G.hudHitT > 0 ? '1' : '0';
    els.hitmarker.style.color = G.hudHit === 'head' ? '#ff4444' : '#ffffff';
  }
  if (els.dmg) els.dmg.style.opacity = G.dmgFlash > 0 ? String(Math.min(0.7, G.dmgFlash)) : '0';
  if (els.dmgdir) {
    els.dmgdir.style.opacity = G.dmgDirT > 0 ? '1' : '0';
    els.dmgdir.style.transform = `rotate(${G.dmgDir ?? 0}rad)`;
  }
  // Vitals.
  if (els['hp-num']) els['hp-num'].textContent = Math.max(0, Math.ceil(p.hp));
  if (els['hp-bar']) els['hp-bar'].style.width = `${Math.max(0, p.hp)}%`;
  if (els['armor-num']) els['armor-num'].textContent = Math.ceil(p.armor);
  if (els['armor-bar']) els['armor-bar'].style.width = `${Math.min(100, p.armor)}%`;
  const st = p.weapons[p.cur];
  const w = CFG.weapons[p.cur];
  if (els['ammo-mag']) els['ammo-mag'].textContent = st ? (st.reloading > 0 ? '--' : st.mag) : '-';
  if (els['ammo-res']) els['ammo-res'].textContent = st ? st.reserve : '-';
  if (els['weapon-name']) els['weapon-name'].textContent = w ? w.name : '';
  // FPS meter + status pill (live FPS, once a second; "— FPS" until measured).
  fpsN++; fpsT += dt;
  if (fpsT >= 1) { fpsV = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  // Timer / score / money.
  const timeTxt = r.state === 'live' ? fmtTime(r.timer) : r.state === 'freeze' ? `BUY ${Math.ceil(r.timer)}` : '—';
  if (els['status-pill']) els['status-pill'].textContent = `${fpsV ? fpsV + ' FPS' : '— FPS'} · ${timeTxt}`;
  if (els.timer) els.timer.textContent = timeTxt;
  if (els['score-atk']) els['score-atk'].textContent = r.scoreAtk;
  if (els['score-def']) els['score-def'].textContent = r.scoreDef;
  if (els['round-label']) els['round-label'].textContent = `ROUND ${r.num}`;
  if (els['money-num']) {
    els['money-num'].textContent = p.money;
    els['money-num'].style.color = G.econFlash > 0 ? '#7dff8a' : '';
  }
  // Objective panel: hidden while the bomb is carried (the default state —
  // the top-left then shows only the FPS pill); shown only on plant/drop.
  if (els.objective) {
    const b = G.bomb;
    const t = b.state === 'planted' ? 'BOMB PLANTED — DEFEND IT' : b.state === 'dropped' ? 'CHARGE DROPPED — RECOVER IT' : '';
    els.objective.style.display = t ? 'block' : 'none';
    els.objective.textContent = t;
  }
  // Compass: heading from real player yaw (yaw 0 faces north, -z).
  if (els['compass-inner']) {
    const h = (((-p.yaw * 180 / Math.PI) % 360) + 360) % 360;
    els['compass-inner'].style.transform = `translateX(${77 - (h + 360) * 2}px)`;
  }
  // Grenade counts under the ammo readout (reserve is the bullet count).
  if (els.grenades) els.grenades.textContent = `HE ${p.grenades.he} · SMK ${p.grenades.smoke}`;
  // Bomb status + progress.
  if (els['bomb-status']) {
    const b = G.bomb;
    // Player carries at every round start: hide it (duplicates the objective).
    els['bomb-status'].textContent =
      b.state === 'planted' ? `CHARGE PLANTED ${fmtTime(b.fuse)}` :
      b.state === 'dropped' ? 'CHARGE DROPPED' :
      b.carrier === p ? '' : 'CHARGE WITH A TEAMMATE';
    els['bomb-status'].style.color = b.state === 'planted' ? '#ff4444' : '';
  }
  if (els.progress) {
    const b = G.bomb;
    const planting = b.plantProgress > 0.05;
    const defusing = b.defuseProgress > 0.05;
    els.progress.style.display = planting || defusing ? 'block' : 'none';
    if (planting) {
      els['progress-label'].textContent = 'PLANTING…';
      els['progress-fill'].style.width = `${(b.plantProgress / CFG.bomb.plantTime) * 100}%`;
    } else if (defusing) {
      const need = p.kit ? CFG.bomb.defuseKitTime : CFG.bomb.defuseTime;
      els['progress-label'].textContent = 'DEFUSING…';
      els['progress-fill'].style.width = `${(b.defuseProgress / need) * 100}%`;
    }
  }
  // Kill feed + radio: capped at render time too (killfeed 5, radio 3, newest
  // on top), faded over the last 1 s of each item's TTL (killfeed 6 s, radio 5 s),
  // so neither feed can pile up.
  if (els.killfeed) {
    els.killfeed.innerHTML = G.killFeed.slice(0, 5).map((k) => {
      const op = `opacity:${Math.min(1, k.t).toFixed(2)}`;
      const me = (k.byPlayer || k.victimPlayer) ? ' kf-me' : '';
      // Structured kills render as pills (killer blue, weapon muted, victim
      // red); text-only entries (shot-mode demos) fall back to the plain line.
      if (k.killer) return `<div class="kf-pill${me}" style="${op}"><span class="kf-k">${k.killer}</span><span class="kf-w">${k.weapon || ''}${k.head ? ' ◉' : ' ✕'}</span><span class="kf-v">${k.victim}</span></div>`;
      return `<div class="kf-pill${me}" style="${op}">${k.text}</div>`;
    }).join('');
  }
  if (els.radio) {
    // The "[RADIO] " prefix is dropped — it cost ~50px per line and adds nothing
    // (position + team colour already say it is a radio callout). Message text unchanged.
    els.radio.innerHTML = G.radio.slice(0, 3).map((m) =>
      `<div class="radio-${m.team}" style="opacity:${Math.min(1, m.t).toFixed(2)}">${m.text}</div>`).join('');
  }
  // Banner (round result; match-over has its own title). It hides while the
  // player is dead, so it can never stack with the spectate label.
  if (els.banner) {
    const b = r.banner;
    const show = b && b.t > 0 && r.state !== 'over' && p.alive;
    els.banner.style.display = show ? 'block' : 'none';
    if (b) els.banner.textContent = b.text;
  }
  // Toast (buy results).
  if (els.toast) els.toast.textContent = G.toastT > 0 ? G.toast : '';
  // Spectator label (v6-full): who the dead player is watching.
  if (els.spectate) {
    const t = G.spectate;
    const show = !p.alive && t && r.state !== 'over';
    els.spectate.style.display = show ? 'block' : 'none';
    if (show) els.spectate.textContent = `SPECTATING ${t.name}`;
  }
  // Buy menu.
  if (els.buymenu) {
    const open = G.buyOpen && r.state === 'freeze';
    els.buymenu.style.display = open ? 'block' : 'none';
    if (open) {
      els['buy-money'].textContent = `$${p.money}`;
      els['buy-grid'].innerHTML = '<table class="buy-table"><thead><tr><th>KEY</th><th>ITEM</th><th>PRICE</th></tr></thead><tbody>' + CFG.buyOrder.map((key, i) => {
        const ww = CFG.weapons[key];
        const owned = !!p.weapons[key];
        return `<tr${owned ? ' class="owned"' : ''}><td class="key">${i + 1}</td><td>${ww.name}</td><td class="price">$${owned ? Math.max(100, Math.floor(ww.price / 4)) + ' ammo' : ww.price}</td></tr>`;
      }).join('') + [
        `<tr><td class="key">7</td><td>Armor</td><td class="price">$${CFG.gear.armor}</td></tr>`,
        `<tr><td class="key">8</td><td>HE grenade</td><td class="price">$${CFG.gear.he}</td></tr>`,
        `<tr><td class="key">9</td><td>Smoke grenade</td><td class="price">$${CFG.gear.smoke}</td></tr>`,
        `<tr><td class="key">0</td><td>Defuse kit</td><td class="price">$${CFG.gear.kit}</td></tr>`,
      ].join('') + '</tbody></table>';
    }
  }
  if (els['buy-hint']) els['buy-hint'].style.display = r.state === 'freeze' && !G.buyOpen ? 'block' : 'none';
  // Scoreboard (Tab held, or below the match-over title at match end). Centred
  // (50%) instead of top:16%, so it never enters the topbar/spectate zone; at
  // match end it sits at 56%, below the title.
  if (els.scoreboard) {
    const show = G.input.keys.has('Tab') || r.state === 'over';
    els.scoreboard.style.display = show ? 'block' : 'none';
    els.scoreboard.style.top = r.state === 'over' ? '56%' : '50%';
    if (show) {
      const rows = [...G.agents].sort((a, b) => (b.kills - b.deaths) - (a.kills - a.deaths));
      els['scoreboard-body'].innerHTML = rows.map((a) =>
        `<div class="sb-row${a.isPlayer ? ' sb-me' : ''}"><span>${a.name}</span><span>${a.team === 'atk' ? 'EMBER' : 'ASH'}</span><span>${a.kills} / ${a.deaths}</span><span>${a.alive ? '●' : '✕'}</span></div>`).join('');
    }
  }
  drawMinimap(G);
}
