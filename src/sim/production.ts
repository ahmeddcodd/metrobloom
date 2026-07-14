/**
 * Industry production (materials + goods), road-following deliveries to
 * commerce, commercial sales, and tax accrual. Nothing appears from nowhere:
 * every material/good has a producing building, every delivery travels the
 * road graph at congestion-adjusted speed.
 */
import { BUILDINGS } from '../config/buildings';
import { nodeById, plotAnchor, plotById } from '../config/map';
import { ECONOMY } from '../config/economy';
import { bus } from '../utils/events';
import { dist2d } from '../utils/math';
import { addCounter } from '../game/GameState';
import type { Delivery, SimContext } from './types';

let nextDeliveryId = 1;

export function tickProduction(ctx: SimContext): void {
  const { state, derived, dt } = ctx;

  for (const b of Object.values(state.buildings)) {
    const def = BUILDINGS[b.defId].tiers[b.tier - 1];
    const rt = derived.runtime.get(b.id)!;

    // construction advances regardless of services (workers on site)
    if (b.construction) {
      b.construction.remaining -= dt;
      if (b.construction.remaining <= 0) {
        b.tier = b.construction.targetTier;
        b.construction = null;
        b.damaged = false;
        bus.emit('buildingChanged', b.id);
        bus.emit('stateChanged', undefined);
        if (b.defId === 'landmark') bus.emit('landmarkStage', b.tier);
      }
      continue;
    }
    if (!rt.active) continue;

    // ---- industry: produce materials (collectable) + goods (deliverable)
    if (b.defId === 'industrial' && rt.efficiency > 0) {
      b.prodProgress += (dt / ECONOMY.productionCycle) * rt.efficiency;
      if (b.prodProgress >= 1) {
        b.prodProgress = 0;
        const rate = def.productionRate ?? 1;
        const cap = def.goodsStorage ?? 4;
        b.materialsReady = Math.min(cap, b.materialsReady + rate);
        b.storedGoods = Math.min(cap, b.storedGoods + rate);
      }
    }

    // ---- taxes: residential (scaled by occupancy+happiness), office, commercial base rent
    const tax = def.taxRate ?? 0;
    if (tax > 0) {
      let taxEff = rt.efficiency;
      if (b.defId === 'residential') {
        const cap = def.populationCapacity ?? 1;
        taxEff = (b.occupancy / cap) * (0.5 + state.happiness / 200);
        // struggling homes still pay half rate — recovery money keeps flowing
        // even if the player spent their starting coins elsewhere
        if (!rt.powered || !rt.watered) taxEff *= 0.5;
      }
      // income accrues continuously (not in one lump) so the collectable amount
      // always reflects the exact time waited, up to a generous storage cap.
      const cap = tax * 6;
      if (b.coinsReady < cap) {
        b.coinsReady = Math.min(cap, b.coinsReady + (tax / ECONOMY.taxCycle) * taxEff * dt);
      }
    }

    // ---- commercial sales: need inventory + customers (nearby population)
    if (b.defId === 'commercial' && rt.efficiency > 0 && b.inventory > 0) {
      const customers = def.customers ?? 10;
      const customerFactor = Math.min(1, derived.population / customers);
      b.salesProgress += (dt / ECONOMY.salesCycle) * rt.efficiency * (0.3 + 0.7 * customerFactor);
      if (b.salesProgress >= 1) {
        b.salesProgress = 0;
        const sold = Math.min(b.inventory, Math.max(1, Math.round(customers * 0.12)));
        b.inventory -= sold;
        b.coinsReady += sold * ECONOMY.coinsPerSale;
        addCounter(state, 'customersServed', sold * 4);
        addCounter(state, 'goodsSold', sold);
      }
    }
  }

  tickDeliveries(ctx);
}

/** Dispatch + advance delivery trucks along the road graph. */
function tickDeliveries(ctx: SimContext): void {
  const { state, derived, graph, dt } = ctx;

  // dispatch: industry with stored goods → hungriest connected shop
  if (derived.deliveries.length < 3) {
    for (const src of Object.values(state.buildings)) {
      if (src.defId !== 'industrial' || src.storedGoods < 1) continue;
      const srcRt = derived.runtime.get(src.id)!;
      if (!srcRt.active || !srcRt.connected) continue;
      let best: { id: string; need: number } | null = null;
      for (const dst of Object.values(state.buildings)) {
        if (dst.defId !== 'commercial') continue;
        const dstRt = derived.runtime.get(dst.id)!;
        if (!dstRt.active || !dstRt.connected) continue;
        const cap = BUILDINGS.commercial.tiers[dst.tier - 1].goodsStorage ?? 5;
        const need = cap - dst.inventory;
        if (need >= 2 && !derived.deliveries.some((d) => d.to === dst.id && !d.done)) {
          if (!best || need > best.need) best = { id: dst.id, need };
        }
      }
      if (best) {
        const path = graph.findPath(plotById(src.id).edge, plotById(best.id).edge);
        if (path && path.length >= 1) {
          const amount = Math.min(src.storedGoods, Math.max(2, Math.floor(best.need / 2)));
          src.storedGoods -= amount;
          derived.deliveries.push({
            id: nextDeliveryId++,
            from: src.id,
            to: best.id,
            amount,
            nodes: buildRoutePoints(src.id, path, best.id),
            seg: 0,
            segT: 0,
            done: false,
          });
        }
      }
    }
  }

  // advance
  for (const d of derived.deliveries) {
    if (d.done) continue;
    const pts = d.nodes;
    if (d.seg >= pts.length - 1) {
      arrive(ctx, d);
      continue;
    }
    const [ax, az] = pointOf(pts[d.seg]);
    const [bx, bz] = pointOf(pts[d.seg + 1]);
    const segLen = Math.max(0.01, dist2d(ax, az, bx, bz));
    // slow down on congested edges near the truck (approx: worst congestion factor)
    const speed = ECONOMY.truckSpeed * congestionFactorNear(ctx, (ax + bx) / 2, (az + bz) / 2);
    d.segT += (speed * dt) / segLen;
    if (d.segT >= 1) {
      d.segT = 0;
      d.seg++;
      if (d.seg >= pts.length - 1) arrive(ctx, d);
    }
  }
  // compact finished
  derived.deliveries = derived.deliveries.filter((d) => !d.done);
}

function arrive(ctx: SimContext, d: Delivery): void {
  const dst = ctx.state.buildings[d.to];
  if (dst) {
    const cap = BUILDINGS.commercial.tiers[dst.tier - 1].goodsStorage ?? 5;
    dst.inventory = Math.min(cap, dst.inventory + d.amount);
    addCounter(ctx.state, 'deliveries');
    bus.emit('deliveryArrived', d.to);
  }
  d.done = true;
}

/** route point encoding: either a node id or "plot:<id>" endpoints */
function pointOf(token: string): [number, number] {
  if (token.startsWith('plot:')) {
    const p = plotById(token.slice(5));
    const a = plotAnchor(p);
    return [a.x, a.z];
  }
  const n = nodeById(token);
  return [n.x, n.z];
}

export function routePoint(token: string): [number, number] {
  return pointOf(token);
}

function buildRoutePoints(fromPlot: string, nodePath: string[], toPlot: string): string[] {
  return [`plot:${fromPlot}`, ...nodePath, `plot:${toPlot}`];
}

function congestionFactorNear(ctx: SimContext, x: number, z: number): number {
  let worst = 0;
  for (const [, rt] of ctx.graph.edges) {
    const mx = (rt.ax + rt.bx) / 2;
    const mz = (rt.az + rt.bz) / 2;
    if (dist2d(x, z, mx, mz) < rt.length * 0.7) worst = Math.max(worst, rt.congestion);
  }
  const over = Math.max(0, worst - ECONOMY.congestionComfort);
  return 1 / (1 + over * 2.2);
}
