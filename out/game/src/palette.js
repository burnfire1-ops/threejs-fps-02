// palette.js — the game's six colours, plus one accent per team.
// The map stays inside this palette so the scene reads at a glance.
export const PAL = {
  canvas: 0x1c2632,
  surface: 0x1e2228,
  hairline: 0x2c323a,
  ink: 0xe9e6df,
  muted: 0x98a0a8,
  accent: 0xf0a830,
  // Map dressing, still inside the palette's family. v6-full brightened
  // the map out of the flat grey-box look: lighter floor and walls, a
  // dusk-blue exterior instead of near-black, warmer accents.
  floor: 0x363b43,
  wall: 0x49525e,
  wallAlt: 0x3d4550,
  wallTop: 0x57637a,
  pipe: 0xa8873f,
  turbine: 0xd09a33,
  coolant: 0x35918a,
  steam: 0xcfd6da,
  siteA: 0xf0a830,
  siteB: 0x3ec6b8,
  // Container-yard paint (v6-visual): cover props wear saturated
  // container colours — teal, rust, olive, mustard, brick, slate —
  // like a bright outdoor container yard, instead of one flat grey.
  // The dusk sky and the amber/teal site accents stay, so the palette
  // stays coherent with v6-full.
  container: [0x2e7f7a, 0xa85a2a, 0x6b7a3a, 0xc9a227, 0x9a4a38, 0x4a6b8a],
  hazard: 0xd8b400,
  trimDark: 0x24282e,
};
export const CSS = {
  canvas: '#14161a', surface: '#1e2228', hairline: '#2c323a',
  ink: '#e9e6df', muted: '#98a0a8', accent: '#f0a830',
};
