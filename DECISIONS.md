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

## Production-hardening pass (v1.1)

15. **L2 was unwinnable** — it required a Townhouse upgrade costing 1 material,
    but materials don't exist until industry is repaired in L3 (the reported
    "cottage won't upgrade" bug). Fixed by making the first residential upgrade
    coins-only; added a regression test asserting no level ≤3 requires materials.
16. **Tutorial pointer accuracy** — the finger projected at world height y=1.5
    (above the flat road), landing near the cottages. Now projects at each
    target's own height (roads ~0.25, buildings ~0.6–0.8) and a pixel-accurate
    pulsing ring marks the exact tap point, with the hand's fingertip anchored
    via `transform-origin`. Added guidance for the collect-materials step, which
    previously had none.
17. **Income feel** — switched tax from per-cycle lumps to continuous accrual
    (collectable amount = exact time waited), raised the storage cap to 6×, and
    bumped cottage tax for snappier early game.
18. **Traffic realism** — vehicles now keep to a right-hand lane (opposing
    traffic auto-separates), instead of overlapping on the road centerline.
19. **Fire-risk UI** — the fire-risk stat is hidden until the fire-service
    system is introduced (L7 / permit), so early players aren't shown a number
    they can't act on.
20. **Playables packaging** — `npm run package` writes a spec-compliant zip with
    forward-slash paths (not Windows `Compress-Archive` backslashes).
21. **Fire model made logical & self-resolving (v1.2)** — reported issue: a
    residential Cottage showed "high fire risk" because the old grid-overload
    clause added risk to *every* powered building, and that risk then got
    *stuck* (it only drained under fire coverage, so "reduce the load" never
    cleared it). Redesigned: (a) fire risk builds only on industrial + power
    buildings — homes/shops brown out but never ignite from a shortage; (b) a
    constant baseline cooldown drains risk whenever its cause is gone, so fixing
    the cause resolves the warning; (c) the panel now states the specific cause
    and fix instead of a vague "reduce the load." Regression-tested (homes stay
    at 0 risk, stale risk decays, industry still needs coverage).
