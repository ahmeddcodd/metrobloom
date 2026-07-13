/**
 * All player commands, with full validation. The UI never mutates state —
 * it calls these. Every rejection carries a human-readable reason
 * (requirements are never hidden).
 */
import { BUILDINGS, REPAIR_COST, fireRepairCost, type BuildingCategory } from '../config/buildings';
import { ECONOMY } from '../config/economy';
import { edgeById, plotById } from '../config/map';
import { addCounter, newBuilding, type GameStateData } from './GameState';
import { bus } from '../utils/events';
import { audio } from '../platform/audioSystem';
import type { Simulation } from '../sim/Simulation';

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

const ok: ActionResult = { ok: true };
const fail = (reason: string): ActionResult => ({ ok: false, reason });

export class Actions {
  constructor(
    private state: GameStateData,
    private sim: Simulation,
  ) {}

  canBuild(plotId: string, category: BuildingCategory): ActionResult {
    const s = this.state;
    const plot = plotById(plotId);
    if (s.buildings[plotId]) return fail('This plot is already occupied.');
    if (!plot.allowed.includes(category)) return fail('This plot does not allow that building type.');
    if (!s.unlockedDistricts.includes(plot.district)) return fail('This district is still locked.');
    if (plot.unlockLevel && s.level < plot.unlockLevel) return fail('This plot is not ready for development yet.');
    const def = BUILDINGS[category];
    if (def.permit && !s.permits.includes(def.permit)) return fail(`Requires the ${def.displayName} permit (earned by campaign progress).`);
    const t1 = def.tiers[0];
    if (s.coins < t1.coinCost) return fail(`Needs ${t1.coinCost} coins — you have ${Math.floor(s.coins)}.`);
    if (s.materials < t1.materialCost) return fail(`Needs ${t1.materialCost} materials — industry produces them.`);
    return ok;
  }

  build(plotId: string, category: BuildingCategory): ActionResult {
    const can = this.canBuild(plotId, category);
    if (!can.ok) return can;
    const t1 = BUILDINGS[category].tiers[0];
    this.state.coins -= t1.coinCost;
    this.state.materials -= t1.materialCost;
    const b = newBuilding(plotId, category, 1);
    b.construction = { targetTier: 1, remaining: t1.buildTime, total: t1.buildTime };
    this.state.buildings[plotId] = b;
    addCounter(this.state, 'buildingsBuilt');
    audio.play('build');
    bus.emit('buildingChanged', plotId);
    bus.emit('stateChanged', undefined);
    return ok;
  }

  /** Returns unmet requirements for the next tier (empty = upgradable). */
  upgradeBlockers(plotId: string): string[] {
    const s = this.state;
    const b = s.buildings[plotId];
    if (!b) return ['Nothing built here.'];
    if (b.construction) return ['Construction in progress.'];
    if (b.damaged) return ['Repair this building first.'];
    if (b.onFire) return ['The building is on fire!'];
    const def = BUILDINGS[b.defId];
    if (b.tier >= def.tiers.length) return ['Already at maximum tier.'];
    const next = def.tiers[b.tier];
    const blockers: string[] = [];
    if (s.coins < next.coinCost) blockers.push(`${next.coinCost} coins (have ${Math.floor(s.coins)})`);
    if (s.materials < next.materialCost) blockers.push(`${next.materialCost} materials (have ${Math.floor(s.materials)})`);
    const plot = plotById(plotId);
    if ((next.roadRequirement ?? 1) > (s.roadTiers[plot.edge] ?? 0)) {
      blockers.push(`Tier ${next.roadRequirement} road access`);
    }
    if ((next.happinessRequirement ?? 0) > s.happiness) {
      blockers.push(`${next.happinessRequirement}% happiness (now ${s.happiness}%)`);
    }
    return blockers;
  }

  upgrade(plotId: string): ActionResult {
    const blockers = this.upgradeBlockers(plotId);
    if (blockers.length) return fail(blockers.join(' · '));
    const b = this.state.buildings[plotId]!;
    const next = BUILDINGS[b.defId].tiers[b.tier];
    this.state.coins -= next.coinCost;
    this.state.materials -= next.materialCost;
    b.construction = { targetTier: b.tier + 1, remaining: next.buildTime, total: next.buildTime };
    addCounter(this.state, 'upgrades');
    audio.play('upgrade');
    bus.emit('buildingChanged', plotId);
    bus.emit('stateChanged', undefined);
    return ok;
  }

  repairCost(plotId: string): number {
    const b = this.state.buildings[plotId];
    if (!b) return 0;
    return REPAIR_COST[b.defId]?.coins ?? fireRepairCost(b.tier);
  }

  repair(plotId: string): ActionResult {
    const b = this.state.buildings[plotId];
    if (!b || !b.damaged) return fail('Nothing to repair.');
    const cost = this.repairCost(plotId);
    if (this.state.coins < cost) return fail(`Repair needs ${cost} coins — collect taxes first.`);
    this.state.coins -= cost;
    b.damaged = false;
    b.fireRisk = 0;
    addCounter(this.state, 'repairs');
    audio.play('build');
    bus.emit('buildingChanged', plotId);
    bus.emit('stateChanged', undefined);
    return ok;
  }

  collect(plotId: string): ActionResult {
    const b = this.state.buildings[plotId];
    if (!b) return fail('Nothing here.');
    let collected = false;
    if (b.coinsReady >= 1) {
      const amount = Math.floor(b.coinsReady);
      this.state.coins += amount;
      b.coinsReady -= amount;
      addCounter(this.state, 'taxCollected');
      addCounter(this.state, 'coinsEarned', amount);
      bus.emit('collect', { plotId, kind: 'coins', amount });
      audio.play('coin');
      collected = true;
    }
    if (b.materialsReady >= 1) {
      const amount = Math.floor(b.materialsReady);
      this.state.materials += amount;
      b.materialsReady -= amount;
      addCounter(this.state, 'materialsCollected', amount);
      bus.emit('collect', { plotId, kind: 'materials', amount });
      audio.play('material');
      collected = true;
    }
    if (collected) bus.emit('stateChanged', undefined);
    return collected ? ok : fail('Nothing to collect yet.');
  }

  roadUpgradeCost(edgeId: string): { coins: number; materials: number } | null {
    const tier = this.state.roadTiers[edgeId] ?? 0;
    if (tier >= 3 || tier < 1) return null;
    return {
      coins: ECONOMY.roadUpgradeCost[tier + 1],
      materials: ECONOMY.roadUpgradeMaterials[tier + 1],
    };
  }

  upgradeRoad(edgeId: string): ActionResult {
    const edge = edgeById(edgeId);
    if (!this.state.unlockedDistricts.includes(edge.district)) return fail('This road is in a locked district.');
    const cost = this.roadUpgradeCost(edgeId);
    if (!cost) return fail('This road is already at the maximum tier.');
    if (this.state.coins < cost.coins) return fail(`Needs ${cost.coins} coins.`);
    if (this.state.materials < cost.materials) return fail(`Needs ${cost.materials} materials.`);
    this.state.coins -= cost.coins;
    this.state.materials -= cost.materials;
    this.state.roadTiers[edgeId] += 1;
    this.sim.graph.invalidateCache();
    addCounter(this.state, 'roadUpgrades');
    audio.play('build');
    bus.emit('roadChanged', edgeId);
    bus.emit('stateChanged', undefined);
    return ok;
  }
}
