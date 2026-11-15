// combat.js — damage with headshots and armor, death, kill feed.
// Headshots multiply torso damage (x4 on most weapons); armor absorbs half
// of what remains and wears down. Friendly fire is off.
import { CFG } from './config.js';
import { playHit } from './audio.js';

export function damageAgent(G, target, dmg, part, attacker) {
  if (!target.alive) return;
  let rest = dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, rest * 0.5);
    target.armor -= absorbed;
    rest -= absorbed;
  }
  target.hp -= rest;
  if (attacker?.isPlayer) playHit(G, part === 'head');
  if (target.isPlayer && attacker) {
    // Damage direction, relative to where the player looks (for the HUD arc).
    const dx = attacker.pos.x - target.pos.x, dz = attacker.pos.z - target.pos.z;
    G.dmgDir = Math.atan2(-dx, -dz) - target.yaw;
    G.dmgDirT = 0.9;
    G.dmgFlash = 0.7;
  }
  if (target.hp <= 0) killAgent(G, target, attacker, part);
}

export function killAgent(G, target, attacker, part) {
  target.hp = 0;
  target.alive = false;
  target.deathT = 0;
  target.deaths = (target.deaths ?? 0) + 1;
  if (attacker) attacker.kills = (attacker.kills ?? 0) + 1;
  if (target.mesh) target.mesh.visible = false;
  if (target === G.player) G.playerDied = true;
  const atkName = attacker ? attacker.name : 'World';
  const line = `${atkName} ${part === 'head' ? '◉' : '✕'} ${target.name}`;
  G.killFeed.unshift({ text: line, t: 5, byPlayer: attacker?.isPlayer, victimPlayer: target.isPlayer });
  if (G.killFeed.length > 5) G.killFeed.pop();
  if (attacker?.isPlayer && attacker !== target) {
    attacker.money += CFG.economy.kill;
    G.econFlash = 0.8;
  }
  // If the bomb carrier dies, the bomb drops where they fell.
  if (G.bomb.carrier === target) {
    G.bomb.carrier = null;
    G.bomb.dropped = target.pos.clone();
    G.bomb.dropped.y = 0;
  }
  // A death is the loudest thing on the map: nearby bots turn toward it.
  if (G.noise) G.noise(target.pos, 30);
}
