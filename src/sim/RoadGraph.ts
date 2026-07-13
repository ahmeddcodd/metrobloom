/**
 * Road network graph + A* pathfinding with a cache.
 * Nodes/edges come from config/map.ts; edge availability depends on
 * unlocked districts, cost depends on tier + live congestion.
 */
import { EDGES, NODES, nodeById, type DistrictId, type MapEdge } from '../config/map';
import { ECONOMY } from '../config/economy';
import { dist2d } from '../utils/math';

export interface EdgeRuntime {
  edge: MapEdge;
  length: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** abstract demand load placed by anchored buildings (recomputed per tick) */
  load: number;
  congestion: number; // load / capacity
}

export class RoadGraph {
  readonly edges = new Map<string, EdgeRuntime>();
  private adjacency = new Map<string, { edgeId: string; to: string }[]>();
  private cache = new Map<string, string[] | null>();
  private unlocked: Set<DistrictId> = new Set(['oldtown']);
  private roadTiers: Record<string, number> = {};

  constructor() {
    for (const e of EDGES) {
      const a = nodeById(e.a);
      const b = nodeById(e.b);
      this.edges.set(e.id, {
        edge: e,
        length: dist2d(a.x, a.z, b.x, b.z),
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        load: 0,
        congestion: 0,
      });
      this.addAdj(e.a, e.id, e.b);
      this.addAdj(e.b, e.id, e.a);
    }
  }

  private addAdj(from: string, edgeId: string, to: string): void {
    const list = this.adjacency.get(from) ?? [];
    list.push({ edgeId, to });
    this.adjacency.set(from, list);
  }

  syncState(unlockedDistricts: DistrictId[], roadTiers: Record<string, number>): void {
    const changed =
      unlockedDistricts.length !== this.unlocked.size ||
      Object.entries(roadTiers).some(([k, v]) => this.roadTiers[k] !== v);
    this.unlocked = new Set(unlockedDistricts);
    this.roadTiers = { ...roadTiers };
    if (changed) this.cache.clear();
  }

  isEdgeOpen(edgeId: string): boolean {
    const rt = this.edges.get(edgeId);
    return !!rt && this.unlocked.has(rt.edge.district) && (this.roadTiers[edgeId] ?? 0) >= 1;
  }

  tierOf(edgeId: string): number {
    return this.roadTiers[edgeId] ?? 0;
  }

  capacityOf(edgeId: string): number {
    return ECONOMY.roadCapacity[Math.min(3, Math.max(0, this.tierOf(edgeId)))];
  }

  /** speed multiplier along an edge, combining tier speed and congestion. */
  speedFactor(edgeId: string): number {
    const rt = this.edges.get(edgeId);
    if (!rt) return 1;
    const tierSpeed = ECONOMY.roadSpeed[Math.min(3, Math.max(1, this.tierOf(edgeId)))];
    const over = Math.max(0, rt.congestion - ECONOMY.congestionComfort);
    return tierSpeed / (1 + over * 2.2);
  }

  setLoad(edgeId: string, load: number): void {
    const rt = this.edges.get(edgeId);
    if (!rt) return;
    rt.load = load;
    const cap = this.capacityOf(edgeId);
    rt.congestion = cap > 0 ? load / cap : 0;
  }

  /** Is `nodeOrEdge` reachable from any open edge network containing fromEdge? */
  connected(fromEdge: string, toEdge: string): boolean {
    if (fromEdge === toEdge) return this.isEdgeOpen(fromEdge);
    return this.findPath(fromEdge, toEdge) !== null;
  }

  /**
   * A* over nodes, from one edge to another (entering at either endpoint).
   * Returns ordered node ids, or null. Results cached until topology changes.
   */
  findPath(fromEdge: string, toEdge: string): string[] | null {
    const key = `${fromEdge}>${toEdge}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const result = this.astar(fromEdge, toEdge);
    this.cache.set(key, result);
    return result;
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  private astar(fromEdge: string, toEdge: string): string[] | null {
    if (!this.isEdgeOpen(fromEdge) || !this.isEdgeOpen(toEdge)) return null;
    const from = this.edges.get(fromEdge)!;
    const to = this.edges.get(toEdge)!;
    const goalNodes = new Set([to.edge.a, to.edge.b]);
    const goalX = (to.ax + to.bx) / 2;
    const goalZ = (to.az + to.bz) / 2;

    const open = new Map<string, number>(); // node -> f
    const g = new Map<string, number>();
    const came = new Map<string, string>();
    for (const start of [from.edge.a, from.edge.b]) {
      const n = nodeById(start);
      g.set(start, 0);
      open.set(start, dist2d(n.x, n.z, goalX, goalZ));
    }
    const closed = new Set<string>();
    while (open.size) {
      let current = '';
      let best = Infinity;
      for (const [id, f] of open) {
        if (f < best) {
          best = f;
          current = id;
        }
      }
      open.delete(current);
      if (goalNodes.has(current)) {
        const path = [current];
        while (came.has(current)) {
          current = came.get(current)!;
          path.unshift(current);
        }
        return path;
      }
      closed.add(current);
      for (const { edgeId, to: next } of this.adjacency.get(current) ?? []) {
        if (!this.isEdgeOpen(edgeId) || closed.has(next)) continue;
        const rt = this.edges.get(edgeId)!;
        // congested / low-tier edges cost more so vehicles prefer good roads
        const cost = rt.length * (1 + Math.max(0, rt.congestion - 0.5)) / ECONOMY.roadSpeed[Math.max(1, this.tierOf(edgeId))];
        const tentative = (g.get(current) ?? Infinity) + cost;
        if (tentative < (g.get(next) ?? Infinity)) {
          came.set(next, current);
          g.set(next, tentative);
          const nn = nodeById(next);
          open.set(next, tentative + dist2d(nn.x, nn.z, goalX, goalZ));
        }
      }
    }
    return null;
  }

  /** All node ids, for debug rendering. */
  get nodes(): typeof NODES {
    return NODES;
  }
}
