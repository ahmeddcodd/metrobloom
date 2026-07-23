/**
 * All models are procedural from primitives through shared caches — zero
 * asset downloads. Each building category has 3 visually distinct tiers
 * (modular sections, never scaled clones). Swap for GLB later without
 * touching simulation code.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../config/theme';

// ---------- shared caches ----------
const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

export function geo(kind: 'box' | 'rbox' | 'cyl' | 'cone' | 'prism' | 'sphere', ...dims: number[]): THREE.BufferGeometry {
  const key = `${kind}:${dims.join(',')}`;
  let g = geoCache.get(key);
  if (!g) {
    switch (kind) {
      case 'box':
        g = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
        break;
      case 'rbox': // soft-bevel box: w, h, d, radius
        g = new RoundedBoxGeometry(dims[0], dims[1], dims[2], 2, dims[3]);
        break;
      case 'cyl':
        g = new THREE.CylinderGeometry(dims[0], dims[1] ?? dims[0], dims[2], dims[3] ?? 10);
        break;
      case 'cone':
        g = new THREE.ConeGeometry(dims[0], dims[1], dims[2] ?? 8);
        break;
      case 'prism': // gabled-roof triangular prism: radius, length
        g = new THREE.CylinderGeometry(dims[0], dims[0], dims[1], 3);
        break;
      case 'sphere':
        g = new THREE.SphereGeometry(dims[0], 10, 8);
        break;
    }
    geoCache.set(key, g);
  }
  return g;
}

export function mat(color: number, opts?: { emissive?: number; emissiveIntensity?: number; metal?: number; rough?: number; transparent?: boolean; opacity?: number }): THREE.MeshStandardMaterial {
  const key = `${color}:${opts?.emissive ?? 0}:${opts?.emissiveIntensity ?? 0}:${opts?.metal ?? 0}:${opts?.rough ?? 0.85}:${opts?.opacity ?? 1}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts?.rough ?? 0.85,
      metalness: opts?.metal ?? 0.05,
      emissive: opts?.emissive ?? 0x000000,
      emissiveIntensity: opts?.emissiveIntensity ?? 0.6,
      transparent: opts?.transparent ?? (opts?.opacity !== undefined && opts.opacity < 1),
      opacity: opts?.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** Chunky rounded box for anything big enough; sharp box for thin slabs. */
const box = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, opts?: Parameters<typeof mat>[1]) => {
  const minDim = Math.min(w, h, d);
  if (minDim >= 0.45) {
    const r = Math.round(Math.min(0.14, minDim * 0.16) * 100) / 100;
    return mesh(geo('rbox', w, h, d, r), mat(color, opts), x, y + h / 2, z);
  }
  return mesh(geo('box', w, h, d), mat(color, opts), x, y + h / 2, z);
};

const cyl = (r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 10) =>
  mesh(geo('cyl', r, r, h, seg), mat(color), x, y + h / 2, z);

/** gabled roof lying along X */
function gable(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = mesh(geo('prism', 1, 1), mat(color), x, y, z);
  m.rotation.z = Math.PI / 2;
  m.rotation.y = Math.PI / 2;
  m.scale.set(d / 1.72, w / 2, h); // radius→depth mapping for 3-sided cylinder
  m.position.y = y + h * 0.32;
  return m;
}

/**
 * Strip of glowing windows on a wall face. The window box is deep enough (0.16)
 * that it STRADDLES the wall surface — its back face sits inside the wall and its
 * front protrudes — so no face is ever coplanar with the wall (which is what
 * causes z-fighting / flicker). `z` is the wall's outward face position.
 */
function windows(parent: THREE.Group, w: number, rows: number, cols: number, y0: number, z: number, rowGap = 0.62, lit = true): void {
  const g = geo('box', 0.34, 0.4, 0.16);
  const m = lit ? mat(PALETTE.glassEmissive, { emissive: PALETTE.glassEmissive, emissiveIntensity: 0.75 }) : mat(PALETTE.glass);
  const count = rows * cols;
  const inst = new THREE.InstancedMesh(g, m, count);
  inst.castShadow = false;
  const tmp = new THREE.Object3D();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tmp.position.set(-w / 2 + (w / (cols + 1)) * (c + 1), y0 + r * rowGap, z);
      tmp.updateMatrix();
      inst.setMatrixAt(i++, tmp.matrix);
    }
  }
  parent.add(inst);
}

function tree(x: number, z: number, s = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'decor'; // excluded from building footprint fitting (may overhang)
  g.add(cyl(0.12 * s, 0.5 * s, PALETTE.trunk, 0, 0, 0, 6));
  const crown = mesh(geo('sphere', 0.55), mat(Math.random() > 0.5 ? PALETTE.treeGreen : PALETTE.treeDark), 0, 0.85 * s, 0);
  crown.scale.setScalar(s);
  g.add(crown);
  g.position.set(x, 0, z);
  return g;
}
export { tree };

// ---------- building builders ----------

function residential(tier: number): THREE.Group {
  const g = new THREE.Group();
  if (tier === 1) {
    g.add(box(2.6, 1.5, 2.2, PALETTE.resWallA));
    g.add(gable(2.8, 1.0, 2.4, PALETTE.resRoofA, 0, 1.5));
    // road-facing (+z) wall front face is at 2.2/2 = 1.1. Centered door,
    // grounded, with a glowing window on each side — all straddle the wall.
    g.add(box(0.62, 0.95, 0.16, PALETTE.trunk, 0, 0, 1.1));
    for (const wx of [-0.82, 0.82]) {
      g.add(box(0.5, 0.44, 0.16, PALETTE.glassEmissive, wx, 0.62, 1.1, { emissive: PALETTE.glassEmissive, emissiveIntensity: 0.7 }));
    }
    g.add(tree(-1.6, 0.8, 0.8));
  } else if (tier === 2) {
    g.add(box(3.4, 2.8, 2.4, PALETTE.resWallB));
    g.add(box(3.6, 0.25, 2.6, PALETTE.resRoofB, 0, 2.8));
    g.add(box(1.4, 0.7, 1.4, PALETTE.resWallB, 0.6, 3.05, 0));
    g.add(box(0.55, 1.0, 0.08, PALETTE.trunk, -0.9, 0, 1.22));
    windows(g, 3.0, 3, 3, 0.65, 1.23, 0.8);
    g.add(tree(1.9, 1.3, 0.7));
  } else {
    g.add(box(3.2, 5.2, 2.8, PALETTE.resWallC));
    g.add(box(3.4, 0.3, 3.0, PALETTE.resRoofC, 0, 5.2));
    g.add(box(0.9, 0.5, 0.9, PALETTE.indMetal, -0.8, 5.5, 0.4));
    g.add(box(1.2, 0.4, 0.06, PALETTE.comSign, 0, 0.9, 1.42));
    windows(g, 2.8, 6, 3, 0.7, 1.43, 0.78);
    windows(g, 2.4, 6, 2, 0.7, -1.43, 0.78);
    g.add(box(3.6, 0.12, 3.2, PALETTE.sidewalk, 0, 0, 0));
  }
  return g;
}

function industrial(tier: number): THREE.Group {
  const g = new THREE.Group();
  if (tier === 1) {
    g.add(box(3.0, 1.8, 2.6, PALETTE.indWall));
    g.add(gable(3.2, 0.8, 2.8, PALETTE.indMetal, 0, 1.8));
    const chimney = cyl(0.22, 1.6, PALETTE.indMetal, 1.0, 1.4, -0.6, 8);
    chimney.name = 'chimney';
    g.add(chimney);
    g.add(box(1.2, 1.0, 0.1, PALETTE.indSafety, -0.6, 0, 1.32));
    g.add(box(0.9, 0.7, 0.9, PALETTE.truckBox, 2.0, 0, 0.9)); // crates
  } else if (tier === 2) {
    g.add(box(4.2, 2.4, 3.2, PALETTE.indWall));
    g.add(box(4.4, 0.25, 3.4, PALETTE.indMetal, 0, 2.4));
    for (const dx of [-1.2, 0.2]) {
      const c = cyl(0.28, 2.2, PALETTE.indMetal, dx, 2.0, -0.8, 8);
      c.name = 'chimney';
      g.add(c);
    }
    g.add(cyl(0.7, 1.6, PALETTE.powerCyan, 2.4, 0, -0.9, 12));
    g.add(box(1.6, 1.2, 0.12, PALETTE.indSafety, 0.8, 0, 1.7));
    windows(g, 3.4, 1, 4, 1.5, 1.62);
  } else {
    g.add(box(4.6, 2.8, 3.4, PALETTE.officeWall));
    g.add(box(4.8, 0.25, 3.6, PALETTE.landmarkGreen, 0, 2.8));
    for (let i = 0; i < 3; i++) g.add(box(1.1, 0.08, 0.9, PALETTE.glass, -1.4 + i * 1.4, 2.95, 0, { metal: 0.4, rough: 0.3 }));
    const c = cyl(0.2, 1.2, PALETTE.sidewalk, 1.8, 2.8, -1.0, 8);
    c.name = 'chimney';
    g.add(c);
    windows(g, 4.0, 2, 5, 0.7, 1.72, 0.9);
    g.add(box(1.4, 1.1, 0.16, PALETTE.comTeal, -1.2, 0, 1.7)); // entrance (straddles wall)
  }
  return g;
}

function commercial(tier: number): THREE.Group {
  const g = new THREE.Group();
  if (tier === 1) {
    g.add(box(2.8, 1.7, 2.4, PALETTE.comWall));
    g.add(box(3.0, 0.2, 2.6, PALETTE.comAccent, 0, 1.7));
    g.add(box(2.9, 0.35, 0.7, PALETTE.comAccent, 0, 1.15, 1.35)); // awning
    g.add(box(2.0, 0.45, 0.08, PALETTE.comSign, 0, 1.75, 1.25, { emissive: PALETTE.comSign, emissiveIntensity: 0.5 }));
    windows(g, 2.2, 1, 2, 0.4, 1.22);
  } else if (tier === 2) {
    g.add(box(3.8, 2.2, 2.8, PALETTE.comWall));
    g.add(gable(4.0, 0.8, 3.0, PALETTE.comTeal, 0, 2.2));
    g.add(box(3.9, 0.4, 0.9, PALETTE.comTeal, 0, 1.5, 1.65));
    g.add(box(2.6, 0.55, 0.1, PALETTE.comSign, 0, 2.35, 1.4, { emissive: PALETTE.comSign, emissiveIntensity: 0.6 }));
    windows(g, 3.2, 1, 3, 0.45, 1.42);
    g.add(box(0.8, 0.7, 0.8, PALETTE.material, 2.3, 0, 1.0)); // goods pallet
  } else {
    g.add(box(4.6, 3.2, 3.2, PALETTE.officeWall));
    g.add(box(4.8, 0.3, 3.4, PALETTE.comAccent, 0, 3.2));
    g.add(box(1.2, 4.2, 1.2, PALETTE.comAccent, -2.2, 0, -0.8));
    g.add(box(1.0, 0.8, 0.14, PALETTE.comSign, -2.2, 3.5, -0.1, { emissive: PALETTE.comSign, emissiveIntensity: 0.8 }));
    windows(g, 4.0, 3, 4, 0.6, 1.62, 0.9);
    g.add(box(4.4, 0.5, 1.0, PALETTE.glass, 0, 0.3, 1.75, { rough: 0.3 }));
  }
  return g;
}

function power(tier: number): THREE.Group {
  const g = new THREE.Group();
  if (tier === 1) {
    g.add(box(2.6, 1.4, 2.2, PALETTE.indMetal));
    const c = cyl(0.5, 1.8, PALETTE.powerYellow, 0.7, 0, -0.4, 12);
    c.name = 'core';
    g.add(c);
    g.add(cyl(0.14, 2.2, PALETTE.indMetal, -0.9, 0, -0.7, 6));
    g.add(box(1.0, 0.8, 0.1, PALETTE.indSafety, -0.5, 0, 1.12));
  } else if (tier === 2) {
    g.add(box(3.8, 2.2, 2.8, PALETTE.indMetal));
    const c = cyl(0.5, 3.2, PALETTE.sidewalk, 1.2, 2.0, -0.6, 10);
    c.name = 'chimney';
    g.add(c);
    g.add(cyl(0.9, 1.6, PALETTE.powerYellow, -1.0, 0, 0.9, 12));
    windows(g, 3.0, 1, 3, 1.3, 1.42);
  } else {
    g.add(box(3.4, 1.2, 2.6, PALETTE.officeWall));
    // wind turbine
    const mast = cyl(0.12, 4.6, PALETTE.officeWall, -1.2, 0, -0.6, 8);
    g.add(mast);
    const hub = new THREE.Group();
    hub.name = 'rotor';
    for (let i = 0; i < 3; i++) {
      const blade = box(0.18, 1.9, 0.06, PALETTE.officeWall, 0, 0.2, 0);
      blade.geometry = geo('box', 0.18, 1.9, 0.06);
      const holder = new THREE.Group();
      holder.rotation.z = (i * Math.PI * 2) / 3;
      holder.add(blade);
      hub.add(holder);
    }
    hub.position.set(-1.2, 4.6, -0.45);
    g.add(hub);
    // solar array
    for (let i = 0; i < 3; i++) {
      const p = box(1.0, 0.08, 0.8, PALETTE.glass, 0.6 + (i % 2) * 1.2, 1.2 + 0.0, 0.4 - Math.floor(i / 2) * 1.0, { metal: 0.5, rough: 0.25 });
      p.rotation.x = -0.5;
      g.add(p);
    }
  }
  return g;
}

function water(tier: number): THREE.Group {
  const g = new THREE.Group();
  if (tier === 1) {
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const leg = cyl(0.1, 2.2, PALETTE.indMetal, dx, 0, dz, 6);
      g.add(leg);
    }
    const tank = cyl(1.2, 1.4, PALETTE.waterBlue, 0, 2.2, 0, 14);
    tank.name = 'tank';
    g.add(tank);
    g.add(mesh(geo('cone', 1.25, 0.7, 14), mat(PALETTE.roadT2), 0, 3.95, 0));
  } else if (tier === 2) {
    g.add(box(3.0, 1.6, 2.4, PALETTE.officeWall));
    g.add(cyl(0.9, 2.4, PALETTE.waterBlue, 1.4, 0, -0.6, 14));
    g.add(cyl(0.18, 1.0, PALETTE.indMetal, 0.2, 0.4, 1.3, 6));
    windows(g, 2.4, 1, 2, 0.7, 1.22);
  } else {
    g.add(box(3.8, 1.4, 2.8, PALETTE.officeWall));
    for (const dx of [-1.0, 0.4, 1.8]) {
      const basin = cyl(0.75, 0.7, PALETTE.waterBlue, dx, 0, 1.2, 14);
      g.add(basin);
    }
    g.add(cyl(1.0, 2.6, PALETTE.waterBlue, -1.2, 0, -0.9, 14));
    windows(g, 3.0, 1, 3, 0.6, 1.42);
  }
  return g;
}

function park(tier: number): THREE.Group {
  const g = new THREE.Group();
  const base = box(4.4, 0.12, 4.4, PALETTE.parkGreen);
  base.receiveShadow = true;
  g.add(base);
  if (tier >= 1) {
    g.add(tree(-1.3, -1.2, 1.1));
    g.add(tree(1.4, 0.9, 0.9));
    g.add(box(0.9, 0.35, 0.3, PALETTE.trunk, 0.2, 0.12, -0.6)); // bench
  }
  if (tier >= 2) {
    const pond = cyl(1.0, 0.08, PALETTE.water, 1.1, 0.1, -1.1, 16);
    g.add(pond);
    g.add(tree(-1.5, 1.4, 1.2));
    g.add(box(2.4, 0.06, 0.7, PALETTE.sand, -0.4, 0.12, 0.4)); // path
  }
  if (tier >= 3) {
    const fountain = cyl(0.7, 0.5, PALETTE.officeWall, 0, 0.12, 0, 14);
    g.add(fountain);
    const jet = cyl(0.15, 0.9, PALETTE.water, 0, 0.6, 0, 8);
    jet.name = 'jet';
    g.add(jet);
    g.add(tree(1.7, 1.6, 1.0));
    g.add(box(0.9, 0.35, 0.3, PALETTE.trunk, -1.6, 0.12, 0.3));
  }
  return g;
}

function fire(tier: number): THREE.Group {
  const g = new THREE.Group();
  if (tier === 1) {
    g.add(box(3.0, 1.8, 2.6, PALETTE.fireRed));
    g.add(box(3.2, 0.2, 2.8, PALETTE.officeWall, 0, 1.8));
    g.add(box(1.6, 1.3, 0.1, PALETTE.sidewalk, 0.4, 0, 1.32)); // garage door
    g.add(box(0.8, 0.4, 0.08, PALETTE.officeWall, -0.9, 1.1, 1.32));
  } else if (tier === 2) {
    g.add(box(4.0, 2.2, 2.8, PALETTE.fireRed));
    g.add(box(4.2, 0.22, 3.0, PALETTE.officeWall, 0, 2.2));
    g.add(box(1.2, 3.4, 1.2, PALETTE.fireRed, -1.8, 0, -0.7)); // hose tower
    g.add(box(1.5, 1.4, 0.1, PALETTE.sidewalk, 0.6, 0, 1.42));
    g.add(box(1.5, 1.4, 0.1, PALETTE.sidewalk, 2.2 - 1.0, 0, 1.42));
    windows(g, 3.2, 1, 3, 1.5, 1.42);
  } else {
    g.add(box(4.8, 2.6, 3.2, PALETTE.fireRed));
    g.add(box(5.0, 0.25, 3.4, PALETTE.officeWall, 0, 2.6));
    g.add(box(1.4, 4.2, 1.4, PALETTE.officeWall, -2.0, 0, -0.8));
    const beacon = mesh(geo('sphere', 0.3), mat(PALETTE.warn, { emissive: PALETTE.warn, emissiveIntensity: 1 }), -2.0, 4.5, -0.8);
    beacon.name = 'beacon';
    g.add(beacon);
    for (const dx of [0.0, 1.7]) g.add(box(1.4, 1.5, 0.1, PALETTE.sidewalk, dx, 0, 1.62));
    windows(g, 4.0, 1, 4, 1.8, 1.62);
  }
  return g;
}

function transit(tier: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.2, 0.1, 1.6, PALETTE.roadT2));
  g.add(cyl(0.07, 1.6, PALETTE.indMetal, -0.8, 0, -0.4, 6));
  g.add(box(0.5, 0.4, 0.06, PALETTE.busYellow, -0.8, 1.35, -0.4)); // sign
  if (tier >= 2) {
    g.add(box(1.8, 0.08, 0.9, PALETTE.comTeal, 0.2, 1.5, -0.2));
    g.add(cyl(0.06, 1.5, PALETTE.indMetal, 0.9, 0, -0.5, 6));
    g.add(box(1.6, 0.5, 0.06, PALETTE.glass, 0.2, 0.5, -0.55, { rough: 0.3, opacity: 0.7 }));
  }
  if (tier >= 3) {
    g.add(box(2.0, 0.35, 0.4, PALETTE.trunk, 0.2, 0.1, 0.45));
    g.add(box(0.6, 0.9, 0.2, PALETTE.comSign, -1.0, 0.1, 0.5, { emissive: PALETTE.comSign, emissiveIntensity: 0.5 })); // info kiosk
  }
  return g;
}

function office(tier: number): THREE.Group {
  const g = new THREE.Group();
  const h = tier === 1 ? 3.4 : tier === 2 ? 5.4 : 7.6;
  const w = tier === 1 ? 2.8 : 3.2;
  g.add(box(w, h, 2.6, tier === 3 ? PALETTE.glass : PALETTE.officeWall, 0, 0, 0, tier === 3 ? { rough: 0.3, metal: 0.4 } : undefined));
  g.add(box(w + 0.2, 0.25, 2.8, PALETTE.indMetal, 0, h));
  if (tier >= 2) g.add(box(1.0, 0.6, 1.0, PALETTE.indMetal, 0.6, h + 0.2, -0.4));
  if (tier === 3) {
    g.add(box(0.16, 1.6, 0.16, PALETTE.indMetal, 0, h + 0.25, 0)); // antenna
    g.add(box(w + 0.4, 0.5, 3.0, PALETTE.comTeal, 0, 0, 0)); // lobby band
  }
  windows(g, w - 0.4, Math.floor(h / 0.85), 3, 0.7, 1.32, 0.85);
  windows(g, 2.0, Math.floor(h / 0.85), 2, 0.7, -1.32, 0.85);
  return g;
}

/** Eco Spire — stage 1 foundation+plaza, 2 tower, 3 crown+beacon. */
function landmark(stage: number): THREE.Group {
  const g = new THREE.Group();
  // plaza base always
  g.add(box(6.4, 0.18, 6.4, PALETTE.sidewalk));
  g.add(tree(-2.6, 2.6, 1.0));
  g.add(tree(2.6, -2.6, 1.0));
  if (stage >= 1) {
    g.add(box(3.6, 1.6, 3.6, PALETTE.landmarkMetal, 0, 0.18, 0));
    g.add(box(4.2, 0.4, 4.2, PALETTE.landmarkGreen, 0, 1.78, 0));
  }
  if (stage >= 2) {
    g.add(box(2.8, 3.2, 2.8, PALETTE.glass, 0, 2.2, 0, { rough: 0.25, metal: 0.4 }));
    g.add(box(3.3, 0.35, 3.3, PALETTE.landmarkGreen, 0, 5.4, 0));
    g.add(box(2.2, 2.6, 2.2, PALETTE.glass, 0, 5.75, 0, { rough: 0.25, metal: 0.4 }));
    windows(g, 2.4, 4, 3, 2.6, 1.42, 0.8);
  }
  if (stage >= 3) {
    g.add(box(2.6, 0.35, 2.6, PALETTE.landmarkGreen, 0, 8.35, 0));
    g.add(box(1.5, 2.0, 1.5, PALETTE.glass, 0, 8.7, 0, { rough: 0.2, metal: 0.5 }));
    const ring = mesh(new THREE.TorusGeometry(1.3, 0.09, 8, 24), mat(PALETTE.landmarkGreen, { emissive: PALETTE.landmarkGreen, emissiveIntensity: 1.2 }), 0, 10.0, 0);
    ring.rotation.x = Math.PI / 2;
    ring.name = 'ring';
    g.add(ring);
    const beacon = mesh(geo('sphere', 0.35), mat(PALETTE.glassEmissive, { emissive: PALETTE.glassEmissive, emissiveIntensity: 1.4 }), 0, 11.0, 0);
    beacon.name = 'beacon';
    g.add(beacon);
  }
  return g;
}

// ---------- public API ----------
const builders: Record<string, (tier: number) => THREE.Group> = {
  residential,
  industrial,
  commercial,
  power,
  water,
  park,
  fire,
  transit,
  office,
  landmark,
};

export function buildModel(category: string, tier: number): THREE.Group {
  const b = builders[category];
  const g = b ? b(tier) : new THREE.Group();
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    if (o instanceof THREE.InstancedMesh) o.castShadow = false;
  });
  return g;
}

/** simple vehicles */
export function buildVehicle(kind: 'car' | 'truck' | 'bus' | 'firetruck', variant = 0): THREE.Group {
  const g = new THREE.Group();
  const colors = [PALETTE.carA, PALETTE.carB, PALETTE.carC];
  if (kind === 'car') {
    g.add(box(0.9, 0.3, 0.5, colors[variant % 3], 0, 0.12, 0));
    g.add(box(0.5, 0.24, 0.44, PALETTE.glass, -0.02, 0.42, 0, { rough: 0.3 }));
  } else if (kind === 'truck') {
    g.add(box(0.5, 0.42, 0.6, PALETTE.carB, -0.55, 0.12, 0));
    g.add(box(1.0, 0.62, 0.64, PALETTE.truckBox, 0.25, 0.12, 0));
  } else if (kind === 'bus') {
    g.add(box(1.8, 0.6, 0.62, PALETTE.busYellow, 0, 0.14, 0));
    windows(g, 1.5, 1, 4, 0.5, 0.32);
  } else {
    g.add(box(1.5, 0.5, 0.62, PALETTE.fireRed, 0, 0.14, 0));
    g.add(box(0.9, 0.14, 0.2, PALETTE.sidewalk, 0.1, 0.66, 0)); // ladder
    const light = mesh(geo('sphere', 0.09), mat(PALETTE.waterBlue, { emissive: PALETTE.waterBlue, emissiveIntensity: 1.4 }), -0.5, 0.72, 0);
    light.name = 'beacon';
    g.add(light);
  }
  // wheels
  const wheelGeo = geo('cyl', 0.13, 0.13, 0.1, 8);
  const wheelMat = mat(0x2a2d33);
  const xs = kind === 'car' ? [-0.28, 0.28] : kind === 'bus' ? [-0.6, 0.6] : [-0.45, 0.45];
  for (const wx of xs) {
    for (const wz of [-0.26, 0.26]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.13, wz);
      g.add(w);
    }
  }
  return g;
}

/** stylized citizen: big head, compact body, flat outfit colors */
export function buildCitizen(variant = 0): THREE.Group {
  const g = new THREE.Group();
  const outfits = [PALETTE.citizenA, PALETTE.citizenB, PALETTE.citizenC];
  const bodyM = mat(outfits[variant % 3]);
  const body = mesh(geo('cyl', 0.14, 0.18, 0.42, 8), bodyM, 0, 0.21, 0);
  g.add(body);
  const head = mesh(geo('sphere', 0.16), mat(PALETTE.skin), 0, 0.56, 0);
  g.add(head);
  return g;
}

/** Soft contact-shadow disc — fake AO that grounds every building. */
let aoTexture: THREE.CanvasTexture | null = null;
export function makeAoDisc(radius: number): THREE.Mesh {
  if (!aoTexture) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(30,42,38,0.34)');
    grad.addColorStop(0.65, 'rgba(30,42,38,0.18)');
    grad.addColorStop(1, 'rgba(30,42,38,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    aoTexture = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: aoTexture, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

export function buildScaffold(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const frame = mat(PALETTE.material);
  const postG = geo('box', 0.08, h, 0.08);
  for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    g.add(mesh(postG, frame, dx, h / 2, dz));
  }
  for (let yy = h / 3; yy < h; yy += h / 3) {
    g.add(mesh(geo('box', w + 0.1, 0.06, 0.06), frame, 0, yy, -d / 2));
    g.add(mesh(geo('box', w + 0.1, 0.06, 0.06), frame, 0, yy, d / 2));
    g.add(mesh(geo('box', 0.06, 0.06, d + 0.1), frame, -w / 2, yy, 0));
    g.add(mesh(geo('box', 0.06, 0.06, d + 0.1), frame, w / 2, yy, 0));
  }
  const crane = new THREE.Group();
  crane.name = 'crane';
  crane.add(mesh(geo('box', 0.12, h + 1.4, 0.12), mat(PALETTE.indSafety), w / 2 + 0.5, (h + 1.4) / 2, 0));
  const arm = mesh(geo('box', 1.8, 0.1, 0.1), mat(PALETTE.indSafety), w / 2 + 0.5 - 0.6, h + 1.3, 0);
  arm.name = 'arm';
  crane.add(arm);
  g.add(crane);
  return g;
}
