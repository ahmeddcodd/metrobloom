/**
 * The ten-level campaign. Every objective is data — evaluated by
 * sim/objectives.ts against live state, never hand-checked in UI code.
 */
import type { BuildingCategory } from './buildings';
import type { DistrictId } from './map';

export type ObjectiveDef =
  | { kind: 'repair'; plot: string; text: string; hint: string }
  | { kind: 'build'; category: BuildingCategory; count: number; text: string; hint: string }
  | { kind: 'buildTier'; category: BuildingCategory; tier: number; count: number; text: string; hint: string }
  | { kind: 'roadTier'; tier: number; count: number; edge?: string; text: string; hint: string }
  | { kind: 'poweredHomes'; count: number; text: string; hint: string }
  | { kind: 'population'; amount: number; text: string; hint: string }
  | { kind: 'happiness'; amount: number; text: string; hint: string }
  | { kind: 'jobsFilled'; amount: number; text: string; hint: string }
  | { kind: 'counter'; key: string; amount: number; text: string; hint: string }
  | { kind: 'allWatered'; text: string; hint: string }
  | { kind: 'powerReserve'; amount: number; text: string; hint: string }
  | { kind: 'waterReserve'; amount: number; text: string; hint: string }
  | { kind: 'pollutionMax'; amount: number; text: string; hint: string }
  | { kind: 'trafficEff'; amount: number; text: string; hint: string }
  | { kind: 'busRoute'; text: string; hint: string }
  | { kind: 'industryCovered'; text: string; hint: string }
  | { kind: 'landmark'; stage: number; text: string; hint: string };

export interface LevelDef {
  level: number;
  title: string;
  intro: string;
  objectives: ObjectiveDef[];
  reward: {
    coins: number;
    materials?: number;
    permits?: string[];
    district?: DistrictId;
    text: string;
  };
}

export const LEVELS: LevelDef[] = [
  {
    level: 1,
    title: 'Lights On',
    intro: 'The old generator failed and the town went dark. Bring the power back, Mayor!',
    objectives: [
      { kind: 'repair', plot: 'pgen', text: 'Repair the damaged generator', hint: 'Tap the smoking generator and choose Repair.' },
      { kind: 'poweredHomes', count: 3, text: 'Restore power to 3 homes', hint: 'Homes power up automatically once the generator runs.' },
      { kind: 'counter', key: 'taxCollected', amount: 1, text: 'Collect your first taxes', hint: 'Tap a house showing a coin bubble.' },
    ],
    reward: { coins: 150, text: 'Old Town celebrates! Residential upgrades are now approved.' },
  },
  {
    level: 2,
    title: 'A Place to Grow',
    intro: 'Families want to move in — but the main street is worn out and homes are too small.',
    objectives: [
      { kind: 'roadTier', tier: 2, count: 1, edge: 'e67', text: 'Upgrade the worn main street', hint: 'Tap the cracked road west of the crossing.' },
      { kind: 'buildTier', category: 'residential', tier: 2, count: 1, text: 'Upgrade a cottage into a Townhouse', hint: 'Tap a cottage → Upgrade. Townhouses need a Tier 2 road.' },
      { kind: 'population', amount: 30, text: 'Reach 30 residents', hint: 'Powered, connected homes attract residents.' },
    ],
    reward: { coins: 140, text: 'A new construction plot opens in Old Town.' },
  },
  {
    level: 3,
    title: 'Jobs for the Town',
    intro: 'New residents need work. The old workshop by the main road has seen better days.',
    objectives: [
      { kind: 'repair', plot: 'pwork', text: 'Repair the old workshop', hint: 'Tap the boarded-up workshop and choose Repair.' },
      { kind: 'jobsFilled', amount: 8, text: 'Employ 8 workers', hint: 'Workers commute from occupied homes to the workshop.' },
      { kind: 'counter', key: 'materialsCollected', amount: 3, text: 'Collect 3 construction materials', hint: 'Tap the workshop when it shows a crate bubble.' },
    ],
    reward: { coins: 120, permits: ['commercial'], text: 'Commercial permit granted — shops may open!' },
  },
  {
    level: 4,
    title: 'Market Day',
    intro: 'Workers have wages and nowhere to spend them. Time to open shop.',
    objectives: [
      { kind: 'build', category: 'commercial', count: 1, text: 'Open a shop', hint: 'Tap the empty plot on the south side of main street.' },
      { kind: 'counter', key: 'deliveries', amount: 1, text: 'Receive a goods delivery', hint: 'A truck carries goods from the workshop along the roads.' },
      { kind: 'counter', key: 'customersServed', amount: 20, text: 'Serve 20 customers', hint: 'Stocked shops serve nearby residents and earn coins.' },
    ],
    reward: { coins: 160, text: 'Commerce is booming on Main Street.' },
  },
  {
    level: 5,
    title: 'Rush Hour',
    intro: 'Success has a price: trips overload the roads and deliveries crawl.',
    objectives: [
      { kind: 'roadTier', tier: 2, count: 3, text: 'Have 3 road sections at Tier 2+', hint: 'Tap congested (red) roads to upgrade or open the southern loop.' },
      { kind: 'trafficEff', amount: 82, text: 'Traffic efficiency 82%+', hint: 'Upgrade busy roads; alternate routes spread the load.' },
      { kind: 'counter', key: 'deliveries', amount: 4, text: 'Complete 4 deliveries in total', hint: 'Free-flowing roads speed up trucks.' },
    ],
    reward: { coins: 170, permits: ['water', 'park'], district: 'market', text: 'The Market Quarter opens — with water and park permits!' },
  },
  {
    level: 6,
    title: 'Clean and Healthy',
    intro: 'The growing town needs clean water — and the workshop smoke is bothering everyone.',
    objectives: [
      { kind: 'build', category: 'water', count: 1, text: 'Build a water tower', hint: 'Use the water plot in the Market Quarter.' },
      { kind: 'allWatered', text: 'Supply water to every occupied building', hint: 'Water flows along connected roads, like power.' },
      { kind: 'build', category: 'park', count: 1, text: 'Build a park', hint: 'Parks raise happiness and absorb pollution.' },
      { kind: 'happiness', amount: 70, text: 'Reach 70% happiness', hint: 'Tap the happiness meter to see the full breakdown.' },
    ],
    reward: { coins: 180, permits: ['fire'], text: 'Fire-service permit granted. Safety first!' },
  },
  {
    level: 7,
    title: 'Safe Streets',
    intro: 'The busy workshop is running hot. A fire warning is flashing — act before it ignites!',
    objectives: [
      { kind: 'build', category: 'fire', count: 1, text: 'Build a fire station', hint: 'The plot in the Market Quarter covers the town center.' },
      { kind: 'industryCovered', text: 'Cover all industry with fire protection', hint: 'Coverage drains fire risk. Watch the risk meter fall.' },
      { kind: 'happiness', amount: 65, text: 'Keep happiness at 65%+', hint: 'Safety adds to citywide happiness.' },
    ],
    reward: { coins: 200, permits: ['transit'], district: 'industry', text: 'Industrial Edge unlocked — plus a public transport permit!' },
  },
  {
    level: 8,
    title: 'Keep the City Moving',
    intro: 'Roads alone can’t carry a real city. Buses move many citizens with few vehicles.',
    objectives: [
      { kind: 'build', category: 'transit', count: 2, text: 'Build two bus stops', hint: 'Small paved pads near the road junctions.' },
      { kind: 'busRoute', text: 'Activate a bus route', hint: 'Two connected stops start a route automatically.' },
      { kind: 'trafficEff', amount: 85, text: 'Traffic efficiency 85%+', hint: 'Buses take cars off the road.' },
      { kind: 'buildTier', category: 'commercial', tier: 2, count: 1, text: 'Upgrade a shop to a Local Market', hint: 'Bigger shops need Tier 2 roads and more goods.' },
    ],
    reward: { coins: 220, permits: ['office'], district: 'downtown', text: 'Downtown Waterfront unlocked — offices approved!' },
  },
  {
    level: 9,
    title: 'Rise of Downtown',
    intro: 'The waterfront is open. Density, offices, skyline — this is where MetroBloom grows up.',
    objectives: [
      { kind: 'buildTier', category: 'residential', tier: 3, count: 1, text: 'Complete an Apartment building', hint: 'Apartments need Tier 2 roads and 70% happiness.' },
      { kind: 'build', category: 'office', count: 1, text: 'Build an office', hint: 'Offices offer clean jobs on the downtown plots.' },
      { kind: 'population', amount: 150, text: 'Reach 150 residents', hint: 'Apartments hold 60 residents each.' },
      { kind: 'happiness', amount: 70, text: 'Hold happiness at 70%+', hint: 'Density strains power, water and roads — plan ahead.' },
    ],
    reward: { coins: 300, materials: 2, permits: ['landmark'], text: 'Landmark permit granted. Build the city’s heart!' },
  },
  {
    level: 10,
    title: 'The City’s Heart',
    intro: 'Prove MetroBloom is balanced — then raise the Eco Spire above the waterfront.',
    objectives: [
      { kind: 'population', amount: 180, text: 'Reach 180 residents', hint: 'Keep homes desirable: services, clean air, jobs.' },
      { kind: 'happiness', amount: 75, text: 'Reach 75% happiness', hint: 'Check the breakdown for your weakest factor.' },
      { kind: 'powerReserve', amount: 10, text: 'Keep a +10 power reserve', hint: 'Upgrade the power plant beyond current demand.' },
      { kind: 'waterReserve', amount: 10, text: 'Keep a +10 water reserve', hint: 'Upgrade the water system beyond current demand.' },
      { kind: 'pollutionMax', amount: 30, text: 'Keep pollution under 30', hint: 'Clean plants, parks and renewables clear the air.' },
      { kind: 'trafficEff', amount: 80, text: 'Traffic efficiency 80%+', hint: 'Tier 3 roads and buses keep the city moving.' },
      { kind: 'landmark', stage: 3, text: 'Build the Eco Spire (3 phases)', hint: 'Construct each phase on the waterfront plot.' },
    ],
    reward: { coins: 0, text: 'MetroBloom is complete!' },
  },
];

export function levelDef(level: number): LevelDef | null {
  return LEVELS.find((l) => l.level === level) ?? null;
}
