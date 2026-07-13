/**
 * Service networks: road access, power and water distribution.
 * A building is served when its anchor edge connects (over open roads) to a
 * source building's anchor edge and citywide capacity covers demand.
 */
import { BUILDINGS } from '../config/buildings';
import { plotById, plotAnchor } from '../config/map';
import type { SimContext, BuildingRuntime } from './types';

export function tickServices(ctx: SimContext): void {
  const { state, derived, graph } = ctx;
  graph.syncState(state.unlockedDistricts, state.roadTiers);
  derived.waterEnabled = state.level >= 6;

  // gather sources (must themselves be functional + road-connected)
  const powerSources: string[] = [];
  const waterSources: string[] = [];
  let powerSupply = 0;
  let waterSupply = 0;

  for (const b of Object.values(state.buildings)) {
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    const plot = plotById(b.id);
    const usable = !b.damaged && !b.onFire && !b.construction && graph.isEdgeOpen(plot.edge);
    if (usable && def.powerCapacity) {
      powerSources.push(plot.edge);
      powerSupply += def.powerCapacity;
    }
    if (usable && def.waterCapacity) {
      waterSources.push(plot.edge);
      waterSupply += def.waterCapacity;
    }
  }

  let powerDemand = 0;
  let waterDemand = 0;

  for (const b of Object.values(state.buildings)) {
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    const plot = plotById(b.id);
    const rtPrev = derived.runtime.get(b.id);
    const rt: BuildingRuntime = rtPrev ?? {
      powered: false,
      watered: false,
      roadOk: false,
      connected: false,
      workerFactor: 1,
      efficiency: 0,
      exposure: 0,
      covered: false,
      active: false,
    };
    derived.runtime.set(b.id, rt);

    const edgeOpen = graph.isEdgeOpen(plot.edge);
    const tierOk = (def.roadRequirement ?? 1) <= graph.tierOf(plot.edge);
    rt.roadOk = edgeOpen && tierOk;
    rt.connected = edgeOpen;
    rt.active = !b.damaged && !b.onFire && !b.construction;

    const wantsPower = (def.powerDemand ?? 0) > 0 && rt.active;
    const wantsWater = derived.waterEnabled && (def.waterDemand ?? 0) > 0 && rt.active;
    rt.powered = wantsPower ? edgeOpen && powerSources.some((src) => graph.connected(src, plot.edge)) : true;
    rt.watered = wantsWater ? edgeOpen && waterSources.some((src) => graph.connected(src, plot.edge)) : true;
    if (wantsPower && rt.powered) powerDemand += def.powerDemand ?? 0;
    if (wantsWater && rt.watered) waterDemand += def.waterDemand ?? 0;
  }

  derived.powerSupply = powerSupply;
  derived.powerDemand = powerDemand;
  derived.waterSupply = waterSupply;
  derived.waterDemand = waterDemand;

  // shortage → non-essential buildings get scaled service, essentials keep 1.
  const powerRatio = powerDemand > 0 ? Math.min(1, powerSupply / powerDemand) : 1;
  const waterRatio = waterDemand > 0 ? Math.min(1, waterSupply / waterDemand) : 1;
  derived.powerRatio = powerRatio;
  derived.waterRatio = waterRatio;

  for (const b of Object.values(state.buildings)) {
    const rt = derived.runtime.get(b.id)!;
    const essential = b.defId === 'power' || b.defId === 'water' || b.defId === 'fire';
    if (!essential) {
      if (rt.powered && powerRatio < 1) rt.powered = powerRatio > 0.55; // brownout threshold
      if (rt.watered && waterRatio < 1) rt.watered = waterRatio > 0.55;
    }
  }
  // fire anchor plot needs plotAnchor imported (kept for coverage calc in fire.ts)
  void plotAnchor;
}
