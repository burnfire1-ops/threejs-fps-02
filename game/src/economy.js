// economy.js — money between rounds, and the buy menu (B during freeze). Kill +$300,
// round win +$3,250, loss +$1,900 with a +$500 loss-streak bonus (max 3). Buying a
// weapon you own refills its reserve for a quarter price.
import { CFG } from './config.js';

export function awardRound(G, winner) {
  const r = G.round;
  for (const a of G.agents) {
    if (!a.isPlayer) continue;
    if (a.team === winner) {
      a.money += CFG.economy.win;
    } else {
      const streak = winner === 'atk' ? r.lossStreakDef : r.lossStreakAtk;
      a.money += CFG.economy.loss + Math.min(streak - 1, CFG.economy.lossStreakMax) * CFG.economy.lossStreak;
    }
  }
}

// Returns a message for the HUD (or null when nothing was bought).
export function buyItem(G, key) {
  const p = G.player;
  if (G.round.state !== 'freeze' || !p.alive) return null;
  const w = CFG.weapons[key];
  if (w) {
    if (p.weapons[key]) {
      const cost = Math.max(100, Math.floor(w.price / 4));
      if (p.money < cost) return 'Not enough money';
      p.money -= cost;
      p.weapons[key].reserve = w.reserve;
      return `${w.name} ammo refilled -$${cost}`;
    }
    if (p.money < w.price) return 'Not enough money';
    p.money -= w.price;
    p.weapons[key] = { mag: w.mag, reserve: w.reserve, reloading: 0, cooldown: 0 };
    p.cur = key;
    return `${w.name} bought -$${w.price}`;
  }
  if (key === 'armor') {
    if (p.armor >= 100) return 'Armor already full';
    if (p.money < CFG.gear.armor) return 'Not enough money';
    p.money -= CFG.gear.armor;
    p.armor = 100;
    return `Armor -$${CFG.gear.armor}`;
  }
  if (key === 'he' || key === 'smoke') {
    if (p.grenades[key] >= 2) return 'Carrying max grenades';
    if (p.money < CFG.gear[key]) return 'Not enough money';
    p.money -= CFG.gear[key];
    p.grenades[key]++;
    return `${key === 'he' ? 'HE grenade' : 'Smoke grenade'} -$${CFG.gear[key]}`;
  }
  if (key === 'kit') {
    if (p.team !== 'def') return 'Defenders only';
    if (p.kit) return 'Already have a kit';
    if (p.money < CFG.gear.kit) return 'Not enough money';
    p.money -= CFG.gear.kit;
    p.kit = true;
    return `Defuse kit -$${CFG.gear.kit}`;
  }
  return null;
}
