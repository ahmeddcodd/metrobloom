/**
 * Versioned, migration-safe persistence.
 * Inside YouTube → SDK saveData/loadData. Local dev → LocalStorage fallback.
 * loadData() is ALWAYS awaited before the first saveData() (enforced by Game boot order).
 */
import { sdk } from './playablesSdk';

const LOCAL_KEY = 'metrobloom-save-v1';
export const SAVE_VERSION = 1;

export interface SaveBlob {
  version: number;
  [key: string]: unknown;
}

/** Pure migration function — unit-tested. Accepts any historical shape. */
export function migrateSave(raw: unknown): SaveBlob | null {
  if (!raw || typeof raw !== 'object') return null;
  const blob = raw as SaveBlob;
  if (typeof blob.version !== 'number') return null;
  // Future migrations chain here: if (blob.version === 1) { ...; blob.version = 2; }
  if (blob.version > SAVE_VERSION) {
    // Save from a newer build: keep known fields, never crash.
    blob.version = SAVE_VERSION;
  }
  return blob;
}

class SaveSystem {
  private loaded = false;
  private lastSerialized = '';
  private pendingTimer: number | null = null;

  async load(): Promise<SaveBlob | null> {
    let text = '';
    if (sdk.available) {
      text = await sdk.loadData();
    } else {
      try {
        text = localStorage.getItem(LOCAL_KEY) ?? '';
      } catch {
        text = '';
      }
    }
    this.loaded = true;
    if (!text) return null;
    try {
      return migrateSave(JSON.parse(text));
    } catch {
      // Corrupt save: back it up locally where possible, then start fresh.
      try {
        localStorage.setItem(LOCAL_KEY + '-corrupt', text.slice(0, 4096));
      } catch {
        /* noop */
      }
      return null;
    }
  }

  /** Debounced save — never called per frame; callers pass a snapshot factory. */
  requestSave(snapshot: () => SaveBlob, delayMs = 800): void {
    if (!this.loaded) return; // hard rule: never save before load resolved
    if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer);
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      void this.saveNow(snapshot());
    }, delayMs);
  }

  async saveNow(blob: SaveBlob): Promise<void> {
    if (!this.loaded) return;
    const text = JSON.stringify(blob);
    if (text === this.lastSerialized) return;
    if (text.length > 500 * 1024) {
      // Stay far below the 3 MiB platform ceiling; refuse pathological saves.
      return;
    }
    this.lastSerialized = text;
    if (sdk.available) {
      await sdk.saveData(text);
    } else {
      try {
        localStorage.setItem(LOCAL_KEY, text);
      } catch {
        /* storage full/blocked: non-fatal */
      }
    }
  }

  reset(): void {
    this.lastSerialized = '';
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* noop */
    }
    if (sdk.available) void sdk.saveData('');
  }
}

export const saveSystem = new SaveSystem();
