# MetroBloom — Production Decisions

Assumptions and judgment calls made where the brief left room. Each was chosen
for the best Playables result and is cheap to revisit.

1. **Project location:** the working directory contained a complete different
   game (Scoop Shop Boss 3D). MetroBloom lives in its own self-contained
   `metrobloom/` sub-project (own package.json/node_modules) — nothing of the
   existing game was touched.
2. **Zero downloaded assets:** the brief allows GLB/KTX2, but a first-pass
   procedural `ModelFactory` ships better (620 KB total, instant load, no
   decoder cost). GLB swap-in is isolated to `buildModel()`. KTX2/Meshopt
   deliberately skipped — nothing to compress.
3. **Traffic model:** per-edge demand from each active building's anchor edge +
   full-route load from live deliveries, rather than per-trip agent simulation.
   Congestion still has real causes, road tiers/buses still fix it; visible cars
   are a representative sample driving real A* routes at congestion-scaled speed.
4. **Water/power distribution:** road-network connectivity + citywide capacity
   (as specified) with a 55 % brownout threshold instead of per-building rationing.
5. **District→level mapping:** fire-station and water plots sit in the Market
   Quarter (unlocked after L5) because L6–L7 need them before the Industrial
   Edge opens (L7 reward). Downtown unlocks after L8 so L9 can build there.
6. **Tier-2 roads cost no materials** — L2 requires the upgrade before industry
   (the only material source) exists. Caught by the test suite.
7. **Fire fairness additions:** risk clamped below warning before L7; ignition
   requires ≥20 s of visible warning; buildings are damaged, never destroyed.
8. **Occupancy floors** (55 % single-service gap / 30 % blackout) prevent the
   move-out death spiral while keeping failures visibly painful.
9. **Apartment path:** L9's apartment is tier 3 of the residential family
   (upgrade path), matching the 3-tier rule rather than a separate building.
10. **Music** is a generative 4-chord WebAudio pad (no licensed audio risk);
    SFX are synthesized envelopes.
11. **Limited camera:** fixed isometric yaw (no rotation) — matches both
    reference families, simplifies picking/readability on mobile.
12. **Landmark stages = tiers 1–3** of the `landmark` category, reusing the
    construction pipeline (scaffold, crane, dust) for all three phases.
13. **Reset = in-place state swap** (no page reload) so the SDK lifecycle
    (`gameReady`, pause callbacks) stays valid.
14. **Debug "Finale" button** exists behind `?debug=1` for QA of the ending;
    excluded from normal presentation.
