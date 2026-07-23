/**
 * Draws + animates the city from GameState/Derived: roads (tiered, congestion
 * tinted), plots, buildings (with construction scaffolds), status bubbles,
 * selection ring, and locked-district barriers. Rebuilds only on change events.
 */
import * as THREE from 'three';
import { EDGES, PLOTS, edgeById, nodeById, plotAnchor, plotById, type PlotDef } from '../config/map';
import { PALETTE } from '../config/theme';
import { bus } from '../utils/events';
import { clamp } from '../utils/math';
import type { GameStateData } from '../game/GameState';
import type { Simulation } from '../sim/Simulation';
import { buildModel, buildScaffold, geo, makeAoDisc, mat } from './ModelFactory';

/** Uniform scale that fits a building's (rotated) footprint inside its plot with
 *  a margin, so upgraded meshes never spill onto the road. Decorative trees are
 *  excluded so they can overhang naturally. */
function fitScaleToPlot(model: THREE.Object3D, plotW: number, plotD: number): number {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  let any = false;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) return;
    for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) {
      if (cur.name === 'decor') return;
    }
    tmp.setFromObject(m);
    if (tmp.isEmpty()) return;
    box.union(tmp);
    any = true;
  });
  if (!any) return 1;
  const bw = box.max.x - box.min.x;
  const bd = box.max.z - box.min.z;
  const margin = 0.8;
  return Math.min(1, Math.max(1, plotW - margin) / Math.max(0.01, bw), Math.max(1, plotD - margin) / Math.max(0.01, bd));
}

/** Every edge gets its own asphalt height so overlapping boxes at
 *  intersections can never z-fight (steps are sub-pixel at game zoom). */
function roadTopY(edgeId: string): number {
  const idx = Math.max(0, EDGES.findIndex((e) => e.id === edgeId));
  return 0.1 + idx * 0.003;
}

let asphaltTex: THREE.CanvasTexture | null = null;
function getAsphaltTex(): THREE.CanvasTexture {
  if (!asphaltTex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    // near-white base so material.color stays the true road tint
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, 128, 128);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      const v = 205 + Math.floor(rnd() * 50);
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.fillRect(rnd() * 128, rnd() * 128, 1.6, 1.6);
    }
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = 'rgba(150,150,150,0.35)';
      ctx.beginPath();
      const x = rnd() * 128;
      const y = rnd() * 128;
      ctx.moveTo(x, y);
      ctx.lineTo(x + rnd() * 20 - 10, y + rnd() * 20 - 10);
      ctx.stroke();
    }
    asphaltTex = new THREE.CanvasTexture(c);
    asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(1, 4);
  }
  return asphaltTex;
}

const BUBBLE_SPECS: Record<string, { bg: string; urgent?: boolean }> = {
  fire: { bg: '#e8564a', urgent: true },
  damaged: { bg: '#ffb03a', urgent: true },
  construction: { bg: '#5aa9e6' },
  firerisk: { bg: '#ffb03a', urgent: true },
  noroad: { bg: '#ffb03a' },
  nopower: { bg: '#e8564a' },
  nowater: { bg: '#5aa9e6' },
  noworkers: { bg: '#ffb03a' },
  nogoods: { bg: '#ffb03a' },
  materials: { bg: '#8f6f4b' },
  coins: { bg: '#3f9d49' },
};

/** Vector glyphs drawn straight onto the bubble canvas — no emoji fonts,
 *  identical rendering on every platform. Canvas is 96×112, bubble center
 *  (48,44) radius 38. */
function drawBubbleGlyph(ctx: CanvasRenderingContext2D, kind: string): void {
  ctx.save();
  ctx.translate(48, 44);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'coins': {
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd045';
      ctx.fill();
      ctx.strokeStyle = '#b07a1e';
      ctx.lineWidth = 4;
      ctx.font = 'bold 26px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#8a5c10';
      ctx.fillText('$', 0, 2);
      break;
    }
    case 'materials': {
      ctx.fillStyle = '#e0a06a';
      ctx.fillRect(-20, -14, 18, 11);
      ctx.fillRect(2, -14, 18, 11);
      ctx.fillRect(-9, 1, 18, 11);
      ctx.fillStyle = '#f2c396';
      ctx.fillRect(-20, 1, 9, 11);
      ctx.fillRect(11, 1, 9, 11);
      break;
    }
    case 'nopower': {
      ctx.beginPath();
      ctx.moveTo(4, -22);
      ctx.lineTo(-12, 4);
      ctx.lineTo(-1, 4);
      ctx.lineTo(-4, 22);
      ctx.lineTo(12, -4);
      ctx.lineTo(1, -4);
      ctx.closePath();
      ctx.fillStyle = '#ffe95e';
      ctx.fill();
      break;
    }
    case 'nowater': {
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.bezierCurveTo(12, -4, 16, 2, 16, 9);
      ctx.arc(0, 9, 16, 0, Math.PI, false);
      ctx.bezierCurveTo(-16, 2, -12, -4, 0, -20);
      ctx.fillStyle = '#dff4ff';
      ctx.fill();
      break;
    }
    case 'fire': {
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.bezierCurveTo(10, -10, 18, -4, 18, 8);
      ctx.arc(0, 8, 18, 0, Math.PI, false);
      ctx.bezierCurveTo(-18, -4, -10, -10, 0, -22);
      ctx.fillStyle = '#ffd045';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 10, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#e8564a';
      ctx.fill();
      break;
    }
    case 'firerisk': {
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(20, 15);
      ctx.lineTo(-20, 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(-3, -8, 6, 13);
      ctx.beginPath();
      ctx.arc(0, 10, 3.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'damaged': {
      // wrench
      ctx.beginPath();
      ctx.arc(-10, -10, 10, Math.PI * 0.25, Math.PI * 1.6);
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(14, 14);
      ctx.stroke();
      break;
    }
    case 'construction': {
      // hammer
      ctx.save();
      ctx.rotate(-0.6);
      ctx.fillRect(-16, -18, 24, 12);
      ctx.fillRect(-4, -8, 8, 28);
      ctx.restore();
      break;
    }
    case 'noroad': {
      ctx.fillRect(-20, -6, 40, 14);
      ctx.fillStyle = BUBBLE_SPECS.noroad.bg;
      for (let i = -18; i < 20; i += 10) {
        ctx.beginPath();
        ctx.moveTo(i, 8);
        ctx.lineTo(i + 6, -6);
        ctx.lineTo(i + 10, -6);
        ctx.lineTo(i + 4, 8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-17, 8, 5, 10);
      ctx.fillRect(12, 8, 5, 10);
      break;
    }
    case 'noworkers': {
      ctx.beginPath();
      ctx.arc(0, -8, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 16, 15, Math.PI, 0);
      ctx.fill();
      // hard-hat brim
      ctx.fillStyle = '#ffd045';
      ctx.beginPath();
      ctx.arc(0, -10, 9.5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-12, -10, 24, 3);
      break;
    }
    case 'nogoods': {
      ctx.fillRect(-16, -12, 32, 28);
      ctx.strokeStyle = BUBBLE_SPECS.nogoods.bg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 16);
      ctx.moveTo(-16, -2);
      ctx.lineTo(16, -2);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export class CityRenderer {
  readonly group = new THREE.Group();
  private roadGroups = new Map<string, THREE.Group>();
  private roadMats = new Map<string, THREE.MeshStandardMaterial>();
  private plotGroups = new Map<string, THREE.Group>();
  private buildingGroups = new Map<string, THREE.Group>();
  private bubbles = new Map<string, THREE.Sprite>();
  private bubbleKinds = new Map<string, string>();
  private bubbleTex = new Map<string, THREE.SpriteMaterial>();
  private plotHeights = new Map<string, number>();
  private selection: THREE.Mesh;
  private t = 0;
  pickables: THREE.Object3D[] = [];

  constructor(
    scene: THREE.Scene,
    private state: GameStateData,
    private sim: Simulation,
  ) {
    scene.add(this.group);
    this.selection = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 32), mat(PALETTE.select, { emissive: PALETTE.select, emissiveIntensity: 0.5, opacity: 0.9 }));
    this.selection.rotation.x = -Math.PI / 2;
    this.selection.position.y = 0.06;
    this.selection.visible = false;
    this.group.add(this.selection);

    this.buildAllRoads();
    this.buildAllPlots();
    bus.on('buildingChanged', (id) => this.rebuildPlot(id));
    bus.on('roadChanged', (id) => this.rebuildRoad(id));
    bus.on('districtUnlocked', () => {
      this.buildAllRoads();
      this.buildAllPlots();
    });
    bus.on('levelStarted', () => this.buildAllPlots()); // unlockLevel plots appear
    bus.on('selectionChanged', (id) => {
      this.selection.visible = !!id;
      if (id) {
        const p = plotById(id);
        this.selection.position.set(p.x, 0.06, p.z);
        const s = Math.max(p.w, p.d) / 4.6;
        this.selection.scale.setScalar(s);
      }
    });
  }

  // ---------- roads ----------
  private buildAllRoads(): void {
    for (const e of EDGES) this.rebuildRoad(e.id);
  }

  private rebuildRoad(edgeId: string): void {
    const old = this.roadGroups.get(edgeId);
    if (old) {
      this.group.remove(old);
      this.pickables = this.pickables.filter((p) => p.userData.edgeId !== edgeId);
    }
    const e = edgeById(edgeId);
    const a = nodeById(e.a);
    const b = nodeById(e.b);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const unlocked = this.state.unlockedDistricts.includes(e.district);
    const tier = this.state.roadTiers[edgeId] ?? 0;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = yaw;

    if (!unlocked) {
      // dirt track + barriers + survey flags
      const dirt = new THREE.Mesh(geo('box', 1.4, 0.05, len), mat(PALETTE.dirt));
      dirt.position.y = 0.028 + Math.max(0, EDGES.findIndex((x) => x.id === edgeId)) * 0.0015;
      dirt.receiveShadow = true;
      g.add(dirt);
      for (let i = -1; i <= 1; i += 2) {
        const barrier = new THREE.Mesh(geo('box', 2.0, 0.7, 0.18), mat(PALETTE.indSafety));
        barrier.position.set(0, 0.35, (i * len) / 2 - i * 1.2);
        g.add(barrier);
        const flag = new THREE.Mesh(geo('box', 0.4, 0.3, 0.04), mat(PALETTE.comSign));
        flag.position.set(0.8, 0.9, (i * len) / 2 - i * 2.2);
        g.add(flag);
        const pole = new THREE.Mesh(geo('box', 0.05, 1.0, 0.05), mat(PALETTE.trunk));
        pole.position.set(0.62, 0.5, (i * len) / 2 - i * 2.2);
        g.add(pole);
      }
    } else {
      const topY = roadTopY(edgeId);
      const width = tier === 1 ? 1.7 : tier === 2 ? 2.3 : 2.9;
      const color = tier === 1 ? PALETTE.roadT1 : tier === 2 ? PALETTE.roadT2 : PALETTE.roadT3;
      const asphaltMat = new THREE.MeshStandardMaterial({ color, roughness: 0.96, map: getAsphaltTex() });
      this.roadMats.set(edgeId, asphaltMat);
      const road = new THREE.Mesh(geo('box', width, 0.1, len + width * 0.9), asphaltMat);
      road.position.y = topY - 0.05;
      road.receiveShadow = true;
      road.userData.edgeId = edgeId;
      g.add(road);
      this.pickables.push(road);
      if (tier === 1) {
        // worn road: sparse off-center repair patches, slightly darker than the asphalt
        for (let zz = -len / 2 + 1.6; zz < len / 2 - 1.2; zz += 4.3) {
          const side = Math.round(zz * 13) % 2 === 0 ? -1 : 1;
          const patch = new THREE.Mesh(geo('box', 0.44, 0.012, 0.6), mat(0x776f62));
          patch.position.set((side * width) / 4.2, topY + 0.006, zz);
          patch.rotation.y = (zz * 7) % 0.8;
          g.add(patch);
        }
      }
      if (tier >= 2) {
        // dashed center line sits ON the asphalt, never inside it
        for (let zz = -len / 2 + 1; zz < len / 2 - 0.5; zz += 2.2) {
          const dash = new THREE.Mesh(geo('box', 0.14, 0.014, 1.0), mat(PALETTE.roadLine));
          dash.position.set(0, topY + 0.008, zz);
          g.add(dash);
        }
        for (const side of [-1, 1]) {
          const walk = new THREE.Mesh(geo('box', 0.6, 0.1, len + width), mat(PALETTE.sidewalk));
          walk.position.set(side * (width / 2 + 0.32), topY - 0.07, 0);
          walk.receiveShadow = true;
          g.add(walk);
        }
      }
      if (tier >= 3) {
        // edge lines + streetlights for the boulevard look
        for (const side of [-1, 1]) {
          const line = new THREE.Mesh(geo('box', 0.08, 0.012, len - 0.6), mat(PALETTE.roadLine));
          line.position.set(side * (width / 2 - 0.18), topY + 0.007, 0);
          g.add(line);
        }
        for (const zz of [-len / 3, len / 3]) {
          const pole = new THREE.Mesh(geo('box', 0.08, 1.9, 0.08), mat(PALETTE.indMetal));
          pole.position.set(width / 2 + 0.3, topY + 0.9, zz);
          g.add(pole);
          const lamp = new THREE.Mesh(geo('sphere', 0.14), mat(PALETTE.glassEmissive, { emissive: PALETTE.glassEmissive, emissiveIntensity: 0.9 }));
          lamp.position.set(width / 2 + 0.3, topY + 1.9, zz);
          g.add(lamp);
        }
      }
    }
    this.roadGroups.set(edgeId, g);
    this.group.add(g);
  }

  // ---------- plots + buildings ----------
  private buildAllPlots(): void {
    for (const p of PLOTS) this.rebuildPlot(p.id);
  }

  private plotVisible(p: PlotDef): boolean {
    if (!this.state.unlockedDistricts.includes(p.district)) return false;
    if (p.unlockLevel && this.state.level < p.unlockLevel) return false;
    return true;
  }

  rebuildPlot(plotId: string): void {
    const old = this.plotGroups.get(plotId);
    if (old) {
      this.group.remove(old);
      this.pickables = this.pickables.filter((o) => o.userData.plotId !== plotId);
      this.buildingGroups.delete(plotId);
    }
    const p = plotById(plotId);
    if (!this.plotVisible(p)) return;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);

    // pad + outline (reads as tappable)
    const pad = new THREE.Mesh(geo('box', p.w, 0.06, p.d), mat(PALETTE.grassBright));
    pad.position.y = 0.005; // top at 0.035 — under every road/driveway layer
    pad.receiveShadow = true;
    pad.userData.plotId = plotId;
    g.add(pad);
    this.pickables.push(pad);
    const frameMat = mat(PALETTE.plotLine, { opacity: 0.55 });
    for (const [w, d, x, z] of [
      [p.w, 0.1, 0, -p.d / 2],
      [p.w, 0.1, 0, p.d / 2],
      [0.1, p.d, -p.w / 2, 0],
      [0.1, p.d, p.w / 2, 0],
    ]) {
      const bar = new THREE.Mesh(geo('box', w, 0.05, d), frameMat);
      bar.position.set(x, 0.055, z);
      g.add(bar);
    }

    const b = this.state.buildings[plotId];
    if (b) {
      // driveway to anchor
      const anchor = plotAnchor(p);
      const ddx = anchor.x - p.x;
      const ddz = anchor.z - p.z;
      const dlen = Math.hypot(ddx, ddz);
      if (dlen > p.w / 2 - 0.5 && b.defId !== 'park') {
        const drive = new THREE.Mesh(geo('box', 1.0, 0.05, Math.max(0.5, dlen - p.d / 2 + 0.6)), mat(PALETTE.sidewalk));
        drive.position.set(ddx * 0.7, 0.042, ddz * 0.7); // above pad, below every road
        drive.rotation.y = Math.atan2(ddx, ddz);
        drive.receiveShadow = true;
        g.add(drive);
      }
      // soft contact shadow grounds the building
      if (b.defId !== 'park') {
        const ao = makeAoDisc(Math.max(p.w, p.d) * 0.6);
        ao.position.y = 0.045;
        g.add(ao);
      }

      const tier = b.construction && b.construction.targetTier === 1 ? 1 : b.tier;
      const model = buildModel(b.defId, tier);
      model.rotation.y = Math.atan2(ddx, ddz); // face the road
      model.userData.plotId = plotId;
      model.name = 'building';
      g.add(model);
      // Fit the building's footprint inside its plot so a bigger upgraded mesh
      // never spills onto the road — it grows in place within its own plot.
      const fit = fitScaleToPlot(model, p.w, p.d);
      model.userData.fit = fit;
      model.scale.set(fit, fit, fit);
      this.buildingGroups.set(plotId, g);
      model.traverse((o) => (o.userData.plotId = plotId));
      this.pickables.push(model);

      if (b.construction) {
        const size = Math.max(2.5, p.w - 1.5);
        const scaffold = buildScaffold(size, 2.4, size);
        scaffold.name = 'scaffold';
        g.add(scaffold);
        model.scale.y = fit * 0.05;
      }
      if (b.damaged) {
        // boarded-up look: dark planks + faded dust plane
        const plank = new THREE.Mesh(geo('box', 1.4, 0.9, 0.1), mat(PALETTE.trunk));
        plank.position.set(0.2, 0.6, p.d / 2 - 1.4);
        plank.rotation.z = 0.2;
        plank.name = 'plank';
        g.add(plank);
      }
    } else if (p.allowed.length) {
      // vacant: small "for development" sign
      const pole = new THREE.Mesh(geo('box', 0.07, 0.9, 0.07), mat(PALETTE.trunk));
      pole.position.set(-p.w / 2 + 0.7, 0.45, p.d / 2 - 0.7);
      g.add(pole);
      const sign = new THREE.Mesh(geo('box', 0.9, 0.55, 0.06), mat(PALETTE.comWall));
      sign.position.set(-p.w / 2 + 0.7, 1.05, p.d / 2 - 0.7);
      sign.rotation.y = 0.6;
      g.add(sign);
    }

    this.plotGroups.set(plotId, g);
    this.group.add(g);
    const model = g.getObjectByName('building');
    this.plotHeights.set(plotId, model ? new THREE.Box3().setFromObject(model).max.y + 1.4 : 3.2);
  }

  // ---------- bubbles ----------
  private bubbleMaterial(kind: string): THREE.SpriteMaterial {
    let m = this.bubbleTex.get(kind);
    if (!m) {
      const spec = BUBBLE_SPECS[kind];
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 112;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = spec.bg;
      ctx.beginPath();
      ctx.arc(48, 44, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath(); // tail
      ctx.moveTo(36, 76);
      ctx.lineTo(60, 76);
      ctx.lineTo(48, 100);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(48, 44, 38, 0, Math.PI * 2);
      ctx.stroke();
      drawBubbleGlyph(ctx, kind);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map: tex, depthTest: false });
      this.bubbleTex.set(kind, m);
    }
    return m;
  }

  private syncBubbles(): void {
    const statuses = this.sim.derived.statuses;
    // remove stale
    for (const [id, sprite] of this.bubbles) {
      const kind = statuses.get(id);
      if (!kind) {
        this.group.remove(sprite);
        this.bubbles.delete(id);
        this.bubbleKinds.delete(id);
      } else if (this.bubbleKinds.get(id) !== kind) {
        sprite.material = this.bubbleMaterial(kind);
        this.bubbleKinds.set(id, kind);
      }
    }
    // add new
    for (const [id, kind] of statuses) {
      if (this.bubbles.has(id)) continue;
      const sprite = new THREE.Sprite(this.bubbleMaterial(kind));
      const p = plotById(id);
      sprite.position.set(p.x, 4.6, p.z);
      sprite.scale.setScalar(2.1);
      sprite.renderOrder = 10;
      sprite.userData.plotId = id;
      this.group.add(sprite);
      this.pickables.push(sprite);
      this.bubbles.set(id, sprite);
      this.bubbleKinds.set(id, kind);
    }
  }

  // ---------- per-frame ----------
  update(dt: number): void {
    this.t += dt;
    this.syncBubbles();

    // construction animation: building rises inside scaffold, crane swings
    for (const [plotId, g] of this.plotGroups) {
      const b = this.state.buildings[plotId];
      if (!b) continue;
      const model = g.getObjectByName('building');
      const scaffold = g.getObjectByName('scaffold');
      const fit = (model?.userData.fit as number) ?? 1;
      if (b.construction && model) {
        const progress = 1 - b.construction.remaining / b.construction.total;
        model.scale.y = fit * clamp(0.05 + progress, 0.05, 1);
        const crane = scaffold?.getObjectByName('crane');
        if (crane) crane.rotation.y = Math.sin(this.t * 0.8) * 0.7;
      } else if (model && model.scale.y < fit - 0.001) {
        model.scale.y = fit;
      }
      // landmark ring + rotor + beacon idle animations
      const ring = model?.getObjectByName('ring');
      if (ring) ring.rotation.z = this.t * 0.5;
      const rotor = model?.getObjectByName('rotor');
      if (rotor) rotor.rotation.z = this.t * 2.4;
      const beacon = model?.getObjectByName('beacon');
      if (beacon) beacon.scale.setScalar(1 + Math.sin(this.t * 3) * 0.15);
      const jet = model?.getObjectByName('jet');
      if (jet) jet.scale.y = 1 + Math.sin(this.t * 4) * 0.2;
    }

    // bubble bob + urgency pulse
    for (const [id, sprite] of this.bubbles) {
      const kind = this.bubbleKinds.get(id)!;
      const urgent = BUBBLE_SPECS[kind]?.urgent;
      const h = this.plotHeights.get(id) ?? 3.6;
      sprite.position.y = h + Math.sin(this.t * 2.2 + sprite.position.x) * 0.12;
      const s = urgent ? 2.1 + Math.sin(this.t * 5) * 0.22 : 2.1;
      sprite.scale.setScalar(s);
    }

    // congestion tint on open roads
    for (const [edgeId, m] of this.roadMats) {
      const rt = this.sim.graph.edges.get(edgeId);
      if (!rt) continue;
      const tier = this.state.roadTiers[edgeId] ?? 1;
      const base = new THREE.Color(tier === 1 ? PALETTE.roadT1 : tier === 2 ? PALETTE.roadT2 : PALETTE.roadT3);
      const heat = clamp((rt.congestion - 0.7) / 0.8, 0, 1);
      m.color.copy(base).lerp(new THREE.Color(PALETTE.danger), heat * 0.45);
    }

    // selection pulse
    if (this.selection.visible) {
      const s = this.selection.scale.x;
      this.selection.rotation.z = this.t * 0.6;
      void s;
    }
  }

  /** find the owning plot/edge from a raycast hit */
  static ownerOf(obj: THREE.Object3D): { plotId?: string; edgeId?: string } {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData.plotId) return { plotId: cur.userData.plotId as string };
      if (cur.userData.edgeId) return { edgeId: cur.userData.edgeId as string };
      cur = cur.parent;
    }
    return {};
  }
}
