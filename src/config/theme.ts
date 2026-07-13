/**
 * Single source of truth for color. PALETTE feeds Three.js materials,
 * CSS_VARS feeds the DOM overlay. Never hardcode colors elsewhere.
 */
export const PALETTE = {
  // environment
  grass: 0x8ecf6b,
  grassBright: 0xa5dd7e,
  sand: 0xf0dfae,
  water: 0x4fb8e7,
  waterDeep: 0x2f93c4,
  roadT1: 0x8a8378,
  roadT2: 0x55565e,
  roadT3: 0x3f4048,
  roadLine: 0xf6f2e6,
  sidewalk: 0xd8d2c4,
  dirt: 0xb99e6f,
  plotLine: 0xffffff,

  // residential
  resWallA: 0xf6e7c8,
  resWallB: 0xe8a598,
  resWallC: 0xa8c8e8,
  resRoofA: 0xc9584d,
  resRoofB: 0x7c9a6d,
  resRoofC: 0x5b7c9e,

  // commercial
  comWall: 0xfff1d6,
  comAccent: 0xff9f68,
  comTeal: 0x51c2b8,
  comSign: 0xffd45e,

  // industrial / utility
  indWall: 0xb8794a,
  indMetal: 0x77808c,
  indSafety: 0xf59a3c,
  smoke: 0xb9bec4,
  powerYellow: 0xffd94a,
  powerCyan: 0x59d5e8,
  waterBlue: 0x3f9fe8,
  fireRed: 0xe8564a,
  parkGreen: 0x5cb85f,
  treeGreen: 0x4d9e52,
  treeDark: 0x3b7f44,
  trunk: 0x8a6239,

  // office / downtown / landmark
  glass: 0xa8dcef,
  glassEmissive: 0xfff3b8,
  officeWall: 0xe8eef2,
  landmarkMetal: 0xd8e2e8,
  landmarkGreen: 0x6fcf7c,

  // agents
  skin: 0xf2c99a,
  citizenA: 0xef7d66,
  citizenB: 0x5aa9e6,
  citizenC: 0x8f6fc4,
  carA: 0xe66a5c,
  carB: 0x5aa9e6,
  carC: 0x77c877,
  busYellow: 0xf2b93d,
  truckBox: 0xe8e2d4,

  // feedback
  select: 0xffffff,
  warn: 0xffb03a,
  danger: 0xe8564a,
  good: 0x69d86e,
  coin: 0xffd045,
  material: 0xc98a4b,
  night: 0x1c2b45,
} as const;

export const CSS_VARS: Record<string, string> = {
  '--mb-bg-panel': 'rgba(26, 34, 50, 0.97)',
  '--mb-bg-chip': 'rgba(22, 29, 42, 0.85)',
  '--mb-bg-light': 'rgba(255, 255, 255, 0.96)',
  '--mb-text': '#ffffff',
  '--mb-text-dark': '#2a3243',
  '--mb-text-dim': '#aab6cc',
  '--mb-accent': '#ffd045',
  '--mb-green': '#69d86e',
  '--mb-blue': '#5aa9e6',
  '--mb-red': '#e8564a',
  '--mb-orange': '#ffb03a',
  '--mb-radius': '14px',
  '--mb-font': "'Arial Rounded MT Bold', 'Trebuchet MS', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif",
};

export function applyCssVars(): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(CSS_VARS)) root.style.setProperty(k, v);
}
