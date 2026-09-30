import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { bevelPuck, fixLatheSeam, rng, roundedRectShape } from '../geometry';
import { canvas, canvasTexture } from '../textures';
import { Face as FaceCtor, faceMaterial } from '../face';
import { addOutline, toon, type ToonOptions } from '../toon';
import { buildHead, collectToon, glowMaterial, makeShell, surfaceNormal, surfacePoint, type Shell } from './common';
import { body as paintBody, finishOf, role, type Finish, type FinishId } from '../../paint';

/*
  The Toybox: ten more Slop shells in JevBot's toy language.

  Every one keeps the same contract as the originals:
   - a big, clearly framed glass (rounded rect or circle) where Flutter paints
     the living face, never covered by anything in front of it;
   - a clean, flat-ish crown seat on top (`anchors.top`) with nothing spiky
     where the crown sits: antennas, handles, spikes and toast sit behind or
     beside the seat;
   - the three paint roles (body / accent / trim) so every finish repaints it,
     plus a signature paint job of its own.
*/

const INK = '#0e0d15';
const UP = new THREE.Vector3(0, 1, 0);
/** Finishes whose accent is the dark ink (the part would vanish into the trim). */
const inkAccent = (f: Finish) => f.accent === '#2a2733' || f.accent === '#23263a';
/** Near-white bodies (a white part on them needs to swap to a colour). */
const whiteBody = (f: Finish) => ['pearl', 'matte', 'chrome', 'holo'].includes(f.id);

function outlined<T extends THREE.Mesh>(m: T, thickness = 2.3, smooth = false): T {
  addOutline(m, { color: INK, thickness, smooth });
  return m;
}

/** A secondary paint role: the finish's accent (or `fallback` when the accent is ink). */
function accentPaint(F: Finish | null, sig: ToonOptions, fallback?: Partial<ToonOptions>): ToonOptions {
  if (!F) return sig;
  if (inkAccent(F) && fallback) return { ...sig, ...fallback };
  return { ...sig, color: F.accent, shade: F.accentShade, rimColor: F.accentRim };
}

/** Dark hardware (decks, sockets, speaker rims). */
function trimPaint(F: Finish | null, sig: ToonOptions): ToonOptions {
  return F ? { ...sig, color: F.trim, shade: F.trimShade } : sig;
}

const CHROME_ENV = { sky: '#a6c6ff', horizon: '#f6f8ff', dark: '#1d2142', ground: '#e8b9a8' };
const GOLD_ENV = { sky: '#ffe9a8', horizon: '#fff8e6', dark: '#5a3a12', ground: '#d8914a' };
/** Polished metal hardware: silver, or gold on the gold finish. */
function metal(F: Finish | null, extra: ToonOptions = {}) {
  const gold = F?.id === 'gold';
  return toon({ color: gold ? '#ffd06a' : '#ffffff', shade: gold ? '#c79a6a' : '#a3a1d6', chrome: gold ? GOLD_ENV : CHROME_ENV, spec: 0.9, specSize: 0.972, rim: 0.45, rimColor: '#ffe0ee', edge: 0.25, edgeColor: '#ffffff', ...extra });
}

/** A glowing dot (LEDs, bulbs, spots): unlit, with a soft additive halo. */
function led(color: THREE.ColorRepresentation, r: number, halo = 2.4) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const dot = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
  g.add(dot);
  if (halo > 0) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(r * halo, 24), glowMaterial(color, 0.55, 'ring', 0.0, 0.55));
    h.position.z = -0.001;
    g.add(h);
  }
  return { group: g, mat };
}

/** Orient `obj` so its +z faces `normal` (a sticker flush on a surface). */
function faceAlong(obj: THREE.Object3D, normal: THREE.Vector3) {
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
}

// ─── Coin-Op — a stand-up arcade cabinet ────────────────────────────────

function marqueeTexture() {
  const { c, ctx } = canvas(512, 128);
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#ff4fb8');
  g.addColorStop(0.5, '#ffb347');
  g.addColorStop(1, '#4fd8ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  // sunset stripes
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < 4; i++) ctx.fillRect(0, 74 + i * 14, 512, 5 - i);
  // three chunky chevrons, no words: it reads as "arcade" at any size
  ctx.fillStyle = '#fffbe8';
  for (const x of [196, 256, 316]) {
    ctx.beginPath();
    ctx.moveTo(x - 26, 30);
    ctx.lineTo(x, 58);
    ctx.lineTo(x + 26, 30);
    ctx.lineTo(x + 26, 50);
    ctx.lineTo(x, 78);
    ctx.lineTo(x - 26, 50);
    ctx.closePath();
    ctx.fill();
  }
  // twinkles
  ctx.fillStyle = '#ffffff';
  for (const [x, y, s] of [[60, 36, 9], [110, 88, 6], [420, 40, 8], [470, 86, 6]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2);
    ctx.lineTo(x + s * 0.5, y - s * 0.5);
    ctx.lineTo(x + s * 2, y);
    ctx.lineTo(x + s * 0.5, y + s * 0.5);
    ctx.lineTo(x, y + s * 2);
    ctx.lineTo(x - s * 0.5, y + s * 0.5);
    ctx.lineTo(x - s * 2, y);
    ctx.lineTo(x - s * 0.5, y - s * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  return canvasTexture(c);
}

export function createCoinOp(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.66, b = 0.58, c = 0.46, n = 5;
  const head = buildHead(
    {
      a, b, c, n,
      flat: 0.92,
      dome: 0.12,
      body: paintBody({ color: '#e2408f', shade: '#8a3ab8', spec: 0.64, specSize: 0.968, rim: 0.5, rimColor: '#ffd6f0', edge: 0.3, seams: [[0, 0, 1, c * 0.32]], seamWidth: 0.006, seamDark: 0.3 }, F),
      outline: INK,
      screen: { w: 1.06, h: 0.8, r: 0.13, y: 0.02, face: { tint: '#0b0816', glow: '#ff6fd8', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    12.3,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  const trim = toon(trimPaint(F, { color: '#221c33', shade: '#5a5278', spec: 0.55, specSize: 0.96, rim: 0.4, rimColor: '#ffd6f0' }));

  // the marquee: an overhanging lit sign box (its flat top is the crown seat)
  const mq = new THREE.Group();
  const box = outlined(new THREE.Mesh(new RoundedBoxGeometry(1.46, 0.34, 1.02, 3, 0.09), trim), 2.5);
  mq.add(box);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.22), new THREE.MeshBasicMaterial({ map: marqueeTexture(), toneMapped: false }));
  sign.position.z = 0.512;
  mq.add(sign);
  const signGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), glowMaterial('#ffb0e0', 0.35, 'band'));
  signGlow.position.z = 0.515;
  mq.add(signGlow);
  mq.position.set(0, b + 0.13, 0.03);
  pivot.add(mq);

  // the control deck: a sloped ledge with a stick and three buttons
  const deck = new THREE.Group();
  const ledge = outlined(new THREE.Mesh(new RoundedBoxGeometry(1.46, 0.2, 0.52, 3, 0.07), trim), 2.4);
  deck.add(ledge);
  const stick = new THREE.Group();
  const shaft = outlined(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.2, 12), metal(F)), 2);
  shaft.position.y = 0.1;
  const ballMat = toon(accentPaint(F, { color: '#ffd23f', shade: '#d8843f', spec: 0.9, specSize: 0.95, rim: 0.5, rimColor: '#fff2c4' }, { color: F?.led ?? '#ffd23f', shade: '#8a88b2' }));
  const ball = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), ballMat), 2.3);
  ball.position.y = 0.22;
  const base = outlined(new THREE.Mesh(bevelPuck(0.08, 0.03, 0.012, 24, 2), trim), 1.8);
  stick.add(base, shaft, ball);
  stick.position.set(-0.4, 0.1, 0.02);
  deck.add(stick);
  const btnColors = ['#4fd8ff', '#ffd23f', '#ff4f7a'];
  const btnMats: THREE.ShaderMaterial[] = [];
  btnColors.forEach((col, i) => {
    const m = toon({ color: col, shade: '#6a5cc8', spec: 0.8, specSize: 0.95, rim: 0.4, rimColor: '#ffffff' });
    btnMats.push(m);
    const btn = outlined(new THREE.Mesh(bevelPuck(0.062, 0.05, 0.02, 24, 3), m), 2);
    btn.position.set(0.1 + i * 0.16, 0.115, 0.04 - (i === 1 ? 0.06 : 0));
    deck.add(btn);
  });
  deck.position.set(0, -b + 0.02, c - 0.06);
  deck.rotation.x = 0.32;
  pivot.add(deck);

  // plinth with two glowing coin slots
  const plinth = outlined(new THREE.Mesh(new RoundedBoxGeometry(1.24, 0.17, 0.84, 3, 0.05), trim), 2.4);
  plinth.position.set(0, -b - 0.12, -0.02);
  pivot.add(plinth);
  for (const x of [-0.16, 0.16]) {
    const slot = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.07, 4, 10), new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false }));
    slot.position.set(x, -b - 0.12, 0.401);
    pivot.add(slot);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), glowMaterial('#ffb347', 0.5, 'band'));
    halo.rotation.z = Math.PI / 2;
    halo.position.set(x, -b - 0.12, 0.405);
    pivot.add(halo);
  }

  const update = (_dt: number, t: number) => {
    stick.rotation.z = Math.sin(t * 3.1) * 0.18;
    stick.rotation.x = Math.sin(t * 2.3 + 1) * 0.12;
    const hit = Math.floor(t * 2.2) % 3;
    btnMats.forEach((m, i) => (m.uniforms.uFlash.value = i === hit ? 0.35 : 0));
  };
  update(0, 0);

  return makeShell(
    { id: 'coin-op', name: 'Coin-Op', role: 'Arcade cabinet', accent: '#ff4fb8', asks: 'Insert coin, or one more go?' },
    { pivot, face: head.face, width: 1.5, height: 2 * b + 0.56, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.3, 0.06), up: UP.clone(), width: 0.92 } },
  );
}

// ─── Bassline — a boombox with two big breathing speakers ───────────────

export function createBassline(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 1.04, b = 0.58, c = 0.44, n = 4.2;
  const sy = 0.0;
  const head = buildHead(
    {
      a, b, c, n,
      flat: 0.9,
      dome: 0.15,
      body: paintBody({ color: '#20c0b2', shade: '#3a6fb0', spec: 0.64, specSize: 0.968, rim: 0.5, rimColor: '#d6fff8', edge: 0.3, seams: [[0, 0, 1, c * 0.3]], seamWidth: 0.006, seamDark: 0.3 }, F),
      outline: INK,
      screen: { w: 0.84, h: 0.7, r: 0.15, y: sy, face: { tint: '#08100f', glow: '#4fe8d0', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    3.9,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  const trim = toon(trimPaint(F, { color: '#1d2130', shade: '#555a7a', spec: 0.5, specSize: 0.96, rim: 0.35, rimColor: '#d6fff8' }));
  const coneMat = toon(accentPaint(F, { color: '#ff7a6b', shade: '#b04a78', spec: 0.45, specSize: 0.95, rim: 0.45, rimColor: '#ffe0d8' }, { color: '#f4f1ec', shade: '#9a98c4', rimColor: '#ffffff' }));
  const capMat = toon(trimPaint(F, { color: '#2a2733', shade: '#5c5974', spec: 0.8, specSize: 0.95 }));

  // speakers: a grille ring, a dished cone and a dust cap that thump on the beat
  const cones: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const x = side * 0.715;
    const spk = new THREE.Group();
    const z = head.frontAt(x, sy);
    spk.position.set(x, sy, z - 0.005);
    spk.rotation.y = side * 0.16;
    const ring = outlined(new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.042, 12, 48), trim), 2);
    spk.add(ring);
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const r = 0.235 * (1 - i / 8);
      pts.push(new THREE.Vector2(r, -0.05 * Math.sin((i / 8) * Math.PI * 0.5)));
    }
    const coneGeo = new THREE.LatheGeometry(pts.reverse(), 40);
    coneGeo.rotateX(Math.PI / 2);
    coneGeo.computeVertexNormals();
    const cone = new THREE.Group();
    const dish = new THREE.Mesh(coneGeo, coneMat);
    const dust = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat), 1.8);
    dust.rotation.x = Math.PI / 2;
    dust.position.z = -0.045;
    cone.add(dish, dust);
    cone.position.z = 0.01;
    spk.add(cone);
    cones.push(cone);
    pivot.add(spk);
  }

  // an LED level meter under the glass
  const bars: THREE.Mesh[] = [];
  const barMat = new THREE.MeshBasicMaterial({ color: role(F, '#ffe24f', (f) => f.led), toneMapped: false });
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.08), barMat);
    const x = -0.24 + i * 0.08;
    m.position.set(x, -0.45, head.frontAt(x, -0.45) + 0.004);
    bars.push(m);
    pivot.add(m);
  }

  // tape-deck keys along the top front edge
  const keyMat = toon(accentPaint(F, { color: '#ffd23f', shade: '#d8843f', spec: 0.6, specSize: 0.95, rim: 0.4, rimColor: '#fff2c4' }, { color: F?.led ?? '#ffd23f', shade: '#8a88b2' }));
  for (let i = 0; i < 4; i++) {
    const k = outlined(new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.07, 0.12, 2, 0.025), i === 1 ? trim : keyMat), 1.8);
    k.position.set(-0.78 + i * 0.16, b - 0.02, 0.2);
    pivot.add(k);
  }

  // the carry handle, folded back so the top stays a clean seat
  const handle = new THREE.Group();
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.62, 0, 0),
    new THREE.Vector3(-0.56, 0.2, 0),
    new THREE.Vector3(-0.36, 0.28, 0),
    new THREE.Vector3(0.36, 0.28, 0),
    new THREE.Vector3(0.56, 0.2, 0),
    new THREE.Vector3(0.62, 0, 0),
  ]);
  const bar = outlined(new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.045, 12, false), trim), 2.3);
  handle.add(bar);
  handle.position.set(0, b - 0.05, -0.18);
  handle.rotation.x = -1.18;
  pivot.add(handle);
  for (const side of [-1, 1]) {
    const mount = outlined(new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.1, 0.16, 2, 0.03), trim), 2);
    mount.position.set(side * 0.62, b - 0.03, -0.18);
    pivot.add(mount);
  }

  // a telescopic antenna off the back corner (beside the seat, never on it)
  const ant = new THREE.Group();
  const rod = outlined(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.022, 0.5, 8), metal(F)), 1.6);
  rod.position.y = 0.25;
  const tip = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), metal(F)), 1.6);
  tip.position.y = 0.51;
  ant.add(rod, tip);
  ant.position.set(0.8, b - 0.06, -0.26);
  ant.rotation.z = -0.36;
  pivot.add(ant);

  const update = (_dt: number, t: number) => {
    const beat = (t * 2.1) % 1;
    const thump = Math.exp(-beat * 9);
    for (const cn of cones) cn.position.z = 0.01 + thump * 0.035;
    bars.forEach((m, i) => {
      const h = 0.35 + 0.65 * Math.abs(Math.sin(t * 5.3 + i * 1.7)) * (0.5 + thump * 0.5);
      m.scale.y = h;
      m.position.y = -0.45 - (1 - h) * 0.04;
    });
    ant.rotation.x = Math.sin(t * 1.4) * 0.04;
  };
  update(0, 0);

  return makeShell(
    { id: 'bassline', name: 'Bassline', role: 'Boombox', accent: '#20c0b2', asks: 'Drop it, loop it, or skip?' },
    { pivot, face: head.face, width: 2 * a + 0.12, height: 2 * b + 0.3, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.01, 0.08), up: UP.clone(), width: 0.86 } },
  );
}

// ─── Saucer — a little flying saucer with a tractor beam ────────────────

export function createSaucer(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.64, b = 0.58, c = 0.58, n = 2.1;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#9df05a', shade: '#3f9e8a', spec: 0.7, specSize: 0.97, rim: 0.55, rimColor: '#f0ffd6', seams: [[0, 0, 1, c * 0.3]], seamWidth: 0.006, seamDark: 0.25 }, F),
      outline: INK,
      screen: { w: 0.94, h: 0.62, r: 0.22, y: 0.1, face: { tint: '#07120a', glow: '#8cff6a', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    7.1,
  );
  const pivot = new THREE.Group();
  const hover = new THREE.Group();
  pivot.add(hover);
  hover.add(head.group);

  // the saucer: a lens-shaped disc round the dome's waist
  const ringMat = toon(accentPaint(F, { color: '#b9a8ff', shade: '#5a48c8', spec: 0.85, specSize: 0.965, rim: 0.55, rimColor: '#ffe8ff', edge: 0.3 }, F && inkAccent(F) ? { color: '#e8e6f2', shade: '#8a88b2', rimColor: '#ffffff' } : undefined));
  const R = 1.08;
  const prof: [number, number][] = [
    [0.001, -0.2],
    [0.42, -0.19],
    [0.8, -0.12],
    [1.0, -0.05],
    [R, 0.0],
    [R - 0.02, 0.04],
    [0.9, 0.1],
    [0.58, 0.16],
    [0.001, 0.18],
  ];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const discGeo = new THREE.LatheGeometry(pts, 72);
  discGeo.computeVertexNormals();
  fixLatheSeam(discGeo, pts.length, 72);
  const disc = outlined(new THREE.Mesh(discGeo, ringMat), 2.5);
  const saucer = new THREE.Group();
  saucer.add(disc);
  const band = new THREE.Mesh(new THREE.TorusGeometry(R - 0.005, 0.03, 8, 96), toon(trimPaint(F, { color: '#2a2440', shade: '#5c5a90', spec: 0.6 })));
  band.rotation.x = Math.PI / 2;
  saucer.add(band);

  // chasing lights round the top of the rim
  const N = 14;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.048, 14, 10), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  const M = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    M.makeTranslation(Math.cos(ang) * 0.9, 0.1, Math.sin(ang) * 0.9);
    bulbs.setMatrixAt(i, M);
  }
  saucer.add(bulbs);
  saucer.position.y = -0.42;
  hover.add(saucer);
  // a glowing seam where the dome sits in the disc
  const seamY = -0.235;
  const seamR = a * Math.pow(1 - Math.pow(Math.abs(seamY) / b, n), 1 / n) + 0.01;
  const seam = new THREE.Mesh(new THREE.TorusGeometry(seamR, 0.026, 8, 72), new THREE.MeshBasicMaterial({ color: role(F, '#e6ff9a', (f) => f.led), toneMapped: false }));
  seam.rotation.x = Math.PI / 2;
  seam.position.y = seamY;
  hover.add(seam);

  // the tractor beam: a lit hatch underneath and a soft cone of light
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: role(F, '#d8ff9a', (f) => f.led), toneMapped: false }));
  hatch.rotation.x = Math.PI / 2;
  hatch.position.y = -0.622;
  hover.add(hatch);

  const ON = new THREE.Color(role(F, '#ffe24f', (f) => f.led));
  const OFF = new THREE.Color('#8a7a5a');
  const C = new THREE.Color();
  const update = (_dt: number, t: number) => {
    const step = Math.floor(t * 6);
    for (let i = 0; i < N; i++) {
      C.copy((i + step) % 2 === 0 ? ON : OFF);
      bulbs.setColorAt(i, C);
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    saucer.rotation.y = t * 0.35;
    hover.position.y = Math.sin(t * 1.6) * 0.02;
  };
  update(0, 0);

  return makeShell(
    { id: 'saucer', name: 'Saucer', role: 'Flying saucer', accent: '#9df05a', asks: 'Beam it up, or leave it be?' },
    { pivot, face: head.face, width: 2 * R, height: 2 * b + 0.4, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b, 0.02), up: UP.clone(), width: 0.84 } },
  );
}

// ─── Gumdrop — a gumball machine: a glass globe of sweets on a coin base ─

export function createGumdrop(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.66, b = 0.5, c = 0.52, n = 3.0;
  const baseY = -0.3;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#ef3346', shade: '#9a2a6a', spec: 0.7, specSize: 0.968, rim: 0.55, rimColor: '#ffd6e0', edge: 0.3, seams: [[0, 1, 0, -b * 0.66]], seamWidth: 0.007, seamDark: 0.3 }, F),
      outline: INK,
      screen: { w: 1.02, h: 0.64, r: 0.16, y: 0.04, face: { tint: '#140709', glow: '#ff6f8a', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    9.9,
  );
  head.group.position.y = baseY;
  const pivot = new THREE.Group();
  pivot.add(head.group);

  const chrome = metal(F);
  // collar between base and globe
  const collar = outlined(new THREE.Mesh(bevelPuck(0.4, 0.12, 0.04, 40, 3), chrome), 2.3);
  collar.position.y = baseY + b + 0.02;
  pivot.add(collar);

  // the globe: sweets inside, clear glass over them
  const gR = 0.4;
  const gY = baseY + b + 0.37;
  const rand = rng(21);
  const sweets = ['#ff4f7a', '#ffd23f', '#4fd8ff', '#7df36a', '#b58cff', '#ff9a3c', '#ffffff'];
  const balls: THREE.Vector3[] = [];
  for (let tries = 0; tries < 600 && balls.length < 34; tries++) {
    const p = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).multiplyScalar(gR - 0.1);
    if (p.length() > gR - 0.1) continue;
    if (p.y > 0.12) continue; // a machine two-thirds full
    if (balls.some((q) => q.distanceTo(p) < 0.13)) continue;
    balls.push(p);
  }
  const ballMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 16, 12), toon({ color: '#ffffff', shade: '#9a8ac8', spec: 0.8, specSize: 0.94, rim: 0.3 }), balls.length);
  const M = new THREE.Matrix4();
  const C = new THREE.Color();
  balls.forEach((p, i) => {
    M.makeTranslation(p.x, p.y + gY, p.z);
    ballMesh.setMatrixAt(i, M);
    ballMesh.setColorAt(i, C.set(sweets[i % sweets.length]));
  });
  addOutline(ballMesh, { color: INK, thickness: 1.4 });
  pivot.add(ballMesh);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(gR, 48, 32),
    toon({ color: '#eef6ff', shade: '#a8b8ff', transparent: true, opacity: 0.2, spec: 0.95, specSize: 0.955, rim: 0.8, rimColor: '#ffffff', edge: 0.6 }),
  );
  glass.position.y = gY;
  glass.renderOrder = 5;
  (glass.material as THREE.ShaderMaterial).depthWrite = true;
  // the ink hull would fill the clear globe with ink from behind: draw it after the
  // glass (transparent pass, same shared uniforms) so only the silhouette survives
  const hull = addOutline(glass, { color: INK, thickness: 2.4 });
  const shared = hull.material as THREE.ShaderMaterial;
  const late = shared.clone();
  late.uniforms = shared.uniforms;
  late.transparent = true;
  hull.material = late;
  hull.renderOrder = 6;
  pivot.add(glass);
  // chrome cap (a low, flat crown seat)
  const cap = outlined(new THREE.Mesh(bevelPuck(0.2, 0.08, 0.035, 36, 3), chrome), 2.2);
  cap.position.y = gY + gR - 0.01;
  pivot.add(cap);

  // the twist knob and the candy chute under the glass
  const knob = new THREE.Group();
  const plate = outlined(new THREE.Mesh(bevelPuck(0.11, 0.05, 0.02, 32, 2), chrome), 2);
  plate.rotation.x = Math.PI / 2;
  const grip = outlined(new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.05, 0.05, 2, 0.02), chrome), 2);
  grip.position.z = 0.04;
  knob.add(plate, grip);
  knob.position.set(0, baseY - 0.375, head.frontAt(0, -0.375) + 0.01);
  pivot.add(knob);

  // a sweet rolls out of the chute now and then
  const update = (_dt: number, t: number) => {
    const k = t % 4.2;
    grip.rotation.z = k < 0.5 ? (k / 0.5) * Math.PI : Math.PI;
  };
  update(0, 0);

  const top = gY + gR + 0.03;
  return makeShell(
    { id: 'gumdrop', name: 'Gumdrop', role: 'Gumball machine', accent: '#ef3346', asks: 'One more sweet, or save it?' },
    { pivot, face: head.face, width: 2 * a + 0.1, height: top - (baseY - b), materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, top, 0), up: UP.clone(), width: 0.7 } },
  );
}

// ─── Liftoff — a toy rocket with a porthole screen ──────────────────────

function finShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.36);
  s.quadraticCurveTo(0.12, 0.08, 0.3, -0.12);
  s.quadraticCurveTo(0.38, -0.22, 0.34, -0.34);
  s.quadraticCurveTo(0.3, -0.4, 0.2, -0.36);
  s.lineTo(0, -0.26);
  s.closePath();
  return s;
}

export function createLiftoff(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.62, b = 0.66, c = 0.62, n = 2.25;
  const sr = 0.43;
  const sy = -0.04;
  const head = buildHead(
    {
      a, b, c, n,
      flat: 0.8,
      dome: 0.3,
      body: paintBody({ color: '#f5f1ea', shade: '#a9a4d8', spec: 0.7, specSize: 0.968, rim: 0.55, rimColor: '#ffe6dc', edge: 0.3 }, F),
      outline: INK,
      screen: { w: 2 * sr, h: 2 * sr, r: sr, y: sy, face: { shape: 'circle', tint: '#070b18', glow: '#6fb8ff', amp: 0.085, width: 0.02, glowSize: 0.024 } },
    },
    4.8,
  );
  head.screenSpec.shape = 'circle';
  const pivot = new THREE.Group();
  const ship = new THREE.Group();
  pivot.add(ship);
  ship.add(head.group);

  const red = toon(accentPaint(F, { color: '#ff5438', shade: '#b2385a', spec: 0.7, specSize: 0.966, rim: 0.5, rimColor: '#ffd6c8', edge: 0.3 }, F?.chrome ? { color: '#2a2733', shade: '#5c5974', rimColor: '#cfd6ff' } : { color: F?.led ?? '#ff5438', shade: '#8a88b2' }));

  // a blunt, rounded nose (a flat-ish crown seat, never a spike)
  const noseY = b * 0.72;
  const halfW = a * Math.pow(1 - Math.pow(noseY / b, n), 1 / n);
  const prof: [number, number][] = [];
  const r0 = halfW + 0.02;
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    prof.push([r0 * (1 - 0.6 * Math.pow(k, 1.5)), k * 0.4]);
  }
  const topR = prof[prof.length - 1][0];
  for (let i = 1; i <= 6; i++) {
    const t = (i / 6) * (Math.PI / 2);
    prof.push([topR * Math.cos(t), 0.4 + Math.sin(t) * 0.1]);
  }
  prof[prof.length - 1][0] = 0.001;
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const noseGeo = new THREE.LatheGeometry(pts, 56);
  noseGeo.computeVertexNormals();
  fixLatheSeam(noseGeo, pts.length, 56);
  const nose = outlined(new THREE.Mesh(noseGeo, red), 2.4);
  nose.position.y = noseY - 0.03;
  ship.add(nose);
  const collarRing = outlined(new THREE.Mesh(new THREE.TorusGeometry(r0 - 0.005, 0.035, 10, 56), metal(F)), 2);
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.y = noseY - 0.03;
  ship.add(collarRing);

  // the porthole: a bolted ring that follows the hull's curve
  const ring: THREE.Vector3[] = [];
  const pr = sr + 0.045;
  for (let i = 0; i < 64; i++) {
    const ang = (i / 64) * Math.PI * 2;
    const x = Math.cos(ang) * pr, y = sy + Math.sin(ang) * pr;
    ring.push(new THREE.Vector3(x, y, head.frontAt(x, y) + 0.012));
  }
  const bezel = outlined(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 128, 0.04, 10, true), metal(F)), 2.2);
  ship.add(bezel);

  // three fins and the engine bell
  const finGeo = new THREE.ExtrudeGeometry(finShape(), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 12 });
  finGeo.translate(0, 0, -0.03);
  for (const [ang, x, z] of [[0, 1, 0], [Math.PI, -1, 0], [Math.PI / 2, 0, -1]] as const) {
    const fin = outlined(new THREE.Mesh(finGeo, red), 2.3);
    fin.rotation.y = ang === Math.PI / 2 ? Math.PI / 2 : 0;
    fin.scale.x = x < 0 ? -1 : 1;
    fin.position.set(x * (a - 0.1), -b * 0.62, z * (c - 0.1));
    ship.add(fin);
  }
  const bellPts = [new THREE.Vector2(0.34, -0.14), new THREE.Vector2(0.3, -0.08), new THREE.Vector2(0.24, 0), new THREE.Vector2(0.2, 0.05)];
  const bell = outlined(new THREE.Mesh(new THREE.LatheGeometry(bellPts, 40), toon(trimPaint(F, { color: '#2a2733', shade: '#5c5974', spec: 0.7, specSize: 0.95, rim: 0.4, rimColor: '#ffd6c8', side: THREE.DoubleSide }))), 2.2);
  bell.position.y = -b + 0.02;
  ship.add(bell);
  // a little flame that flickers
  const flameMat = glowMaterial('#ffb347', 0.9, 'ring', 0.0, 0.6);
  const flame = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), flameMat);
  flame.scale.set(0.9, 0.8, 1);
  flame.position.set(0, -b - 0.1, 0.05);
  ship.add(flame);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshBasicMaterial({ color: '#fff4c8', toneMapped: false, transparent: true }));
  core.scale.set(0.9, 1.3, 1);
  core.position.set(0, -b - 0.08, 0.06);
  ship.add(core);

  const update = (_dt: number, t: number) => {
    const f = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
    flame.scale.set(0.9 * f, 0.8 + 0.12 * f, 1);
    core.scale.set(0.9, 1.1 + 0.3 * f, 1);
    ship.position.y = Math.sin(t * 2.2) * 0.012;
  };
  update(0, 0);

  const top = noseY - 0.03 + 0.5;
  return makeShell(
    { id: 'liftoff', name: 'Liftoff', role: 'Toy rocket', accent: '#ff5438', asks: 'Launch now, or hold the count?' },
    { pivot, face: head.face, width: 2 * a + 0.3, height: top + b + 0.3, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, top, 0), up: UP.clone(), width: 0.62 } },
  );
}

// ─── Carat — a cut gem (LEGACY: cut before release, kept for its owners) ─

export function createCarat(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  // the front table (where the glass sits); the chamfer grows it into the girdle
  const table: [number, number][] = [
    [-0.5, 0.62],
    [0.5, 0.62],
    [0.74, 0.34],
    [0.7, -0.1],
    [0, -0.6],
    [-0.7, -0.1],
    [-0.74, 0.34],
  ];
  // a brilliant-ish cut as a convex hull: table, star ring, girdle, pavilion, culet
  const ring = (k: number, z: number, mids = false) => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < table.length; i++) {
      const [x0, y0] = table[i];
      const [x1, y1] = table[(i + 1) % table.length];
      if (mids) out.push(new THREE.Vector3(((x0 + x1) / 2) * k, ((y0 + y1) / 2) * k, z));
      else out.push(new THREE.Vector3(x0 * k, y0 * k, z));
    }
    return out;
  };
  const zt = 0.34;
  const G = 1.22;
  const hullPts = [...ring(1, zt), ...ring(1.13, 0.2, true), ...ring(G, 0.03), ...ring(G, 0.03, true), ...ring(G, -0.03), ...ring(G * 1.0, -0.03, true), ...ring(0.8, -0.26), new THREE.Vector3(0, 0.02, -0.48)];
  const geo = new ConvexGeometry(hullPts).toNonIndexed();
  geo.computeVertexNormals();
  // per-facet sparkle: every face (coplanar triangles share it) gets its own jitter
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const cols = new Float32Array(pos.count * 3);
  const facet = new Map<string, [number, number]>();
  const rand = rng(77);
  for (let i = 0; i < pos.count; i += 3) {
    const key = [nor.getX(i), nor.getY(i), nor.getZ(i)].map((v) => v.toFixed(2)).join(',');
    let f = facet.get(key);
    if (!f) {
      f = [0.72 + rand() * 0.42, (rand() - 0.5) * 0.3];
      facet.set(key, f);
    }
    const [k, h] = nor.getZ(i) > 0.99 ? [1, 0] : f;
    for (let j = 0; j < 3; j++) {
      cols[(i + j) * 3] = k * (1 + h);
      cols[(i + j) * 3 + 1] = k;
      cols[(i + j) * 3 + 2] = k * (1 - h);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  const bs = (G - 1) * 0.74;
  const gemOpts = paintBody({ color: '#8fdcff', shade: '#6a58f0', spec: 0.95, specSize: 0.95, rim: 0.7, rimColor: '#ffc9f2', edge: 0.45, edgeColor: '#ffffff', hi: 0.4, terminator: 0.02 }, F);
  const gem = new THREE.Mesh(geo, toon({ ...gemOpts, vertexColors: true }));
  addOutline(gem, { color: INK, thickness: 2.5, smooth: true });
  const pivot = new THREE.Group();
  pivot.add(gem);

  // the glass, flush on the table
  const w = 1.06, h = 0.6, sy = 0.1;
  const zFront = zt;
  const fmat = faceMaterialFor(w, h, 0.12, { tint: '#070a18', glow: '#9fdcff' });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fmat);
  screen.position.set(0, sy, zFront + 0.003);
  screen.renderOrder = 2;
  pivot.add(screen);
  const face = new FaceCtor(fmat, 6.6);

  // a thin metal bezel seats the glass on the facet
  const bezelShape = roundedRectShape(w + 0.08, h + 0.08, 0.12 * h + 0.04);
  bezelShape.holes.push(new THREE.Path(roundedRectShape(w + 0.005, h + 0.005, 0.12 * h).getPoints(24).reverse()));
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(bezelShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 12 }), metal(F));
  bezel.position.set(0, sy, zFront - 0.004);
  pivot.add(bezel);

  // two shards orbiting and a few sparkles
  const shardMat = toon({ ...gemOpts, vertexColors: false });
  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.OctahedronGeometry(0.1, 0);
    g.scale(1, 1.7, 1);
    const m = new THREE.Mesh(g, shardMat);
    addOutline(m, { color: INK, thickness: 2, smooth: true });
    shards.push(m);
    pivot.add(m);
  }
  const sparkles: THREE.Mesh[] = [];
  const sparkleGeo = sparkleShape(0.07);
  const sparkleMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true });
  for (const [x, y, z] of [[-0.72, 0.62, 0.3], [0.8, -0.2, 0.3], [0.5, 0.78, 0.2]] as const) {
    const s = new THREE.Mesh(sparkleGeo, sparkleMat);
    s.position.set(x, y, z);
    sparkles.push(s);
    pivot.add(s);
  }

  const update = (_dt: number, t: number) => {
    shards.forEach((m, i) => {
      const ang = t * 0.9 + i * Math.PI;
      m.position.set(i ? 1.02 : -1.0, (i ? 0.36 : -0.44) + Math.sin(t * 1.3 + i * 2) * 0.05, -0.05);
      m.rotation.y = ang;
    });
    sparkles.forEach((s, i) => s.scale.setScalar(Math.max(0.001, Math.sin(t * 2.2 + i * 2.1))));
  };
  update(0, 0);

  const top = 0.62 * G + 0.005;
  return makeShell(
    { id: 'carat', name: 'Carat', role: 'Cut gem', accent: '#9fe8ff', asks: 'Polish it, or let it shine?' },
    {
      pivot, face, width: 2 * 0.74 * G, height: 1.62 * G, materials: collectToon(pivot), update,
      screen, screenSpec: { w, h, r: 0.12 * h, shape: 'rect', gasket: 0.016, frame: screen, corners: flatCorners(w, h) },
      anchors: { top: new THREE.Vector3(0, top, 0.02), up: UP.clone(), width: 0.84 },
    },
  );
}

// ─── Drizzle — a rain cloud ─────────────────────────────────────────────

export function createDrizzle(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.74, b = 0.5, c = 0.5, n = 2.7;
  const cloud: ToonOptions = { color: '#fbfaff', shade: '#9aa8ff', spec: 0.5, specSize: 0.97, rim: 0.6, rimColor: '#dff0ff', edge: 0.35 };
  const paint = paintBody(cloud, F);
  const head = buildHead(
    {
      a, b, c, n,
      body: paint,
      outline: INK,
      screen: { w: 1.08, h: 0.66, r: 0.22, y: -0.03, face: { tint: '#080b1a', glow: '#8fb8ff', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    2.9,
  );
  const pivot = new THREE.Group();
  const body = new THREE.Group();
  pivot.add(body);
  body.add(head.group);

  // puffs: one big centred top puff (the crown seat), smaller ones round the rim
  const puffMat = toon(paint);
  const puffs: [number, number, number, number][] = [
    [0.02, 0.5, -0.1, 0.42],
    [-0.5, 0.36, -0.06, 0.32],
    [0.54, 0.34, -0.08, 0.31],
    [-0.8, -0.04, -0.06, 0.28],
    [0.82, -0.02, -0.06, 0.27],
    [-0.58, -0.4, -0.02, 0.24],
    [0.6, -0.42, -0.04, 0.23],
    [0.0, -0.48, -0.12, 0.26],
  ];
  for (const [x, y, z, r] of puffs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), puffMat);
    addOutline(m, { color: INK, thickness: 2.3 });
    m.position.set(x, y, z);
    body.add(m);
  }

  // raindrops that fall and pop, forever
  const dropMat = toon(accentPaint(F, { color: '#6fb8ff', shade: '#5a5ad0', spec: 0.9, specSize: 0.94, rim: 0.6, rimColor: '#e6f4ff' }, { color: F?.led ?? '#6fb8ff', shade: '#6a6ab8' }));
  const dropGeo = teardrop(0.055);
  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(dropGeo, dropMat);
    addOutline(d, { color: INK, thickness: 1.8 });
    drops.push(d);
    pivot.add(d);
  }
  const lanes = [-0.34, 0.06, 0.42];
  const update = (_dt: number, t: number) => {
    drops.forEach((d, i) => {
      const k = (t * 0.7 + i * 0.37) % 1;
      d.position.set(lanes[i], -0.62 - k * 0.3, 0.12);
      d.scale.setScalar(Math.max(0.001, Math.sin(Math.min(1, k * 1.15) * Math.PI) * 1.1));
    });
    body.position.y = Math.sin(t * 1.1) * 0.015;
  };
  update(0, 0);

  return makeShell(
    { id: 'drizzle', name: 'Drizzle', role: 'Rain cloud', accent: '#8fb8ff', asks: 'Sun, showers, or a storm?' },
    { pivot, face: head.face, width: 2.2, height: 2.0, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0.02, 0.9, -0.02), up: UP.clone(), width: 0.8 } },
  );
}

// ─── Toasty — a retro toaster, toast popping behind the seat ────────────

function toastShape(w: number, h: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  s.moveTo(x + 0.04, 0);
  s.lineTo(x + w - 0.04, 0);
  s.quadraticCurveTo(x + w, 0, x + w, 0.04);
  s.lineTo(x + w, h * 0.72);
  // the loaf's two soft bumps
  s.bezierCurveTo(x + w + 0.02, h * 1.02, x + w * 0.56, h * 1.04, x + w * 0.5, h * 0.9);
  s.bezierCurveTo(x + w * 0.44, h * 1.04, x - 0.02, h * 1.02, x, h * 0.72);
  s.lineTo(x, 0.04);
  s.quadraticCurveTo(x, 0, x + 0.04, 0);
  return s;
}

export function createToasty(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.76, b = 0.54, c = 0.5, n = 3.6;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#9ccfff', shade: '#6f78c8', spec: 0.7, specSize: 0.968, rim: 0.55, rimColor: '#eaf4ff', edge: 0.3, seams: [[0, 1, 0, -b * 0.7]], seamWidth: 0.007, seamDark: 0.3 }, F),
      outline: INK,
      screen: { w: 1.12, h: 0.64, r: 0.16, y: -0.06, face: { tint: '#080c18', glow: '#ffb35c', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    8.8,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);
  const chrome = metal(F);
  const trim = toon(trimPaint(F, { color: '#1f1c2a', shade: '#55506e', spec: 0.4 }));

  // two slots at the back of the top; the front half stays a clean crown seat
  const slotZ = [-0.1, -0.3];
  for (const z of slotZ) {
    const slot = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.06, 0.12, 2, 0.03), trim);
    slot.position.set(0, b - 0.012, z);
    pivot.add(slot);
    const lip = outlined(new THREE.Mesh(new RoundedBoxGeometry(1.08, 0.04, 0.18, 2, 0.02), chrome), 1.8);
    lip.position.set(0, b - 0.028, z);
    pivot.add(lip);
  }

  // toast, golden with a crust
  const toastGeo = new THREE.ExtrudeGeometry(toastShape(0.82, 0.5), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 3, curveSegments: 16 });
  toastGeo.translate(0, 0, -0.03);
  const toastMat = toon({ color: '#f6bf62', shade: '#b8603a', spec: 0.25, specSize: 0.94, rim: 0.4, rimColor: '#ffe6b0' });
  const crumbMat = toon({ color: '#fbe3a8', shade: '#c88a5a' });
  const toasts: THREE.Group[] = [];
  slotZ.forEach((z, i) => {
    const g = new THREE.Group();
    const t = outlined(new THREE.Mesh(toastGeo, toastMat), 2.2);
    g.add(t);
    // the soft crumb inside the crust
    const crumb = new THREE.Mesh(new THREE.ShapeGeometry(toastShape(0.68, 0.4), 12), crumbMat);
    crumb.position.set(0, 0.05, 0.057);
    g.add(crumb);
    g.position.set(i ? 0.05 : -0.04, 0, z);
    g.rotation.z = i ? -0.05 : 0.04;
    toasts.push(g);
    pivot.add(g);
  });

  // lever and browning dial on the side that faces the camera
  const lever = new THREE.Group();
  const leverSlot = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.5, 0.06, 2, 0.025), trim);
  const knob = outlined(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.2, 2, 0.03), chrome), 2);
  knob.position.set(0.05, 0.12, 0);
  lever.add(leverSlot, knob);
  lever.position.set(a - 0.01, -0.02, 0.1);
  pivot.add(lever);
  const dial = outlined(new THREE.Mesh(bevelPuck(0.08, 0.06, 0.02, 28, 2), chrome), 2);
  dial.rotation.z = -Math.PI / 2;
  dial.position.set(a - 0.02, -0.02, -0.22);
  pivot.add(dial);

  // chrome base plate + feet
  const plate = outlined(new THREE.Mesh(new RoundedBoxGeometry(2 * a * 0.96, 0.08, 2 * c * 0.92, 3, 0.035), chrome), 2.2);
  plate.position.y = -b - 0.02;
  pivot.add(plate);
  for (const x of [-0.56, 0.56]) {
    const foot = outlined(new THREE.Mesh(bevelPuck(0.07, 0.06, 0.02, 20, 2), trim), 1.8);
    foot.position.set(x, -b - 0.08, 0.18);
    pivot.add(foot);
  }

  // pop! the toast is up most of the time (sprites and gear use the up pose)
  const upY = b - 0.26;
  const downY = b - 0.52;
  const update = (_dt: number, t: number) => {
    const k = t % 5;
    let y: number;
    if (k < 2.8) y = upY;
    else if (k < 3.3) y = upY + (downY - upY) * ((k - 2.8) / 0.5);
    else if (k < 4.2) y = downY;
    else {
      const p = (k - 4.2) / 0.8;
      y = downY + (upY - downY) * (1 + Math.sin(p * Math.PI) * 0.35 * (1 - p)) * Math.min(1, p * 2.2);
    }
    toasts.forEach((g, i) => (g.position.y = y + (i ? 0.02 : 0)));
    knob.position.y = y < upY - 0.1 ? -0.12 : 0.12;
  };
  update(0, 0);

  return makeShell(
    { id: 'toasty', name: 'Toasty', role: 'Pop-up toaster', accent: '#ffb35c', asks: 'Light, golden, or extra crispy?' },
    { pivot, face: head.face, width: 2 * a + 0.2, height: 2 * b + 0.5, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.01, 0.18), up: UP.clone(), width: 0.9 } },
  );
}

// ─── Rawr — a dino-costume hood: teeth round the glass, plates down the back ─

export function createRawr(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.72, b = 0.62, c = 0.6, n = 2.5;
  const sy = -0.08;
  const sw = 1.0, sh = 0.64;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#5fd068', shade: '#2f8f8a', spec: 0.62, specSize: 0.968, rim: 0.55, rimColor: '#e6ffd0', edge: 0.3 }, F),
      outline: INK,
      screen: { w: sw, h: sh, r: 0.2, y: sy, face: { tint: '#07120b', glow: '#9cff6a', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    13.3,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // teeth: a soft white row over the glass and a shorter one under it
  const toothMat = toon({ color: '#fffaf0', shade: '#b8b0d8', spec: 0.6, specSize: 0.95, rim: 0.4, rimColor: '#ffffff' });
  const toothGeo = new THREE.ConeGeometry(0.05, 0.1, 14);
  toothGeo.rotateX(Math.PI);
  const teeth = (y: number, count: number, span: number, up: boolean, size: number) => {
    for (let i = 0; i < count; i++) {
      const x = -span / 2 + (span * i) / (count - 1);
      const m = outlined(new THREE.Mesh(toothGeo, toothMat), 1.8);
      m.scale.setScalar(size);
      if (up) m.rotation.z = Math.PI;
      const p = new THREE.Vector3(x, y, head.frontAt(x, y) - 0.012);
      m.position.copy(p);
      m.rotation.x = up ? 0.35 : -0.35;
      pivot.add(m);
    }
  };
  teeth(sy + sh / 2 + 0.085, 6, 0.84, false, 1);
  teeth(sy - sh / 2 - 0.08, 5, 0.66, true, 0.85);

  // back plates: from behind the crown seat, down the back of the head
  const plateMat = toon(accentPaint(F, { color: '#ff9f3a', shade: '#c0503a', spec: 0.6, specSize: 0.955, rim: 0.5, rimColor: '#ffe0b8' }, { color: F?.led ?? '#ff9f3a', shade: '#8a88b2' }));
  const plates: [number, number][] = [
    [1.76, 0.24],
    [2.02, 0.4],
    [2.3, 0.54],
    [2.6, 0.5],
    [2.9, 0.36],
  ];
  for (const [t, sz] of plates) {
    // rounded thorns read from every angle (flat plates vanish edge-on)
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      const r = sz * 0.42 * Math.pow(1 - k, 0.8);
      prof.push(new THREE.Vector2(Math.max(0.001, r), k * sz - (k > 0.92 ? (k - 0.92) * sz * 0.5 : 0)));
    }
    const geo = new THREE.LatheGeometry(prof, 20);
    geo.computeVertexNormals();
    fixLatheSeam(geo, prof.length, 20);
    const m = outlined(new THREE.Mesh(geo, plateMat), 2.2);
    const p = surfacePoint(new THREE.Vector3(0, Math.sin(t), Math.cos(t)), a, b, c, n);
    const nrm = surfaceNormal(p, a, b, c, n);
    m.position.copy(p).addScaledVector(nrm, -0.04);
    // lean back a little, like a real ridge
    m.quaternion.setFromUnitVectors(UP, nrm.clone().add(new THREE.Vector3(0, 0.25, -0.1)).normalize());
    pivot.add(m);
  }

  // a stubby tail curling out behind, on the camera side
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, -0.42, -0.4),
    new THREE.Vector3(0.62, -0.58, -0.62),
    new THREE.Vector3(0.86, -0.54, -0.76),
    new THREE.Vector3(1.0, -0.4, -0.8),
  ]);
  const tailGeo = new THREE.TubeGeometry(tailCurve, 40, 0.2, 18, false);
  taperTube(tailGeo, tailCurve, 40, 18, 0.2, 0.06);
  const tailMat = toon(paintBody({ color: '#5fd068', shade: '#2f8f8a', spec: 0.62, specSize: 0.968, rim: 0.55, rimColor: '#e6ffd0' }, F));
  const tail = outlined(new THREE.Mesh(tailGeo, tailMat), 2.3);
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0.3, -0.42, -0.4);
  tail.position.set(-0.3, 0.42, 0.4);
  tailPivot.add(tail);
  pivot.add(tailPivot);
  // tail-tip cap
  const tip = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), tailMat), 2);
  tip.position.copy(tailCurve.getPoint(1)).add(new THREE.Vector3(-0.3, 0.42, 0.4));
  tailPivot.add(tip);

  const update = (_dt: number, t: number) => {
    tailPivot.rotation.y = Math.sin(t * 2.4) * 0.14;
    tailPivot.rotation.z = Math.sin(t * 1.7) * 0.05;
  };
  update(0, 0);

  return makeShell(
    { id: 'rawr', name: 'Rawr', role: 'Dino hood', accent: '#5fd068', asks: 'Stomp, chomp, or nap?' },
    { pivot, face: head.face, width: 2 * a + 0.4, height: 2 * b + 0.3, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b, 0.08), up: UP.clone(), width: 0.88 } },
  );
}

// ─── Glowcap — a mushroom with glowing spots ────────────────────────────

export function createGlowcap(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.62, b = 0.5, c = 0.56, n = 2.6;
  const stemSig: ToonOptions = { color: '#f7ecd6', shade: '#b7a0c8', spec: 0.45, specSize: 0.968, rim: 0.5, rimColor: '#fff4e0', edge: 0.3 };
  const stem: ToonOptions = F ? (whiteBody(F) ? { ...stemSig, color: inkAccent(F) ? '#f7ecd6' : F.accent, shade: inkAccent(F) ? '#b7a0c8' : F.accentShade } : stemSig) : stemSig;
  const sy = -0.12;
  const head = buildHead(
    {
      a, b, c, n,
      body: stem,
      outline: INK,
      screen: { w: 0.98, h: 0.62, r: 0.2, y: sy, face: { tint: '#070a18', glow: '#7df9ff', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    6.2,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // the cap: a half-ellipsoid with a rolled lip
  const rx = 1.0, ry = 0.54;
  const capY = 0.36;
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const phi = (i / 16) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.max(0.001, rx * Math.cos(phi)), ry * Math.sin(phi)));
  }
  const capGeo = new THREE.LatheGeometry(prof, 72);
  capGeo.computeVertexNormals();
  fixLatheSeam(capGeo, prof.length, 72);
  const capOpts = paintBody({ color: '#6a4cff', shade: '#3a2c9c', spec: 0.7, specSize: 0.968, rim: 0.6, rimColor: '#e0d6ff', edge: 0.3 }, F);
  const capMat = toon(capOpts);
  const cap = new THREE.Group();
  const dome = outlined(new THREE.Mesh(capGeo, capMat), 2.5);
  cap.add(dome);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rx - 0.02, 0.055, 12, 72), capMat);
  lip.rotation.x = Math.PI / 2;
  cap.add(lip);
  addOutline(lip, { color: INK, thickness: 2.3 });
  const gills = new THREE.Mesh(new THREE.RingGeometry(0.3, rx - 0.02, 64, 1), toon({ color: '#f0dcc0', shade: '#9a88b8', side: THREE.DoubleSide }));
  gills.rotation.x = Math.PI / 2;
  gills.position.y = -0.01;
  cap.add(gills);

  // bioluminescent spots (none on the crown seat at the apex)
  const spotColor = role(F, '#7df9ff', (f) => f.led);
  const spotMats: THREE.MeshBasicMaterial[] = [];
  const spots: [number, number, number][] = [
    [0.55, 0.5, 0.13],
    [0.62, 1.2, 0.1],
    [0.74, 1.95, 0.09],
    [0.8, 0.95, 0.085],
    [0.66, -0.35, 0.1],
    [0.8, 0.2, 0.08],
    [0.52, 2.6, 0.1],
    [0.84, 1.5, 0.07],
  ];
  for (const [phiK, theta, r] of spots) {
    // phiK: 0 = apex, 1 = rim; theta: round the cap (π/2 faces the camera)
    const phi = phiK * (Math.PI / 2);
    const x = rx * Math.sin(phi) * Math.cos(theta);
    const z = rx * Math.sin(phi) * Math.sin(theta);
    const y = ry * Math.cos(phi);
    const nrm = new THREE.Vector3(x / (rx * rx), y / (ry * ry), z / (rx * rx)).normalize();
    const s = led(spotColor, r, 1.9);
    s.group.position.set(x, y, z).addScaledVector(nrm, 0.004);
    faceAlong(s.group, nrm);
    spotMats.push(s.mat);
    cap.add(s.group);
  }
  cap.position.y = capY;
  cap.rotation.x = -0.06;
  pivot.add(cap);

  // a baby mushroom sprouting at its foot
  const baby = new THREE.Group();
  const bStem = outlined(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.2, 14), toon(stemSig)), 1.8);
  bStem.position.y = 0.1;
  const bCapGeo = new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  bCapGeo.scale(1, 0.75, 1);
  const bCap = outlined(new THREE.Mesh(bCapGeo, capMat), 1.9);
  bCap.position.y = 0.19;
  const bSpot = led(spotColor, 0.035, 1.8);
  bSpot.group.position.set(0.03, 0.27, 0.1);
  bSpot.group.rotation.x = -0.7;
  spotMats.push(bSpot.mat);
  baby.add(bStem, bCap, bSpot.group);
  baby.position.set(0.68, -b + 0.02, 0.22);
  baby.rotation.z = -0.18;
  pivot.add(baby);

  const base = new THREE.Color(spotColor);
  const update = (_dt: number, t: number) => {
    spotMats.forEach((m, i) => {
      const k = 0.75 + 0.25 * Math.sin(t * 1.8 + i * 1.3);
      m.color.copy(base).multiplyScalar(k);
    });
    baby.rotation.z = -0.18 + Math.sin(t * 2) * 0.04;
  };
  update(0, 0);

  const top = capY + ry + 0.01;
  return makeShell(
    { id: 'glowcap', name: 'Glowcap', role: 'Glowing mushroom', accent: '#7df9ff', asks: 'Glow bright, or glow low?' },
    { pivot, face: head.face, width: 2 * rx + 0.1, height: top + b + 0.1, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, top, 0), up: UP.clone(), width: 0.9 } },
  );
}

// ─── small helpers ──────────────────────────────────────────────────────





function faceMaterialFor(w: number, h: number, radius: number, o: { tint: string; glow: string }) {
  return faceMaterial({ aspect: w / h, radius, tint: o.tint, glow: o.glow, amp: 0.085, width: 0.018, glowSize: 0.022, gasket: 0.016 });
}

function flatCorners(w: number, h: number) {
  return () => [
    new THREE.Vector3(-w / 2, h / 2, 0),
    new THREE.Vector3(w / 2, h / 2, 0),
    new THREE.Vector3(w / 2, -h / 2, 0),
    new THREE.Vector3(-w / 2, -h / 2, 0),
    new THREE.Vector3(0, 0, 0),
  ];
}

function sparkleShape(s: number) {
  const sh = new THREE.Shape();
  sh.moveTo(0, s * 2);
  sh.quadraticCurveTo(0, 0, s * 2, 0);
  sh.quadraticCurveTo(0, 0, 0, -s * 2);
  sh.quadraticCurveTo(0, 0, -s * 2, 0);
  sh.quadraticCurveTo(0, 0, 0, s * 2);
  return new THREE.ShapeGeometry(sh, 8);
}

function teardrop(r: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * Math.PI;
    // round bottom, pointed top
    const y = -Math.cos(t) * r * 1.5;
    const x = Math.sin(t) * r * Math.pow((1 + Math.cos(t)) / 2, 0.55) * 1.1;
    pts.push(new THREE.Vector2(Math.max(0.0005, x), y));
  }
  const g = new THREE.LatheGeometry(pts, 20);
  g.computeVertexNormals();
  return fixLatheSeam(g, pts.length, 20);
}

/** Scale a TubeGeometry's rings from r0 at the start to r1 at the end. */
function taperTube(geo: THREE.TubeGeometry, curve: THREE.Curve<THREE.Vector3>, tubular: number, radial: number, r0: number, r1: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    const c = curve.getPointAt(u);
    const k = (r0 + (r1 - r0) * Math.pow(u, 0.9)) / r0;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ════════════════════════════════════════════════════════════════════════
//  Toybox, wave two: bolder silhouettes
// ════════════════════════════════════════════════════════════════════════

/**
 * Radially scale a built group by s(y) (x and z both), in place, with the
 * normals carried through the inverse-transpose so the cel ramp stays smooth.
 */
function radialTaper(root: THREE.Object3D, s: (y: number) => number, ds: (y: number) => number) {
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || seen.has(m.geometry)) return;
    seen.add(m.geometry);
    let oy = 0;
    for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) oy += p.position.y;
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = m.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) + oy, z = pos.getZ(i);
      const k = s(y);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
      if (nor) {
        const d = ds(y) / k;
        const nx = nor.getX(i) / k;
        const ny = nor.getY(i) - d * (x * nor.getX(i) + z * nor.getZ(i));
        const nz = nor.getZ(i) / k;
        const l = Math.hypot(nx, ny, nz) || 1;
        nor.setXYZ(i, nx / l, ny / l, nz / l);
      }
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    m.geometry.computeBoundingSphere();
  });
}

/** A tapered tube along points, with a round cap at the thin end. */
function limb(points: THREE.Vector3[], r0: number, r1: number, mat: THREE.Material, seg = 40, capEnd = true) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, seg, r0, 16, false);
  taperTube(geo, curve, seg, 16, r0, r1);
  const g = new THREE.Group();
  g.add(outlined(new THREE.Mesh(geo, mat), 2.3));
  if (capEnd) {
    const cap = outlined(new THREE.Mesh(new THREE.SphereGeometry(r1, 16, 12), mat), 2.1);
    cap.position.copy(curve.getPoint(1));
    g.add(cap);
  }
  const start = outlined(new THREE.Mesh(new THREE.SphereGeometry(r0, 16, 12), mat), 2.1);
  start.position.copy(curve.getPoint(0));
  g.add(start);
  return { group: g, curve };
}

// ─── Updraft — a hot-air balloon with a wicker basket ───────────────────

export function createUpdraft(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.76, b = 0.6, c = 0.68, n = 2.2;
  const lift = 0.14;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#ff8a3d', shade: '#c0456a', spec: 0.6, specSize: 0.968, rim: 0.55, rimColor: '#ffe0c8', edge: 0.3 }, F),
      outline: INK,
      screen: { w: 1.0, h: 0.62, r: 0.2, y: 0.04, face: { tint: '#140a08', glow: '#ffb35c', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    15.1,
  );
  // gores: alternating panels round the envelope (vertex colours; the glass sits
  // in one panel, centred on the front)
  const envC = new THREE.Color(role(F, '#ff8a3d', (f) => f.body));
  const altC = new THREE.Color(role(F, '#ffd23f', (f) => (inkAccent(f) ? f.led : f.accent)));
  const gore = head.body.geometry;
  const gp = gore.getAttribute('position') as THREE.BufferAttribute;
  const gc = new Float32Array(gp.count * 3);
  const GORES = 10;
  for (let i = 0; i < gp.count; i++) {
    const az = Math.atan2(gp.getX(i), gp.getZ(i));
    const k = Math.floor((az / (Math.PI * 2)) * GORES + 0.5 + GORES);
    const col = k % 2 === 0 ? envC : altC;
    gc[i * 3] = col.r;
    gc[i * 3 + 1] = col.g;
    gc[i * 3 + 2] = col.b;
  }
  gore.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  head.bodyMat.vertexColors = true;
  (head.bodyMat.uniforms.uColor.value as THREE.Color).set('#ffffff');
  head.bodyMat.needsUpdate = true;
  const ribbonMat = toon(accentPaint(F, { color: '#ffd23f', shade: '#d8843f', spec: 0.6, specSize: 0.96, rim: 0.5, rimColor: '#fff2c4' }, { color: F?.led ?? '#ffd23f', shade: '#8a88b2' }));
  // teardrop: the envelope pinches in below the glass (the glass itself is untouched)
  const y0 = -0.28, K = 0.8;
  const span = b + y0;
  radialTaper(
    head.group,
    (y) => (y < y0 ? 1 - K * Math.pow((y0 - y) / span, 2) : 1),
    (y) => (y < y0 ? (2 * K * (y0 - y)) / (span * span) : 0),
  );
  head.group.position.y = lift;
  const pivot = new THREE.Group();
  const ride = new THREE.Group();
  pivot.add(ride);
  ride.add(head.group);

  // crown seat: a flat parachute-vent cap
  const vent = outlined(new THREE.Mesh(bevelPuck(0.24, 0.06, 0.025, 36, 3), ribbonMat), 2);
  vent.position.y = lift + b - 0.01;
  ride.add(vent);

  // the skirt, ropes, burner and wicker basket
  const trim = toon(trimPaint(F, { color: '#3a2a30', shade: '#6b4a5c', spec: 0.4 }));
  const skirtY = lift - b + 0.06;
  const skirt = outlined(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 10, 32), ribbonMat), 2);
  skirt.rotation.x = Math.PI / 2;
  skirt.position.y = skirtY;
  ride.add(skirt);
  const basketY = -0.72;
  const ropeMat = toon({ color: '#e9dcc4', shade: '#9a8ab0' });
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const from = new THREE.Vector3(sx * 0.15, skirtY, sz * 0.15);
    const to = new THREE.Vector3(sx * 0.23, basketY + 0.13, sz * 0.23);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, from.distanceTo(to), 6), ropeMat);
    rope.position.copy(from).add(to).multiplyScalar(0.5);
    rope.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
    ride.add(rope);
  }
  const flame = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), glowMaterial('#ffb347', 1, 'ring', 0, 0.6));
  flame.position.set(0, skirtY - 0.07, 0.02);
  ride.add(flame);
  const wicker = toon({ color: '#d6995a', shade: '#8a4a3a', spec: 0.2, rim: 0.35, rimColor: '#ffe6c0', seams: [[0, 1, 0, 0.04], [0, 1, 0, -0.04], [1, 0, 0, 0.1], [1, 0, 0, -0.1], [0, 0, 1, 0.1], [0, 0, 1, -0.1]], seamWidth: 0.008, seamDark: 0.35 });
  const basket = outlined(new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.26, 0.52, 3, 0.06), wicker), 2.3);
  basket.position.y = basketY;
  ride.add(basket);
  const lip = outlined(new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.05, 0.58, 2, 0.024), trim), 1.8);
  lip.position.y = basketY + 0.135;
  ride.add(lip);

  const update = (_dt: number, t: number) => {
    ride.position.y = Math.sin(t * 1.3) * 0.02;
    ride.rotation.z = Math.sin(t * 0.9) * 0.025;
    flame.scale.setScalar(0.85 + 0.2 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.1)));
  };
  update(0, 0);

  return makeShell(
    { id: 'updraft', name: 'Updraft', role: 'Hot-air balloon', accent: '#ff8a3d', asks: 'Rise, drift, or land?' },
    { pivot, face: head.face, width: 2 * a + 0.1, height: 1.9, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, lift + b + 0.03, 0), up: UP.clone(), width: 0.84 } },
  );
}

// ─── Wobble — a jellyfish: a glossy bell, a frill and dangling tentacles ─

export function createWobble(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.74, b = 0.56, c = 0.62, n = 2.1;
  const lift = 0.1;
  const bell = paintBody({ color: '#ff8fd0', shade: '#8a5cd8', spec: 0.8, specSize: 0.964, rim: 0.7, rimColor: '#ffe6ff', edge: 0.4, edgeColor: '#ffffff' }, F);
  const head = buildHead(
    {
      a, b, c, n,
      body: bell,
      outline: INK,
      screen: { w: 1.0, h: 0.6, r: 0.22, y: 0.08, face: { tint: '#12071a', glow: '#ff9ef0', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    16.4,
  );
  head.group.position.y = lift;
  const pivot = new THREE.Group();
  const swim = new THREE.Group();
  pivot.add(swim);
  swim.add(head.group);

  // the frill: a scalloped ring of soft beads round the bell's rim
  const frillMat = toon(accentPaint(F, { color: '#b58cff', shade: '#6a4fc8', spec: 0.6, specSize: 0.95, rim: 0.6, rimColor: '#f0e0ff' }, { color: F?.led ?? '#b58cff', shade: '#8a88b2' }));
  const rimY = -0.44;
  const rk = Math.pow(1 - Math.pow(Math.abs(rimY) / b, n), 1 / n);
  const N = 22;
  const bead = new THREE.SphereGeometry(0.075, 14, 10);
  bead.scale(1, 0.7, 1);
  const beads = new THREE.InstancedMesh(bead, frillMat, N);
  const M = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const x = a * rk * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n);
    const z = c * rk * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
    M.makeTranslation(x * 1.02, rimY + lift - 0.02, z * 1.02);
    beads.setMatrixAt(i, M);
  }
  addOutline(beads, { color: INK, thickness: 1.8 });
  swim.add(beads);

  // tentacles: wavy ribbons that sway from the top, with glowing tips
  const tentA = toon(bell);
  const tentB = frillMat;
  const tips: THREE.MeshBasicMaterial[] = [];
  const tentacles: THREE.Group[] = [];
  const spots: [number, number, number, number][] = [
    [-0.36, 0.22, 0.34, 0.07],
    [-0.12, 0.3, 0.4, 0.075],
    [0.12, 0.3, 0.38, 0.075],
    [0.36, 0.22, 0.34, 0.07],
    [-0.5, -0.1, 0.28, 0.06],
    [0.5, -0.1, 0.3, 0.06],
    [0.0, -0.28, 0.32, 0.065],
  ];
  spots.forEach(([x, z, len, r], i) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      pts.push(new THREE.Vector3(Math.sin(u * Math.PI * 2 + i) * 0.045 * u, -u * len, Math.cos(u * Math.PI * 2 + i) * 0.02 * u));
    }
    const l = limb(pts, r, r * 0.4, i % 2 ? tentB : tentA, 24, false);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 12, 8), new THREE.MeshBasicMaterial({ color: role(F, '#fff0a8', (f) => f.led), toneMapped: false }));
    tip.position.copy(l.curve.getPoint(1));
    tips.push(tip.material as THREE.MeshBasicMaterial);
    l.group.add(tip);
    const g = new THREE.Group();
    g.position.set(x, lift - 0.46, z);
    g.add(l.group);
    tentacles.push(g);
    swim.add(g);
  });

  const update = (_dt: number, t: number) => {
    const pulse = Math.sin(t * 2.2);
    swim.position.y = pulse * 0.025;
    head.group.scale.set(1 + pulse * 0.012, 1 - pulse * 0.012, 1 + pulse * 0.012);
    tentacles.forEach((g, i) => {
      g.rotation.z = Math.sin(t * 2.2 - 0.8 + i * 0.7) * 0.16;
      g.rotation.x = Math.sin(t * 1.7 + i) * 0.1;
    });
    tips.forEach((m, i) => m.color.setScalar(0.75 + 0.25 * Math.sin(t * 3 + i)));
    if (F) tips.forEach((m) => m.color.multiply(new THREE.Color(F.led)));
    else tips.forEach((m) => m.color.multiply(new THREE.Color('#fff0a8')));
  };
  update(0, 0);

  return makeShell(
    { id: 'wobble', name: 'Wobble', role: 'Jellyfish', accent: '#ff8fd0', asks: 'Drift, glow, or sting?' },
    { pivot, face: head.face, width: 2 * a + 0.1, height: 1.9, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, lift + b, 0.02), up: UP.clone(), width: 0.86 } },
  );
}

// ─── Brewster — a porcelain teapot with a spout that steams ─────────────

export function createBrewster(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.72, b = 0.56, c = 0.64, n = 2.4;
  const dotDirs: [number, number, number, number][] = [
    [0.8, 0.35, 0.3, 0.05], [0.9, -0.2, 0.25, 0.045], [0.7, -0.6, 0.35, 0.04], [0.95, 0.05, -0.2, 0.05],
    [0.6, 0.5, -0.4, 0.04], [-0.8, 0.3, 0.3, 0.05], [-0.9, -0.3, 0.2, 0.045], [-0.6, -0.65, 0.4, 0.04],
    [0.35, -0.85, 0.4, 0.04], [-0.3, -0.85, 0.45, 0.04], [0.45, 0.8, 0.2, 0.035], [-0.45, 0.8, 0.2, 0.035],
  ];
  const dots = dotDirs.map(([x, y, z, r]) => {
    const p = surfacePoint(new THREE.Vector3(x, y, z), a, b, c, n);
    return [p.x, p.y, p.z, r] as [number, number, number, number];
  });
  const cobalt = role(F, '#2f5bd6', (f) => (inkAccent(f) ? f.led : f.accent));
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: '#f7f8ff', shade: '#9aa6e0', spec: 0.85, specSize: 0.966, rim: 0.6, rimColor: '#e6ecff', edge: 0.35, dots, dotColor: cobalt }, F),
      outline: INK,
      screen: { w: 1.0, h: 0.62, r: 0.2, y: -0.04, face: { tint: '#080b1a', glow: '#8fb8ff', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    17.9,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);
  const blue = toon(accentPaint(F, { color: '#2f5bd6', shade: '#23308a', spec: 0.85, specSize: 0.96, rim: 0.5, rimColor: '#cfdcff' }, { color: F?.led ?? '#2f5bd6', shade: '#6a6ab8' }));
  const porcelain = toon(paintBody({ color: '#f7f8ff', shade: '#9aa6e0', spec: 0.85, specSize: 0.966, rim: 0.6, rimColor: '#e6ecff', edge: 0.35 }, F));

  // lid: a flat cobalt lid with a gold-line rim (the crown seat)
  const lid = outlined(new THREE.Mesh(bevelPuck(0.44, 0.1, 0.04, 48, 3), blue), 2.3);
  lid.position.y = b - 0.03;
  pivot.add(lid);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.018, 8, 64), metal({ id: 'gold' } as Finish));
  band.rotation.x = Math.PI / 2;
  band.position.y = b - 0.06;
  pivot.add(band);

  // spout out of the left side, handle on the right
  const spout = limb([new THREE.Vector3(-0.6, -0.22, 0.02), new THREE.Vector3(-0.86, -0.14, 0.04), new THREE.Vector3(-1.0, 0.06, 0.04), new THREE.Vector3(-1.06, 0.26, 0.04)], 0.14, 0.065, porcelain, 40, false);
  pivot.add(spout.group);
  const tipRing = outlined(new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.02, 8, 24), blue), 1.6);
  tipRing.position.copy(spout.curve.getPoint(1));
  tipRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spout.curve.getTangent(1));
  pivot.add(tipRing);
  const handle = outlined(new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.058, 12, 40, Math.PI * 1.3), blue), 2.2);
  handle.rotation.z = -Math.PI * 0.65;
  handle.position.set(a + 0.1, 0.0, -0.02);
  pivot.add(handle);
  const foot = outlined(new THREE.Mesh(bevelPuck(0.42, 0.08, 0.03, 40, 3), blue), 2);
  foot.position.y = -b + 0.01;
  pivot.add(foot);

  // steam curling up from the spout
  const puffMat = toon({ color: '#ffffff', shade: '#c9c9e6', rim: 0.3 });
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), puffMat);
    addOutline(m, { color: INK, thickness: 1.6 });
    puffs.push(m);
    pivot.add(m);
  }
  const tipP = spout.curve.getPoint(1);
  const update = (_dt: number, t: number) => {
    puffs.forEach((m, i) => {
      const k = (t * 0.4 + i / 3) % 1;
      m.position.set(tipP.x - 0.04 + Math.sin(k * 6 + i) * 0.04, tipP.y + 0.06 + k * 0.34, tipP.z);
      m.scale.setScalar(Math.sin(k * Math.PI) * (0.6 + k * 0.8) + 0.001);
    });
  };
  update(0, 0);

  return makeShell(
    { id: 'brewster', name: 'Brewster', role: 'Teapot', accent: '#2f5bd6', asks: 'Steep, pour, or top up?' },
    { pivot, face: head.face, width: 2.2, height: 2 * b + 0.3, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.03, 0), up: UP.clone(), width: 0.86 } },
  );
}

// ─── Prickles — a potted cactus with two arms and a flower ──────────────

export function createPrickles(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.6, b = 0.66, c = 0.56, n = 2.5;
  const lift = 0.08;
  const ribs: [number, number, number, number][] = [];
  for (const ang of [0.32, 0.72, 1.12, -0.32, -0.72, -1.12, 1.5]) ribs.push([Math.cos(ang), 0, -Math.sin(ang), 0]);
  const skin = paintBody({ color: '#4fc46a', shade: '#2a7a78', spec: 0.55, specSize: 0.968, rim: 0.55, rimColor: '#e6ffd0', edge: 0.3, seams: ribs, seamWidth: 0.007, seamDark: 0.35 }, F);
  const head = buildHead(
    {
      a, b, c, n,
      body: skin,
      outline: INK,
      screen: { w: 0.96, h: 0.6, r: 0.2, y: 0.0, face: { tint: '#07120b', glow: '#9cff6a', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    18.2,
  );
  head.group.position.y = lift;
  const pivot = new THREE.Group();
  pivot.add(head.group);
  const armMat = toon({ ...skin, seams: undefined });

  const left = limb([new THREE.Vector3(-0.5, lift - 0.12, 0), new THREE.Vector3(-0.82, lift - 0.14, 0), new THREE.Vector3(-0.9, lift + 0.04, 0), new THREE.Vector3(-0.9, lift + 0.3, 0)], 0.13, 0.12, armMat);
  const right = limb([new THREE.Vector3(0.5, lift + 0.04, 0), new THREE.Vector3(0.8, lift + 0.02, 0), new THREE.Vector3(0.88, lift + 0.2, 0), new THREE.Vector3(0.88, lift + 0.44, 0)], 0.12, 0.11, armMat);
  const arms = new THREE.Group();
  arms.add(left.group, right.group);
  pivot.add(arms);

  // spines: little white darts on the arms and the sides (never on the glass plate)
  const spineGeo = new THREE.ConeGeometry(0.014, 0.07, 6);
  const spinePts: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  for (const arm of [left, right]) {
    for (let i = 1; i <= 6; i++) {
      const u = i / 7;
      const p = arm.curve.getPoint(u);
      const tng = arm.curve.getTangent(u);
      for (const side of [1, -1]) {
        const nn = new THREE.Vector3(0, 0, 1).cross(tng).normalize().multiplyScalar(side);
        spinePts.push({ p: p.clone().addScaledVector(nn, 0.12), n: nn });
      }
    }
  }
  for (const [x, y, z] of [[0.95, 0.5, 0.1], [0.97, 0.1, 0.2], [0.9, -0.4, 0.3], [-0.95, 0.5, 0.1], [-0.97, 0.1, 0.2], [-0.9, -0.4, 0.3], [0.3, 0.95, 0.2], [-0.3, 0.95, 0.2]]) {
    const p = surfacePoint(new THREE.Vector3(x, y, z), a, b, c, n);
    spinePts.push({ p: p.clone().add(new THREE.Vector3(0, lift, 0)), n: surfaceNormal(p, a, b, c, n) });
  }
  const spines = new THREE.InstancedMesh(spineGeo, toon({ color: '#fffaf0', shade: '#b8b0d8', spec: 0.4 }), spinePts.length);
  const M = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spinePts.forEach(({ p, n: nn }, i) => {
    q.setFromUnitVectors(UP, nn);
    M.compose(p.clone().addScaledVector(nn, 0.02), q, new THREE.Vector3(1, 1, 1));
    spines.setMatrixAt(i, M);
  });
  pivot.add(spines);

  // a flower on the right arm (beside the crown seat, never on it)
  const flower = new THREE.Group();
  const petalMat = toon(accentPaint(F, { color: '#ff6fae', shade: '#b04a78', spec: 0.5, specSize: 0.95, rim: 0.5, rimColor: '#ffe0f0' }, { color: F?.led ?? '#ff6fae', shade: '#8a88b2' }));
  for (let i = 0; i < 5; i++) {
    const pg = new THREE.SphereGeometry(0.07, 12, 8);
    pg.scale(1, 0.45, 1.6);
    const petal = outlined(new THREE.Mesh(pg, petalMat), 1.6);
    const ang = (i / 5) * Math.PI * 2;
    petal.position.set(Math.cos(ang) * 0.08, 0, Math.sin(ang) * 0.08);
    petal.rotation.y = -ang + Math.PI / 2;
    flower.add(petal);
  }
  const heart = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), toon({ color: '#ffd23f', shade: '#d8843f', spec: 0.6 })), 1.6);
  heart.position.y = 0.03;
  flower.add(heart);
  flower.position.copy(right.curve.getPoint(1)).add(new THREE.Vector3(0, 0.12, 0));
  flower.rotation.x = 0.35;
  pivot.add(flower);

  // terracotta pot
  const potC = F?.id === 'tangerine' ? '#c9785a' : '#e07a4f';
  const potMat = toon({ color: potC, shade: '#8f3f4e', spec: 0.35, specSize: 0.96, rim: 0.4, rimColor: '#ffd8c0', seams: [[0, 1, 0, -0.12]], seamWidth: 0.012, seamDark: 0.25 });
  const potPts = [new THREE.Vector2(0.001, -0.2), new THREE.Vector2(0.42, -0.2), new THREE.Vector2(0.5, 0.0), new THREE.Vector2(0.56, 0.16), new THREE.Vector2(0.001, 0.16)];
  const potGeo = new THREE.LatheGeometry(potPts, 56);
  potGeo.computeVertexNormals();
  const pot = outlined(new THREE.Mesh(potGeo, potMat), 2.4);
  const potY = -0.72;
  pot.position.y = potY;
  pivot.add(pot);
  const potRim = outlined(new THREE.Mesh(bevelPuck(0.64, 0.12, 0.04, 56, 3), potMat), 2.3);
  potRim.position.y = potY + 0.2;
  pivot.add(potRim);

  const update = (_dt: number, t: number) => {
    arms.rotation.z = Math.sin(t * 1.3) * 0.02;
    flower.rotation.y = Math.sin(t * 1.1) * 0.3;
  };
  update(0, 0);

  return makeShell(
    { id: 'prickles', name: 'Prickles', role: 'Potted cactus', accent: '#4fc46a', asks: 'Water me, or leave me be?' },
    { pivot, face: head.face, width: 2.1, height: 1.9, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, lift + b, 0.02), up: UP.clone(), width: 0.72 } },
  );
}

// ─── Hivemind — a straw beehive skep, two bees on patrol ────────────────

function bee(F: Finish | null) {
  const g = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(0.075, 16, 12);
  bodyGeo.scale(1.35, 1, 1);
  const yellow = toon({ color: '#ffd23f', shade: '#d8843f', spec: 0.7, specSize: 0.95, rim: 0.5, rimColor: '#fff2c4' });
  const body = outlined(new THREE.Mesh(bodyGeo, yellow), 1.6);
  g.add(body);
  const stripe = toon({ color: '#2a2733', shade: '#5c5974' });
  for (const x of [-0.03, 0.035]) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.016, 6, 20), stripe);
    s.rotation.y = Math.PI / 2;
    s.position.x = x;
    g.add(s);
  }
  const wingMat = toon({ color: '#eef6ff', shade: '#a8b8ff', transparent: true, opacity: 0.8, rim: 0.6, rimColor: '#ffffff' });
  const wings: THREE.Mesh[] = [];
  for (const side of [1, -1]) {
    const wg = new THREE.SphereGeometry(0.06, 12, 8);
    wg.scale(0.7, 0.2, 1.1);
    wg.translate(0, 0, side * 0.06);
    const w = new THREE.Mesh(wg, wingMat);
    w.position.y = 0.07;
    wings.push(w);
    g.add(w);
  }
  void F;
  return { group: g, wings };
}

export function createHivemind(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.74, b = 0.64, c = 0.62, n = 2.2;
  const lift = 0.06;
  const coils: [number, number, number, number][] = [];
  for (const y of [-0.52, -0.4, 0.34, 0.44, 0.53]) coils.push([0, 1, 0, y]);
  const straw = paintBody({ color: '#ffc23a', shade: '#c0663a', spec: 0.5, specSize: 0.966, rim: 0.55, rimColor: '#fff0c4', edge: 0.3, seams: coils, seamWidth: 0.008, seamDark: 0.4 }, F);
  const head = buildHead(
    {
      a, b, c, n,
      body: straw,
      outline: INK,
      screen: { w: 1.02, h: 0.6, r: 0.2, y: -0.02, face: { tint: '#140c04', glow: '#ffc857', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    19.3,
  );
  const coilMat = toon(straw);
  // the straw coils bulge as real rings above and below the glass
  for (const y of [0.36, 0.47, 0.57, -0.4, -0.52]) {
    const k = Math.pow(1 - Math.pow(Math.abs(y) / b, n), 1 / n);
    // a tube along the body's own cross-section (so the taper below bends it correctly)
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 72; i++) {
      const phi = (i / 72) * Math.PI * 2;
      const cs = Math.cos(phi), sn = Math.sin(phi);
      pts.push(new THREE.Vector3(a * k * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n) + 0.012 * cs, y, c * k * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) + 0.012 * sn));
    }
    const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 144, 0.055, 10, true), coilMat);
    addOutline(ring, { color: INK, thickness: 1.9 });
    head.group.add(ring);
  }
  // a skep: the dome narrows above the glass
  const y1 = 0.3, Kd = 0.34, spanD = b - y1;
  radialTaper(
    head.group,
    (y) => (y > y1 ? 1 - Kd * Math.pow((y - y1) / spanD, 2) : 1),
    (y) => (y > y1 ? (-2 * Kd * (y - y1)) / (spanD * spanD) : 0),
  );
  head.group.position.y = lift;
  const pivot = new THREE.Group();
  pivot.add(head.group);
  // the entrance hole under the glass
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#2a1608' }));
  const hy = -0.5;
  hole.position.set(0, hy + lift, head.frontAt(0, hy) + 0.006);
  faceAlong(hole, surfaceNormal(new THREE.Vector3(0, hy, head.frontAt(0, hy)), a, b, c, n));
  pivot.add(hole);
  // a wooden stand
  const wood = toon(trimPaint(F, { color: '#9a5a3a', shade: '#5a2a3a', spec: 0.3, rim: 0.3, rimColor: '#ffd8b0' }));
  const plank = outlined(new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.1, 1.1, 3, 0.04), wood), 2.3);
  plank.position.y = lift - b - 0.02;
  pivot.add(plank);
  // honey drip under the crown seat's front edge (off the glass)
  const honey = toon({ color: '#ffb020', shade: '#c0561a', spec: 0.95, specSize: 0.94, rim: 0.6, rimColor: '#fff0b0' });
  const drip = outlined(new THREE.Mesh(teardrop(0.05), honey), 1.6);
  drip.rotation.z = Math.PI;
  drip.position.set(0.58, lift - 0.62, 0.36);
  pivot.add(drip);

  // two bees on patrol, one each side
  const bees = [bee(F), bee(F)];
  bees.forEach((b2) => {
    b2.group.scale.setScalar(1.45);
    pivot.add(b2.group);
  });
  const update = (_dt: number, t: number) => {
    bees.forEach((b2, i) => {
      const s = i ? -1 : 1;
      const k = t * (i ? 1.7 : 2.1) + i;
      b2.group.position.set(s * (0.98 + Math.cos(k) * 0.1), (i ? -0.1 : 0.42) + Math.sin(k * 2) * 0.07, 0.12 + Math.sin(k) * 0.14);
      b2.group.rotation.y = s > 0 ? Math.PI : 0;
      b2.group.rotation.z = Math.sin(k * 2) * 0.2;
      b2.wings.forEach((w, j) => (w.rotation.x = (j ? -1 : 1) * (0.3 + Math.abs(Math.sin(t * 40)) * 0.5)));
    });
  };
  update(0, 0);

  return makeShell(
    { id: 'hivemind', name: 'Hivemind', role: 'Beehive', accent: '#ffc23a', asks: 'Swarm, build, or buzz off?' },
    { pivot, face: head.face, width: 2.2, height: 2 * b + 0.2, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, lift + b, 0.02), up: UP.clone(), width: 0.8 } },
  );
}

// ─── Quackers — a rubber duck: head with a bill, a round body, wings ────

export function createQuackers(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.66, b = 0.52, c = 0.56, n = 2.3;
  const lift = 0.2;
  const rubber = paintBody({ color: '#ffd83a', shade: '#e0763a', spec: 0.85, specSize: 0.964, rim: 0.6, rimColor: '#fff6c8', edge: 0.35 }, F);
  const head = buildHead(
    {
      a, b, c, n,
      body: rubber,
      outline: INK,
      screen: { w: 0.94, h: 0.56, r: 0.2, y: 0.06, face: { tint: '#140e04', glow: '#ffc857', amp: 0.085, width: 0.018, glowSize: 0.022 } },
    },
    20.7,
  );
  head.group.position.y = lift;
  const pivot = new THREE.Group();
  const bob = new THREE.Group();
  pivot.add(bob);
  bob.add(head.group);
  const rubberMat = toon(rubber);

  // the body: a round belly behind and below the head
  const bodyGeo = new THREE.SphereGeometry(1, 48, 32);
  bodyGeo.scale(0.82, 0.42, 0.68);
  const belly = outlined(new THREE.Mesh(bodyGeo, rubberMat), 2.5);
  belly.position.set(0, -0.46, -0.16);
  bob.add(belly);
  // wings
  for (const side of [1, -1]) {
    const wg = new THREE.SphereGeometry(1, 28, 18);
    wg.scale(0.12, 0.2, 0.34);
    const w = outlined(new THREE.Mesh(wg, rubberMat), 2.1);
    w.position.set(side * 0.8, -0.4, -0.1);
    w.rotation.set(0.2, side * 0.25, side * -0.35);
    bob.add(w);
  }
  // the tail flick, up behind
  const tailGeo = new THREE.SphereGeometry(1, 24, 16);
  tailGeo.scale(0.16, 0.26, 0.16);
  const tail = outlined(new THREE.Mesh(tailGeo, rubberMat), 2.1);
  tail.position.set(0.52, -0.08, -0.62);
  tail.rotation.set(-0.5, 0, -0.55);
  bob.add(tail);

  // the bill, under the glass
  const billC = F && (F.id === 'tangerine' || F.id === 'cherry') ? { color: F.accent, shade: F.accentShade } : { color: '#ff8a2a', shade: '#c0463a' };
  const billMat = toon({ ...billC, spec: 0.8, specSize: 0.95, rim: 0.5, rimColor: '#ffe0c0' });
  const upper = new THREE.SphereGeometry(1, 32, 16);
  upper.scale(0.34, 0.085, 0.26);
  const billTop = outlined(new THREE.Mesh(upper, billMat), 2.2);
  const by = lift - 0.3;
  billTop.position.set(0, by, head.frontAt(0, by - lift) + 0.1);
  billTop.rotation.x = 0.18;
  bob.add(billTop);
  const lower = new THREE.SphereGeometry(1, 32, 16);
  lower.scale(0.28, 0.065, 0.2);
  const billLow = outlined(new THREE.Mesh(lower, billMat), 2);
  billLow.position.copy(billTop.position).add(new THREE.Vector3(0, -0.085, -0.03));
  billLow.rotation.x = 0.18;
  bob.add(billLow);
  const update = (_dt: number, t: number) => {
    bob.position.y = Math.sin(t * 1.8) * 0.02;
    bob.rotation.z = Math.sin(t * 1.3) * 0.03;
    billLow.position.y = billTop.position.y - 0.085 - Math.max(0, Math.sin(t * 5)) * 0.02 * (Math.sin(t * 0.7) > 0.6 ? 1 : 0);
  };
  update(0, 0);

  return makeShell(
    { id: 'quackers', name: 'Quackers', role: 'Rubber duck', accent: '#ffd83a', asks: 'Splash, float, or quack?' },
    { pivot, face: head.face, width: 1.9, height: 1.7, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, lift + b, 0.02), up: UP.clone(), width: 0.78 } },
  );
}
