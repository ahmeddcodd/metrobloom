/**
 * Orchestrator: wires state, simulation, rendering, agents, UI, input,
 * SDK pause/resume, saves, tutorial focus and campaign visual events.
 */
import * as THREE from 'three';
import { DISTRICTS, plotById } from '../config/map';
import { LEVELS, levelDef } from '../config/levels';
import { createInitialState, deserialize, serialize, type GameStateData } from './GameState';
import { Actions } from './Actions';
import { Simulation } from '../sim/Simulation';
import { evaluateLevel } from '../sim/objectives';
import { Renderer } from '../render/Renderer';
import { CameraController } from '../render/CameraController';
import { Lighting } from '../render/Lighting';
import { Terrain } from '../render/Terrain';
import { CityRenderer } from '../render/CityRenderer';
import { Agents } from '../render/Agents';
import { Effects } from '../render/Effects';
import { UIManager } from '../ui/UIManager';
import { audio } from '../platform/audioSystem';
import { saveSystem, type SaveBlob } from '../platform/saveSystem';
import { sdk } from '../platform/playablesSdk';
import { bus } from '../utils/events';
import { edgeById, nodeById } from '../config/map';

export class Game {
  state: GameStateData;
  sim: Simulation;
  actions: Actions;
  renderer: Renderer;
  camera: CameraController;
  lighting: Lighting;
  terrain: Terrain;
  city: CityRenderer;
  agents: Agents;
  effects: Effects;
  ui: UIManager;
  paused = false;
  simSpeed = 1;
  private accumulator = 0;
  private lastFrame = performance.now();
  private saveTick = 0;
  private raycastTargets: THREE.Object3D[] = [];

  constructor(saveBlob: SaveBlob | null, canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.state = deserialize(saveBlob);
    this.sim = new Simulation(this.state);
    this.actions = new Actions(this.state, this.sim);
    this.renderer = new Renderer(canvas);
    this.camera = new CameraController(canvas);
    this.lighting = new Lighting(this.renderer.scene);
    this.terrain = new Terrain(this.renderer.scene);
    this.city = new CityRenderer(this.renderer.scene, this.state, this.sim);
    this.agents = new Agents(this.renderer.scene, this.state, this.sim);
    this.effects = new Effects(this.renderer.scene, this.state, this.sim);

    this.ui = new UIManager(uiRoot, this.state, this.sim, this.actions, this.camera.camera, {
      onQualityChange: (q) => this.renderer.setQualityMode(q),
      onReducedMotion: (on) => {
        this.camera.reducedMotion = on;
        this.effects.reducedMotion = on;
      },
      onReset: () => this.resetGame(),
      flyTo: (x, z, zoom) => this.camera.flyTo(x, z, zoom),
      saveNow: () => this.requestSave(),
    });

    this.renderer.onQualityChange = (q) => {
      this.lighting.applyQuality(q);
      this.agents.applyQuality(q);
    };
    this.renderer.setQualityMode(this.state.settings.quality);
    this.camera.reducedMotion = this.state.settings.reducedMotion;
    this.effects.reducedMotion = this.state.settings.reducedMotion;
    audio.setMusic(this.state.settings.music);
    audio.setSfx(this.state.settings.sfx);

    this.wireInput(canvas);
    this.wireEvents();
    this.wireSdk();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // debug tools behind ?debug=1, never in normal presentation
    if (new URLSearchParams(location.search).get('debug') === '1') {
      this.ui.buildDebugPanel((act) => this.debugAction(act));
      (window as unknown as { __mb: Game }).__mb = this; // manual driving for QA harnesses
    }

    // warm the sim so derived values exist before first paint
    this.sim.tick(Simulation.TICK);
  }

  // ---------------- input ----------------
  private wireInput(_canvas: HTMLCanvasElement): void {
    const unlockAudio = () => {
      audio.unlock();
      window.removeEventListener('pointerdown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);

    this.camera.onTap = (_wx, _wz, sx, sy) => {
      const ray = this.camera.raycaster(sx, sy);
      this.raycastTargets.length = 0;
      for (const o of this.city.pickables) this.raycastTargets.push(o);
      const hits = ray.intersectObjects(this.raycastTargets, true);
      if (hits.length) {
        const owner = CityRenderer.ownerOf(hits[0].object);
        if (owner.plotId) {
          audio.play('tap');
          const b = this.state.buildings[owner.plotId];
          // tapping a collectable bubble collects instantly (tycoon feel)
          if (b && (b.coinsReady >= 1 || b.materialsReady >= 1) && !b.damaged) {
            this.actions.collect(owner.plotId);
          }
          this.ui.select({ plotId: owner.plotId });
          return;
        }
        if (owner.edgeId) {
          audio.play('tap');
          this.ui.select({ edgeId: owner.edgeId });
          return;
        }
      }
      this.ui.select(null);
    };

    // keyboard pan/zoom for desktop accessibility
    window.addEventListener('keydown', (e) => {
      const step = 2.5;
      if (e.key === 'Escape') this.ui.select(null);
      const t = (this.camera as unknown as { desiredTarget: THREE.Vector2 }).desiredTarget;
      if (e.key === 'ArrowLeft' || e.key === 'a') t.x -= step;
      if (e.key === 'ArrowRight' || e.key === 'd') t.x += step;
      if (e.key === 'ArrowUp' || e.key === 'w') t.y -= step;
      if (e.key === 'ArrowDown' || e.key === 's') t.y += step;
    });
  }

  // ---------------- events ----------------
  private wireEvents(): void {
    bus.on('districtUnlocked', async (districtId) => {
      const d = DISTRICTS.find((x) => x.id === districtId);
      if (!d) return;
      await this.camera.flyTo(d.focus.x, d.focus.z, 13, 1.6);
      this.effects.celebrate(6);
      await new Promise((r) => setTimeout(r, this.state.settings.reducedMotion ? 100 : 900));
      this.requestSave();
    });
    bus.on('levelCompleted', () => {
      audio.play('celebrate');
      this.requestSave();
    });
    bus.on('levelStarted', (lv) => {
      // gentle camera nudge toward the level's first spatial objective
      const focus = this.tutorialFocusFor(lv);
      if (focus && !this.camera.isCinematic) void this.camera.flyTo(focus.x, focus.z, 15, 1.2);
      this.requestSave();
    });
    bus.on('gameCompleted', async () => {
      audio.play('celebrate');
      const lm = plotById('plandmark');
      await this.camera.flyTo(lm.x + 4, lm.z + 4, 12, 2.0);
      this.effects.celebrate(26);
      this.requestSave();
    });
    bus.on('buildingChanged', () => this.requestSave());
    bus.on('roadChanged', () => this.requestSave());
    bus.on('deliveryArrived', () => audio.play('bus'));
    bus.on('fireResolved', (plotId) => {
      const b = this.state.buildings[plotId];
      bus.emit('toast', { text: b?.damaged ? '🔥 The fire burned out — the building needs repairs.' : '🚒 Fire extinguished by the fire crew!' });
    });
  }

  private wireSdk(): void {
    sdk.onPause(() => this.setPaused(true));
    sdk.onResume(() => this.setPaused(false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPaused(true);
      else if (!sdk.available) this.setPaused(false);
    });
    audio.init();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) {
      audio.pause();
      void saveSystem.saveNow(serialize(this.state));
    } else {
      audio.resume();
      this.lastFrame = performance.now();
    }
  }

  private requestSave(): void {
    saveSystem.requestSave(() => serialize(this.state));
  }

  private resetGame(): void {
    saveSystem.reset();
    const fresh = createInitialState();
    // in-place so every system keeps its reference
    this.state.level = fresh.level;
    this.state.coins = fresh.coins;
    this.state.materials = fresh.materials;
    this.state.permits = fresh.permits;
    this.state.buildings = fresh.buildings;
    this.state.roadTiers = fresh.roadTiers;
    this.state.unlockedDistricts = fresh.unlockedDistricts;
    this.state.counters = fresh.counters;
    this.state.happiness = fresh.happiness;
    this.state.playSeconds = 0;
    this.state.tutorialSeen = [];
    this.state.completed = false;
    this.sim.graph.invalidateCache();
    this.sim.derived.deliveries.length = 0;
    document.getElementById('end-screen')?.remove();
    document.querySelector('.modal-backdrop')?.remove();
    this.ui.select(null);
    bus.emit('districtUnlocked', 'oldtown'); // forces full visual rebuild
    bus.emit('levelStarted', 1);
    bus.emit('stateChanged', undefined);
    void this.camera.flyTo(5, 2, 16, 1.2);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.camera.resize(w, h);
    // NOTE: game state is intentionally untouched on resize
  }

  // ---------------- tutorial focus ----------------
  private tutorialFocusFor(level: number): { x: number; z: number; y?: number; text: string } | null {
    const def = levelDef(level);
    if (!def) return null;
    const progress = evaluateLevel(this.state, this.sim.derived);
    const open = progress.find((p) => !p.done);
    if (!open) return null;
    const o = open.def;
    if (o.kind === 'repair') {
      const p = plotById(o.plot);
      return { x: p.x, z: p.z, y: 0.7, text: o.hint };
    }
    if (o.kind === 'roadTier' && o.edge) {
      const e = edgeById(o.edge);
      const a = nodeById(e.a);
      const b2 = nodeById(e.b);
      return { x: (a.x + b2.x) / 2, z: (a.z + b2.z) / 2, y: 0.25, text: o.hint };
    }
    if (o.kind === 'build') {
      // point at the first eligible vacant plot for this category
      const candidates = ['pshop1', 'pwater', 'ppark1', 'pfire', 'pstop1', 'pstop2', 'poffice', 'plandmark'];
      for (const pid of candidates) {
        const p = plotById(pid);
        if (!this.state.buildings[pid] && p.allowed.includes(o.category) && this.state.unlockedDistricts.includes(p.district)) {
          return { x: p.x, z: p.z, y: 0.5, text: o.hint };
        }
      }
    }
    if (o.kind === 'buildTier') {
      // point at an existing building of this category that can be upgraded,
      // preferring one whose road already meets the tier requirement
      const upgradable = Object.values(this.state.buildings)
        .filter((b) => b.defId === o.category && b.tier < o.tier && !b.construction && !b.damaged)
        .sort((a, b) => (this.actions.upgradeBlockers(a.id).length - this.actions.upgradeBlockers(b.id).length));
      if (upgradable.length) {
        const p = plotById(upgradable[0].id);
        return { x: p.x, z: p.z, y: 0.8, text: o.hint };
      }
    }
    if (o.kind === 'counter' && o.key === 'taxCollected') {
      for (const b of Object.values(this.state.buildings)) {
        if (b.coinsReady >= 1) {
          const p = plotById(b.id);
          return { x: p.x, z: p.z, y: 0.7, text: o.hint };
        }
      }
    }
    if (o.kind === 'counter' && o.key === 'materialsCollected') {
      // point at whichever industry has materials ready to collect
      const withMats = Object.values(this.state.buildings).find((b) => b.defId === 'industrial' && b.materialsReady >= 1);
      const target = withMats ?? Object.values(this.state.buildings).find((b) => b.defId === 'industrial');
      if (target) {
        const p = plotById(target.id);
        return { x: p.x, z: p.z, y: 0.7, text: o.hint };
      }
    }
    return null;
  }

  // ---------------- debug ----------------
  private debugAction(act: string): void {
    switch (act) {
      case 'coins':
        this.state.coins += 500;
        break;
      case 'materials':
        this.state.materials += 10;
        break;
      case 'skip': {
        if (this.state.level > LEVELS.length) break;
        const def = levelDef(this.state.level)!;
        this.state.coins += def.reward.coins;
        for (const p of def.reward.permits ?? []) if (!this.state.permits.includes(p)) this.state.permits.push(p);
        if (def.reward.district && !this.state.unlockedDistricts.includes(def.reward.district)) {
          this.state.unlockedDistricts.push(def.reward.district);
          bus.emit('districtUnlocked', def.reward.district);
        }
        this.state.level++;
        bus.emit('levelStarted', this.state.level);
        break;
      }
      case 'fast':
        this.simSpeed = this.simSpeed === 1 ? 4 : 1;
        bus.emit('toast', { text: `Sim speed ×${this.simSpeed}` });
        break;
      case 'finale': {
        const lm = this.state.buildings['plandmark'];
        if (!lm) {
          this.state.buildings['plandmark'] = { ...createInitialState().buildings['ph1'], id: 'plandmark', defId: 'landmark', tier: 3, occupancy: 0, damaged: false };
          if (!this.state.unlockedDistricts.includes('downtown')) {
            this.state.unlockedDistricts.push('downtown');
            this.sim.graph.invalidateCache();
          }
          bus.emit('districtUnlocked', 'downtown');
          bus.emit('buildingChanged', 'plandmark');
        }
        this.state.completed = true;
        bus.emit('gameCompleted', undefined);
        break;
      }
      case 'fire': {
        const ind = Object.values(this.state.buildings).find((b) => b.defId === 'industrial');
        if (ind) {
          ind.fireRisk = 99;
          ind.warnedAt = this.sim.time - 30;
        }
        break;
      }
      case 'metrics': {
        const info = this.renderer.renderer.info;
        bus.emit('toast', { text: `draws ${info.render.calls} · tris ${Math.round(info.render.triangles / 1000)}k · q:${this.renderer.quality}` });
        break;
      }
    }
    bus.emit('stateChanged', undefined);
  }

  // ---------------- main loop ----------------
  start(): void {
    bus.emit('levelStarted', this.state.level);
    const frame = () => {
      requestAnimationFrame(frame);
      const now = performance.now();
      let dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      if (this.paused) return;
      dt = Math.min(dt, 0.1); // clamp long frames (tab switch etc.)

      // fixed-step simulation
      this.accumulator += dt * this.simSpeed;
      let guard = 0;
      while (this.accumulator >= Simulation.TICK && guard++ < 10) {
        this.sim.tick(Simulation.TICK);
        this.accumulator -= Simulation.TICK;
      }

      // periodic safety save
      this.saveTick += dt;
      if (this.saveTick > 20) {
        this.saveTick = 0;
        this.requestSave();
      }

      // tutorial pointer (first campaign levels only, hides once acted on)
      if (this.state.level <= 4) {
        this.ui.setTutorial(this.tutorialFocusFor(this.state.level));
      } else {
        this.ui.setTutorial(null);
      }

      this.camera.update(dt);
      this.terrain.update(dt);
      this.city.update(dt);
      this.agents.update(dt, this.sim.time);
      this.effects.update(dt, this.sim.time);
      this.ui.update(dt);
      this.renderer.render(this.camera.camera);
      this.renderer.recordFrame(dt * 1000);
    };
    requestAnimationFrame(frame);
  }
}
