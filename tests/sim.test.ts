import { describe, expect, it } from 'vitest';
import { createInitialState, deserialize } from '../src/game/GameState';
import { migrateSave } from '../src/platform/saveSystem';
import { Simulation } from '../src/sim/Simulation';
import { RoadGraph } from '../src/sim/RoadGraph';
import { evaluateLevel, evaluateObjective } from '../src/sim/objectives';
import { Actions } from '../src/game/Actions';
import { ECONOMY } from '../src/config/economy';

function runTicks(sim: Simulation, seconds: number): void {
  const n = Math.round(seconds * ECONOMY.simRate);
  for (let i = 0; i < n; i++) sim.tick(Simulation.TICK);
}

describe('road graph & pathfinding', () => {
  it('finds a path between old town edges', () => {
    const g = new RoadGraph();
    g.syncState(['oldtown'], { e67: 1, e78: 1, e6_10: 1, e10_11: 1, e7_11: 1 });
    expect(g.findPath('e67', 'e78')).not.toBeNull();
  });

  it('cannot route through locked districts', () => {
    const g = new RoadGraph();
    g.syncState(['oldtown'], { e67: 1, e78: 1, e23: 1 });
    expect(g.findPath('e67', 'e23')).toBeNull();
    g.syncState(['oldtown', 'market'], { e67: 1, e78: 1, e23: 1, e26: 1, e37: 1 });
    expect(g.findPath('e67', 'e23')).not.toBeNull();
  });

  it('road tier raises capacity', () => {
    const g = new RoadGraph();
    g.syncState(['oldtown'], { e67: 1 });
    const cap1 = g.capacityOf('e67');
    g.syncState(['oldtown'], { e67: 2 });
    expect(g.capacityOf('e67')).toBeGreaterThan(cap1);
  });
});

describe('power network', () => {
  it('homes are unpowered while the generator is damaged, powered after repair', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    runTicks(sim, 1);
    expect(sim.derived.runtime.get('ph1')!.powered).toBe(false);
    state.buildings['pgen'].damaged = false;
    runTicks(sim, 1);
    expect(sim.derived.runtime.get('ph1')!.powered).toBe(true);
    expect(sim.derived.powerSupply).toBeGreaterThan(0);
  });

  it('L1 is never unwinnable: repair stays affordable and taxes flow after repair', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    runTicks(sim, 30); // struggle phase: blackout
    expect(state.coins).toBeGreaterThanOrEqual(50); // repair always affordable
    const pop = Object.values(state.buildings).reduce((s, b) => s + b.occupancy, 0);
    expect(pop).toBeGreaterThan(0); // town never fully empties
    state.buildings['pgen'].damaged = false; // player repairs
    runTicks(sim, 40);
    const anyCoins = Object.values(state.buildings).some((b) => b.coinsReady > 0);
    expect(anyCoins).toBe(true);
  });
});

describe('employment', () => {
  it('understaffed workplaces never output at 100%', () => {
    const state = createInitialState();
    state.buildings['pgen'].damaged = false;
    state.buildings['pwork'].damaged = false;
    // tiny population → few workers
    for (const b of Object.values(state.buildings)) if (b.defId === 'residential') b.occupancy = 2;
    const sim = new Simulation(state);
    runTicks(sim, 1);
    const rt = sim.derived.runtime.get('pwork')!;
    expect(rt.workerFactor).toBeLessThan(1);
    expect(rt.efficiency).toBeLessThan(1);
  });
});

describe('happiness', () => {
  it('breakdown sums to the reported happiness', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    runTicks(sim, 2);
    const d = sim.derived;
    const sum = 50 + d.happinessBreakdown.reduce((s, f) => s + f.value, 0);
    expect(d.happiness).toBe(Math.max(0, Math.min(100, Math.round(sum))));
  });
});

describe('objectives & campaign', () => {
  it('level 1 starts incomplete', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    runTicks(sim, 1);
    const progress = evaluateLevel(state, sim.derived);
    expect(progress.some((p) => !p.done)).toBe(true);
  });

  it('completing level 1 objectives advances to level 2 and pays the reward', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    state.buildings['pgen'].damaged = false;
    state.counters['taxCollected'] = 1;
    const before = state.coins;
    runTicks(sim, 2); // homes power up; sim tick advances the level itself
    expect(state.level).toBe(2);
    expect(state.coins).toBeGreaterThan(before); // reward paid
  });

  it('counter objectives track progress', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    runTicks(sim, 1);
    state.counters['deliveries'] = 2;
    const p = evaluateObjective({ kind: 'counter', key: 'deliveries', amount: 4, text: '', hint: '' }, state, sim.derived);
    expect(p.cur).toBe(2);
    expect(p.done).toBe(false);
  });
});

describe('actions', () => {
  it('rejects building without permit and accepts with permit + funds', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    const actions = new Actions(state, sim);
    runTicks(sim, 1);
    expect(actions.build('pshop1', 'commercial').ok).toBe(false);
    state.permits.push('commercial');
    state.coins = 1000;
    expect(actions.build('pshop1', 'commercial').ok).toBe(true);
    expect(state.buildings['pshop1'].construction).not.toBeNull();
  });

  it('upgrade blockers are reported, never hidden', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    const actions = new Actions(state, sim);
    runTicks(sim, 1);
    state.coins = 0;
    const blockers = actions.upgradeBlockers('ph1');
    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.join()).toContain('coins');
  });

  it('road upgrades spend resources and raise the tier', () => {
    const state = createInitialState();
    const sim = new Simulation(state);
    const actions = new Actions(state, sim);
    runTicks(sim, 1);
    state.coins = 500;
    const res = actions.upgradeRoad('e67');
    expect(res.ok).toBe(true);
    expect(state.roadTiers['e67']).toBe(2);
  });
});

describe('save migration', () => {
  it('handles null, garbage and future versions safely', () => {
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave('junk')).toBeNull();
    expect(migrateSave({})).toBeNull();
    const future = migrateSave({ version: 99, coins: 42 });
    expect(future).not.toBeNull();
  });

  it('round-trips and tolerates partial blobs', () => {
    const fresh = deserialize(null);
    expect(fresh.level).toBe(1);
    const partial = deserialize({ version: 1, coins: 777, level: 5, buildings: { bogus: { defId: 'nope' } } } as never);
    expect(partial.coins).toBe(777);
    expect(partial.level).toBe(5);
    expect(partial.buildings['bogus']).toBeUndefined();
    // pre-placed buildings from unknown-save fall back cleanly
    expect(Object.keys(partial.roadTiers).length).toBeGreaterThan(0);
  });
});

describe('fire safety fairness', () => {
  it('a fire never ignites without a warning phase', () => {
    const state = createInitialState();
    state.level = 7;
    state.buildings['pgen'].damaged = false;
    state.buildings['pwork'].damaged = false;
    for (const b of Object.values(state.buildings)) if (b.defId === 'residential') b.occupancy = 8;
    const sim = new Simulation(state);
    // run long enough for risk to climb past ignition threshold
    let sawWarningBeforeFire = true;
    for (let i = 0; i < 200 * ECONOMY.simRate; i++) {
      sim.tick(Simulation.TICK);
      const w = state.buildings['pwork'];
      if (w.onFire && w.warnedAt < 0) sawWarningBeforeFire = false;
      if (w.onFire) break;
    }
    expect(sawWarningBeforeFire).toBe(true);
  });
});
