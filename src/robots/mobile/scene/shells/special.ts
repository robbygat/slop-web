import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Face, faceMaterial } from '../face';
import { fixLatheSeam, rng, roundedRectShape, roundedTriangleShape } from '../geometry';
import { chipFaceTexture, chipRimTexture } from '../textures';
import { addOutline, toon } from '../toon';
import { buildHead, collectToon, earPod, makeShell, type Shell } from './common';
import { body as paintBody, finishOf, jitterPalette, role, type FinishId } from '../../paint';

// ─── Blocky — a voxel grass block (Minecraft bots) ──────────────────────

/** Blocky's finishes are biomes: a top layer that creeps down over a body block. */
const BIOMES: Record<string, { top: string; side: string; spread?: number }> = {
  pearl: { top: '#f4f7ff', side: '#9fb0c8' }, // snow on stone
  midnight: { top: '#7a5cff', side: '#2a2438' }, // amethyst on obsidian
  bubblegum: { top: '#ffa6d8', side: '#8a5a44' }, // cherry blossom
  sunny: { top: '#ffe07a', side: '#e8b25a' }, // sand
  mint: { top: '#5fe0b4', side: '#3a8f96' }, // prismarine
  sky: { top: '#e8f6ff', side: '#7fb2ff' }, // ice
  tangerine: { top: '#ffa23c', side: '#6a4a38' }, // pumpkin
  grape: { top: '#c49bff', side: '#5a3c9c' }, // amethyst
  cherry: { top: '#ff5a55', side: '#3a2a2e' }, // redstone
  chrome: { top: '#eef1f8', side: '#b9c0d0', spread: 0.08 }, // iron block
  gold: { top: '#ffe07a', side: '#f4b93e', spread: 0.1 }, // gold block
  holo: { top: '#f0c8ff', side: '#a8e8ff', spread: 0.1 }, // opal
  carbon: { top: '#4a4c58', side: '#26272e', spread: 0.08 }, // basalt
  candy: { top: '#ff9bd5', side: '#7fe3ff', spread: 0.1 }, // candy block
  matte: { top: '#f1e6cf', side: '#d9b98a', spread: 0.1 }, // sandstone
};

export function createBlocky(finish: FinishId = 'signature'): Shell {
  const N = 8;
  const s = 0.19;
  const rand = rng(42);
  const pivot = new THREE.Group();

  const biome = finish === 'signature' ? null : BIOMES[finish];
  const dirt = biome ? jitterPalette(biome.side, 7, biome.spread ?? 0.16, 7) : ['#b97545', '#a7643a', '#c6874f', '#95552f', '#8b4c2a', '#b36d3f', '#9e5d35'];
  const grass = biome ? jitterPalette(biome.top, 6, biome.spread ?? 0.14, 3) : ['#6fc444', '#5db53a', '#80d253', '#52a235', '#67bd40', '#74c94a'];
  const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)];

  // screen hole on the front face: columns 1..6, rows 1..5
  const inHole = (x: number, y: number, z: number) => z === N - 1 && x >= 1 && x <= 6 && y >= 1 && y <= 5;

  type Vox = { x: number; y: number; z: number; color: string; sy?: number; oy?: number; sxz?: number };
  const voxels: Vox[] = [];
  const grassAt = new Map<string, boolean>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

  for (let y = N - 1; y >= 0; y--) {
    for (let x = 0; x < N; x++) {
      for (let z = 0; z < N; z++) {
        const surface = x === 0 || y === 0 || z === 0 || x === N - 1 || y === N - 1 || z === N - 1;
        if (!surface || inHole(x, y, z)) continue;
        let isGrass = y === N - 1;
        if (!isGrass && y === N - 2) isGrass = rand() < 0.72;
        if (!isGrass && y === N - 3) isGrass = !!grassAt.get(key(x, y + 1, z)) && rand() < 0.38;
        if (!isGrass && y === N - 4) isGrass = !!grassAt.get(key(x, y + 1, z)) && rand() < 0.2;
        grassAt.set(key(x, y, z), isGrass);
        voxels.push({ x, y, z, color: isGrass ? pick(grass) : pick(dirt) });
      }
    }
  }
  // bumpy tufts on top
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rand() * N);
    const z = Math.floor(rand() * N);
    const h = 0.35 + rand() * 0.35;
    voxels.push({ x, y: N, z, color: pick(grass), sy: h, oy: -0.5 + h / 2, sxz: 0.62 + rand() * 0.3 });
  }

  const geo = new RoundedBoxGeometry(s * 1.002, s * 1.002, s * 1.002, 1, s * 0.07);
  const metal = finish === 'chrome' || finish === 'gold' || finish === 'holo' || finish === 'carbon' || finish === 'candy';
  const mat = toon({ color: '#ffffff', shade: '#b48f9a', spec: metal ? 0.7 : 0.18, specSize: 0.97, rim: 0.35, rimColor: '#ffe9c9', terminator: 0.1, bottomDark: 0.14 });
  const mesh = new THREE.InstancedMesh(geo, mat, voxels.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const half = (N - 1) / 2;
  voxels.forEach((v, i) => {
    const jitter = (rand() - 0.5) * 0.004;
    p.set((v.x - half) * s, (v.y - half) * s + (v.oy ?? 0) * s, (v.z - half) * s);
    // push surface voxels slightly along their outward axis for a hand-made relief
    if (v.x === 0) p.x -= jitter;
    if (v.x === N - 1) p.x += jitter;
    if (v.z === N - 1) p.z += jitter;
    if (v.z === 0) p.z -= jitter;
    sc.set(v.sxz ?? 1, v.sy ?? 1, v.sxz ?? 1);
    m.compose(p, q, sc);
    mesh.setMatrixAt(i, m);
    col.set(v.color);
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  pivot.add(mesh);
  // one clean ink silhouette around the whole block (per-voxel hulls read as a busy grid)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(N * s, N * s, N * s), new THREE.MeshBasicMaterial({ visible: false }));
  addOutline(hull, { color: '#0e0d15', thickness: 2.4, smooth: true });
  pivot.add(hull);

  // recessed screen
  const w = 6 * s;
  const h = 5 * s;
  const fmat = faceMaterial({ aspect: w / h, radius: 0.05, tint: '#07080f', glow: '#6f8dff', amp: 0.1, width: 0.028, glowSize: 0.032, gasket: 0.02, gasketColor: '#1c130c' });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fmat);
  screen.position.set(0, -0.5 * s, (N / 2 - 1) * s + 0.002);
  screen.renderOrder = 2;
  pivot.add(screen);

  const face = new Face(fmat, 2.2);
  const corners = () => [
    new THREE.Vector3(-w / 2, h / 2, 0),
    new THREE.Vector3(w / 2, h / 2, 0),
    new THREE.Vector3(w / 2, -h / 2, 0),
    new THREE.Vector3(-w / 2, -h / 2, 0),
    new THREE.Vector3(0, 0, 0),
  ];
  return makeShell(
    { id: 'blocky', name: 'Blocky', role: 'Companion for Minecraft', accent: '#6fc444', asks: 'Collect, follow, or flee?' },
    {
      pivot, face, width: N * s, height: (N + 0.6) * s, materials: collectToon(pivot),
      screen, screenSpec: { w, h, r: 0.05 * h, shape: 'rect', gasket: 0.02, frame: screen, corners },
      anchors: { top: new THREE.Vector3(0, (N / 2 + 0.25) * s, 0), width: 1.1 },
    },
  );
}

// ─── High Roller — poker chip shell ─────────────────────────────────────

const CHIP_WHITE = '#f6f1ec';

export function createChip(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  // a chip's colour is its denomination; the inserts stay white (or turn ink on a white chip)
  const chipRed = role(F, '#e3302d', (f) => (f.chrome ? '#e8ebf4' : f.body));
  const chipWhite = F && (F.id === 'pearl' || F.body.toLowerCase() === '#f7f2f8') ? '#2a2733' : CHIP_WHITE;
  const R = 0.8;
  const T = 0.34;
  const bevel = 0.075;
  const hh = T / 2;
  const pivot = new THREE.Group();
  const chip = new THREE.Group();

  // rim + bevels as one lathe (axis y); faces are separate planar-UV discs
  const pts: THREE.Vector2[] = [];
  const segs = 6;
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - bevel + Math.sin(t) * bevel, hh - bevel + Math.cos(t) * bevel));
  }
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - bevel + Math.cos(t) * bevel, -hh + bevel - Math.sin(t) * bevel));
  }
  pts.reverse(); // bottom → top, so the lathe's normals face outward
  const rimGeo = new THREE.LatheGeometry(pts, 96);
  rimGeo.computeVertexNormals();
  fixLatheSeam(rimGeo, pts.length, 96);
  const chipChrome = F?.chrome ? { chrome: F.id === 'gold' ? { sky: '#ffe9a8', horizon: '#fff8e6', dark: '#5a3a12', ground: '#d8914a' } : F.id === 'holo' ? { sky: '#c9a8ff', horizon: '#e6fff9', dark: '#4a3a8a', ground: '#ffadd9' } : { sky: '#a6c6ff', horizon: '#f6f8ff', dark: '#1d2142', ground: '#e8b9a8' } } : {};
  const rimMat = toon({ map: chipRimTexture(chipRed, chipWhite), shade: role(F, '#b0708e', (f) => f.shade), spec: 0.55, specSize: 0.96, rim: 0.5, rimColor: role(F, '#ffe0e8', (f) => f.rim), ...chipChrome });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  addOutline(rim, { color: '#0e0d15', thickness: 2.5 });
  chip.add(rim);

  const faceTex = chipFaceTexture(chipRed, chipWhite);
  const faceMat = toon({ map: faceTex, shade: role(F, '#b0708e', (f) => f.shade), spec: 0.5, specSize: 0.965, rim: 0.3, rimColor: role(F, '#ffe0e8', (f) => f.rim), ...chipChrome });
  const faceGeo = new THREE.CircleGeometry(R - bevel + 0.001, 96);
  const top = new THREE.Mesh(faceGeo, faceMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = hh;
  const bottom = new THREE.Mesh(faceGeo, faceMat);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -hh;
  chip.add(top, bottom);

  // round screen with a dark bezel ring
  const sr = 0.5;
  const fmat = faceMaterial({ aspect: 1, shape: 'circle', tint: '#090a16', glow: '#6f8dff', len: 0.74, amp: 0.08, width: 0.024, glowSize: 0.03, gasket: 0.014, gasketColor: '#2a2a36' });
  const screen = new THREE.Mesh(new THREE.CircleGeometry(sr, 64), fmat);
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = hh + 0.004;
  screen.renderOrder = 2;
  chip.add(screen);
  // a thin silver bezel seats the glass (a heavy dark ring read as a hole)
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(sr + 0.006, 0.018, 12, 96), toon({ color: '#e4e6ef', shade: '#8b90aa', spec: 0.85, specSize: 0.95, rim: 0.4 }));
  bezel.rotation.x = -Math.PI / 2;
  bezel.position.y = hh + 0.004;
  chip.add(bezel);

  chip.rotation.x = Math.PI / 2;
  pivot.add(chip);

  const face = new Face(fmat, 7.7);
  // the circle lies in its local XY plane (rotated onto the chip's top)
  const corners = () => [
    new THREE.Vector3(-sr, sr, 0),
    new THREE.Vector3(sr, sr, 0),
    new THREE.Vector3(sr, -sr, 0),
    new THREE.Vector3(-sr, -sr, 0),
    new THREE.Vector3(0, 0, 0),
  ];
  return makeShell(
    { id: 'chip', name: 'High Roller', role: 'Poker vs bots', accent: '#ff4b4b', asks: 'Fold, call, or raise?' },
    {
      pivot, face, width: 2 * R, height: 2 * R, materials: collectToon(pivot),
      screen, screenSpec: { w: 2 * sr, h: 2 * sr, r: sr, shape: 'circle', gasket: 0.014, frame: screen, corners },
      anchors: { top: new THREE.Vector3(0, R - 0.02, 0), width: 0.8 },
    },
  );
}

// ─── Stage Door — Twitch chat moderator: a stage-door marquee ───────────

function starShape(outer: number, inner: number) {
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const ang = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) star.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
    else star.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  star.closePath();
  return star;
}

function goldStar(outer: number, inner: number, depth: number) {
  const geo = new THREE.ExtrudeGeometry(starShape(outer, inner), { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: outer * 0.1, bevelSegments: 2 });
  geo.center();
  const m = new THREE.Mesh(geo, toon({ color: '#ffcf4d', shade: '#d8843f', spec: 0.8, specSize: 0.95, rim: 0.5, rimColor: '#fff2c4' }));
  addOutline(m, { color: '#0e0d15', thickness: 2.3 });
  return m;
}

export function createStageDoor(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.8, b = 0.62, c = 0.56, n = 3.0;
  const sw = 1.1, sh = 0.72, sy = 0.02;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#9b6dff', shade: '#5b3cc2', spec: 0.62, specSize: 0.968, rim: 0.5, rimColor: '#ffd9f4', edge: 0.3 }, F),
      outline: '#0e0d15',
      screen: { w: sw, h: sh, r: 0.2, y: sy, face: { tint: '#0b0918', glow: '#b58cff', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    5.2,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // marquee bulbs round the screen, chasing like the sign over a stage door
  const path = roundedRectShape(sw + 0.16, sh + 0.15, 0.22).getSpacedPoints(24).slice(0, 24);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.031, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), path.length);
  const M = new THREE.Matrix4();
  path.forEach((pt, i) => {
    M.makeTranslation(pt.x, pt.y + sy, head.frontAt(pt.x, pt.y + sy) + 0.014);
    bulbs.setMatrixAt(i, M);
  });
  const ON = new THREE.Color('#fff4d2');
  const OFF = new THREE.Color('#b99a6a');
  const C = new THREE.Color();
  pivot.add(bulbs);

  // a gold star on a stalk: the talent is always on stage
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.2, 10), toon({ color: '#2a2733', shade: '#5c5974' }));
  addOutline(stalk, { color: '#0e0d15', thickness: 2 });
  stalk.position.set(0, b + 0.06, -0.06);
  const star = goldStar(0.15, 0.066, 0.05);
  const starPivot = new THREE.Group();
  starPivot.position.set(0, b + 0.24, -0.06);
  starPivot.add(star);
  pivot.add(stalk, starPivot);

  // two little stage lights for ears
  const lamp = { r: 0.2, depth: 0.18, color: role(F, '#2a2733', (f) => f.trim), shade: role(F, '#57547a', (f) => f.trimShade), cap: '#3a3748', capR: 0.14, ring: '#ffe9a8', ringGlow: true, ringR: 0.11 };
  const right = earPod(lamp);
  right.position.set(a * 0.95, 0.02, -0.04);
  const left = earPod(lamp);
  left.scale.x = -1;
  left.position.set(-a * 0.95, 0.02, -0.04);
  pivot.add(right, left);

  const update = (_dt: number, t: number) => {
    const step = Math.floor(t * 5);
    for (let i = 0; i < path.length; i++) {
      C.copy((i + step) % 3 === 0 ? ON : OFF);
      bulbs.setColorAt(i, C);
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    starPivot.rotation.y = Math.sin(t * 0.9) * 0.5;
    starPivot.rotation.z = Math.sin(t * 1.3) * 0.08;
  };
  update(0, 0);

  return makeShell(
    { id: 'twitch-mod', name: 'Stage Door', role: 'Twitch chat moderator', accent: '#a970ff', asks: 'Allow, hold, or deny?' },
    { pivot, face: head.face, width: 2 * a + 0.36, height: 2 * b + 0.5, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.02, 0.12), width: 0.62 } },
  );
}

// ─── Field Marshal — Screeps colony strategy: a crested bronze helmet ───

export function createFieldMarshal(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.76, b = 0.66, c = 0.58, n = 2.7;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({
        color: '#dc9a45',
        shade: '#8e4f2d',
        spec: 0.85,
        specSize: 0.964,
        rim: 0.5,
        rimColor: '#ffe2b0',
        edge: 0.3,
        seams: [[0, 1, 0, 0.47]],
        seamWidth: 0.008,
        seamDark: 0.35,
      }, F),
      outline: '#0e0d15',
      screen: { w: 1.06, h: 0.7, r: 0.18, y: -0.05, face: { tint: '#0c0a12', glow: '#ffb35c', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    6.4,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // the crest: a red crescent plume from brow to nape
  const outer = { rx: 0.66, ry: b + 0.36 };
  const inner = { rx: 0.52, ry: b - 0.02 };
  const crest = new THREE.Shape();
  const A0 = 0.2, A1 = Math.PI - 0.12;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = A0 + ((A1 - A0) * i) / steps;
    const x = Math.cos(t) * outer.rx, y = Math.sin(t) * outer.ry;
    if (i === 0) crest.moveTo(x, y);
    else crest.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const t = A0 + ((A1 - A0) * i) / steps;
    crest.lineTo(Math.cos(t) * inner.rx, Math.sin(t) * inner.ry);
  }
  crest.closePath();
  const crestGeo = new THREE.ExtrudeGeometry(crest, { depth: 0.11, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 12 });
  crestGeo.translate(0, 0, -0.055);
  crestGeo.rotateY(-Math.PI / 2); // the crescent runs front (brow) to back (nape)
  const crestRed = !F || F.id !== 'cherry';
  const crestMesh = new THREE.Mesh(crestGeo, toon({ color: crestRed ? '#e5463d' : '#f6f1ec', shade: crestRed ? '#8f2138' : '#bfaec8', spec: 0.5, specSize: 0.95, rim: 0.5, rimColor: '#ffd0c4' }));
  addOutline(crestMesh, { color: '#0e0d15', thickness: 2.4 });
  crestMesh.position.set(0, -0.06, -0.02);
  pivot.add(crestMesh);

  // a rank star on the brow
  const badge = goldStar(0.075, 0.033, 0.03);
  badge.position.set(0, 0.47, head.frontAt(0, 0.47) + 0.02);
  pivot.add(badge);

  // cheek guards
  const guardMat = F ? toon(paintBody({ color: '#c9853a', shade: '#7d4327', spec: 0.7, specSize: 0.96 }, F)) : toon({ color: '#c9853a', shade: '#7d4327', spec: 0.7, specSize: 0.96 });
  for (const side of [1, -1]) {
    const g = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.34, 0.3, 2, 0.045), guardMat);
    addOutline(g, { color: '#0e0d15', thickness: 2.2 });
    g.position.set(side * (a + 0.02), -0.12, 0.02);
    g.rotation.z = side * 0.12;
    pivot.add(g);
  }

  return makeShell(
    { id: 'screeps-general', name: 'Field Marshal', role: 'Strategy for Screeps', accent: '#f2a541', asks: 'Expand, defend, or build up?' },
    { pivot, face: head.face, width: 2 * a + 0.2, height: 2 * b + 0.42, materials: collectToon(pivot), screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.3, -0.02), width: 0.5 } },
  );
}

// ─── Stamp — GitHub triage: a rubber stamp that labels and assigns ──────

export function createStamp(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.74, b = 0.54, c = 0.56, n = 4;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#f5efe4', shade: '#b3a9cf', spec: 0.55, specSize: 0.968, rim: 0.5, rimColor: '#fff0dc', edge: 0.3, seams: [[0, 1, 0, -b * 0.62]], seamWidth: 0.007, seamDark: 0.3 }, F),
      outline: '#0e0d15',
      screen: { w: 1.1, h: 0.66, r: 0.16, y: 0.04, face: { tint: '#0b0a16', glow: '#9d8dff', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    4.4,
  );
  const pivot = new THREE.Group();
  const body = new THREE.Group();
  pivot.add(body);
  body.add(head.group);

  // the rubber: a violet ink pad under the block
  const inkC = role(F, '#6d5dfc', (f) => (f.accent === '#2a2733' || f.accent === '#23263a' ? '#6d5dfc' : f.accent));
  const pad = new THREE.Mesh(new RoundedBoxGeometry(2 * a * 0.94, 0.12, 2 * c * 0.9, 3, 0.04), toon({ color: inkC, shade: role(F, '#3a2c9c', (f) => (inkC === f.accent ? f.accentShade : '#3a2c9c')), spec: 0.4, specSize: 0.95 }));
  addOutline(pad, { color: '#0e0d15', thickness: 2.3 });
  pad.position.set(0, -b - 0.03, -0.02);
  body.add(pad);

  // the knob on its neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.16, 16), toon({ color: '#2a2733', shade: '#5c5974', spec: 0.4 }));
  addOutline(neck, { color: '#0e0d15', thickness: 2.2 });
  neck.position.set(0, b + 0.05, -0.04);
  const knobGeo = new THREE.SphereGeometry(0.2, 28, 18);
  knobGeo.scale(1, 0.82, 1);
  const knob = new THREE.Mesh(knobGeo, toon({ color: role(F, '#8b7bff', () => inkC), shade: role(F, '#4a38b8', (f) => (inkC === f.accent ? f.accentShade : '#4a38b8')), spec: 0.9, specSize: 0.962, rim: 0.5, rimColor: '#e8e0ff' }));
  addOutline(knob, { color: '#0e0d15', thickness: 2.4 });
  knob.position.set(0, b + 0.27, -0.04);
  body.add(neck, knob);

  // every few seconds it stamps: a quick press and recoil
  const update = (_dt: number, t: number) => {
    const k = t % 3.4;
    const press = k < 0.22 ? Math.sin((k / 0.22) * Math.PI) : 0;
    body.position.y = -press * 0.06;
    body.scale.set(1 + press * 0.03, 1 - press * 0.05, 1 + press * 0.03);
  };

  return makeShell(
    { id: 'pr-triage', name: 'Stamp', role: 'GitHub triage', accent: '#8b7bff', asks: 'Which label, and who reviews?' },
    { pivot, face: head.face, width: 2 * a + 0.1, height: 2 * b + 0.62, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.43, -0.04), width: 0.36 } },
  );
}

// ─── Homebody — Home Assistant routines: a little house ─────────────────

export function createHomebody(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.74, b = 0.54, c = 0.56, n = 3.6;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#f8f1e4', shade: '#b0a8d6', spec: 0.5, specSize: 0.968, rim: 0.5, rimColor: '#ffe9d6', edge: 0.3 }, F),
      outline: '#0e0d15',
      screen: { w: 1.04, h: 0.64, r: 0.15, y: -0.06, face: { tint: '#0a0d14', glow: '#5ee6c8', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    9.1,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // the roof: a rounded teal gable
  const roofGeo = new THREE.ExtrudeGeometry(roundedTriangleShape(2 * a + 0.3, 0.6, 0.07), { depth: 2 * c * 0.92, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 });
  roofGeo.translate(0, 0, -c * 0.92);
  // the roof keeps its teal unless the body is already teal-ish; then it goes terracotta
  const roofC = F && F.id === 'mint' ? '#e27a4e' : '#26c4a6';
  const roof = new THREE.Mesh(roofGeo, toon({ color: roofC, shade: roofC === '#26c4a6' ? '#12716e' : '#8f3f2e', spec: 0.6, specSize: 0.964, rim: 0.5, rimColor: '#d6fff5' }));
  addOutline(roof, { color: '#0e0d15', thickness: 2.5 });
  roof.position.set(0, b - 0.16, -0.02);
  pivot.add(roof);

  // chimney with a puff of smoke
  const chimney = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.3, 0.16, 2, 0.03), toon({ color: '#e27a4e', shade: '#8f3f2e', spec: 0.3 }));
  addOutline(chimney, { color: '#0e0d15', thickness: 2.2 });
  chimney.position.set(0.44, b + 0.2, -0.12);
  pivot.add(chimney);
  const puffMat = toon({ color: '#ffffff', shade: '#c9c9e6', rim: 0.3 });
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), puffMat);
    addOutline(m, { color: '#0e0d15', thickness: 1.8 });
    puffs.push(m);
    pivot.add(m);
  }

  const update = (_dt: number, t: number) => {
    puffs.forEach((m, i) => {
      const k = (t * 0.32 + i / 3) % 1;
      m.position.set(0.44 + Math.sin(k * 5 + i) * 0.05 + k * 0.08, b + 0.38 + k * 0.42, -0.12);
      m.scale.setScalar(Math.sin(k * Math.PI) * (0.6 + k * 0.7) + 0.001);
    });
  };
  update(0, 0);

  return makeShell(
    { id: 'homebody', name: 'Homebody', role: 'Smart-home routines', accent: '#22c1a4', asks: 'Lights, heat, or leave it?' },
    { pivot, face: head.face, width: 2 * a + 0.34, height: 2 * b + 0.72, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.44, 0.0), width: 0.3 } },
  );
}
