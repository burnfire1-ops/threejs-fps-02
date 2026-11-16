// shots.js — deterministic screenshot scenarios for ?shot=. start: title overlay
// over the map. play: mid-round, a bot in the sights, a shot going off. plant: the
// charge going down at site A with a defender closing in. end: match over,
// scoreboard up. Each mode sets fixed positions and a seeded RNG, so the same seed renders the same frame.
export function applyShot(G, mode) {
  const p = G.player;
  const bots = G.bots;
  const atk = bots.filter((b) => b.team === 'atk');
  const def = bots.filter((b) => b.team === 'def');
  if (mode === 'start') {
    G.menuOpen = true;
    p.pos.set(0, 0, 17);
    p.yaw = 0;
    p.pitch = -0.02;
    return;
  }
  G.menuOpen = false;
  if (mode === 'play') {
    G.round.state = 'live';
    G.round.timer = 67;
    G.round.scoreAtk = 2; G.round.scoreDef = 1; G.round.num = 4;
    p.pos.set(0, 0, 10);
    p.yaw = 0.05;
    p.pitch = 0;
    p.money = 3150;
    p.cur = 'rifle';
    if (!p.weapons.rifle) p.weapons.rifle = { mag: 30, reserve: 90, reloading: 0, cooldown: 0 };
    p.weapons.rifle.mag = 24;
    // One enemy mid-lane in the sights, one teammate on the left.
    def[0].pos.set(0.5, 0, 2);
    def[0].yaw = Math.PI;
    def[0].alive = true;
    def[0].mesh.visible = true;
    atk[0].pos.set(-6, 0, 6);
    atk[0].yaw = 0.4;
    // A shot going off: flash up, one kill already on the feed.
    G.viewModel.flash.material.opacity = 0.9;
    G.viewModel.flashLight.intensity = 6;
    G.killFeed.unshift({ text: 'You ◉ Sable', t: 5, byPlayer: true, victimPlayer: false });
    G.radio.unshift({ text: 'Vex: Contact mid — pushing A', t: 6, team: 'atk' });
    return;
  }
  if (mode === 'plant') {
    G.round.state = 'live';
    G.round.timer = 45;
    G.round.scoreAtk = 3; G.round.scoreDef = 3; G.round.num = 7;
    // Player at the south-east edge of site A, facing the plant zone and
    // the turbine beyond it; a defender closes in from the west.
    p.pos.set(-10.5, 0, -9.5);
    p.yaw = 0.785;
    p.pitch = -0.05;
    p.money = 2400;
    G.bomb.state = 'carried';
    G.bomb.carrier = p;
    G.bomb.plantProgress = 2.1;
    def[0].pos.set(-15.5, 0, -9);
    def[0].yaw = Math.PI * 0.25;
    def[0].alive = true;
    def[0].mesh.visible = true;
    atk[0].pos.set(-16, 0, -8);
    atk[0].yaw = 0.8;
    G.radio.unshift({ text: 'Mira: Planting A — cover me', t: 6, team: 'atk' });
    return;
  }
  if (mode === 'end') {
    G.round.state = 'over';
    G.round.scoreAtk = 8; G.round.scoreDef = 5; G.round.num = 13;
    G.round.banner = { text: 'EMBER TAKES THE MATCH 8–5', t: 9999, team: 'atk' };
    p.pos.set(0, 0, 8);
    p.yaw = 0;
    p.pitch = -0.03;
    p.money = 4200;
    // Plausible match K/D so the scoreboard reads like a real match.
    const kd = { You: [12, 5], Vex: [9, 7], Rook: [11, 6], Mira: [7, 8], Juno: [6, 9], Sable: [8, 10], Onyx: [10, 8], Kestrel: [5, 9], Wren: [7, 11], Dusk: [6, 10] };
    for (const a of G.agents) {
      const v = kd[a.name];
      if (v) { a.kills = v[0]; a.deaths = v[1]; }
    }
    G.input.keys.add('Tab');
    G.killFeed.unshift({ text: 'You ✕ Wren', t: 5, byPlayer: true, victimPlayer: false });
    G.killFeed.unshift({ text: 'Rook ◉ Onyx', t: 5, byPlayer: false, victimPlayer: false });
    return;
  }
}
