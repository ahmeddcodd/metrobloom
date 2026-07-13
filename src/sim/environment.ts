/**
 * Pollution (real sources, distance falloff, park mitigation) and the
 * transparent happiness formula with a full factor breakdown.
 */
import { BUILDINGS } from '../config/buildings';
import { plotById, PLOTS } from '../config/map';
import { ECONOMY } from '../config/economy';
import { clamp, dist2d } from '../utils/math';
import type { SimContext } from './types';

export function tickEnvironment(ctx: SimContext): void {
  const { state, derived } = ctx;

  // ---- pollution sources
  const sources: { x: number; z: number; p: number }[] = [];
  for (const b of Object.values(state.buildings)) {
    const rt = derived.runtime.get(b.id)!;
    if (!rt.active) continue;
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    const out = def.pollutionOutput ?? 0;
    if (out > 0) {
      const plot = plotById(b.id);
      sources.push({ x: plot.x, z: plot.z, p: out * Math.max(0.3, rt.efficiency) });
    }
  }
  // parks (and the finished Eco Spire) mitigate
  const parks: { x: number; z: number; r: number }[] = [];
  for (const b of Object.values(state.buildings)) {
    const rt = derived.runtime.get(b.id)!;
    if (!rt.active) continue;
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    if (def.mitigationRadius) {
      const plot = plotById(b.id);
      parks.push({ x: plot.x, z: plot.z, r: def.mitigationRadius });
    }
  }

  let exposureSum = 0;
  let homes = 0;
  for (const b of Object.values(state.buildings)) {
    const rt = derived.runtime.get(b.id)!;
    const plot = plotById(b.id);
    let exposure = 0;
    for (const s of sources) {
      const d = dist2d(plot.x, plot.z, s.x, s.z);
      const falloff = Math.max(0, 1 - d / ECONOMY.pollutionRadius);
      if (falloff <= 0) continue;
      let mitigation = 1;
      for (const park of parks) {
        const pd = dist2d(plot.x, plot.z, park.x, park.z);
        if (pd < park.r) mitigation *= 0.55 + 0.45 * (pd / park.r);
      }
      exposure += s.p * falloff * mitigation;
    }
    rt.exposure = exposure * 8; // normalize to ~0..100
    if (b.defId === 'residential') {
      exposureSum += rt.exposure * Math.max(0.2, b.occupancy / 8);
      homes++;
    }
  }
  derived.pollutionAvg = homes > 0 ? Math.round(clamp(exposureSum / homes, 0, 100)) : 0;

  // ---- happiness with breakdown (never a mystery percentage)
  const bd: { label: string; value: number; icon: string }[] = [];
  const employment = derived.jobsTotal > 0 ? Math.round((derived.employmentRate - 0.5) * 24) : 0;
  bd.push({ label: 'Employment', value: employment, icon: '💼' });

  const powerScore = derived.powerDemand === 0 ? 0 : derived.powerRatio >= 1 ? 10 : Math.round(-16 * (1 - derived.powerRatio) - 4);
  bd.push({ label: 'Power reliability', value: powerScore, icon: '⚡' });

  let waterScore = 0;
  if (derived.waterEnabled) {
    waterScore = derived.waterDemand === 0 ? -6 : derived.waterRatio >= 1 ? 8 : Math.round(-12 * (1 - derived.waterRatio) - 4);
    // unwatered occupied homes hurt even when citywide capacity is fine
    const dry = Object.values(state.buildings).some(
      (b) => b.defId === 'residential' && b.occupancy > 0.5 && !derived.runtime.get(b.id)!.watered,
    );
    if (dry) waterScore = Math.min(waterScore, -8);
  }
  bd.push({ label: 'Water supply', value: waterScore, icon: '💧' });

  const shopsStocked = Object.values(state.buildings).filter(
    (b) => b.defId === 'commercial' && derived.runtime.get(b.id)!.active && b.inventory > 0,
  ).length;
  bd.push({ label: 'Shopping access', value: Math.min(8, shopsStocked * 4), icon: '🛒' });

  const parkBonus = Object.values(state.buildings).reduce((sum, b) => {
    const rt = derived.runtime.get(b.id)!;
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    return sum + (rt.active ? (def.happinessBonus ?? 0) : 0);
  }, 0);
  bd.push({ label: 'Parks & nature', value: Math.min(15, parkBonus), icon: '🌳' });

  const covered = countCoveredHomes(ctx);
  bd.push({ label: 'Fire safety', value: covered > 0 ? 6 : 0, icon: '🚒' });

  const trafficPenalty = Math.round((100 - derived.trafficEfficiency) * 0.14);
  bd.push({ label: 'Traffic', value: -trafficPenalty, icon: '🚗' });

  const pollutionPenalty = Math.round(derived.pollutionAvg * 0.16);
  bd.push({ label: 'Air quality', value: -pollutionPenalty, icon: '🌫️' });

  const total = clamp(Math.round(50 + bd.reduce((s, f) => s + f.value, 0)), 0, 100);
  derived.happinessBreakdown = bd;
  derived.happiness = total;
  // smooth persistent value so brief dips don't whiplash the HUD
  state.happiness = Math.round(state.happiness + (total - state.happiness) * Math.min(1, ctx.dt * 2));
}

function countCoveredHomes(ctx: SimContext): number {
  const { state, derived } = ctx;
  const stations = Object.values(state.buildings).filter(
    (b) => b.defId === 'fire' && derived.runtime.get(b.id)!.active,
  );
  if (!stations.length) return 0;
  let covered = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.defId !== 'residential' || b.occupancy < 0.5) continue;
    const plot = plotById(b.id);
    for (const st of stations) {
      const sp = plotById(st.id);
      const r = BUILDINGS.fire.tiers[st.tier - 1].coverageRadius ?? 18;
      if (dist2d(plot.x, plot.z, sp.x, sp.z) <= r) {
        covered++;
        break;
      }
    }
  }
  void PLOTS;
  return covered;
}
