# MetroBloom — Balancing

All values live in `src/config/economy.ts`, `src/config/buildings.ts` and
`src/config/levels.ts`. Nothing is hardcoded in entity/visual code.

## Timing

| Cycle | Seconds |
|---|---|
| Simulation tick | 0.1 (10 Hz fixed) |
| Tax accrual | 12 |
| Industrial production | 8 |
| Commercial sales | 9 |
| Expected level pace | L1–3 ≈ 45–90 s, L4–7 ≈ 60–120 s, L8–10 ≈ 90–180 s |

## Buildings (per tier: T1 / T2 / T3)

- **Residential** cap 8/24/60 · power 2/5/10 · water 1/3/7 · traffic 1/3/8 · tax 6/18/50 · cost 90c → 250c+1m → 750c+4m (T2 needs T2 road; T3 needs T2 road + 70 % happiness)
- **Industrial** jobs 10/26/50 · pollution 6/12/5 · production 1/2/4 per cycle · cost 150c → 450c+2m → 1000c+5m
- **Commercial** jobs 5/14/30 · customers 10/28/65 · goods cap 5/14/30 · cost 180c → 480c+2m → 1100c+5m
- **Power** capacity 20/55/120 (T3 renewable = 0 pollution) · cost 50c repair → 400c+2m → 900c+5m
- **Water** capacity 30/70/140 · cost 220c+1m → 520c+3m → 1000c+5m
- **Park** happiness +4/+8/+12 · mitigation radius 10/14/18
- **Fire** coverage radius 18/28/44
- **Transit** car-trip reduction 12/18/25 % per stop (route max 50 %)
- **Office** jobs 12/28/60 · tax 20/45/90
- **Landmark** 3 phases: 500c+4m, 800c+6m, 1200c+8m

## Roads

Tier 1/2/3: capacity 8/16/26, speed ×1.0/1.25/1.5. Upgrades: →T2 120c (no
materials — must be reachable in L2 before industry exists), →T3 300c+2m.
Congestion comfort threshold 0.7; speed = tierSpeed / (1 + 2.2·excess).

## Population & economy

Workforce ratio 0.62 · min worker factor 0.25 · move-in ≈ 0.1·desirability/s ·
move-out 0.15–0.4/s with occupancy floors 55 % (minor service gap) / 30 %
(blackout) so recovery is always possible. Sale = 14 coins per goods unit.

## Fire

Warn at risk 60, ignite at 100 only after 20 s+ of warning; risk clamped to 55
before L7. Burn 10 s uncovered (→ damaged, repair 60·tier coins) or ~7 s covered
(no damage). Coverage drains risk at 1.2/s.

## Recovery safeguards (tested in `tests/sim.test.ts`)

- Start coins (120) always cover the generator repair (50).
- Homes never fully empty while connected → taxes keep flowing.
- Tier-2 road upgrade requires no materials (available pre-industry).
- Fires cannot ignite without warning, or before L7.
