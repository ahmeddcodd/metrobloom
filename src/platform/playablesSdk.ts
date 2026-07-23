/**
 * Typed wrapper around the YouTube Playables SDK.
 * All calls are guarded — when `window.ytgame` is absent or we are outside
 * the Playables frame (local dev), safe no-op fallbacks keep behavior identical.
 */

interface YtGame {
  /** true only when actually running inside the YouTube Playables frame */
  IN_PLAYABLES_ENV?: boolean;
  game?: {
    firstFrameReady?: () => void;
    gameReady?: () => void;
    loadData?: () => Promise<string>;
    saveData?: (data: string) => Promise<void>;
  };
  system?: {
    isAudioEnabled?: () => boolean;
    onAudioEnabledChange?: (cb: (enabled: boolean) => void) => void;
    onPause?: (cb: () => void) => void;
    onResume?: (cb: () => void) => void;
  };
  engagement?: {
    sendScore?: (data: { value: number }) => Promise<void> | void;
  };
}

declare global {
  interface Window {
    ytgame?: YtGame;
  }
}

class PlayablesSdk {
  private firstFrameSent = false;
  private gameReadySent = false;

  /** Wait briefly for the async SDK script; resolves either way. */
  async waitForSdk(timeoutMs = 1200): Promise<boolean> {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      if (window.ytgame) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return !!window.ytgame;
  }

  get available(): boolean {
    // The SDK script loads in any browser but only functions inside the
    // YouTube frame — outside it we must use local fallbacks (saves!).
    return !!window.ytgame && window.ytgame.IN_PLAYABLES_ENV === true;
  }

  firstFrameReady(): void {
    if (this.firstFrameSent || !this.available) return;
    this.firstFrameSent = true;
    try {
      window.ytgame?.game?.firstFrameReady?.();
    } catch {
      /* never crash the game on SDK errors */
    }
  }

  gameReady(): void {
    if (this.gameReadySent || !this.available) return;
    this.gameReadySent = true;
    try {
      window.ytgame?.game?.gameReady?.();
    } catch {
      /* noop */
    }
  }

  async loadData(): Promise<string> {
    if (!this.available) return '';
    try {
      const fn = window.ytgame?.game?.loadData;
      if (fn) return await fn.call(window.ytgame?.game);
    } catch {
      /* fall through to empty save */
    }
    return '';
  }

  async saveData(data: string): Promise<boolean> {
    if (!this.available) return false;
    try {
      const fn = window.ytgame?.game?.saveData;
      if (fn) {
        await fn.call(window.ytgame?.game, data);
        return true;
      }
    } catch {
      /* noop */
    }
    return false;
  }

  onPause(cb: () => void): void {
    if (!this.available) return;
    try {
      window.ytgame?.system?.onPause?.(cb);
    } catch {
      /* noop */
    }
  }

  onResume(cb: () => void): void {
    if (!this.available) return;
    try {
      window.ytgame?.system?.onResume?.(cb);
    } catch {
      /* noop */
    }
  }

  isAudioEnabled(): boolean {
    if (!this.available) return true;
    try {
      const fn = window.ytgame?.system?.isAudioEnabled;
      if (fn) return fn.call(window.ytgame?.system);
    } catch {
      /* noop */
    }
    return true;
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): void {
    if (!this.available) return;
    try {
      window.ytgame?.system?.onAudioEnabledChange?.(cb);
    } catch {
      /* noop */
    }
  }

  /** Submit the player's score (must be a non-negative integer). */
  sendScore(value: number): void {
    if (!this.available) return;
    try {
      const v = Math.max(0, Math.round(value)) | 0; // force a clean integer
      window.ytgame?.engagement?.sendScore?.({ value: v });
    } catch {
      /* never crash on SDK errors */
    }
  }
}

export const sdk = new PlayablesSdk();
