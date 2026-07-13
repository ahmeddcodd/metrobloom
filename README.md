# METROBLOOM 🏙️

A compact, premium isometric 3D city-builder for **YouTube Playables**.
Vite + Three.js + TypeScript (strict). Zero downloaded assets — every model,
texture and sound is procedural.

Restore a neglected coastal district through a ten-level campaign: power →
housing → jobs → commerce → traffic → water & pollution → fire safety →
transit → downtown density → the Eco Spire landmark. Then keep playing in
**Free Mayor Mode**.

## Run

```sh
npm install
npm run dev        # http://localhost:5174 (SDK no-ops outside YouTube)
```

## Build & validate

```sh
npm run typecheck  # strict TS
npm test           # vitest logic suite (services, economy, objectives, saves, fire fairness)
npm run build      # production bundle → dist/ (~620 KB raw, ~165 KB gzip)
npm run preview    # serve the built bundle
npm run sizecheck  # bundle report vs Playables budgets
```

## Play

- **Tap / click** a building to inspect it; tap an empty plot to build; tap a road to
  upgrade it. Tapping a building with a coin/crate bubble collects instantly.
- **Drag** to pan, **pinch / wheel** to zoom. WASD/arrows pan on desktop, Esc closes panels.
- The **happiness chip** (top-left) opens a full factor breakdown.
- The **objective panel** (top-center) tracks the current level; tap it to collapse.
- Debug tools: append `?debug=1` (coins, materials, level skip, sim ×4, fire test, finale).

## Architecture

```
src/
  config/     theme (palette+CSS vars), buildings, map layout, economy, levels — ALL balance data
  platform/   playablesSdk (guarded wrapper), saveSystem (versioned + migration), audioSystem (procedural WebAudio)
  game/       GameState (single source of truth), Actions (validated player commands), Game (orchestrator + loop)
  sim/        RoadGraph (A* + cache), Simulation (fixed 10 Hz tick) + services / population / production /
              traffic / environment / fire / objectives systems
  render/     Renderer (quality scaling), CameraController (iso ortho + input), ModelFactory (procedural
              3-tier buildings), CityRenderer, Terrain, Agents (cars/trucks/bus/citizens), Effects, Lighting
  ui/         UIManager (HUD, panels, build menu, tutorial, end screen) + styles.css
tests/        pure-logic vitest suite
```

Simulation order per tick: services → population/employment → production/goods →
traffic → pollution/happiness → fire → objectives → status icons.

## Save system

Versioned JSON via Playables `loadData`/`saveData` (LocalStorage in dev).
`loadData()` is always awaited before any save; saves are debounced, event-driven
(construction, upgrades, level-ups, settings) plus a 20 s safety interval, and
migration-safe (`tests` cover null/garbage/partial/future blobs). Resize never
resets state.

## Performance

~120 draw calls / ~5k triangles in normal play (budget <150). One shadow-casting
sun (off on low quality), instanced particles & windows, pooled vehicles/citizens,
auto quality scaling with manual override in Settings.
