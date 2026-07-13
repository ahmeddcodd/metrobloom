/**
 * Traffic: every active building places trip demand on its anchor edge
 * (trips originate from real homes/workplaces/shops). Bus routes divert a
 * share of car trips. Congestion = demand/capacity per edge.
 */
import { BUILDINGS } from '../config/buildings';
import { plotById } from '../config/map';
import { ECONOMY } from '../config/economy';
import type { SimContext } from './types';

export function tickTraffic(ctx: SimContext): void {
  const { state, derived, graph } = ctx;

  // ---- bus route: at least two functional stops connected to each other
  const stops = Object.values(state.buildings).filter((b) => {
    const rt = derived.runtime.get(b.id)!;
    return b.defId === 'transit' && rt.active && rt.connected;
  });
  let busActive = false;
  let carReduction = 0;
  if (stops.length >= 2) {
    for (let i = 0; i < stops.length && !busActive; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        if (graph.connected(plotById(stops[i].id).edge, plotById(stops[j].id).edge)) {
          busActive = true;
          break;
        }
      }
    }
  }
  if (busActive) {
    for (const s of stops) {
      carReduction += BUILDINGS.transit.tiers[s.tier - 1].carTripReduction ?? 0;
    }
    carReduction = Math.min(0.5, carReduction);
  }
  derived.busActive = busActive;
  derived.carReduction = carReduction;

  // ---- per-edge demand
  const loads = new Map<string, number>();
  for (const b of Object.values(state.buildings)) {
    const rt = derived.runtime.get(b.id)!;
    if (!rt.active) continue;
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    let demand = def.trafficDemand ?? 0;
    if (b.defId === 'residential') {
      const cap = def.populationCapacity ?? 1;
      demand *= Math.max(0.2, b.occupancy / cap);
    }
    demand *= 1 - carReduction;
    if (demand <= 0) continue;
    const edge = plotById(b.id).edge;
    loads.set(edge, (loads.get(edge) ?? 0) + demand);
  }
  // active deliveries add load along their whole route (they are real trips)
  for (const d of derived.deliveries) {
    for (let i = 0; i < d.nodes.length - 1; i++) {
      const a = d.nodes[i];
      const b = d.nodes[i + 1];
      for (const [id, rt] of graph.edges) {
        if ((rt.edge.a === a && rt.edge.b === b) || (rt.edge.a === b && rt.edge.b === a)) {
          loads.set(id, (loads.get(id) ?? 0) + 1);
        }
      }
    }
  }

  let worst = 0;
  let excessSum = 0;
  let openCount = 0;
  for (const [id] of graph.edges) {
    const load = loads.get(id) ?? 0;
    graph.setLoad(id, load);
    if (!graph.isEdgeOpen(id)) continue;
    openCount++;
    const rt = graph.edges.get(id)!;
    worst = Math.max(worst, rt.congestion);
    excessSum += Math.max(0, rt.congestion - ECONOMY.congestionComfort);
  }
  derived.maxCongestion = worst;
  const avgExcess = openCount > 0 ? excessSum / openCount : 0;
  derived.trafficEfficiency = Math.round(Math.max(0, Math.min(100, 100 - avgExcess * 90 - Math.max(0, worst - 1) * 25)));
}
