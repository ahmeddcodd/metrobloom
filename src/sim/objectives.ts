/**
 * Objective evaluation + level progression. Pure evaluation functions are
 * exported for unit tests; side-effects (rewards, events) happen in tickObjectives.
 */
import { LEVELS, levelDef, type ObjectiveDef } from '../config/levels';
import { BUILDINGS } from '../config/buildings';
import { bus } from '../utils/events';
import type { GameStateData } from '../game/GameState';
import type { Derived } from './types';

export interface ObjectiveProgress {
  def: ObjectiveDef;
  cur: number;
  max: number;
  done: boolean;
}

export function evaluateObjective(def: ObjectiveDef, s: GameStateData, d: Derived): ObjectiveProgress {
  const p = (cur: number, max: number): ObjectiveProgress => ({
    def,
    cur: Math.min(cur, max),
    max,
    done: cur >= max,
  });
  switch (def.kind) {
    case 'repair': {
      const b = s.buildings[def.plot];
      return p(b && !b.damaged ? 1 : 0, 1);
    }
    case 'build': {
      const n = Object.values(s.buildings).filter((b) => b.defId === def.category && !b.construction).length;
      return p(n, def.count);
    }
    case 'buildTier': {
      const n = Object.values(s.buildings).filter(
        (b) => b.defId === def.category && b.tier >= def.tier && !b.construction,
      ).length;
      return p(n, def.count);
    }
    case 'roadTier': {
      if (def.edge) return p(s.roadTiers[def.edge] >= def.tier ? 1 : 0, 1);
      const n = Object.values(s.roadTiers).filter((t) => t >= def.tier).length;
      return p(n, def.count);
    }
    case 'poweredHomes': {
      let n = 0;
      for (const b of Object.values(s.buildings)) {
        if (b.defId === 'residential' && d.runtime.get(b.id)?.powered && d.runtime.get(b.id)?.active) n++;
      }
      return p(n, def.count);
    }
    case 'population':
      return p(Math.floor(d.population), def.amount);
    case 'happiness':
      return p(s.happiness, def.amount);
    case 'jobsFilled':
      return p(Math.floor(d.jobsFilled), def.amount);
    case 'counter':
      return p(Math.floor(s.counters[def.key] ?? 0), def.amount);
    case 'allWatered': {
      let need = 0;
      let ok = 0;
      for (const b of Object.values(s.buildings)) {
        const def2 = BUILDINGS[b.defId].tiers[b.tier - 1];
        const rt = d.runtime.get(b.id);
        if (!rt?.active || (def2.waterDemand ?? 0) <= 0) continue;
        if (b.defId === 'residential' && b.occupancy < 0.5) continue;
        need++;
        if (rt.watered) ok++;
      }
      return need === 0 ? p(0, 1) : p(ok === need ? 1 : 0, 1);
    }
    case 'powerReserve':
      return p(Math.floor(d.powerSupply - d.powerDemand), def.amount);
    case 'waterReserve':
      return p(Math.floor(d.waterSupply - d.waterDemand), def.amount);
    case 'pollutionMax':
      return p(d.pollutionAvg <= def.amount ? 1 : 0, 1);
    case 'trafficEff':
      return p(d.trafficEfficiency >= def.amount ? 1 : 0, 1);
    case 'busRoute':
      return p(d.busActive ? 1 : 0, 1);
    case 'industryCovered': {
      let need = 0;
      let ok = 0;
      for (const b of Object.values(s.buildings)) {
        if (b.defId !== 'industrial') continue;
        const rt = d.runtime.get(b.id);
        if (!rt?.active) continue;
        need++;
        if (rt.covered) ok++;
      }
      return need === 0 ? p(0, 1) : p(ok === need ? 1 : 0, 1);
    }
    case 'landmark': {
      const lm = Object.values(s.buildings).find((b) => b.defId === 'landmark');
      return p(lm && !lm.construction ? lm.tier : Math.max(0, (lm?.tier ?? 1) - 1), def.stage);
    }
  }
}

export function evaluateLevel(s: GameStateData, d: Derived): ObjectiveProgress[] {
  const def = levelDef(s.level);
  if (!def) return [];
  return def.objectives.map((o) => evaluateObjective(o, s, d));
}

/** Advance the campaign when all objectives are complete. */
export function tickObjectives(s: GameStateData, d: Derived): void {
  if (s.level > LEVELS.length) return; // Free Mayor Mode
  const progress = evaluateLevel(s, d);
  if (!progress.length || !progress.every((o) => o.done)) return;

  const def = levelDef(s.level)!;
  s.coins += def.reward.coins;
  s.materials += def.reward.materials ?? 0;
  for (const permit of def.reward.permits ?? []) {
    if (!s.permits.includes(permit)) s.permits.push(permit);
  }
  if (def.reward.district && !s.unlockedDistricts.includes(def.reward.district)) {
    s.unlockedDistricts.push(def.reward.district);
    bus.emit('districtUnlocked', def.reward.district);
  }
  const completedLevel = s.level;
  s.level += 1;
  bus.emit('levelCompleted', completedLevel);
  if (completedLevel >= LEVELS.length) {
    s.completed = true;
    bus.emit('gameCompleted', undefined);
  } else {
    bus.emit('levelStarted', s.level);
  }
  bus.emit('stateChanged', undefined);
}
