# MetroBloom — Art Guide

## Direction

Premium low-poly casual: chunky rounded silhouettes (RoundedBoxGeometry with a
~0.14 bevel on every major volume), flat bright materials, soft shadows plus a
radial-gradient AO disc under each building, emissive windows, thick readable
ground grid. Isometric orthographic camera (offset ≈ (1, 1.05, 1), zoom 8–30
world units). Warm key sun + hemisphere fill + a low-intensity PMREM
RoomEnvironment for glass/metal sheen + ACES tone mapping (exposure 1.02).
Screen-space gradient sky; the map is an island surrounded by ocean so edges
never show void. No photorealism, no neon, no muddy grays.

**Procedural textures** (canvas, zero downloads): painterly two-tone grass,
speckled sand, grain-and-crack asphalt (near-white base so the material color
carries the tier tint). **Water** is a custom ShaderMaterial: sine-displaced
verts, depth gradient, crest glints and animated shore foam.

**Z-fighting rule:** every road edge owns a unique asphalt height
(`0.1 + edgeIndex·0.003` — sub-pixel steps at game zoom) so overlapping meshes
at intersections can never flicker. Lane dashes sit *on* the asphalt (+0.008),
driveways/pads/plot frames each have their own layer below road level.

## Palette

Single source of truth: `src/config/theme.ts` (`PALETTE` for Three.js,
`CSS_VARS` for DOM). Never hardcode colors. Color language: residential warm
creams/brick/soft blue; commercial coral/teal/signage yellow; industrial brick +
metal + safety orange; utilities blue (water) / yellow-cyan (power) / red
(emergency) / green (parks).

## Models

All procedural via `src/render/ModelFactory.ts` — shared geometry/material
caches (`geo()`, `mat()`), `InstancedMesh` for windows and particles. Each
category has 3 **structurally distinct** tiers (extra floors, towers, tanks,
turbines — never scaled clones). To swap in GLB later, replace the builder in
`buildModel()`; simulation code never touches meshes.

Budgets (procedural actuals are far lower): small building ≤6k tris, large ≤20k,
landmark ≤35k, vehicles ≤3k, citizen ≤1.5k. Whole scene currently ~5k tris,
~120 draw calls.

## Conventions

- Pivot at ground center; front (door/signage) faces +Z, rotated toward the
  plot's road anchor at placement.
- Named animation nodes: `chimney` (smoke origin), `rotor`, `ring`, `beacon`,
  `jet`, `crane`/`arm` (construction), `scaffold`.
- Shadows: buildings cast; instanced windows/particles do not.
- Status bubbles are canvas-sprite billboards, one per building, priority-ordered,
  pulsing only when urgent. Glyphs are **drawn as vector paths** on the canvas
  (never emoji text — emoji fonts differ per platform and newer glyphs render
  as tofu on older systems).
- DOM icons are inline SVG from `src/ui/icons.ts` for the same reason; the UI
  font stack is `'Arial Rounded MT Bold', 'Trebuchet MS', 'Segoe UI', …` with
  heavy weights and slight letter-spacing for the game-y look.
- Quality tiers: low = no shadows, capped DPR 1, fewer agents; medium = 1024
  shadow map, DPR 1.5; high = 2048, DPR 2, full agent counts. Auto-scaler steps
  down on sustained >40 ms frames.
