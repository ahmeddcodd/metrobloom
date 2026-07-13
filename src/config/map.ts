/**
 * World layout — single source of truth for districts, road graph and plots.
 * Coordinates: X east, Z south. The sea lies west of x = -28.
 */
import type { BuildingCategory } from './buildings';

export interface MapNode {
  id: string;
  x: number;
  z: number;
}

export interface MapEdge {
  id: string;
  a: string;
  b: string;
  district: DistrictId;
  initialTier: number; // 0 = unbuilt dirt track until district unlocks
}

export type DistrictId = 'oldtown' | 'market' | 'industry' | 'downtown';

export interface DistrictDef {
  id: DistrictId;
  name: string;
  /** camera focus for the unlock cinematic */
  focus: { x: number; z: number };
}

export interface PlotDef {
  id: string;
  district: DistrictId;
  x: number;
  z: number;
  w: number;
  d: number;
  /** which building categories may be constructed here */
  allowed: BuildingCategory[];
  /** road edge this plot fronts (service/traffic anchor) */
  edge: string;
  /** pre-placed building at game start */
  initial?: { category: BuildingCategory; tier: number; damaged?: boolean; occupancy?: number };
  /** plot only appears after reaching this level (used for reward plots) */
  unlockLevel?: number;
}

export const DISTRICTS: DistrictDef[] = [
  { id: 'oldtown', name: 'Old Town', focus: { x: 5, z: 4 } },
  { id: 'market', name: 'Market Quarter', focus: { x: 2, z: -15 } },
  { id: 'industry', name: 'Industrial Edge', focus: { x: 14, z: 15 } },
  { id: 'downtown', name: 'Downtown Waterfront', focus: { x: -20, z: -4 } },
];

export const NODES: MapNode[] = [
  { id: 'n1', x: -18, z: -14 },
  { id: 'n2', x: -6, z: -14 },
  { id: 'n3', x: 6, z: -14 },
  { id: 'n4', x: 18, z: -14 },
  { id: 'n5', x: -18, z: 0 },
  { id: 'n6', x: -6, z: 0 },
  { id: 'n7', x: 6, z: 0 },
  { id: 'n8', x: 18, z: 0 },
  { id: 'n9', x: -18, z: 14 },
  { id: 'n10', x: -6, z: 14 },
  { id: 'n11', x: 6, z: 14 },
  { id: 'n12', x: 18, z: 14 },
];

export const EDGES: MapEdge[] = [
  // Old Town — main street + southern loop (the loop is the L5 alternate route)
  { id: 'e67', a: 'n6', b: 'n7', district: 'oldtown', initialTier: 1 },
  { id: 'e78', a: 'n7', b: 'n8', district: 'oldtown', initialTier: 1 },
  { id: 'e6_10', a: 'n6', b: 'n10', district: 'oldtown', initialTier: 1 },
  { id: 'e10_11', a: 'n10', b: 'n11', district: 'oldtown', initialTier: 1 },
  { id: 'e7_11', a: 'n7', b: 'n11', district: 'oldtown', initialTier: 1 },
  // Market Quarter (north)
  { id: 'e23', a: 'n2', b: 'n3', district: 'market', initialTier: 1 },
  { id: 'e34', a: 'n3', b: 'n4', district: 'market', initialTier: 1 },
  { id: 'e26', a: 'n2', b: 'n6', district: 'market', initialTier: 1 },
  { id: 'e37', a: 'n3', b: 'n7', district: 'market', initialTier: 1 },
  { id: 'e48', a: 'n4', b: 'n8', district: 'market', initialTier: 1 },
  // Industrial Edge (south-east)
  { id: 'e8_12', a: 'n8', b: 'n12', district: 'industry', initialTier: 1 },
  { id: 'e11_12', a: 'n11', b: 'n12', district: 'industry', initialTier: 1 },
  // Downtown Waterfront (west)
  { id: 'e12', a: 'n1', b: 'n2', district: 'downtown', initialTier: 1 },
  { id: 'e56', a: 'n5', b: 'n6', district: 'downtown', initialTier: 1 },
  { id: 'e9_10', a: 'n9', b: 'n10', district: 'downtown', initialTier: 1 },
  { id: 'e15', a: 'n1', b: 'n5', district: 'downtown', initialTier: 1 },
  { id: 'e59', a: 'n5', b: 'n9', district: 'downtown', initialTier: 1 },
];

export const PLOTS: PlotDef[] = [
  // ---- Old Town (start district)
  { id: 'ph1', district: 'oldtown', x: -2, z: -4.5, w: 5, d: 5, allowed: ['residential'], edge: 'e67', initial: { category: 'residential', tier: 1, occupancy: 5 } },
  { id: 'ph2', district: 'oldtown', x: 3.5, z: -4.5, w: 5, d: 5, allowed: ['residential'], edge: 'e67', initial: { category: 'residential', tier: 1, occupancy: 4 } },
  { id: 'ph3', district: 'oldtown', x: 10.5, z: -4.5, w: 5, d: 5, allowed: ['residential'], edge: 'e78', initial: { category: 'residential', tier: 1, occupancy: 5 } },
  { id: 'pgen', district: 'oldtown', x: 15.5, z: -4.5, w: 5, d: 5, allowed: ['power'], edge: 'e78', initial: { category: 'power', tier: 1, damaged: true } },
  { id: 'pwork', district: 'oldtown', x: 11, z: 4.5, w: 5.5, d: 5.5, allowed: ['industrial'], edge: 'e78', initial: { category: 'industrial', tier: 1, damaged: true } },
  { id: 'pres4', district: 'oldtown', x: -2, z: 4.5, w: 5, d: 5, allowed: ['residential'], edge: 'e67', unlockLevel: 2 },
  { id: 'pshop1', district: 'oldtown', x: 3.5, z: 4.5, w: 5, d: 5, allowed: ['commercial'], edge: 'e67' },
  { id: 'pstop1', district: 'oldtown', x: 0.5, z: 8.8, w: 2.4, d: 2.4, allowed: ['transit'], edge: 'e6_10' },
  // ---- Market Quarter (unlocks L5)
  { id: 'ppark1', district: 'market', x: -13, z: -18.5, w: 5, d: 5, allowed: ['park'], edge: 'e12' },
  { id: 'pres5', district: 'market', x: -7.5, z: -18.5, w: 5, d: 5, allowed: ['residential'], edge: 'e23' },
  { id: 'pres6', district: 'market', x: -2, z: -18.5, w: 5, d: 5, allowed: ['residential'], edge: 'e23' },
  { id: 'pshop2', district: 'market', x: 3.5, z: -18.5, w: 5, d: 5, allowed: ['commercial'], edge: 'e34' },
  { id: 'pwater', district: 'market', x: 9.5, z: -18.5, w: 5, d: 5, allowed: ['water'], edge: 'e34' },
  { id: 'pfire', district: 'market', x: 15, z: -18.5, w: 5, d: 5, allowed: ['fire'], edge: 'e34' },
  { id: 'pstop2', district: 'market', x: 8.8, z: -11.2, w: 2.4, d: 2.4, allowed: ['transit'], edge: 'e34' },
  // ---- Industrial Edge (unlocks L7)
  { id: 'ppark2', district: 'industry', x: 2.5, z: 18.5, w: 5, d: 5, allowed: ['park'], edge: 'e10_11' },
  { id: 'pind2', district: 'industry', x: 9, z: 18.5, w: 6, d: 6, allowed: ['industrial'], edge: 'e11_12' },
  { id: 'pind3', district: 'industry', x: 16, z: 18.5, w: 6, d: 6, allowed: ['industrial', 'power'], edge: 'e11_12' },
  { id: 'pstop3', district: 'industry', x: 12, z: 11.2, w: 2.4, d: 2.4, allowed: ['transit'], edge: 'e11_12' },
  // ---- Downtown Waterfront (unlocks L9)
  { id: 'papt', district: 'downtown', x: -23, z: -7, w: 6, d: 6, allowed: ['residential'], edge: 'e15' },
  { id: 'poffice', district: 'downtown', x: -23, z: 5.5, w: 6, d: 6, allowed: ['office'], edge: 'e59' },
  { id: 'poffice2', district: 'downtown', x: -12, z: 5.5, w: 5.5, d: 5.5, allowed: ['office', 'commercial'], edge: 'e56' },
  { id: 'plandmark', district: 'downtown', x: -23.5, z: -17, w: 8, d: 8, allowed: ['landmark'], edge: 'e12' },
  { id: 'pstop4', district: 'downtown', x: -15.2, z: -8, w: 2.4, d: 2.4, allowed: ['transit'], edge: 'e15' },
];

export const MAP_BOUNDS = { minX: -34, maxX: 26, minZ: -26, maxZ: 26 };
export const SEA_X = -28; // west of this line is water

export function nodeById(id: string): MapNode {
  const n = NODES.find((n) => n.id === id);
  if (!n) throw new Error(`unknown node ${id}`);
  return n;
}

export function edgeById(id: string): MapEdge {
  const e = EDGES.find((e) => e.id === id);
  if (!e) throw new Error(`unknown edge ${id}`);
  return e;
}

export function plotById(id: string): PlotDef {
  const p = PLOTS.find((p) => p.id === id);
  if (!p) throw new Error(`unknown plot ${id}`);
  return p;
}

/** Point on the edge nearest the plot — driveway/service anchor. */
export function plotAnchor(plot: PlotDef): { x: number; z: number } {
  const e = edgeById(plot.edge);
  const a = nodeById(e.a);
  const b = nodeById(e.b);
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = Math.max(0.08, Math.min(0.92, ((plot.x - a.x) * abx + (plot.z - a.z) * abz) / len2));
  return { x: a.x + abx * t, z: a.z + abz * t };
}
