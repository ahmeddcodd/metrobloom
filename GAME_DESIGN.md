# MetroBloom — Game Design

## Core loop (20–60 s)

Observe → spot a need (status bubble / objective / congestion tint) → tap to
inspect → see the cause and a solution → spend coins/materials → watch
construction & city reaction → collect income → next objective.

**North star:** every system causes, supports or solves another system.
Homes → residents → workers/customers → industry & shops → goods deliveries →
traffic → roads & transit → pollution → parks & clean tech → density → services.

## Resources

- **Coins** — taxes (residential/commercial/office accrue on the building; tap to
  collect), shop sales, level rewards. Spent on everything.
- **Materials** — produced only by industry (workers + power + road required);
  collected from the workshop bubble. Spent on upgrades, T3 roads, the landmark.
- **Permits** — progression gates from level rewards only (commercial, water,
  park, fire, transit, office, landmark). Never sold, never random.
- **Population** — occupied residential capacity. Move-in needs road, power,
  water (from L6), acceptable happiness and pollution. Failures cause a slow
  move-out with a floor (30–55 % of capacity) — the town never death-spirals.
- **Happiness** — transparent: 50 base + employment + power + water + shopping
  + parks + fire safety − traffic − pollution. Tapping the chip shows every factor.

## Simulation rules

- **Power/Water:** finite capacity; distributed over the connected road network
  from source buildings. Shortage → brownout threshold + reduced efficiency,
  essential services prioritized. Water demand activates at L6.
- **Employment:** `workerFactor = clamp(filled/required, 0.25, 1)`; workplaces
  must be road-reachable from an occupied home. 50 % staffing ≠ 100 % output.
- **Goods:** industry buffers goods → truck drives the actual road path to the
  neediest shop → unloads → shop sells to customers (scaled by population) → coins.
- **Traffic:** each active building loads its anchor edge (occupancy-scaled);
  deliveries load their whole route. `congestion = load/capacity`; speed drops
  smoothly past 70 %. Roads T1/T2/T3 = capacity 8/16/26. Buses remove up to 50 %
  of car demand when ≥2 connected stops exist.
- **Pollution:** real sources only (industry, fossil power) with linear distance
  falloff (r=16) and park mitigation; shown per building as exposure.
- **Fire:** risk grows from industrial activity, old generators and grid
  overload; drains under station coverage. Warning bubble at 60, ignition at 100
  only after ≥20 s of visible warning, and never before L7. Covered buildings are
  saved by a dispatched truck; uncovered ones become damaged (repairable) — never
  destroyed.

## The ten levels

| # | Title | Teaches | Key objectives |
|---|-------|---------|----------------|
| 1 | Lights On | selection, power, collection | repair generator, power 3 homes, collect tax |
| 2 | A Place to Grow | roads, upgrades, population | T2 main street, townhouse, 30 residents |
| 3 | Jobs for the Town | employment, industry, materials | repair workshop, 8 workers, 3 materials |
| 4 | Market Day | commerce, goods, deliveries | build shop, 1 delivery, 20 customers |
| 5 | Rush Hour | congestion, road tiers, routes | 3 T2 roads, 82 % traffic eff., 4 deliveries |
| 6 | Clean & Healthy | water, pollution, parks | water tower, all watered, park, 70 % happy |
| 7 | Safe Streets | fire risk & coverage | fire station, cover industry, 65 % happy |
| 8 | Keep the City Moving | transit | 2 stops, active route, 85 % eff., T2 shop |
| 9 | Rise of Downtown | density, offices | apartment (T3), office, 150 pop, 70 % happy |
| 10 | The City's Heart | balance + landmark | 180 pop, 75 % happy, +10 power & water reserve, ≤30 pollution, 80 % eff., 3 Spire phases |

Rewards grant coins, permits and district unlocks (Market Quarter after L5,
Industrial Edge after L7, Downtown Waterfront after L8). Target first playthrough
≈ 15 minutes. After L10: score screen (Prosperity / Happiness / Mobility /
Sustainability, weighted 30/25/20/25) → Free Mayor Mode.

## Fairness & recovery

- Repair costs are always affordable from the start state (tested).
- Unpowered/unwatered homes keep a rump population so taxes keep trickling.
- Fires warn long before igniting and never occur before the fire system unlocks.
- Every blocker is written out in the UI (costs, road tier, happiness threshold).
