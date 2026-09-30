import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bevelPuck, roundedTriangleShape } from './scene/geometry';
import { glowMaterial, type Shell } from './scene/shells/common';
import { addOutline, toon } from './scene/toon';

/**
 * Headwear for the robots, built in JevBot's toy language: chunky bevelled
 * forms, a two-tone cel ramp with a hard sticker highlight, and the same ink
 * outline every shell wears. Each piece is modelled for a ~0.8-wide crown and
 * scaled to the room the shell leaves on top (`shell.anchors`).
 */
export type AccessoryId = 'crown' | 'halo' | 'sprout' | 'propeller' | 'party' | 'bow' | 'antenna' | 'bunny' | 'horns' | 'tophat' | 'headset' | 'flower';
export const ACCESSORY_IDS: AccessoryId[] = ['crown', 'halo', 'sprout', 'propeller', 'party', 'bow', 'antenna', 'bunny', 'horns', 'tophat', 'headset', 'flower'];

const INK = '#0e0d15';

function gold() {
  return toon({ color: '#ffcf4d', shade: '#d8843f', spec: 0.85, specSize: 0.95, rim: 0.5, rimColor: '#fff2c4', edge: 0.3 });
}

function crown(diamond = false) {
  const g = new THREE.Group();
  const metal = diamond
    ? toon({color: '#9cdfff', shade: '#477fab', spec: .9, specSize: .95, rim: .6, rimColor: '#f3fbff', edge: .3})
    : gold();
  // A continuous, chunky five-point silhouette. The old separate spikes and
  // ball tips collapsed into noise at feed size; one metal wall stays legible.
  const segments = 160;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const peak = Math.pow((Math.cos(5 * (angle - Math.PI / 2)) + 1) / 2, 1.8);
    const height = .13 + .16 * peak;
    for (const [radius, y] of [[.298, .015], [.335, height], [.299, height], [.266, .015]]) {
      vertices.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let edge = 0; edge < 4; edge++) {
      const a = i * 4 + edge;
      const b = (i + 1) * 4 + edge;
      const c = (i + 1) * 4 + (edge + 1) % 4;
      const d = i * 4 + (edge + 1) % 4;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const wall = new THREE.Mesh(geometry, metal);
  wall.material.side = THREE.DoubleSide;
  addOutline(wall, { color: INK, thickness: 2.0 });
  g.add(wall);
  const foot = new THREE.Mesh(new THREE.TorusGeometry(.29, .025, 10, 80), metal);
  foot.rotation.x = Math.PI / 2;
  foot.position.y = .025;
  addOutline(foot, { color: INK, thickness: 1.5 });
  g.add(foot);
  // One clear front jewel reads as a reward, even when the entire crown is 30px.
  const jewel = new THREE.Mesh(
    new THREE.OctahedronGeometry(.056, 0),
    toon({ color: diamond ? '#f0fdff' : '#fc7960', shade: diamond ? '#629fcb' : '#b23d45', spec: .9, rim: .3 }),
  );
  jewel.scale.set(1, 1.22, .42);
  jewel.position.set(0, .106, .318);
  addOutline(jewel, { color: INK, thickness: 1.4 });
  g.add(jewel);
  g.rotation.z = -.035;
  g.position.y = -.025;
  return { group: g };
}

function halo() {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: '#fff3b8', toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 16, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 16, 96), toon({ color: '#ffd76a', shade: '#e9a24a', spec: 0.9, specSize: 0.94, rim: 0.6, rimColor: '#ffffff' }));
  rim.rotation.x = Math.PI / 2;
  rim.scale.setScalar(1.001);
  addOutline(rim, { color: '#8a5a12', thickness: 1.4 });
  rim.visible = true;
  // the lit core sits on top of the toon ring so it reads as light, not metal
  ring.renderOrder = 3;
  (ring.material as THREE.MeshBasicMaterial).transparent = true;
  (ring.material as THREE.MeshBasicMaterial).opacity = 0.75;
  g.add(rim);
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.5, 64), glowMaterial('#ffe28a', 0.9, 'ring', 0.6, 0.16));
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);
  g.position.y = 0.2;
  g.rotation.x = 0.28;
  g.rotation.z = -0.1;
  return { group: g };
}

function sprout() {
  const g = new THREE.Group();
  const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0.01, 0.1, 0), new THREE.Vector3(-0.02, 0.2, 0.01)]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 20, 0.022, 10, false), toon({ color: '#5db53a', shade: '#3f7a52', spec: 0.3 }));
  addOutline(stem, { color: INK, thickness: 2.2 });
  g.add(stem);
  const leafMat = toon({ color: '#7fdc4f', shade: '#3f8a5a', spec: 0.6, specSize: 0.95, rim: 0.5, rimColor: '#eaffc9', edge: 0.3 });
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.08, 0.06, 0.2, 0.08, 0.26, 0.0);
  leafShape.bezierCurveTo(0.2, -0.07, 0.08, -0.06, 0, 0);
  const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.016, bevelSegments: 3, curveSegments: 16 });
  leafGeo.translate(0, 0, -0.01);
  for (const side of [1, -1]) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    addOutline(leaf, { color: INK, thickness: 2.2 });
    leaf.position.set(-0.02, 0.2, 0.01);
    leaf.scale.x = side;
    leaf.rotation.z = side * 0.45;
    leaf.rotation.y = side * 0.2;
    g.add(leaf);
  }
  g.scale.setScalar(1.25);
  return { group: g };
}

function propeller() {
  const g = new THREE.Group();
  // a beanie dome in four candy panels
  const dome = new THREE.SphereGeometry(0.3, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const cols = ['#ff4b6e', '#ffcd45', '#5b82ff', '#36d98a'];
  const colAttr = new Float32Array(dome.getAttribute('position').count * 3);
  const pos = dome.getAttribute('position');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
    c.set(cols[Math.floor((a / (Math.PI * 2)) * 4) % 4]);
    colAttr.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colAttr, 3));
  const domeMesh = new THREE.Mesh(dome, toon({ vertexColors: true, shade: '#b09ad0', spec: 0.6, specSize: 0.95, rim: 0.4 }));
  domeMesh.scale.set(1, 0.62, 1);
  addOutline(domeMesh, { color: INK, thickness: 2.3 });
  g.add(domeMesh);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.026, 10, 64), toon({ color: '#2a2733', shade: '#5c5974', spec: 0.4 }));
  brim.rotation.x = Math.PI / 2;
  g.add(brim);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.12, 10), toon({ color: '#2a2733', shade: '#5c5974' }));
  stalk.position.y = 0.23;
  addOutline(stalk, { color: INK, thickness: 1.8 });
  g.add(stalk);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), toon({ color: '#ffcd45', shade: '#dc8a58', spec: 0.8 }));
  hub.position.y = 0.3;
  addOutline(hub, { color: INK, thickness: 1.8 });
  g.add(hub);
  const blades = new THREE.Group();
  blades.position.y = 0.3;
  for (const side of [0, 1]) {
    const blade = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.018, 0.085, 2, 0.008), toon({ color: side ? '#ff4b6e' : '#5b82ff', shade: '#8a6ab0', spec: 0.7, specSize: 0.95 }));
    blade.position.x = side ? 0.19 : -0.19;
    blade.rotation.x = side ? 0.28 : -0.28;
    addOutline(blade, { color: INK, thickness: 1.8 });
    blades.add(blade);
  }
  blades.rotation.y = 0.5;
  g.add(blades);
  g.position.y = -0.05;
  return { group: g };
}

function party() {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.2, 0.46, 48, 8, true);
  geo.translate(0, 0.23, 0);
  // spiral candy stripes via vertex colours
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color('#ff7ad9');
  const b = new THREE.Color('#fff4fb');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const band = Math.sin(ang * 1 + pos.getY(i) * 26);
    c.copy(band > 0.1 ? a : b);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const cone = new THREE.Mesh(geo, toon({ vertexColors: true, shade: '#c09ad8', spec: 0.55, specSize: 0.95, rim: 0.5, rimColor: '#ffe0f5', side: THREE.DoubleSide }));
  addOutline(cone, { color: INK, thickness: 2.3 });
  g.add(cone);
  const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 2), toon({ color: '#ffcd45', shade: '#dc8a58', spec: 0.4, rim: 0.5 }));
  pom.position.y = 0.48;
  addOutline(pom, { color: INK, thickness: 2 });
  g.add(pom);
  g.rotation.z = -0.22;
  g.position.set(0.1, -0.03, 0);
  return { group: g };
}

function bow() {
  const g = new THREE.Group();
  const mat = toon({ color: '#ff5fb8', shade: '#b0508e', spec: 0.75, specSize: 0.955, rim: 0.55, rimColor: '#ffe0f5', edge: 0.3 });
  const lobeGeo = new THREE.ExtrudeGeometry(roundedTriangleShape(0.3, 0.3, 0.07), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 4, curveSegments: 10 });
  lobeGeo.translate(0, 0, -0.05);
  for (const side of [1, -1]) {
    const lobe = new THREE.Mesh(lobeGeo, mat);
    addOutline(lobe, { color: INK, thickness: 2.3 });
    lobe.rotation.z = side * (Math.PI / 2 + 0.12);
    lobe.position.x = side * 0.02;
    g.add(lobe);
  }
  const knot = new THREE.Mesh(bevelPuck(0.075, 0.12, 0.035, 24, 3), mat);
  knot.rotation.x = Math.PI / 2;
  addOutline(knot, { color: INK, thickness: 2.2 });
  g.add(knot);
  g.position.set(0.22, 0.08, 0.05);
  g.rotation.set(-0.2, 0, -0.35);
  return { group: g };
}

function antenna() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(bevelPuck(0.08, 0.05, 0.02, 24, 3), toon({ color: '#2a2733', shade: '#5c5974', spec: 0.5 }));
  addOutline(base, { color: INK, thickness: 2 });
  g.add(base);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.14, 0), new THREE.Vector3(0.08, 0.27, 0)]);
  const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018, 8, false), toon({ color: '#2a2733', shade: '#5c5974' }));
  addOutline(stalk, { color: INK, thickness: 2 });
  g.add(stalk);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 14), new THREE.MeshBasicMaterial({ color: '#ff5c7a', toneMapped: false }));
  bulb.position.set(0.085, 0.3, 0);
  addOutline(bulb, { color: INK, thickness: 2 });
  g.add(bulb);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  shine.position.set(0.065, 0.325, 0.05);
  g.add(shine);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), glowMaterial('#ff6d8a', 0.8, 'ring', 0.25, 0.3));
  glow.position.set(0.085, 0.3, -0.01);
  g.add(glow);
  return { group: g };
}

function bunny() {
  const g = new THREE.Group();
  const outer = toon({ color: '#fbf7ff', shade: '#b9aee0', spec: 0.6, specSize: 0.96, rim: 0.5, rimColor: '#ffd9f0', edge: 0.3 });
  const inner = toon({ color: '#ff9ccf', shade: '#c070a8', spec: 0.3 });
  for (const side of [1, -1]) {
    const ear = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.075, 0.34, 8, 20);
    geo.scale(1, 1, 0.55);
    const o = new THREE.Mesh(geo, outer);
    addOutline(o, { color: INK, thickness: 2.3 });
    const igeo = new THREE.CapsuleGeometry(0.042, 0.26, 6, 16);
    igeo.scale(1, 1, 0.4);
    const i = new THREE.Mesh(igeo, inner);
    i.position.set(0, 0.0, 0.03);
    ear.add(o, i);
    ear.position.set(side * 0.16, 0.2, 0);
    ear.rotation.z = side * -0.22;
    ear.rotation.x = side > 0 ? -0.1 : 0.15;
    g.add(ear);
  }
  return { group: g };
}

function horns() {
  const g = new THREE.Group();
  const mat = toon({ color: '#ff4b5c', shade: '#9a2a52', spec: 0.8, specSize: 0.95, rim: 0.5, rimColor: '#ffd0c4', edge: 0.3 });
  for (const side of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(side * (0.02 + 0.12 * t + 0.06 * t * t), 0.26 * t + 0.05 * Math.sin(t * Math.PI), 0));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 24, 1, 12, false);
    // taper the tube to a point
    const pos = geo.getAttribute('position');
    const tmp = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const seg = Math.floor(i / 13) / 24;
      const c = curve.getPoint(Math.min(1, seg));
      tmp.fromBufferAttribute(pos, i).sub(c).multiplyScalar(0.075 * (1 - seg * 0.92));
      pos.setXYZ(i, c.x + tmp.x, c.y + tmp.y, c.z + tmp.z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    addOutline(m, { color: INK, thickness: 2.2 });
    m.position.x = side * 0.14;
    g.add(m);
  }
  return { group: g };
}

function tophat() {
  const g = new THREE.Group();
  const felt = toon({ color: '#2a2733', shade: '#5c5974', spec: 0.5, specSize: 0.96, rim: 0.5, rimColor: '#cfd6ff' });
  const brim = new THREE.Mesh(bevelPuck(0.34, 0.035, 0.015, 48, 3), felt);
  addOutline(brim, { color: INK, thickness: 2.2 });
  g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.36, 40), felt);
  crown.position.y = 0.19;
  addOutline(crown, { color: INK, thickness: 2.3 });
  g.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.223, 0.07, 40, 1, true), toon({ color: '#ff4b6e', shade: '#a83a6a', spec: 0.6 }));
  band.position.y = 0.06;
  g.add(band);
  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), felt);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = 0.37;
  g.add(lid);
  g.rotation.z = -0.14;
  g.position.x = 0.06;
  return { group: g };
}

function headset() {
  const g = new THREE.Group();
  const mat = toon({ color: '#2a2733', shade: '#5c5974', spec: 0.6, specSize: 0.95, rim: 0.4 });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 12, 48, Math.PI), mat);
  arc.position.y = -0.16;
  arc.scale.set(1.05, 0.62, 1);
  addOutline(arc, { color: INK, thickness: 2.2 });
  g.add(arc);
  const cushion = toon({ color: '#5b82ff', shade: '#3a4aa8', spec: 0.5, rim: 0.4 });
  for (const side of [1, -1]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), cushion);
    c.scale.set(0.8, 1, 1);
    c.position.set(side * 0.43, -0.13, 0);
    addOutline(c, { color: INK, thickness: 2 });
    g.add(c);
  }
  const boomCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.43, -0.16, 0.04), new THREE.Vector3(-0.42, -0.34, 0.2), new THREE.Vector3(-0.28, -0.46, 0.36)]);
  const boom = new THREE.Mesh(new THREE.TubeGeometry(boomCurve, 20, 0.016, 8, false), mat);
  g.add(boom);
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), toon({ color: '#ff4b6e', shade: '#a83a6a', spec: 0.6 }));
  mic.position.copy(boomCurve.getPoint(1));
  addOutline(mic, { color: INK, thickness: 1.8 });
  g.add(mic);
  return { group: g };
}

function flower() {
  const g = new THREE.Group();
  const petal = toon({ color: '#ffc4e1', shade: '#d58ab8', spec: 0.5, specSize: 0.95, rim: 0.5, rimColor: '#ffffff', edge: 0.3 });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.07, 0.04, 0.09, 0.12, 0.04, 0.16);
  shape.lineTo(0, 0.14);
  shape.lineTo(-0.04, 0.16);
  shape.bezierCurveTo(-0.09, 0.12, -0.07, 0.04, 0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(geo, petal);
    m.rotation.z = (i / 5) * Math.PI * 2;
    addOutline(m, { color: INK, thickness: 1.8 });
    g.add(m);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), toon({ color: '#ffcf4d', shade: '#d8843f', spec: 0.6 }));
  center.position.z = 0.03;
  g.add(center);
  g.rotation.set(-0.9, 0.3, 0.2);
  g.position.set(0.24, 0.02, 0.1);
  return { group: g };
}

const BUILDERS: Record<AccessoryId, () => { group: THREE.Group; update?: (dt: number, t: number) => void }> = {
  crown,
  halo,
  sprout,
  propeller,
  party,
  bow,
  antenna,
  bunny,
  horns,
  tophat,
  headset,
  flower,
};

/** The Crown, as a 3D toy: gold, or the blue diamond crown of the app-wide champion. */
export function buildCrown(kind: 'gold' | 'diamond') {
  const group = crown(kind === 'diamond').group;
  group.scale.setScalar(1.4);
  group.position.y = .04;
  return group;
}

/** An accessory seated on `shell`'s crown point. */
export function buildAccessory(id: AccessoryId, shell: Shell, crownKind: 'gold' | 'diamond' = 'gold') {
  const built = id === 'crown' ? crown(crownKind === 'diamond') : BUILDERS[id]();
  const holder = new THREE.Group();
  holder.add(built.group);
  const { top, width } = shell.anchors;
  holder.position.copy(top);
  holder.scale.setScalar(THREE.MathUtils.clamp(width / 0.8, 0.62, 1.15));
  return { group: holder, update: built.update };
}
