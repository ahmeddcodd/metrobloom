import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BUILDINGS, type BuildingCategory } from '../src/config/buildings';
import { buildModel } from '../src/render/ModelFactory';

/** Count total vertices + mesh nodes as a structural fingerprint. */
function fingerprint(group: THREE.Object3D): { verts: number; nodes: number } {
  let verts = 0;
  let nodes = 0;
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) {
      nodes++;
      const g = mesh.geometry as THREE.BufferGeometry | undefined;
      if (g?.attributes.position) verts += g.attributes.position.count * ((o as THREE.InstancedMesh).count || 1);
    }
  });
  return { verts, nodes };
}

describe('building tier meshes are structurally distinct (real upgrades, not scaled clones)', () => {
  const categories = Object.keys(BUILDINGS) as BuildingCategory[];
  for (const cat of categories) {
    it(`${cat}: each of its tiers renders a different structure`, () => {
      const tiers = BUILDINGS[cat].tiers.length;
      const prints = [];
      for (let t = 1; t <= tiers; t++) {
        const model = buildModel(cat, t);
        expect(model.children.length).toBeGreaterThan(0); // something rendered
        prints.push(fingerprint(model));
      }
      // every tier must differ from every other tier in vertex count OR node count
      for (let a = 0; a < prints.length; a++) {
        for (let b = a + 1; b < prints.length; b++) {
          const differ = prints[a].verts !== prints[b].verts || prints[a].nodes !== prints[b].nodes;
          expect(differ, `${cat} tier ${a + 1} and ${b + 1} look identical`).toBe(true);
        }
      }
    });
  }
});
