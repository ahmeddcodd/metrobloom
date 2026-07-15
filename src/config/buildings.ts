/**
 * Data-driven building definitions — ALL balance values live here or in
 * economy.ts, never inside entity/visual classes. See BALANCING.md.
 */
export type BuildingCategory =
  | 'residential'
  | 'industrial'
  | 'commercial'
  | 'power'
  | 'water'
  | 'park'
  | 'fire'
  | 'transit'
  | 'office'
  | 'landmark';

export interface BuildingTierDefinition {
  tier: number;
  name: string;
  coinCost: number;
  materialCost: number;
  /** construction seconds */
  buildTime: number;
  populationCapacity?: number;
  jobs?: number;
  powerDemand?: number;
  waterDemand?: number;
  powerCapacity?: number;
  waterCapacity?: number;
  pollutionOutput?: number;
  trafficDemand?: number;
  taxRate?: number; // coins per tax cycle
  goodsStorage?: number; // commercial inventory cap / industrial buffer cap
  productionRate?: number; // goods+materials per production cycle
  customers?: number; // commercial serving capacity per cycle
  happinessBonus?: number; // parks
  mitigationRadius?: number; // parks: pollution damping radius
  coverageRadius?: number; // fire
  carTripReduction?: number; // transit, fraction of car demand removed citywide
  roadRequirement?: number; // min tier of anchor road
  happinessRequirement?: number;
}

export interface BuildingDefinition {
  id: BuildingCategory;
  displayName: string;
  icon: string;
  desc: string;
  permit: string | null; // permit id required to build
  tiers: BuildingTierDefinition[];
}

const T = (t: Partial<BuildingTierDefinition> & Pick<BuildingTierDefinition, 'tier' | 'name' | 'coinCost' | 'materialCost' | 'buildTime'>): BuildingTierDefinition => t;

export const BUILDINGS: Record<BuildingCategory, BuildingDefinition> = {
  residential: {
    id: 'residential',
    displayName: 'Residential',
    icon: '🏠',
    desc: 'Homes attract residents — your workers, customers and taxpayers.',
    permit: null,
    tiers: [
      T({ tier: 1, name: 'Cottage', coinCost: 90, materialCost: 0, buildTime: 4, populationCapacity: 8, powerDemand: 2, waterDemand: 1, trafficDemand: 1, taxRate: 8 }),
      // Townhouse is the FIRST upgrade the player ever makes (L2) — it must be
      // coins-only, because industry (the material source) isn't repaired until L3.
      T({ tier: 2, name: 'Townhouse', coinCost: 200, materialCost: 0, buildTime: 6, populationCapacity: 24, powerDemand: 5, waterDemand: 3, trafficDemand: 3, taxRate: 18, roadRequirement: 2 }),
      T({ tier: 3, name: 'Apartment', coinCost: 750, materialCost: 4, buildTime: 9, populationCapacity: 60, powerDemand: 10, waterDemand: 7, trafficDemand: 8, taxRate: 50, roadRequirement: 2, happinessRequirement: 70 }),
    ],
  },
  industrial: {
    id: 'industrial',
    displayName: 'Industry',
    icon: '🏭',
    desc: 'Produces construction materials and goods for shops. Needs workers, power and road access.',
    permit: null,
    tiers: [
      T({ tier: 1, name: 'Workshop', coinCost: 150, materialCost: 0, buildTime: 5, jobs: 10, powerDemand: 4, waterDemand: 1, pollutionOutput: 6, trafficDemand: 2, productionRate: 1, goodsStorage: 4 }),
      T({ tier: 2, name: 'Factory', coinCost: 450, materialCost: 2, buildTime: 7, jobs: 26, powerDemand: 9, waterDemand: 4, pollutionOutput: 12, trafficDemand: 6, productionRate: 2, goodsStorage: 8, roadRequirement: 2 }),
      T({ tier: 3, name: 'Clean Plant', coinCost: 1000, materialCost: 5, buildTime: 9, jobs: 50, powerDemand: 14, waterDemand: 6, pollutionOutput: 5, trafficDemand: 8, productionRate: 4, goodsStorage: 12, roadRequirement: 2 }),
    ],
  },
  commercial: {
    id: 'commercial',
    displayName: 'Commerce',
    icon: '🛒',
    desc: 'Shops sell delivered goods to citizens and earn coins. Need workers, goods and customers.',
    permit: 'commercial',
    tiers: [
      T({ tier: 1, name: 'Corner Shop', coinCost: 180, materialCost: 0, buildTime: 5, jobs: 5, powerDemand: 2, waterDemand: 1, trafficDemand: 2, customers: 10, goodsStorage: 5, taxRate: 10 }),
      T({ tier: 2, name: 'Local Market', coinCost: 480, materialCost: 2, buildTime: 7, jobs: 14, powerDemand: 5, waterDemand: 2, trafficDemand: 4, customers: 28, goodsStorage: 14, taxRate: 26, roadRequirement: 2 }),
      T({ tier: 3, name: 'Shopping Centre', coinCost: 1100, materialCost: 5, buildTime: 9, jobs: 30, powerDemand: 12, waterDemand: 5, trafficDemand: 8, customers: 65, goodsStorage: 30, taxRate: 60, roadRequirement: 2 }),
    ],
  },
  power: {
    id: 'power',
    displayName: 'Power',
    icon: '⚡',
    desc: 'Generates electricity distributed along connected roads. Capacity is finite.',
    permit: null,
    tiers: [
      T({ tier: 1, name: 'Generator', coinCost: 50, materialCost: 0, buildTime: 3, powerCapacity: 20, pollutionOutput: 3, jobs: 3 }),
      T({ tier: 2, name: 'Power Station', coinCost: 400, materialCost: 2, buildTime: 7, powerCapacity: 55, pollutionOutput: 5, jobs: 8 }),
      T({ tier: 3, name: 'Renewable Hub', coinCost: 900, materialCost: 5, buildTime: 9, powerCapacity: 120, pollutionOutput: 0, jobs: 12 }),
    ],
  },
  water: {
    id: 'water',
    displayName: 'Water',
    icon: '💧',
    desc: 'Supplies clean water through the road network to every connected building.',
    permit: 'water',
    tiers: [
      T({ tier: 1, name: 'Water Tower', coinCost: 220, materialCost: 1, buildTime: 5, waterCapacity: 30, jobs: 2 }),
      T({ tier: 2, name: 'Pumping Station', coinCost: 520, materialCost: 3, buildTime: 7, waterCapacity: 70, jobs: 5 }),
      T({ tier: 3, name: 'Treatment Facility', coinCost: 1000, materialCost: 5, buildTime: 9, waterCapacity: 140, jobs: 9 }),
    ],
  },
  park: {
    id: 'park',
    displayName: 'Park',
    icon: '🌳',
    desc: 'Raises nearby happiness and absorbs pollution. Citizens visit to relax.',
    permit: 'park',
    tiers: [
      T({ tier: 1, name: 'Pocket Park', coinCost: 120, materialCost: 0, buildTime: 3, happinessBonus: 4, mitigationRadius: 10 }),
      T({ tier: 2, name: 'Community Park', coinCost: 320, materialCost: 1, buildTime: 5, happinessBonus: 8, mitigationRadius: 14 }),
      T({ tier: 3, name: 'Eco Plaza', coinCost: 700, materialCost: 3, buildTime: 7, happinessBonus: 12, mitigationRadius: 18 }),
    ],
  },
  fire: {
    id: 'fire',
    displayName: 'Fire Service',
    icon: '🚒',
    desc: 'Covers nearby buildings, lowers fire risk and dispatches trucks to incidents.',
    permit: 'fire',
    tiers: [
      // radii sized to the map: a T1 station covers the Old-Town workshop (~23u
      // from the fire plot), so L7 is completable with a single build. Higher
      // tiers reach the Industrial Edge (~37u) and then the whole city.
      T({ tier: 1, name: 'Fire Station', coinCost: 300, materialCost: 1, buildTime: 5, coverageRadius: 26, jobs: 6 }),
      T({ tier: 2, name: 'District Fire Station', coinCost: 650, materialCost: 3, buildTime: 7, coverageRadius: 40, jobs: 12 }),
      T({ tier: 3, name: 'Emergency Center', coinCost: 1200, materialCost: 5, buildTime: 9, coverageRadius: 56, jobs: 20 }),
    ],
  },
  transit: {
    id: 'transit',
    displayName: 'Bus Stop',
    icon: '🚌',
    desc: 'Two connected stops form a bus route that shifts car trips onto buses.',
    permit: 'transit',
    tiers: [
      T({ tier: 1, name: 'Bus Stop', coinCost: 140, materialCost: 0, buildTime: 3, carTripReduction: 0.12 }),
      T({ tier: 2, name: 'Transit Shelter', coinCost: 300, materialCost: 1, buildTime: 4, carTripReduction: 0.18 }),
      T({ tier: 3, name: 'Mobility Hub', coinCost: 600, materialCost: 2, buildTime: 6, carTripReduction: 0.25 }),
    ],
  },
  office: {
    id: 'office',
    displayName: 'Office',
    icon: '🏢',
    desc: 'Clean, well-paid jobs and strong taxes — but hungry for power and road capacity.',
    permit: 'office',
    tiers: [
      T({ tier: 1, name: 'Small Office', coinCost: 380, materialCost: 1, buildTime: 6, jobs: 12, powerDemand: 6, waterDemand: 2, trafficDemand: 4, taxRate: 20 }),
      T({ tier: 2, name: 'Corporate Building', coinCost: 800, materialCost: 3, buildTime: 8, jobs: 28, powerDemand: 10, waterDemand: 4, trafficDemand: 7, taxRate: 45, roadRequirement: 2 }),
      T({ tier: 3, name: 'Innovation Tower', coinCost: 1500, materialCost: 6, buildTime: 10, jobs: 60, powerDemand: 16, waterDemand: 6, trafficDemand: 10, taxRate: 90, roadRequirement: 2 }),
    ],
  },
  landmark: {
    id: 'landmark',
    displayName: 'Eco Spire',
    icon: '🏙️',
    desc: 'The heart of MetroBloom — built in three grand construction phases.',
    permit: 'landmark',
    tiers: [
      T({ tier: 1, name: 'Eco Spire — Foundation', coinCost: 500, materialCost: 4, buildTime: 6 }),
      T({ tier: 2, name: 'Eco Spire — Tower', coinCost: 800, materialCost: 6, buildTime: 8 }),
      T({ tier: 3, name: 'Eco Spire — Crown', coinCost: 1200, materialCost: 8, buildTime: 10, happinessBonus: 15, mitigationRadius: 30 }),
    ],
  },
};

export const REPAIR_COST: Record<string, { coins: number; label: string }> = {
  power: { coins: 50, label: 'Repair the generator' },
  industrial: { coins: 80, label: 'Repair the workshop' },
};

/** Fire damage repair cost scales with tier. */
export function fireRepairCost(tier: number): number {
  return 60 * tier;
}
