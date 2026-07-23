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
  const { state, derived, graph, dt, time } = ctx;

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
      // A fire is fought if ANY active fire station can reach it by road — a
      // truck is dispatched and the building is SAVED. Covered buildings get a
      // faster response. Only a fire no crew can reach burns out into damage.
      const canRespond = stations.some((st) => graph.connected(plotById(st.id).edge, plot.edge));
      const responseTime = rt.covered ? 3 + ECONOMY.fireExtinguishSeconds : ECONOMY.fireBurnSeconds - 2;
      const saved = canRespond && b.fireT >= responseTime;
      const burnedOut = !canRespond && b.fireT >= ECONOMY.fireBurnSeconds;
      if (saved || burnedOut) {
        b.onFire = false;
        b.fireT = 0;
        b.fireRisk = 0;
        b.warnedAt = -1;
        if (burnedOut) b.damaged = true; // no crew could reach it → needs repair
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
    // Baseline cooldown: without an ACTIVE cause, risk always trends to zero.
    // This is what makes "fix the cause" actually resolve the warning — homes
    // and buildings whose risk source is removed cool down on their own.
    let rate = -0.4;
    // Fire risk only builds where it is physically plausible: industrial
    // processes and aging power equipment. Homes/shops just brown out — they
    // never catch fire from a citywide power shortage.
    if (b.defId === 'industrial') {
      rate += b.tier === 3 ? 1.1 : 1.2 + b.tier * 0.4; // clean plant is much safer
    }
    if (b.defId === 'power' && b.tier === 1) rate += 0.7; // old generator runs hot
    // an overloaded grid stresses electrical EQUIPMENT (industry/power), not homes
    if (derived.powerRatio < 1 && (b.defId === 'industrial' || b.defId === 'power')) {
      rate += 0.6;
    }
    if (rt.covered) rate -= 2.2; // fire-station coverage strongly drains risk
    // scripted pressure: L7 introduces the system with a guaranteed warning
    if (state.level === 7 && b.defId === 'industrial' && !rt.covered) rate += 1.4;
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
