/**
 * Single source of truth for persistent simulation state.
 * Systems read/write it; UI and renderers observe via the event bus.
 * Derived per-tick values live in `Derived` (sim/Simulation.ts), never here.
 */
import { BUILDINGS, type BuildingCategory } from '../config/buildings';
import { EDGES, PLOTS, type DistrictId } from '../config/map';
import { ECONOMY } from '../config/economy';
import { SAVE_VERSION, type SaveBlob } from '../platform/saveSystem';

export interface BuildingState {
  id: string; // == plotId
  defId: BuildingCategory;
  tier: number;
  damaged: boolean; // needs repair before it functions (start-state or post-fire)
  construction: { targetTier: number; remaining: number; total: number } | null;
  occupancy: number;
  workers: number;
  prodProgress: number;
  taxProgress: number;
  salesProgress: number;
  storedGoods: number; // industry: produced goods awaiting delivery
  inventory: number; // commercial: delivered goods on shelf
  coinsReady: number;
  materialsReady: number;
  fireRisk: number;
  onFire: boolean;
  fireT: number;
  warnedAt: number; // sim time the risk warning first showed (fairness rule)
}

export interface Settings {
  quality: 'auto' | 'low' | 'medium' | 'high';
  reducedMotion: boolean;
  music: boolean;
  sfx: boolean;
}

export interface GameStateData {
  version: number;
  level: number; // 1..10; 11 = Free Mayor Mode
  coins: number;
  materials: number;
  permits: string[];
  buildings: Record<string, BuildingState>;
  roadTiers: Record<string, number>;
  unlockedDistricts: DistrictId[];
  counters: Record<string, number>; // objective counters (taxCollected, deliveries, ...)
  happiness: number;
  playSeconds: number;
  tutorialSeen: string[];
  completed: boolean;
  bestScore: number;
  settings: Settings;
}

export function newBuilding(plotId: string, defId: BuildingCategory, tier: number, damaged = false, occupancy = 0): BuildingState {
  return {
    id: plotId,
    defId,
    tier,
    damaged,
    construction: null,
    occupancy,
    workers: 0,
    prodProgress: 0,
    taxProgress: 0,
    salesProgress: 0,
    storedGoods: 0,
    inventory: 0,
    coinsReady: 0,
    materialsReady: 0,
    fireRisk: 0,
    onFire: false,
    fireT: 0,
    warnedAt: -1,
  };
}

export function createInitialState(): GameStateData {
  const buildings: Record<string, BuildingState> = {};
  for (const p of PLOTS) {
    if (p.initial) {
      buildings[p.id] = newBuilding(p.id, p.initial.category, p.initial.tier, p.initial.damaged, p.initial.occupancy ?? 0);
    }
  }
  const roadTiers: Record<string, number> = {};
  for (const e of EDGES) roadTiers[e.id] = e.initialTier;
  return {
    version: SAVE_VERSION,
    level: 1,
    coins: ECONOMY.startCoins,
    materials: ECONOMY.startMaterials,
    permits: [],
    buildings,
    roadTiers,
    unlockedDistricts: ['oldtown'],
    counters: {},
    happiness: 55,
    playSeconds: 0,
    tutorialSeen: [],
    completed: false,
    bestScore: 0,
    settings: { quality: 'auto', reducedMotion: false, music: true, sfx: true },
  };
}

export function serialize(s: GameStateData): SaveBlob {
  return { ...s, version: SAVE_VERSION } as unknown as SaveBlob;
}

/** Rebuild a valid state from a (possibly older/partial) save blob. */
export function deserialize(blob: SaveBlob | null): GameStateData {
  const fresh = createInitialState();
  if (!blob) return fresh;
  const b = blob as Partial<GameStateData>;
  const s: GameStateData = {
    ...fresh,
    level: typeof b.level === 'number' ? b.level : 1,
    coins: typeof b.coins === 'number' ? b.coins : fresh.coins,
    materials: typeof b.materials === 'number' ? b.materials : 0,
    permits: Array.isArray(b.permits) ? (b.permits as string[]) : [],
    unlockedDistricts: Array.isArray(b.unlockedDistricts) ? (b.unlockedDistricts as DistrictId[]) : ['oldtown'],
    counters: b.counters && typeof b.counters === 'object' ? { ...(b.counters as Record<string, number>) } : {},
    happiness: typeof b.happiness === 'number' ? b.happiness : 55,
    playSeconds: typeof b.playSeconds === 'number' ? b.playSeconds : 0,
    tutorialSeen: Array.isArray(b.tutorialSeen) ? (b.tutorialSeen as string[]) : [],
    completed: !!b.completed,
    bestScore: typeof b.bestScore === 'number' ? b.bestScore : 0,
    settings: { ...fresh.settings, ...(b.settings as Settings | undefined) },
    buildings: {},
    roadTiers: { ...fresh.roadTiers },
  };
  // buildings: only accept entries whose plot + def still exist (forward-compat)
  if (b.buildings && typeof b.buildings === 'object') {
    for (const [pid, raw] of Object.entries(b.buildings as Record<string, Partial<BuildingState>>)) {
      if (!PLOTS.some((p) => p.id === pid)) continue;
      const defId = raw.defId as BuildingCategory;
      if (!BUILDINGS[defId]) continue;
      const base = newBuilding(pid, defId, typeof raw.tier === 'number' ? raw.tier : 1, !!raw.damaged, raw.occupancy ?? 0);
      s.buildings[pid] = {
        ...base,
        workers: raw.workers ?? 0,
        storedGoods: raw.storedGoods ?? 0,
        inventory: raw.inventory ?? 0,
        coinsReady: raw.coinsReady ?? 0,
        materialsReady: raw.materialsReady ?? 0,
        fireRisk: raw.fireRisk ?? 0,
        construction: raw.construction ?? null,
      };
    }
  }
  if (b.roadTiers && typeof b.roadTiers === 'object') {
    for (const [eid, t] of Object.entries(b.roadTiers as Record<string, number>)) {
      if (eid in s.roadTiers && typeof t === 'number') s.roadTiers[eid] = t;
    }
  }
  return s;
}

export function addCounter(s: GameStateData, key: string, n = 1): void {
  s.counters[key] = (s.counters[key] ?? 0) + n;
}
