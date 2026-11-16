// config.js — every tuning number in one place. Gameplay reads from here; logic never hardcodes a number that a designer would want to change.
export const CFG = {
  map: { half: 20, wallH: 4.6 },
  player: {
    walk: 5.2, crouch: 2.4, accel: 42, friction: 11, gravity: 18, jump: 6.2,
    eyeStand: 1.6, eyeCrouch: 1.02, radius: 0.38, hp: 100,
  },
  round: { freeze: 8, live: 100, post: 4, winScore: 8, maxRounds: 15 },
  economy: {
    start: 800, kill: 300, win: 3250, loss: 1900,
    lossStreak: 500, lossStreakMax: 3,
  },
  bomb: { plantTime: 3, fuse: 40, defuseTime: 5, defuseKitTime: 2.5 },
  // Six weapons. dmg = torso damage; head multiplies by headMul. gap = seconds between shots; spread in radians (still / moving).
  weapons: {
    pistol: { name: 'P9 Sidearm', dmg: 26, headMul: 4, gap: 0.15, mag: 12, reserve: 36, reload: 1.4, spreadStill: 0.004, spreadMove: 0.02, price: 500, auto: false, moveSpeed: 5.2, pellets: 1, kick: 0.011 },
    smg: { name: 'VK-9', dmg: 22, headMul: 4, gap: 0.075, mag: 30, reserve: 90, reload: 1.8, spreadStill: 0.006, spreadMove: 0.03, price: 1500, auto: true, moveSpeed: 5.0, pellets: 1, kick: 0.008 },
    shotgun: { name: 'M590 Breacher', dmg: 9, headMul: 3, gap: 0.8, mag: 6, reserve: 24, reload: 2.6, spreadStill: 0.05, spreadMove: 0.08, price: 1700, auto: false, moveSpeed: 4.9, pellets: 8, kick: 0.045 },
    rifle: { name: 'AR-77', dmg: 30, headMul: 4, gap: 0.096, mag: 30, reserve: 90, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, price: 2700, auto: true, moveSpeed: 5.0, pellets: 1, kick: 0.013 },
    lmg: { name: 'MG-60', dmg: 28, headMul: 4, gap: 0.11, mag: 60, reserve: 120, reload: 3.2, spreadStill: 0.004, spreadMove: 0.035, price: 3800, auto: true, moveSpeed: 4.6, pellets: 1, kick: 0.012 },
    sniper: { name: 'LR-50', dmg: 80, headMul: 2, gap: 1.2, mag: 5, reserve: 15, reload: 2.8, spreadStill: 0.001, spreadMove: 0.06, price: 4750, auto: false, moveSpeed: 4.8, pellets: 1, kick: 0.06 },
  },
  // Buy menu order (keys 1-6) and gear.
  buyOrder: ['pistol', 'smg', 'shotgun', 'rifle', 'lmg', 'sniper'],
  gear: { armor: 650, he: 300, smoke: 300, kit: 400 },
  grenade: { heDamage: 90, heRadius: 6, smokeRadius: 5, smokeTime: 14, throwSpeed: 14 },
  bot: {
    walk: 4.2, reactionMin: 0.25, reactionMax: 0.45, aimErr: 0.028,
    seeDist: 45, fov: 1.75, hearR: 25, burstMin: 3, burstMax: 5,
    burstPauseMin: 0.4, burstPauseMax: 0.9, thinkEvery: 0.15,
  },
  teams: {
    atk: { name: 'Ember', color: 0xf0a830, css: '#f0a830' },
    def: { name: 'Ash', color: 0x3ec6b8, css: '#3ec6b8' },
  },
  botNames: {
    atk: ['Vex', 'Rook', 'Mira', 'Juno'],
    def: ['Sable', 'Onyx', 'Kestrel', 'Wren', 'Dusk'],
  },
};
