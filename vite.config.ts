import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths are mandatory for YouTube Playables bundles.
  base: './',
  build: {
    target: 'es2021',
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5174 },
  // `npm run preview` serves the real production bundle (no dev tooling) — this
  // is what should be run against the Playables certification checker.
  preview: { port: 4174 },
});
