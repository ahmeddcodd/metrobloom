/**
 * Fixed-rate simulation orchestrator. Deterministic system order per tick:
 * services → population/employment → production/goods → traffic → environment
 * → fire → objectives → status icons.
 */
import { ECONOMY } from '../config/economy';
import { BUILDINGS } from '../config/buildings';
import type { GameStateData } from '../game/GameState';
import { RoadGraph } from './RoadGraph';
import { emptyDerived, type Derived, type SimContext } from './types';
import { tickServices } from './services';
import { tickPopulation } from './population';
import { tickProduction } from './production';
import { tickTraffic } from './traffic';
import { tickEnvironment } from './environment';
import { tickFire } from './fire';
import { tickObjectives } from './objectives';

export class Simulation {
  readonly graph = new RoadGraph();
  readonly derived: Derived = emptyDerived();
  time = 0;

  constructor(public state: GameStateData) {}

  tick(dt: number): void {
    this.time += dt;
    this.state.playSeconds += dt;
    const ctx: SimContext = { state: this.state, derived: this.derived, graph: this.graph, time: this.time, dt };
    tickServices(ctx);
    tickPopulation(ctx);
    tickProduction(ctx);
    tickTraffic(ctx);
    tickEnvironment(ctx);
    tickFire(ctx);
    tickObjectives(this.state, this.derived);
    this.updateStatuses();
  }

  /** One attention icon per building, highest priority first. Text lives in UI. */
  private updateStatuses(): void {
    const st = this.derived.statuses;
    st.clear();
    for (const b of Object.values(this.state.buildings)) {
      const rt = this.derived.runtime.get(b.id);
      if (!rt) continue;
      const def = BUILDINGS[b.defId].tiers[b.tier - 1];
      if (b.onFire) st.set(b.id, 'fire');
      else if (b.damaged) st.set(b.id, 'damaged');
      else if (b.construction) st.set(b.id, 'construction');
      else if (b.fireRisk >= ECONOMY.fireRiskWarn) st.set(b.id, 'firerisk');
      else if (!rt.connected) st.set(b.id, 'noroad');
      else if (!rt.powered) st.set(b.id, 'nopower');
      else if (!rt.watered) st.set(b.id, 'nowater');
      else if ((def.jobs ?? 0) > 0 && rt.workerFactor <= ECONOMY.minWorkerFactor) st.set(b.id, 'noworkers');
      else if (b.defId === 'commercial' && b.inventory <= 0) st.set(b.id, 'nogoods');
      else if (b.materialsReady >= 1) st.set(b.id, 'materials');
      else if (b.coinsReady >= Math.max(4, (def.taxRate ?? 8) * 0.75)) st.set(b.id, 'coins');
    }
  }

  static readonly TICK = 1 / ECONOMY.simRate;
}
