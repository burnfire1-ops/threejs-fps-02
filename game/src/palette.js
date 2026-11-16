// palette.js — the game's six colours, plus one accent per team. The map stays inside this palette so the scene reads at a glance.
export const PAL = {
  canvas: 0x1c2632,
  surface: 0x1e2228,
  hairline: 0x2c323a,
  ink: 0xe9e6df,
  muted: 0x98a0a8,
  accent: 0xf0a830,
  // Daylight sky: bright blue above, pale horizon below, warm sun. The dusk-blue canvas stays for the HUD/menu only.
  sky: 0x8ec4ea,
  skyHorizon: 0xd6e8f7,
  sun: 0xffe3ae,
  // Distant skyline silhouette: hazy blue-grey blocks outside the walls, plus warm hanging-lamp glow.
  skyline: 0x46586e,
  lamp: 0xffc46b,
  // Map dressing, still inside the palette's family: clean grey street —
  // neutral grey floor and walls, yellow accents — lightened one more step for the daylight.
  floor: 0x6e7276,
  wall: 0x70747a,
  wallAlt: 0x63676d,
  wallTop: 0x767a80,
  pipe: 0xa8873f,
  turbine: 0xd09a33,
  coolant: 0x35918a,
  steam: 0xcfd6da,
  siteA: 0xf0a830,
  siteB: 0x3ec6b8,
  // Container-yard paint: cover props wear saturated container colours — teal,
  // rust, olive, mustard, brick, slate — like a bright outdoor container yard, instead of one flat grey.
  container: [0x2e7f7a, 0xa85a2a, 0x6b7a3a, 0xc9a227, 0x9a4a38, 0x4a6b8a],
  hazard: 0xd8b400,
  trimDark: 0x24282e,
  // Operator uniforms: CTs in dark blue, Ts in tan/khaki, each with a darker shade,
  // a helmet tone, and a bright team accent for the visor and shoulder marks.
  ctSuit: 0x2b4a6e, ctDark: 0x1d3249, ctHelm: 0x24384f, ctAccent: 0x5a9bd4,
  tSuit: 0x8a6f3c, tDark: 0x5d4a26, tHelm: 0x6b5a2e, tAccent: 0xf0a830,
  // CS:GO-style crates: warm wood planks and grey steel, painted on canvas like the containers.
  wood: 0x8a6a42, woodDark: 0x6b4f2e, metal: 0x707880, metalDark: 0x4a5058,
};
export const CSS = {
  canvas: '#14161a', surface: '#1e2228', hairline: '#2c323a',
  ink: '#e9e6df', muted: '#98a0a8', accent: '#f0a830',
};
