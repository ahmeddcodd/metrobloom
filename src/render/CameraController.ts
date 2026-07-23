/**
 * Isometric orthographic camera: one-finger/mouse drag pan, pinch/wheel zoom,
 * clamped to map bounds, with scripted cinematic moves for unlock events.
 * Also owns tap-vs-drag detection and raycast picking.
 */
import * as THREE from 'three';
import { clamp, damp, easeInOutQuad } from '../utils/math';

const ISO_DIR = new THREE.Vector3(1, 1.05, 1).normalize(); // camera offset direction

// Zoom = ortho half-height in world units. Capped so the player can't zoom out
// far enough to reveal the island edges / open ocean (kept "within the map").
const ZOOM_MIN = 8; // most zoomed IN
const ZOOM_MAX = 18; // most zoomed OUT — frames the whole city, no floating-island view
const ZOOM_DEFAULT = 15;
// Pan bounds keep the view centred over the built city (all four districts),
// never scrolling out into empty countryside or sea.
const PAN = { minX: -26, maxX: 14, minZ: -20, maxZ: 20 };

export class CameraController {
  readonly camera: THREE.OrthographicCamera;
  target = new THREE.Vector2(4, 2);
  zoom = ZOOM_DEFAULT; // ortho half-height in world units
  private desiredTarget = new THREE.Vector2(4, 2);
  private desiredZoom = ZOOM_DEFAULT;
  private aspect = 1;

  // input state
  private pointers = new Map<number, { x: number; y: number }>();
  private dragging = false;
  private moved = 0;
  private lastPinch = 0;
  private cinematic: { fromT: THREE.Vector2; toT: THREE.Vector2; fromZ: number; toZ: number; t: number; dur: number; resolve: () => void } | null = null;
  onTap: ((worldX: number, worldZ: number, screenX: number, screenY: number) => void) | null = null;
  reducedMotion = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
    this.attach();
  }

  get isCinematic(): boolean {
    return this.cinematic !== null;
  }

  resize(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.updateFrustum();
  }

  private updateFrustum(): void {
    const h = this.zoom;
    const w = h * this.aspect;
    this.camera.left = -w;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    if (this.cinematic) {
      const c = this.cinematic;
      c.t += dt;
      const k = easeInOutQuad(clamp(c.t / c.dur, 0, 1));
      this.desiredTarget.lerpVectors(c.fromT, c.toT, k);
      this.desiredZoom = c.fromZ + (c.toZ - c.fromZ) * k;
      if (c.t >= c.dur) {
        this.cinematic = null;
        c.resolve();
      }
    }
    // enforce bounds for every input source (pointer, keyboard, cinematic)
    this.desiredTarget.x = clamp(this.desiredTarget.x, PAN.minX, PAN.maxX);
    this.desiredTarget.y = clamp(this.desiredTarget.y, PAN.minZ, PAN.maxZ);
    this.desiredZoom = clamp(this.desiredZoom, ZOOM_MIN, ZOOM_MAX);

    const lambda = 8;
    this.target.x = damp(this.target.x, this.desiredTarget.x, lambda, dt);
    this.target.y = damp(this.target.y, this.desiredTarget.y, lambda, dt);
    this.zoom = damp(this.zoom, this.desiredZoom, lambda, dt);
    this.updateFrustum();

    const pos = new THREE.Vector3(this.target.x, 0, this.target.y).addScaledVector(ISO_DIR, 90);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target.x, 0, this.target.y);
  }

  /** Scripted move; instant under reduced motion. */
  flyTo(x: number, z: number, zoom: number, dur = 1.4): Promise<void> {
    if (this.reducedMotion) dur = 0.01;
    return new Promise((resolve) => {
      this.cinematic = {
        fromT: this.desiredTarget.clone(),
        toT: new THREE.Vector2(x, z),
        fromZ: this.desiredZoom,
        toZ: zoom,
        t: 0,
        dur,
        resolve,
      };
    });
  }

  screenToWorld(sx: number, sy: number): THREE.Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const out = new THREE.Vector3();
    ray.ray.intersectPlane(plane, out);
    return out;
  }

  raycaster(sx: number, sy: number): THREE.Raycaster {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }

  private attach(): void {
    const el = this.canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-released pointers */
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moved = 0;
      this.dragging = true;
      if (this.pointers.size === 2) this.lastPinch = this.pinchDist();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || !this.dragging) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.cinematic) return; // camera locked during cinematics
      if (this.pointers.size === 1) {
        // pan: screen px → world units (iso axes)
        const rect = el.getBoundingClientRect();
        const upp = (this.zoom * 2) / rect.height;
        // screen right = world (+x,-z)/√2 ; screen up = world (-x,-z)/√2 (foreshortened by tilt)
        const wx = (-dx / Math.SQRT2 - dy * 1.19) * upp;
        const wz = (dx / Math.SQRT2 - dy * 1.19) * upp;
        this.desiredTarget.x = clamp(this.desiredTarget.x + wx, PAN.minX, PAN.maxX);
        this.desiredTarget.y = clamp(this.desiredTarget.y + wz, PAN.minZ, PAN.maxZ);
      } else if (this.pointers.size === 2) {
        const d = this.pinchDist();
        if (this.lastPinch > 0) {
          this.desiredZoom = clamp(this.desiredZoom * (this.lastPinch / d), ZOOM_MIN, ZOOM_MAX);
        }
        this.lastPinch = d;
      }
    });
    const end = (e: PointerEvent) => {
      const wasTap = this.pointers.size === 1 && this.moved < 8;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.lastPinch = 0;
      if (this.pointers.size === 0) this.dragging = false;
      if (wasTap && !this.cinematic) {
        const w = this.screenToWorld(e.clientX, e.clientY);
        this.onTap?.(w.x, w.z, e.clientX, e.clientY);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.cinematic) return;
        this.desiredZoom = clamp(this.desiredZoom * (e.deltaY > 0 ? 1.1 : 0.9), ZOOM_MIN, ZOOM_MAX);
      },
      { passive: false },
    );
  }

  private pinchDist(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
}
