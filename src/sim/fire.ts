/**
 * Fire risk & response. Risk has visible causes, a warning phase ALWAYS
 * precedes ignition, stations cover by radius and dispatch a truck, and a
 * burned building is damaged (repairable) — never destroyed.
 */
import { BUILDINGS } from '../config/buildings';
import { plotById } from '../config/map';
import { ECONOMY } from '../config/economy';
import { bus } from '../utils/events';
import { dist2d } from '../utils/math';
import { addCounter } from '../game/GameState';
import type { SimContext } from './types';

export function tickFire(ctx: SimContext): void {
  const { state, derived, dt, time } = ctx;

  const stations = Object.values(state.buildings).filter(
    (b) => b.defId === 'fire' && derived.runtime.get(b.id)!.active,
  );

  for (const b of Object.values(state.buildings)) {
    const rt = derived.runtime.get(b.id)!;
    const plot = plotById(b.id);

    // coverage
    rt.covered = stations.some((st) => {
      const sp = plotById(st.id);
      const r = BUILDINGS.fire.tiers[st.tier - 1].coverageRadius ?? 18;
      return dist2d(plot.x, plot.z, sp.x, sp.z) <= r;
    });

    // ---- active fire
    if (b.onFire) {
      b.fireT += dt;
      const responseTime = rt.covered ? 3 + ECONOMY.fireExtinguishSeconds : ECONOMY.fireBurnSeconds;
      if (b.fireT >= responseTime) {
        b.onFire = false;
        b.fireT = 0;
        b.fireRisk = 0;
        b.warnedAt = -1;
        if (!rt.covered) b.damaged = true; // uncontrolled burn → needs repair
        addCounter(state, 'firesResolved');
        bus.emit('fireResolved', b.id);
        bus.emit('buildingChanged', b.id);
      }
      continue;
    }

    // ---- risk accumulation: only real causes
    if (!rt.active) {
      b.fireRisk = Math.max(0, b.fireRisk - dt * 4);
      continue;
    }
    let rate = 0;
    if (b.defId === 'industrial') {
      rate += 0.5 + b.tier * 0.4; // industrial activity
      if (b.tier === 3) rate -= 0.6; // clean plant is safer
    }
    if (b.defId === 'power' && b.tier === 1) rate += 0.35; // old generator
    if (derived.powerRatio < 1 && (BUILDINGS[b.defId].tiers[b.tier - 1].powerDemand ?? 0) > 0) {
      rate += 0.5; // overloaded grid
    }
    if (rt.covered) rate -= 1.2; // covered buildings drain risk
    // scripted pressure: L7 introduces the system with a guaranteed warning
    if (state.level === 7 && b.defId === 'industrial' && !rt.covered) rate += 1.6;
    b.fireRisk = Math.max(0, Math.min(ECONOMY.fireRiskIgnite, b.fireRisk + rate * dt));
    // before L7 the fire system isn't taught and no station can be built:
    // risk stays below the warning threshold — no punishment without a solution
    if (state.level < 7) b.fireRisk = Math.min(b.fireRisk, ECONOMY.fireRiskWarn - 5);

    if (b.fireRisk >= ECONOMY.fireRiskWarn && b.warnedAt < 0) {
      b.warnedAt = time;
      addCounter(state, 'fireWarnings');
    }
    if (b.fireRisk < ECONOMY.fireRiskWarn && b.warnedAt >= 0) {
      b.warnedAt = -1; // player resolved the risk before ignition
      addCounter(state, 'fireWarningsCleared');
    }
    // fairness rule: never ignite without ≥20s of visible warning
    if (b.fireRisk >= ECONOMY.fireRiskIgnite && b.warnedAt >= 0 && time - b.warnedAt > 20) {
      b.onFire = true;
      b.fireT = 0;
      addCounter(state, 'firesStarted');
      bus.emit('fireStarted', b.id);
      bus.emit('buildingChanged', b.id);
    }
  }
}
