// hud.js — every DOM readout, push-only: the HUD never touches the sim.
// Health/armor/ammo/timer/score/money, kill feed, radio callouts, round
// banner, buy menu, minimap (teammates always, enemies only where they were
// heard firing), bomb status, plant/defuse progress, damage direction.
import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);
const els = {};
let mmCtx = null;

export function initHud() {
  for (const id of ['overlay', 'endoverlay', 'end-title', 'end-score', 'crosshair', 'hitmarker',
    'dmg', 'dmgdir', 'hp-num', 'hp-bar', 'armor-num', 'armor-bar', 'ammo-mag', 'ammo-res',
    'weapon-name', 'timer', 'score-line', 'round-label', 'money', 'killfeed', 'radio',
    'banner', 'buymenu', 'buy-grid', 'buy-money', 'bomb-status', 'progress', 'progress-fill',
    'progress-label', 'scoreboard', 'scoreboard-body', 'toast', 'minimap', 'buy-hint', 'spectate']) {
    els[id] = $(id);
  }
  mmCtx = els.minimap?.getContext('2d') ?? null;
}

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function drawMinimap(G) {
  if (!mmCtx) return;
  const c = mmCtx, S = 160, k = S / 42, ox = S / 2, oy = S / 2;
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
    c.beginPath(); c.arc(ox + G.bomb.pos.x * k, oy + G.bomb.pos.z * k, 4, 0, 7); c.fill();
  } else if (G.bomb.state === 'dropped' && G.bomb.dropped) {
    c.fillStyle = '#ff8800';
    c.beginPath(); c.arc(ox + G.bomb.dropped.x * k, oy + G.bomb.dropped.z * k, 3, 0, 7); c.fill();
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
      c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(-4, 5); c.closePath(); c.fill();
      c.restore();
    } else if (a.team === G.player.team) {
      c.fillStyle = a.team === 'atk' ? CFG.teams.atk.css : CFG.teams.def.css;
      c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill();
    }
  }
  for (const pg of G.pings) {
    const age = G.time - pg.t;
    if (age > 2) continue;
    c.fillStyle = `rgba(255,68,68,${1 - age / 2})`;
    c.beginPath(); c.arc(ox + pg.x * k, oy + pg.z * k, 3.5, 0, 7); c.fill();
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
  // Timer / score / money.
  if (els.timer) els.timer.textContent = r.state === 'live' ? fmtTime(r.timer) : r.state === 'freeze' ? `BUY ${Math.ceil(r.timer)}` : '—';
  if (els['score-line']) els['score-line'].textContent = `EMBER ${r.scoreAtk} — ${r.scoreDef} ASH`;
  if (els['round-label']) els['round-label'].textContent = `ROUND ${r.num}`;
  if (els.money) {
    els.money.textContent = `$${p.money}`;
    els.money.style.color = G.econFlash > 0 ? '#7dff8a' : '';
  }
  // Bomb status + progress.
  if (els['bomb-status']) {
    const b = G.bomb;
    els['bomb-status'].textContent =
      b.state === 'planted' ? `CHARGE PLANTED ${fmtTime(b.fuse)}` :
      b.state === 'dropped' ? 'CHARGE DROPPED' :
      b.carrier === p ? 'YOU CARRY THE CHARGE' : 'CHARGE WITH A TEAMMATE';
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
  // Kill feed + radio.
  if (els.killfeed) {
    els.killfeed.innerHTML = G.killFeed.map((k) =>
      `<div class="${k.byPlayer ? 'kf-me' : ''}">${k.text}</div>`).join('');
  }
  if (els.radio) {
    els.radio.innerHTML = G.radio.map((m) =>
      `<div class="radio-${m.team}">[RADIO] ${m.text}</div>`).join('');
  }
  // Banner (round result; the match-over screen has its own title).
  if (els.banner) {
    const b = r.banner;
    const show = b && b.t > 0 && r.state !== 'over';
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
      els['buy-grid'].innerHTML = CFG.buyOrder.map((key, i) => {
        const ww = CFG.weapons[key];
        const owned = !!p.weapons[key];
        return `<div class="buy-item${owned ? ' owned' : ''}"><b>${i + 1}</b> ${ww.name} <span>$${owned ? Math.max(100, Math.floor(ww.price / 4)) + ' ammo' : ww.price}</span></div>`;
      }).join('') + [
        `<div class="buy-item"><b>7</b> Armor <span>$${CFG.gear.armor}</span></div>`,
        `<div class="buy-item"><b>8</b> HE grenade <span>$${CFG.gear.he}</span></div>`,
        `<div class="buy-item"><b>9</b> Smoke grenade <span>$${CFG.gear.smoke}</span></div>`,
        `<div class="buy-item"><b>0</b> Defuse kit <span>$${CFG.gear.kit}</span></div>`,
      ].join('');
    }
  }
  if (els['buy-hint']) els['buy-hint'].style.display = r.state === 'freeze' && !G.buyOpen ? 'block' : 'none';
  // Scoreboard (Tab held, or below the match-over title at match end).
  if (els.scoreboard) {
    const show = G.input.keys.has('Tab') || r.state === 'over';
    els.scoreboard.style.display = show ? 'block' : 'none';
    els.scoreboard.style.top = r.state === 'over' ? '56%' : '16%';
    if (show) {
      const rows = [...G.agents].sort((a, b) => (b.kills - b.deaths) - (a.kills - a.deaths));
      els['scoreboard-body'].innerHTML = rows.map((a) =>
        `<div class="sb-row${a.isPlayer ? ' sb-me' : ''}"><span>${a.name}</span><span>${a.team === 'atk' ? 'EMBER' : 'ASH'}</span><span>${a.kills} / ${a.deaths}</span><span>${a.alive ? '●' : '✕'}</span></div>`).join('');
    }
  }
  drawMinimap(G);
}
