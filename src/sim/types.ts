/** Per-tick derived (non-persistent) simulation values. */
import type { GameStateData } from '../game/GameState';
import type { RoadGraph } from './RoadGraph';

export interface BuildingRuntime {
  powered: boolean;
  watered: boolean;
  roadOk: boolean; // anchor edge open + meets tier requirement
  connected: boolean; // reachable on the open road network
  workerFactor: number;
  efficiency: number; // 0..1 overall output factor
  exposure: number; // pollution exposure (residential)
  covered: boolean; // fire coverage
  active: boolean; // functioning (not damaged/constructing/on fire)
}

export interface Delivery {
  id: number;
  from: string;
  to: string;
  amount: number;
  nodes: string[]; // node path
  seg: number; // current segment index
  segT: number; // 0..1 along current segment
  done: boolean;
}

export interface Derived {
  powerSupply: number;
  powerDemand: number;
  waterSupply: number;
  waterDemand: number;
  waterEnabled: boolean;
  powerRatio: number; // supply/demand clamp 0..1
  waterRatio: number;
  population: number;
  popCapacity: number;
  jobsTotal: number;
  jobsFilled: number;
  employmentRate: number; // filled/total jobs
  unemployment: number; // workers without jobs
  trafficEfficiency: number; // 0..100
  maxCongestion: number;
  pollutionAvg: number; // 0..100
  happiness: number; // 0..100
  happinessBreakdown: { label: string; value: number; icon: string }[];
  busActive: boolean;
  carReduction: number;
  runtime: Map<string, BuildingRuntime>;
  deliveries: Delivery[];
  /** plotIds that currently want a status bubble, with priority-ordered icon key */
  statuses: Map<string, string>;
}

export function emptyDerived(): Derived {
  return {
    powerSupply: 0,
    powerDemand: 0,
    waterSupply: 0,
    waterDemand: 0,
    waterEnabled: false,
    powerRatio: 1,
    waterRatio: 1,
    population: 0,
    popCapacity: 0,
    jobsTotal: 0,
    jobsFilled: 0,
    employmentRate: 1,
    unemployment: 0,
    trafficEfficiency: 100,
    maxCongestion: 0,
    pollutionAvg: 0,
    happiness: 55,
    happinessBreakdown: [],
    busActive: false,
    carReduction: 0,
    runtime: new Map(),
    deliveries: [],
    statuses: new Map(),
  };
}

export interface SimContext {
  state: GameStateData;
  derived: Derived;
  graph: RoadGraph;
  time: number; // sim seconds since boot
  dt: number;
}
