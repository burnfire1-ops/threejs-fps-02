// rounds.js — the round state machine: freeze (buy) -> live -> post, then
// the next round. First to 8 wins the match (max 15 rounds). A round ends
// by elimination, detonation, defuse, or timeout (defenders win if the
// charge never went down; once planted the clock stops and only the bomb
// decides). Match end shows the final banner and freezes the score.
import { CFG } from './config.js';
import { awardRound } from './economy.js';
import { resetBotsForRound } from './bots.js';
import { giveWeapon } from './player.js';
import { playRoundWin, playRoundLose } from './audio.js';

export function createRounds() {
  return {
    state: 'freeze', num: 1, timer: CFG.round.freeze,
    scoreAtk: 0, scoreDef: 0, lossStreakAtk: 0, lossStreakDef: 0,
    banner: null, winner: null, reason: null,
  };
}

export function startRound(G) {
  const r = G.round;
  r.state = 'freeze';
  r.timer = CFG.round.freeze;
  r.banner = null;
  // Reset the player.
  const p = G.player;
  const spawn = G.world.spawns[p.team][2];
  p.pos.copy(spawn);
  p.vel.set(0, 0, 0);
  p.hp = CFG.player.hp;
  p.alive = true;
  p.yaw = p.team === 'atk' ? 0 : Math.PI;
  p.pitch = 0;
  // v6-full: clear the recoverable recoil offset and the spectator target.
  p.recoilPitch = 0;
  p.recoilYaw = 0;
  p.lastShotT = -99;
  G.spectate = null;
  // Keep weapons and money between rounds; refresh the starter pistol.
  if (!p.weapons.pistol) {
    const w = CFG.weapons.pistol;
    p.weapons.pistol = { mag: w.mag, reserve: w.reserve, reloading: 0 };
    p.cur = 'pistol';
  }
  resetBotsForRound(G);
  // Reset the bomb to the player and clear the field.
  const b = G.bomb;
  b.state = 'carried'; b.carrier = p; b.dropped = null;
  b.site = null; b.fuse = 0; b.plantProgress = 0; b.defuseProgress = 0;
  b.mesh.visible = false;
  for (const g of G.grenades) G.scene.remove(g.mesh);
  G.grenades.length = 0;
  for (const s of G.smokes) G.scene.remove(s.mesh);
  G.smokes.length = 0;
  G.killFeed.length = 0;
}

// Rematch (v6-full-fix): the end screen promises "press R for a rematch",
// so R really restarts the match. startRound keeps weapons and money
// between rounds, so a fresh match resets them explicitly first. Bots get
// their equipment from the round number, so r.num = 1 handles them.
export function rematch(G) {
  const r = G.round;
  r.scoreAtk = 0; r.scoreDef = 0;
  r.lossStreakAtk = 0; r.lossStreakDef = 0;
  r.num = 1; r.winner = null; r.reason = null;
  const p = G.player;
  p.money = CFG.economy.start;
  p.weapons = {}; giveWeapon(p, 'pistol'); p.cur = 'pistol';
  p.kit = false; p.grenades = { he: 0, smoke: 0 }; p.armor = 0;
  startRound(G);
}

export function endRound(G, winner, reason) {
  const r = G.round;
  if (r.state === 'post' || r.state === 'over') return;
  r.winner = winner;
  r.reason = reason;
  if (winner === 'atk') {
    r.scoreAtk++;
    r.lossStreakDef++;
    r.lossStreakAtk = 0;
  } else {
    r.scoreDef++;
    r.lossStreakAtk++;
    r.lossStreakDef = 0;
  }
  awardRound(G, winner);
  const names = { elimination: 'Team eliminated', detonation: 'Charge detonated', defuse: 'Charge defused', timeout: 'Time expired' };
  r.banner = { text: `${winner === 'atk' ? 'EMBER' : 'ASH'} WINS — ${names[reason] ?? reason}`, t: CFG.round.post, team: winner };
  r.state = 'post';
  r.timer = CFG.round.post;
  if (winner === G.player.team) playRoundWin(G);
  else playRoundLose(G);
}

export function stepRounds(G, dt) {
  const r = G.round;
  if (r.state === 'over') return;
  if (r.state === 'freeze') {
    r.timer -= dt;
    if (r.timer <= 0) { r.state = 'live'; r.timer = CFG.round.live; }
    return;
  }
  if (r.state === 'post') {
    r.timer -= dt;
    if (r.timer <= 0) {
      if (r.scoreAtk >= CFG.round.winScore || r.scoreDef >= CFG.round.winScore || r.num >= CFG.round.maxRounds) {
        r.state = 'over';
        const w = r.scoreAtk > r.scoreDef ? 'atk' : r.scoreDef > r.scoreAtk ? 'def' : null;
        r.banner = { text: w ? `${w === 'atk' ? 'EMBER' : 'ASH'} TAKES THE MATCH ${r.scoreAtk}–${r.scoreDef}` : `DRAW ${r.scoreAtk}–${r.scoreDef}`, t: 9999, team: w };
        return;
      }
      r.num++;
      startRound(G);
    }
    return;
  }
  // Live: elimination, timeout. The clock stops once the charge is planted.
  // Once planted, only the bomb decides: if every attacker is dead the
  // round still runs until defuse or detonation. (The old code ended it
  // instantly by elimination, so a planted charge could never detonate
  // after its team died.) Defender elimination still ends the round when
  // planted: with nobody left to defuse, the attackers win either way.
  const atkAlive = G.agents.some((a) => a.team === 'atk' && a.alive);
  const defAlive = G.agents.some((a) => a.team === 'def' && a.alive);
  if (!atkAlive && G.bomb.state !== 'planted') { endRound(G, 'def', 'elimination'); return; }
  if (!defAlive) { endRound(G, 'atk', 'elimination'); return; }
  if (G.bomb.state !== 'planted') {
    r.timer -= dt;
    if (r.timer <= 0) endRound(G, 'def', 'timeout');
  }
}
