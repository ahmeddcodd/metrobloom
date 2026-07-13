/** Global economy + simulation tuning. All timings in seconds (sim time). */
export const ECONOMY = {
  startCoins: 120,
  startMaterials: 0,

  /** seconds between residential/office/commercial tax payouts accruing on the building */
  taxCycle: 12,
  /** industrial production cycle (materials + goods) */
  productionCycle: 8,
  /** commercial sales cycle (converts inventory + customers → coins bubble) */
  salesCycle: 9,
  /** goods consumed per commercial sales cycle at full customer load */
  goodsPerSale: 1,
  /** how many coins one sales cycle earns per goods unit sold */
  coinsPerSale: 14,

  /** worker availability: fraction of population that can work */
  workforceRatio: 0.62,
  /** minimum output factor for an understaffed workplace */
  minWorkerFactor: 0.25,
  /** move-in rate: residents per second per free capacity slot at full desirability */
  moveInRate: 0.10,

  /** road tier → capacity (abstract trip units) and speed multiplier */
  roadCapacity: [0, 8, 16, 26] as const,
  roadSpeed: [0, 1.0, 1.25, 1.5] as const,
  roadUpgradeCost: [0, 0, 120, 300] as const, // coins to reach tier index
  // tier 2 costs no materials: it must be reachable in L2, before industry runs
  roadUpgradeMaterials: [0, 0, 0, 2] as const,

  /** congestion below this ratio is free-flowing */
  congestionComfort: 0.7,

  /** pollution distance falloff radius (world units) */
  pollutionRadius: 16,

  /** fire risk tuning */
  fireRiskWarn: 60,
  fireRiskIgnite: 100,
  fireBurnSeconds: 10,
  fireExtinguishSeconds: 4,

  /** vehicle speeds, world units/sec */
  carSpeed: 4.5,
  truckSpeed: 3.6,
  busSpeed: 3.2,
  fireTruckSpeed: 6.0,
  citizenSpeed: 1.1,

  /** visible agent caps (representative population model) */
  maxCars: 14,
  maxCitizens: 24,

  simRate: 10, // sim ticks per second
} as const;

export const SCORE_WEIGHTS = {
  prosperity: 0.3, // coins earned + buildings + tiers
  happiness: 0.25,
  mobility: 0.2, // traffic efficiency
  sustainability: 0.25, // low pollution + renewable + parks
} as const;
