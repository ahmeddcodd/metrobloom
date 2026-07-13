/**
 * Population (move-in/out driven by desirability) and employment
 * (proportional job filling with a travel-connectivity requirement).
 */
import { BUILDINGS } from '../config/buildings';
import { plotById } from '../config/map';
import { ECONOMY } from '../config/economy';
import { clamp } from '../utils/math';
import type { SimContext } from './types';

export function tickPopulation(ctx: SimContext): void {
  const { state, derived, dt, graph } = ctx;

  let population = 0;
  let popCapacity = 0;

  for (const b of Object.values(state.buildings)) {
    if (b.defId !== 'residential') continue;
    const def = BUILDINGS.residential.tiers[b.tier - 1];
    const rt = derived.runtime.get(b.id)!;
    const cap = def.populationCapacity ?? 0;
    if (rt.active) popCapacity += cap;

    // desirability gates move-in; failures cause slow move-out (soft failure)
    const desirable =
      rt.active && rt.roadOk && rt.powered && rt.watered && state.happiness > 40 && rt.exposure < 60;
    if (desirable && b.occupancy < cap) {
      const speed = ECONOMY.moveInRate * (0.5 + state.happiness / 200);
      b.occupancy = Math.min(cap, b.occupancy + cap * speed * dt * 0.1 + speed * dt * 4);
    } else if (!desirable && b.occupancy > 0 && (!rt.active || !rt.powered || !rt.watered || !rt.roadOk)) {
      // soft failure: unhappy residents trickle out, but a connected home never
      // fully empties — the town stays recoverable (no death spiral).
      // A missing single service (e.g. water just introduced) is gentler than
      // a full blackout or being cut off.
      const severe = !rt.active || !rt.connected || !rt.powered;
      const floor = rt.connected && rt.active ? cap * (severe ? 0.3 : 0.55) : 0;
      b.occupancy = Math.max(floor, b.occupancy - dt * (severe ? 0.4 : 0.15));
    }
    population += b.occupancy;
  }

  derived.population = population;
  derived.popCapacity = popCapacity;
  state.counters['peakPopulation'] = Math.max(state.counters['peakPopulation'] ?? 0, population);

  // ---- employment
  const workforce = population * ECONOMY.workforceRatio;
  // a workplace only receives workers if reachable from at least one occupied home
  const homeEdges: string[] = [];
  for (const b of Object.values(state.buildings)) {
    if (b.defId === 'residential' && b.occupancy > 0.5) homeEdges.push(plotById(b.id).edge);
  }

  let jobsTotal = 0;
  const employers: { id: string; jobs: number; reachable: boolean }[] = [];
  for (const b of Object.values(state.buildings)) {
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    const rt = derived.runtime.get(b.id)!;
    const jobs = def.jobs ?? 0;
    if (jobs <= 0) continue;
    const reachable = rt.active && rt.connected && homeEdges.some((e) => graph.connected(e, plotById(b.id).edge));
    if (rt.active) jobsTotal += jobs;
    employers.push({ id: b.id, jobs, reachable });
  }

  const fillRatio = jobsTotal > 0 ? clamp(workforce / jobsTotal, 0, 1) : 0;
  let jobsFilled = 0;
  for (const e of employers) {
    const b = state.buildings[e.id];
    const rt = derived.runtime.get(e.id)!;
    const filled = e.reachable ? e.jobs * fillRatio : 0;
    b.workers = filled;
    jobsFilled += filled;
    rt.workerFactor = e.jobs > 0 ? clamp(filled / e.jobs, ECONOMY.minWorkerFactor, 1) : 1;
    if (!e.reachable) rt.workerFactor = 0;
  }

  derived.jobsTotal = jobsTotal;
  derived.jobsFilled = jobsFilled;
  derived.employmentRate = jobsTotal > 0 ? jobsFilled / jobsTotal : 1;
  derived.unemployment = Math.max(0, workforce - jobsFilled);

  // ---- overall building efficiency (used by production, taxes, sales)
  for (const b of Object.values(state.buildings)) {
    const rt = derived.runtime.get(b.id)!;
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    if (!rt.active || !rt.connected) {
      rt.efficiency = 0;
      continue;
    }
    let eff = 1;
    if ((def.jobs ?? 0) > 0) eff *= rt.workerFactor;
    if ((def.powerDemand ?? 0) > 0) eff *= rt.powered ? (0.6 + 0.4 * derived.powerRatio) : 0.15;
    if (derived.waterEnabled && (def.waterDemand ?? 0) > 0) eff *= rt.watered ? (0.7 + 0.3 * derived.waterRatio) : 0.3;
    if (!rt.roadOk) eff *= 0.5;
    rt.efficiency = clamp(eff, 0, 1);
  }
}
