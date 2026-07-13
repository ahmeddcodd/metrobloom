/**
 * Pooled particle effects: chimney smoke, construction dust, collect bursts,
 * fire flames and finale fireworks. One InstancedMesh per particle class.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/theme';
import { bus } from '../utils/events';
import { plotById } from '../config/map';
import { makeRng } from '../utils/rng';
import type { GameStateData } from '../game/GameState';
import type { Simulation } from '../sim/Simulation';
import { geo, mat } from './ModelFactory';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private tmp = new THREE.Object3D();

  constructor(scene: THREE.Scene, count: number, color: number, size: number, emissive = false) {
    this.mesh = new THREE.InstancedMesh(
      geo('box', size, size, size),
      mat(color, emissive ? { emissive: color, emissiveIntensity: 1, opacity: 0.9 } : { opacity: 0.85 }),
      count,
    );
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      this.particles.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1, active: false });
    }
    scene.add(this.mesh);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size = 1): void {
    const p = this.particles.find((p) => !p.active);
    if (!p) return;
    Object.assign(p, { x, y, z, vx, vy, vz, life, maxLife: life, size, active: true });
  }

  burst(x: number, y: number, z: number, n: number, speed: number, life: number, rng: () => number): void {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const v = speed * (0.5 + rng() * 0.5);
      this.spawn(x, y, z, Math.cos(a) * v, speed * (0.6 + rng()), Math.sin(a) * v, life * (0.7 + rng() * 0.6), 0.6 + rng() * 0.8);
    }
  }

  update(dt: number, gravity = 0): void {
    let i = 0;
    for (const p of this.particles) {
      if (p.active) {
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          p.y = -100;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.vy += gravity * dt;
        }
      }
      this.tmp.position.set(p.x, p.y, p.z);
      const k = p.active ? (p.life / p.maxLife) * p.size : 0.0001;
      this.tmp.scale.setScalar(Math.max(0.0001, k));
      this.tmp.rotation.y = p.life * 3;
      this.tmp.updateMatrix();
      this.mesh.setMatrixAt(i++, this.tmp.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Effects {
  private smoke: ParticlePool;
  private dust: ParticlePool;
  private coins: ParticlePool;
  private flames: ParticlePool;
  private fireworks: ParticlePool;
  private confetti: ParticlePool;
  private rng = makeRng(777);
  private smokeT = 0;
  private fireworksT = 0;
  private fireworksLeft = 0;
  reducedMotion = false;

  constructor(
    scene: THREE.Scene,
    private state: GameStateData,
    private sim: Simulation,
  ) {
    this.smoke = new ParticlePool(scene, 40, PALETTE.smoke, 0.4);
    this.dust = new ParticlePool(scene, 50, PALETTE.sand, 0.35);
    this.coins = new ParticlePool(scene, 30, PALETTE.coin, 0.3, true);
    this.flames = new ParticlePool(scene, 40, 0xff7b39, 0.45, true);
    this.fireworks = new ParticlePool(scene, 120, PALETTE.comSign, 0.28, true);
    this.confetti = new ParticlePool(scene, 80, PALETTE.comTeal, 0.25, true);

    bus.on('collect', ({ plotId }) => {
      const p = plotById(plotId);
      this.coins.burst(p.x, 2.2, p.z, this.reducedMotion ? 3 : 8, 2.2, 0.8, this.rng);
    });
    bus.on('buildingChanged', (plotId) => {
      const b = this.state.buildings[plotId];
      if (b && !b.construction) {
        const p = plotById(plotId);
        this.dust.burst(p.x, 0.5, p.z, this.reducedMotion ? 4 : 14, 3.0, 0.9, this.rng);
      }
    });
    bus.on('levelCompleted', () => this.celebrate(6));
    bus.on('gameCompleted', () => this.celebrate(26));
    bus.on('districtUnlocked', () => this.celebrate(8));
  }

  celebrate(bursts: number): void {
    this.fireworksLeft = this.reducedMotion ? Math.min(2, bursts) : bursts;
    this.fireworksT = 0;
  }

  update(dt: number, time: number): void {
    // chimney smoke from active polluting buildings
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.35;
      for (const b of Object.values(this.state.buildings)) {
        const rt = this.sim.derived.runtime.get(b.id);
        if (!rt?.active) continue;
        if ((b.defId === 'industrial' && b.tier <= 2) || (b.defId === 'power' && b.tier === 2)) {
          if (this.rng() < 0.7) {
            const p = plotById(b.id);
            this.smoke.spawn(p.x + 1.0, 3.2, p.z - 0.6, (this.rng() - 0.5) * 0.3, 0.9 + this.rng() * 0.4, (this.rng() - 0.5) * 0.3, 2.2, 1.1);
          }
        }
        if (b.onFire) {
          const p = plotById(b.id);
          this.flames.burst(p.x + (this.rng() - 0.5) * 2, 1.2, p.z + (this.rng() - 0.5) * 2, 3, 1.2, 0.7, this.rng);
          this.smoke.spawn(p.x, 3.0, p.z, 0, 1.4, 0, 1.8, 1.6);
        }
        // construction dust
        if (b.construction && this.rng() < 0.4) {
          const p = plotById(b.id);
          this.dust.spawn(p.x + (this.rng() - 0.5) * 3, 0.4, p.z + (this.rng() - 0.5) * 3, (this.rng() - 0.5) * 0.8, 0.7, (this.rng() - 0.5) * 0.8, 1.1, 0.9);
        }
      }
    }

    // fireworks over downtown
    if (this.fireworksLeft > 0) {
      this.fireworksT -= dt;
      if (this.fireworksT <= 0) {
        this.fireworksT = 0.5;
        this.fireworksLeft--;
        const x = -20 + this.rng() * 24;
        const z = -18 + this.rng() * 30;
        this.fireworks.burst(x, 9 + this.rng() * 4, z, 14, 4, 1.1, this.rng);
        this.confetti.burst(x, 8 + this.rng() * 4, z, 10, 3, 1.4, this.rng);
      }
    }

    this.smoke.update(dt);
    this.dust.update(dt, -1.2);
    this.coins.update(dt, -3);
    this.flames.update(dt, 1.2);
    this.fireworks.update(dt, -2.4);
    this.confetti.update(dt, -1.6);
    void time;
  }
}
