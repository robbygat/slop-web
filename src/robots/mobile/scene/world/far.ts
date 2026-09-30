import * as THREE from 'three';
import { toon } from '../toon';

/* Mt. Fuji, rising out of the cloud sea on the far right horizon, softened by the haze. */

export function createFuji() {
  const H = 38;
  const R = 74;
  const rings = 44;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= rings; i++) {
    const h = i / rings;
    // concave flank + small flattened crater
    let r = R * Math.pow(1 - h, 1.75);
    r = Math.max(r, R * 0.055 * (1 - Math.pow(Math.max(0, h - 0.97) / 0.03, 2)));
    pts.push(new THREE.Vector2(Math.max(r, 0.01), h * H));
  }
  pts.push(new THREE.Vector2(0.01, H * 0.985));
  const geo = new THREE.LatheGeometry(pts, 140);
  geo.computeVertexNormals();
  // snow cap with ridged streaks, via vertex colours
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const rock = new THREE.Color('#5f86de');
  const rockDark = new THREE.Color('#4d6fc6');
  const snow = new THREE.Color('#f3f6ff');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(x, z);
    const h = y / H;
    const streak = Math.sin(ang * 11.0) * 0.07 + Math.sin(ang * 27.0 + 1.3) * 0.035 + Math.sin(ang * 5.0 + 0.7) * 0.03;
    const line = 0.66 + streak;
    const s = THREE.MathUtils.smoothstep(h, line - 0.012, line + 0.012);
    c.copy(rock).lerp(rockDark, 0.5 + 0.5 * Math.sin(ang * 17.0)).lerp(snow, s);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = toon({ vertexColors: true, shade: '#9fa6e2', terminator: 0.0, soft: 0.05, rim: 0.2, rimColor: '#ffe6f0', bottomDark: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(128, -22, -340);
  mesh.scale.setScalar(0.82);
  mesh.rotation.y = 0.6;
  return mesh;
}

