# MetroBloom — YouTube Playables Checklist

## Verified in this build

- [x] SDK `<script src="https://www.youtube.com/game_api/v1">` loads in `index.html` **before** game code.
- [x] `firstFrameReady()` fires once, after the splash actually paints (double-rAF) — `src/main.ts`.
- [x] `gameReady()` fires once, only when the world renders and input is live — never behind a blocking loader.
- [x] `loadData()` awaited before any `saveData()` (boot order in `main.ts`; `SaveSystem.loaded` guard).
- [x] Saves versioned + migration-safe (unit-tested: null/garbage/partial/future blobs), debounced, ~2 KB (« 500 KiB soft limit).
- [x] `onPause`/`onResume` pause the loop, sim, audio; a safety save fires on pause. `visibilitychange` fallback outside YouTube.
- [x] Audio: procedural WebAudio only, unlocked on first user gesture, gain follows `isAudioEnabled()` + `onAudioEnabledChange()`. No autoplay.
- [x] All SDK calls guarded (`IN_PLAYABLES_ENV` check + try/catch) — local dev falls back to LocalStorage no-ops.
- [x] Bundle: 1 HTML + 1 CSS + 1 JS ≈ 620 KB raw / 165 KB gzip (budget: <15 MiB initial). File count 3 (≤8000). Safe filenames. Relative paths (`base: './'`).
- [x] No external requests besides the SDK script itself; no fonts, no CDNs, no analytics, no links, no login, no ads/IAP, no share prompts.
- [x] Touch + mouse + keyboard input; no hover-only interactions; 44 px+ touch targets; `touch-action: none` on canvas; `overscroll-behavior: none`.
- [x] Responsive: desktop, mobile portrait (375×812 verified), landscape, square; CSS safe-area insets; resize never resets game state.
- [x] Reduced-motion setting (camera cuts, minimal particles) + quality setting (auto/low/medium/high) with adaptive downscaling.
- [x] Every status icon has a text explanation in the building panel (no color-only meaning).
- [x] Clear completion state (score screen) + Free Mayor Mode; no in-game quit button.
- [x] Debug panel only behind `?debug=1`.
- [x] WebGL context-loss event handled (prevents default; page remains recoverable).
- [x] Original IP: name, map, buildings, UI and audio are all original/procedural; reference images used as mood only.

## Verify against current platform docs before submission

- [ ] Exact current SDK method names/typings (`ytgame.game.*`, `ytgame.system.*`) — wrapper isolates changes to `src/platform/playablesSdk.ts`.
- [ ] Packaging format (zip layout, entry file expectations) for the `dist/` folder.
- [ ] Whether the SDK script tag must be non-async in the current spec.
- [ ] Score-submission API if leaderboards are wanted (not currently used).
- [ ] Real-device pass on mid-range Android + iOS YouTube apps (touch latency, heap, thermal).
