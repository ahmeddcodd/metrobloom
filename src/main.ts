/**
 * Boot order (certification-critical):
 * 1. splash renders → firstFrameReady()
 * 2. await loadData()  (always before any saveData)
 * 3. build world, start loop
 * 4. player can interact → gameReady()
 */
import './ui/styles.css';
import { sdk } from './platform/playablesSdk';
import { saveSystem } from './platform/saveSystem';
import { Game } from './game/Game';

function splashProgress(p: number): void {
  const el = document.getElementById('boot-fill');
  if (el) el.style.width = `${Math.round(p * 100)}%`;
}

function buildSplash(): void {
  const root = document.getElementById('ui-root')!;
  const div = document.createElement('div');
  div.id = 'boot-splash';
  div.innerHTML = `
    <div id="loading">
      <div class="city-icon">🏙️</div>
      <div class="logo">METROBLOOM</div>
      <div class="bar"><div id="boot-fill"></div></div>
    </div>`;
  root.appendChild(div);
}

/** Wait for the splash to paint, but NEVER block boot: hidden/backgrounded tabs
 *  suspend requestAnimationFrame, so race it against a short timeout. */
function nextPaint(): Promise<void> {
  return Promise.race([
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    new Promise<void>((r) => setTimeout(r, 250)),
  ]);
}

async function boot(): Promise<void> {
  try {
    await bootInner();
  } catch (err) {
    // a boot failure must never leave a blank/stuck splash — surface + recover
    console.error('[metrobloom] boot failed', err);
    const splash = document.getElementById('boot-splash');
    if (splash) splash.remove();
  }
}

async function bootInner(): Promise<void> {
  buildSplash();
  // let the splash actually paint before signaling (bounded — see nextPaint)
  await nextPaint();
  await sdk.waitForSdk();
  sdk.firstFrameReady();
  splashProgress(0.3);

  const saveBlob = await saveSystem.load(); // ALWAYS before any save
  splashProgress(0.6);

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;
  const game = new Game(saveBlob, canvas, uiRoot);
  splashProgress(0.9);

  game.start();
  splashProgress(1);
  // world visible + input live → the game is genuinely interactable
  window.setTimeout(() => {
    const splash = document.getElementById('boot-splash');
    if (splash) {
      splash.style.transition = 'opacity 0.4s';
      splash.style.opacity = '0';
      window.setTimeout(() => splash.remove(), 450);
    }
    sdk.gameReady();
  }, 250);
}

void boot();
