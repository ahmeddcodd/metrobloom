/**
 * WebGLRenderer setup with quality scaling (auto-detect + manual override),
 * sRGB output, ACES tone mapping, and context-loss handling.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PALETTE } from '../config/theme';

export type QualityLevel = 'low' | 'medium' | 'high';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  quality: QualityLevel = 'medium';
  private frameTimes: number[] = [];
  private autoQuality = true;
  onQualityChange: ((q: QualityLevel) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    // gradient sky (screen-space) + soft haze
    const sky = document.createElement('canvas');
    sky.width = 4;
    sky.height = 256;
    const ctx = sky.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#7dc4ef');
    grad.addColorStop(0.55, '#b8e0f4');
    grad.addColorStop(0.78, '#dff0e8');
    grad.addColorStop(1, '#cde9c2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog(0xcfe8f5, 100, 210);

    // image-based lighting: subtle reflections on glass/metal, richer shading
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.15; // subtle sheen only — sun stays the key light
    pmrem.dispose();
    void PALETTE;

    this.applyQuality('medium');

    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
  }

  setQualityMode(mode: 'auto' | QualityLevel): void {
    this.autoQuality = mode === 'auto';
    if (mode !== 'auto') this.applyQuality(mode);
  }

  applyQuality(q: QualityLevel): void {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const cap = q === 'low' ? 1 : q === 'medium' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.onQualityChange?.(q);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  /** Adaptive quality: sustained slow frames step quality down (never up-thrash). */
  recordFrame(ms: number): void {
    if (!this.autoQuality) return;
    this.frameTimes.push(ms);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 40 && this.quality !== 'low') {
      this.applyQuality(this.quality === 'high' ? 'medium' : 'low');
    } else if (avg < 18 && this.quality === 'medium') {
      this.applyQuality('high');
    }
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }
}
