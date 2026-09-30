import * as THREE from 'three';

/** Bounds of what you actually see: no pick proxy, no outline hulls, no hidden bits, no additive glows. */
export function visibleBounds(obj: THREE.Object3D, out = new THREE.Box3()) {
  out.makeEmpty();
  obj.updateMatrixWorld(true);
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || o.name === 'pick' || o.name === 'outline') return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material as THREE.Material;
      if (mat.blending !== THREE.AdditiveBlending) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        out.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
      }
    }
    o.children.forEach(walk);
  };
  walk(obj);
  return out;
}

/** Some shapes read bigger than their bounds (a cube fills its box; a round head doesn't). */
export const VISUAL_WEIGHT: Record<string, number> = { blocky: 0.84, chip: 0.93, homebody: 0.94 };
