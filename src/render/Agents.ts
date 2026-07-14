/**
 * Representative population: ambient cars (real OD trips over the road
 * graph), sim-driven delivery trucks, a route bus, a fire truck responder
 * and wandering citizens. All pooled; counts scale with quality level.
 */
import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { plotAnchor, plotById } from '../config/map';
import { bus as events } from '../utils/events';
import { makeRng } from '../utils/rng';
import { dist2d } from '../utils/math';
import type { GameStateData } from '../game/GameState';
import type { Simulation } from '../sim/Simulation';
import { routePoint } from '../sim/production';
import { buildCitizen, buildVehicle } from './ModelFactory';
import type { QualityLevel } from './Renderer';

/** ground clearance per agent kind (roads are ~0.1–0.15 high) */
const BASE_Y: Record<string, number> = { car: 0.14, bus: 0.14, firetruck: 0.14, citizen: 0.1 };
/** right-lane offset (world units) so vehicles don't overlap on the centerline */
const VEHICLE_LANE = 0.42;

interface Traveler {
  obj: THREE.Group;
  points: [number, number][];
  seg: number;
  segT: number;
  speed: number;
  active: boolean;
  pauseT: number;
  kind: 'car' | 'citizen' | 'bus' | 'firetruck';
  loop: boolean;
}

export class Agents {
  private cars: Traveler[] = [];
  private citizens: Traveler[] = [];
  private busT: Traveler | null = null;
  private fireTruck: Traveler | null = null;
  private fireTarget: string | null = null;
  private truckMeshes = new Map<number, THREE.Group>();
  private group = new THREE.Group();
  private rng = makeRng(4242);
  private spawnT = 0;
  private carCap: number = ECONOMY.maxCars;
  private citizenCap: number = ECONOMY.maxCitizens;

  constructor(
    scene: THREE.Scene,
    private state: GameStateData,
    private sim: Simulation,
  ) {
    scene.add(this.group);
    events.on('fireStarted', (plotId) => this.dispatchFireTruck(plotId));
  }

  applyQuality(q: QualityLevel): void {
    this.carCap = q === 'low' ? 6 : q === 'medium' ? 10 : ECONOMY.maxCars;
    this.citizenCap = q === 'low' ? 8 : q === 'medium' ? 16 : ECONOMY.maxCitizens;
  }

  // ---------- helpers ----------
  private anchorsOf(pred: (defId: string) => boolean): string[] {
    const out: string[] = [];
    for (const b of Object.values(this.state.buildings)) {
      const rt = this.sim.derived.runtime.get(b.id);
      if (rt?.active && rt.connected && pred(b.defId)) out.push(b.id);
    }
    return out;
  }

  private makeRoute(fromPlot: string, toPlot: string): [number, number][] | null {
    const path = this.sim.graph.findPath(plotById(fromPlot).edge, plotById(toPlot).edge);
    if (!path) return null;
    const pts: [number, number][] = [];
    const a = plotAnchor(plotById(fromPlot));
    pts.push([a.x, a.z]);
    for (const n of path) pts.push(routePoint(n));
    const b = plotAnchor(plotById(toPlot));
    pts.push([b.x, b.z]);
    return pts;
  }

  private advance(t: Traveler, dt: number): boolean {
    if (t.pauseT > 0) {
      t.pauseT -= dt;
      return true;
    }
    const pts = t.points;
    if (t.seg >= pts.length - 1) return false;
    const [ax, az] = pts[t.seg];
    const [bx, bz] = pts[t.seg + 1];
    const segLen = Math.max(0.01, dist2d(ax, az, bx, bz));
    // congestion-aware speed on the nearest edge
    let speedFactor = 1;
    let bestD = 4;
    for (const [id, rt] of this.sim.graph.edges) {
      const mx = (rt.ax + rt.bx) / 2;
      const mz = (rt.az + rt.bz) / 2;
      const d = dist2d(t.obj.position.x, t.obj.position.z, mx, mz) / Math.max(1, rt.length);
      if (d < bestD) {
        bestD = d;
        speedFactor = this.sim.graph.speedFactor(id);
      }
    }
    if (t.kind === 'firetruck') speedFactor = Math.max(speedFactor, 0.85); // sirens clear a path
    t.segT += ((t.speed * speedFactor) * dt) / segLen;
    let x = ax + (bx - ax) * Math.min(1, t.segT);
    let z = az + (bz - az) * Math.min(1, t.segT);
    // vehicles keep to the right lane: offset perpendicular-right of travel.
    // Opposing traffic on the same segment naturally lands on the other side.
    if (t.kind !== 'citizen') {
      const rx = (bz - az) / segLen;
      const rz = -(bx - ax) / segLen;
      x += rx * VEHICLE_LANE;
      z += rz * VEHICLE_LANE;
    }
    t.obj.position.set(x, BASE_Y[t.kind] ?? 0.12, z);
    if (segLen > 0.4) t.obj.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    if (t.segT >= 1) {
      t.segT = 0;
      t.seg++;
      if (t.seg >= pts.length - 1) {
        if (t.loop) {
          t.points = [...t.points].reverse();
          t.seg = 0;
          t.pauseT = t.kind === 'bus' ? 1.6 : 0.4;
          return true;
        }
        return false;
      }
    }
    return true;
  }

  // ---------- cars ----------
  private spawnCar(): void {
    const origins = this.anchorsOf((d) => d === 'residential');
    const dests = this.anchorsOf((d) => d === 'industrial' || d === 'commercial' || d === 'office' || d === 'park');
    if (!origins.length || !dests.length) return;
    const from = origins[Math.floor(this.rng() * origins.length)];
    const to = dests[Math.floor(this.rng() * dests.length)];
    if (from === to) return;
    const pts = this.makeRoute(from, to);
    if (!pts) return;
    let t = this.cars.find((c) => !c.active);
    if (!t) {
      if (this.cars.length >= this.carCap) return;
      t = { obj: buildVehicle('car', this.cars.length), points: pts, seg: 0, segT: 0, speed: ECONOMY.carSpeed, active: true, pauseT: 0, kind: 'car', loop: false };
      this.group.add(t.obj);
      this.cars.push(t);
    }
    t.points = pts;
    t.seg = 0;
    t.segT = 0;
    t.active = true;
    t.obj.visible = true;
    t.obj.position.set(pts[0][0], BASE_Y.car, pts[0][1]);
  }

  // ---------- citizens ----------
  private spawnCitizen(): void {
    const origins = this.anchorsOf((d) => d === 'residential');
    const dests = this.anchorsOf((d) => d === 'park' || d === 'commercial' || d === 'transit' || d === 'industrial');
    if (!origins.length || !dests.length) return;
    const from = origins[Math.floor(this.rng() * origins.length)];
    const to = dests[Math.floor(this.rng() * dests.length)];
    if (from === to) return;
    const pts = this.makeRoute(from, to);
    if (!pts) return;
    // walk on sidewalk offset
    const off = 1.15;
    const shifted = pts.map(([x, z], i): [number, number] => {
      const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)];
      const dx = nx - x;
      const dz = nz - z;
      const len = Math.hypot(dx, dz) || 1;
      return [x + (-dz / len) * off, z + (dx / len) * off];
    });
    let t = this.citizens.find((c) => !c.active);
    if (!t) {
      if (this.citizens.length >= this.citizenCap) return;
      t = { obj: buildCitizen(this.citizens.length), points: shifted, seg: 0, segT: 0, speed: ECONOMY.citizenSpeed, active: true, pauseT: 0, kind: 'citizen', loop: false };
      this.group.add(t.obj);
      this.citizens.push(t);
    }
    t.points = shifted;
    t.seg = 0;
    t.segT = 0;
    t.active = true;
    t.obj.visible = true;
    t.obj.position.set(shifted[0][0], BASE_Y.citizen, shifted[0][1]);
  }

  // ---------- bus ----------
  private syncBus(): void {
    const d = this.sim.derived;
    if (!d.busActive) {
      if (this.busT) this.busT.obj.visible = false;
      if (this.busT) this.busT.active = false;
      return;
    }
    if (this.busT?.active) return;
    const stops = Object.values(this.state.buildings).filter((b) => b.defId === 'transit');
    if (stops.length < 2) return;
    const pts = this.makeRoute(stops[0].id, stops[1].id);
    if (!pts) return;
    if (!this.busT) {
      this.busT = { obj: buildVehicle('bus'), points: pts, seg: 0, segT: 0, speed: ECONOMY.busSpeed, active: true, pauseT: 0, kind: 'bus', loop: true };
      this.group.add(this.busT.obj);
    }
    this.busT.points = pts;
    this.busT.seg = 0;
    this.busT.segT = 0;
    this.busT.active = true;
    this.busT.obj.visible = true;
  }

  // ---------- fire truck ----------
  private dispatchFireTruck(targetPlot: string): void {
    const stations = Object.values(this.state.buildings).filter(
      (b) => b.defId === 'fire' && this.sim.derived.runtime.get(b.id)?.active,
    );
    if (!stations.length) return;
    const pts = this.makeRoute(stations[0].id, targetPlot);
    if (!pts) return;
    if (!this.fireTruck) {
      this.fireTruck = { obj: buildVehicle('firetruck'), points: pts, seg: 0, segT: 0, speed: ECONOMY.fireTruckSpeed, active: true, pauseT: 0, kind: 'firetruck', loop: false };
      this.group.add(this.fireTruck.obj);
    }
    this.fireTruck.points = pts;
    this.fireTruck.seg = 0;
    this.fireTruck.segT = 0;
    this.fireTruck.active = true;
    this.fireTruck.obj.visible = true;
    this.fireTruck.obj.position.set(pts[0][0], 0.05, pts[0][1]);
    this.fireTarget = targetPlot;
  }

  // ---------- delivery trucks (sim-driven) ----------
  private syncDeliveries(): void {
    const live = new Set<number>();
    for (const d of this.sim.derived.deliveries) {
      live.add(d.id);
      let m = this.truckMeshes.get(d.id);
      if (!m) {
        m = buildVehicle('truck');
        this.truckMeshes.set(d.id, m);
        this.group.add(m);
      }
      const pts = d.nodes;
      const i = Math.min(d.seg, pts.length - 2);
      const [ax, az] = routePoint(pts[i]);
      const [bx, bz] = routePoint(pts[i + 1]);
      const segLen = Math.hypot(bx - ax, bz - az) || 1;
      const rx = (bz - az) / segLen;
      const rz = -(bx - ax) / segLen;
      m.position.set(ax + (bx - ax) * d.segT + rx * VEHICLE_LANE, BASE_Y.car, az + (bz - az) * d.segT + rz * VEHICLE_LANE);
      if (segLen > 0.4) m.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    }
    for (const [id, m] of this.truckMeshes) {
      if (!live.has(id)) {
        this.group.remove(m);
        this.truckMeshes.delete(id);
      }
    }
  }

  update(dt: number, simTime: number): void {
    // spawn cadence scales with real activity
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.2 + this.rng() * 1.2;
      const activeCars = this.cars.filter((c) => c.active).length;
      const targetCars = Math.min(this.carCap, 2 + Math.floor(this.sim.derived.population / 18));
      if (activeCars < targetCars) this.spawnCar();
      const activeCit = this.citizens.filter((c) => c.active).length;
      const targetCit = Math.min(this.citizenCap, 3 + Math.floor(this.sim.derived.population / 10));
      if (activeCit < targetCit) this.spawnCitizen();
    }

    for (const c of this.cars) {
      if (c.active && !this.advance(c, dt)) {
        c.active = false;
        c.obj.visible = false;
      }
    }
    for (const c of this.citizens) {
      if (c.active && !this.advance(c, dt)) {
        c.active = false;
        c.obj.visible = false;
      }
      if (c.active) c.obj.position.y = BASE_Y.citizen + Math.abs(Math.sin(simTime * 8 + c.obj.position.x)) * 0.05; // walk bob
    }

    this.syncBus();
    if (this.busT?.active) this.advance(this.busT, dt);

    if (this.fireTruck?.active) {
      const arrived = !this.advance(this.fireTruck, dt);
      const beacon = this.fireTruck.obj.getObjectByName('beacon');
      if (beacon) beacon.visible = Math.sin(simTime * 10) > 0;
      const targetBurning = this.fireTarget && this.state.buildings[this.fireTarget]?.onFire;
      if (arrived && !targetBurning) {
        this.fireTruck.active = false;
        this.fireTruck.obj.visible = false;
        this.fireTarget = null;
      }
    }

    this.syncDeliveries();
  }
}
