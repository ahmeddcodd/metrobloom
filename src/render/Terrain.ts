/**
 * Static world: textured grass, coastline cliff, animated shader water with
 * shore foam, beach, ambient trees and drifting clouds.
 * All textures are procedural canvases — zero downloads.
 */
import * as THREE from 'three';
import { MAP_BOUNDS, PLOTS, SEA_X } from '../config/map';
import { PALETTE } from '../config/theme';
import { makeRng } from '../utils/rng';
import { geo, mat, tree } from './ModelFactory';

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export class Terrain {
  readonly group = new THREE.Group();
  private waterMat: THREE.ShaderMaterial;
  private clouds: THREE.Sprite[] = [];
  private ocean!: THREE.Mesh;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const { minX, maxX, minZ, maxZ } = MAP_BOUNDS;
    const cz = (minZ + maxZ) / 2;
    // Land extends well beyond the playable area (west edge = the coastline at
    // SEA_X) so its far edges are never visible at any allowed zoom/pan — only
    // the sea to the west reads as an edge, which is intentional.
    const gw = 150; // grass width (east extent)
    const d = 150; // grass depth (north/south extent)
    const cx = SEA_X + gw / 2; // keep the west edge exactly on the coastline

    // ---- grass: painterly two-tone noise
    const rngTex = makeRng(99);
    const grassTex = canvasTexture(
      256,
      (ctx, s) => {
        ctx.fillStyle = '#84c463';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 260; i++) {
          const r = 6 + rngTex() * 22;
          ctx.fillStyle = rngTex() > 0.5 ? 'rgba(165,221,126,0.2)' : 'rgba(100,158,72,0.22)';
          ctx.beginPath();
          ctx.ellipse(rngTex() * s, rngTex() * s, r, r * 0.7, rngTex() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 420; i++) {
          ctx.fillStyle = rngTex() > 0.5 ? 'rgba(190,235,150,0.25)' : 'rgba(90,140,70,0.2)';
          ctx.fillRect(rngTex() * s, rngTex() * s, 2, 2);
        }
      },
      Math.round(gw / 9),
    );
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(gw, d),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, 0, cz);
    ground.receiveShadow = true;
    this.group.add(ground);
    // cliff rim under the island edge
    const rim = new THREE.Mesh(geo('box', gw, 1.2, d), mat(0x8a9a5f));
    rim.position.set(cx, -0.61, cz);
    this.group.add(rim);

    // ---- beach
    const sandTex = canvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = hex(PALETTE.sand);
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 300; i++) {
          ctx.fillStyle = rngTex() > 0.5 ? 'rgba(255,244,214,0.5)' : 'rgba(196,168,116,0.4)';
          ctx.fillRect(rngTex() * s, rngTex() * s, 1.6, 1.6);
        }
      },
      6,
    );
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, d),
      new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(SEA_X + 0.6, 0.02, cz);
    beach.receiveShadow = true;
    this.group.add(beach);

    // ---- water: animated stylized shader (waves, depth gradient, shore foam)
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: new THREE.Color(PALETTE.water) },
        uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
        uFoam: { value: new THREE.Color(0xf2fbff) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vUv = uv;
          vec3 p = position;
          float w1 = sin(p.x * 0.55 + uTime * 1.1) * 0.5;
          float w2 = sin(p.y * 0.4 - uTime * 0.8 + p.x * 0.2) * 0.5;
          vWave = w1 + w2;
          p.z += vWave * 0.14; // plane is XY before rotation; z = world up
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          // vUv.x = 1.0 at the shore (east edge of the water plane)
          float depth = smoothstep(1.0, 0.0, vUv.x);
          vec3 col = mix(uShallow, uDeep, depth * 0.85);
          // glints from wave crests
          col += vec3(0.05, 0.08, 0.09) * smoothstep(0.55, 1.0, vWave);
          // animated shore foam
          float shore = smoothstep(0.965, 1.0, vUv.x + sin(vUv.y * 60.0 + uTime * 1.4) * 0.004);
          float lace  = smoothstep(0.90, 0.945, vUv.x + sin(vUv.y * 34.0 - uTime * 1.1) * 0.006)
                      - smoothstep(0.945, 0.96, vUv.x);
          col = mix(col, uFoam, clamp(shore + max(lace, 0.0) * 0.5, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(30, d + 30, 40, 80), this.waterMat);
    sea.rotation.x = -Math.PI / 2;
    sea.rotation.z = Math.PI; // uv.x=1 faces the shore
    sea.position.set(SEA_X - 14.4, -0.16, cz);
    this.group.add(sea);
    // Deep ocean fills the western sea. It follows the camera each frame (see
    // update) so its edge is never visible no matter how the player pans/zooms.
    this.ocean = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(PALETTE.waterDeep));
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.set(cx, -0.42, cz);
    this.group.add(this.ocean);

    // ---- clouds: soft billboard sprites drifting over the bay
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 128;
    cloudCanvas.height = 64;
    const cctx = cloudCanvas.getContext('2d')!;
    for (const [bx, by, br] of [[38, 40, 22], [64, 32, 26], [92, 40, 20], [52, 44, 18], [80, 46, 16]]) {
      const g2 = cctx.createRadialGradient(bx, by, 2, bx, by, br);
      g2.addColorStop(0, 'rgba(255,255,255,0.85)');
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      cctx.fillStyle = g2;
      cctx.fillRect(0, 0, 128, 64);
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);
    const rng = makeRng(1337);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false }));
      sp.scale.set(14 + rng() * 10, 6 + rng() * 4, 1);
      sp.position.set(minX + rng() * (maxX - minX), 22 + rng() * 6, minZ + rng() * (maxZ - minZ));
      this.clouds.push(sp);
      this.group.add(sp);
    }


    // ---- ambient trees (seeded, clear of plots and roads)
    let placed = 0;
    let guard = 0;
    while (placed < 46 && guard++ < 400) {
      const x = minX + 4 + rng() * (maxX - minX - 6);
      const z = minZ + 3 + rng() * (maxZ - minZ - 6);
      if (x < SEA_X + 4) continue;
      if (Math.abs(z - 0) < 3.2 || Math.abs(z - 14) < 3.2 || Math.abs(z + 14) < 3.2) continue;
      if (Math.abs(x - -18) < 3.2 || Math.abs(x - -6) < 3.2 || Math.abs(x - 6) < 3.2 || Math.abs(x - 18) < 3.2) continue;
      if (PLOTS.some((p) => Math.abs(x - p.x) < p.w / 2 + 1.6 && Math.abs(z - p.z) < p.d / 2 + 1.6)) continue;
      this.group.add(tree(x, z, 0.8 + rng() * 0.7));
      placed++;
    }

    scene.add(this.group);
  }

  update(dt: number, camX = 0, camZ = 0): void {
    this.t += dt;
    this.waterMat.uniforms.uTime.value = this.t;
    // keep the deep ocean under the view so its edge is never revealed
    this.ocean.position.x = camX;
    this.ocean.position.z = camZ;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += dt * (0.25 + i * 0.06);
      if (c.position.x > MAP_BOUNDS.maxX + 24) c.position.x = MAP_BOUNDS.minX - 20;
    }
  }
}
