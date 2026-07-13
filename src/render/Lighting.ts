/** Warm key sun + hemisphere fill. One shadow-casting light for the whole map. */
import * as THREE from 'three';
import { PALETTE } from '../config/theme';
import type { QualityLevel } from './Renderer';

export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;

  constructor(scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(0xeaf6ff, new THREE.Color(PALETTE.grass).multiplyScalar(0.6), 0.7);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.3);
    this.sun.position.set(-30, 48, -22);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -42;
    cam.right = 42;
    cam.top = 42;
    cam.bottom = -42;
    cam.near = 5;
    cam.far = 130;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0015;
    scene.add(this.sun);
    scene.add(this.sun.target);

    const amb = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(amb);
  }

  applyQuality(q: QualityLevel): void {
    this.sun.castShadow = q !== 'low';
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }
}
