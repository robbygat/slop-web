import * as THREE from 'three';
import { roundedRectShape, roundedTriangleShape, bevelPuck, superFrontZ, fixLatheSeam } from '../geometry';
import { canvas, canvasTexture } from '../textures';
import { addOutline, toon } from '../toon';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildHead, chinSocket, collectToon, earPod, makeShell, surfaceNormal, surfacePoint, type Shell } from './common';
import { body as paintBody, finishOf, role, type FinishId } from '../../paint';

/*
  The rounded-TV family: Core, Neko, Builder, Sprout, Noir.
  All share buildHead() (same screen, same mind) and differ only in the shell.
*/

/** Brand: the signal blue of the squiggle, and the chrome the neutral Core is made of. */
export const SIGNAL = '#5b82ff';
export const CHROME = { sky: '#a6c6ff', horizon: '#f6f8ff', dark: '#1d2142', ground: '#e8b9a8' };

// ─── Jev Core — the default shell, in liquid chrome ──────────────────────

export function createCore(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.8, b = 0.66, c = 0.6, n = 2.6;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({
        // liquid chrome: the neutral, pure body of the mind. It reflects the sky world
        chrome: CHROME,
        spec: 0.9,
        specSize: 0.976,
        rim: 0.55,
        rimColor: '#ffe0ee',
        edge: 0.22,
        edgeColor: '#ffffff',
        seams: [
          [0, 0, 1, c * 0.34],
          [0, 1, 0, -b * 0.8],
        ],
        seamWidth: 0.006,
        seamDark: 0.32,
      }, F),
      outline: '#0e0d15',
      screen: {
        w: 1.24,
        h: 0.9,
        r: 0.27,
        y: 0.03,
        face: { tint: '#070a18', line: '#ffffff', glow: SIGNAL, amp: 0.085, width: 0.017, glowSize: 0.024 },
      },
    },
    3.1,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // graphite ear pods with the signal-blue ring: the one colour the mind always carries
  const pod = { r: 0.25, depth: 0.2, color: role(F, '#23263a', (f) => f.trim), shade: role(F, '#4c5078', (f) => f.trimShade), cap: role(F, '#34384f', (f) => f.trim), capR: 0.17, ring: role(F, SIGNAL, (f) => f.led), ringGlow: true, ringR: 0.15 };
  const right = earPod(pod);
  right.position.set(a * 0.93, 0.02, -0.05);
  const left = earPod(pod);
  left.scale.x = -1;
  left.position.set(-a * 0.93, 0.02, -0.05);
  pivot.add(right, left);

  const chin = chinSocket(0.2, 0.11, role(F, '#23263a', (f) => f.trim), '#9a9db0');
  chin.position.set(0, -b * 0.99, 0.02);
  pivot.add(chin);
  // a status light on the chin that breathes with the shared mind
  const statusMat = new THREE.MeshBasicMaterial({ color: role(F, SIGNAL, (f) => f.led), toneMapped: false, transparent: true });
  const status = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.09, 4, 12), statusMat);
  status.rotation.z = Math.PI / 2;
  status.position.set(0, -b * 0.99 - 0.005, 0.02 + 0.2 * 0.98);
  pivot.add(status);

  const update = (_dt: number, t: number) => {
    statusMat.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.1));
  };

  return makeShell(
    { id: 'core', name: 'Jev Core', role: 'Default shell', accent: '#5b82ff', asks: 'Whatever you ask it.' },
    { pivot, face: head.face, width: 2 * a + 0.2, height: 2 * b + 0.12, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b, 0.02), width: 0.9 } },
  );
}

// ─── Neko — cat-eared companion shell ───────────────────────────────────

export function createNeko(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.72, b = 0.61, c = 0.58, n = 2.6;
  const dotDirs: [number, number, number, number][] = [
    [0.7, -0.52, 0.52, 0.034],
    [0.82, -0.36, 0.44, 0.028],
    [0.58, -0.66, 0.5, 0.026],
    [0.88, -0.2, 0.3, 0.024],
    [0.42, -0.78, 0.46, 0.03],
    [-0.62, -0.62, 0.48, 0.026],
    [0.9, -0.5, 0.05, 0.03],
  ];
  const dots = dotDirs.map(([x, y, z, r]) => {
    const p = surfacePoint(new THREE.Vector3(x, y, z), a, b, c, n);
    return [p.x, p.y, p.z, r] as [number, number, number, number];
  });
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({
        color: '#f7f2f8',
        shade: '#b6addc',
        spec: 0.7,
        specSize: 0.97,
        rim: 0.65,
        rimColor: '#ffc9ec',
        seams: [[0, 0, 1, c * 0.3]],
        seamWidth: 0.006,
        seamDark: 0.25,
        dots,
        dotColor: '#1d1b26',
      }, F),
      outline: '#0e0d15',
      screen: {
        w: 1.02,
        h: 0.78,
        r: 0.24,
        y: 0.03,
        face: { tint: '#0a0a18', glow: '#7a8cff', amp: 0.085, width: 0.018, glowSize: 0.022 },
      },
    },
    5.7,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // ears
  const NA = role(F, '#f266cf', (f) => (f.id === 'pearl' ? '#f266cf' : f.accent === '#2a2733' || f.accent === '#23263a' ? '#f266cf' : f.accent));
  const NAS = role(F, '#a45bb8', (f) => (NA === f.accent ? f.accentShade : '#a45bb8'));
  const earOuter = toon({ color: NA, shade: NAS, spec: 0.55, specSize: 0.95, rim: 0.5, rimColor: role(F, '#ffd1f3', (f) => f.accentRim) });
  const earInner = toon({ color: role(F, '#8f2f86', (f) => f.trim), shade: '#8f7fb8', spec: 0.2 });
  const outerGeo = new THREE.ExtrudeGeometry(roundedTriangleShape(0.52, 0.56, 0.08), {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 4,
    curveSegments: 10,
  });
  outerGeo.translate(0, 0, -0.05);
  const innerGeo = new THREE.ExtrudeGeometry(roundedTriangleShape(0.32, 0.38, 0.06), {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 8,
  });
  for (const side of [1, -1]) {
    const ear = new THREE.Group();
    const o = new THREE.Mesh(outerGeo, earOuter);
    addOutline(o, { color: '#0e0d15', thickness: 2.3 });
    const i = new THREE.Mesh(innerGeo, earInner);
    i.position.set(0, 0.07, 0.085);
    ear.add(o, i);
    const base = surfacePoint(new THREE.Vector3(side * 0.62, 0.95, 0.02), a, b, c, n);
    ear.position.copy(base).add(new THREE.Vector3(0, -0.07, 0));
    ear.rotation.set(-0.12, side * -0.28, side * -0.42);
    pivot.add(ear);
  }

  const pod = { r: 0.215, depth: 0.19, color: NA, shade: NAS, outline: '#0e0d15', cap: role(F, '#ffb8ee', (f) => f.accentRim), capR: 0.14, ring: role(F, '#ff9ef0', (f) => f.led), ringGlow: true, ringR: 0.165 };
  const right = earPod(pod);
  right.position.set(a * 0.95, -0.02, -0.02);
  const left = earPod(pod);
  left.scale.x = -1;
  left.position.set(-a * 0.95, -0.02, -0.02);
  pivot.add(right, left);

  // pink chin plate
  const plateMat = toon({ color: NA, shade: NAS, spec: 0.5, rim: 0.4, rimColor: '#ffd1f3' });
  const plate = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRectShape(0.36, 0.14, 0.06), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3 }),
    plateMat,
  );
  addOutline(plate, { color: '#0e0d15', thickness: 2.4 });
  const pp = surfacePoint(new THREE.Vector3(0, -0.78, 0.62), a, b, c, n);
  plate.position.copy(pp).add(new THREE.Vector3(0, -0.02, -0.05));
  plate.rotation.x = 0.7;
  pivot.add(plate);
  const chin = chinSocket(0.14, 0.08, NA, '#ffc2f0');
  chin.position.set(0, -b * 0.99, 0.0);
  pivot.add(chin);

  return makeShell(
    { id: 'neko', name: 'Neko', role: 'Discord moderator', accent: '#ff7ad9', asks: 'Allow, warn, or time out?' },
    { pivot, face: head.face, width: 2 * a + 0.2, height: 2 * b + 0.5, materials: collectToon(pivot), screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b, 0.0), width: 0.62 } },
  );
}

// ─── Clicky — computer use: a glossy mouse that uses the mouse ───────────

/** Narrow a built head towards the top (egg / mouse outline): x *= 1 - k·y/b, in place. */
function taperGroup(root: THREE.Object3D, k: number, b: number) {
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || seen.has(m.geometry)) return;
    seen.add(m.geometry);
    let oy = 0;
    for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) oy += p.position.y;
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = m.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const ds = -k / b; // d(scale)/dy
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const sc = 1 - (k * (pos.getY(i) + oy)) / b;
      pos.setX(i, x * sc);
      // normals follow the inverse transpose of the taper's Jacobian, so smooth stays smooth
      if (nor) {
        const nx = nor.getX(i) / sc;
        const ny = nor.getY(i) - ((x * ds) / sc) * nor.getX(i);
        const nz = nor.getZ(i);
        const l = Math.hypot(nx, ny, nz) || 1;
        nor.setXYZ(i, nx / l, ny / l, nz / l);
      }
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    m.geometry.computeBoundingSphere();
  });
}

function treadTexture() {
  const { c, ctx } = canvas(128, 32);
  ctx.fillStyle = '#34313f';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#17151e';
  for (let i = 0; i < 16; i++) ctx.fillRect(i * 8, 0, 3, 32);
  return canvasTexture(c);
}

export function createClicky(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.6, b = 0.76, c = 0.52, n = 2.4;
  const TAPER = 0.1;
  const YELLOW = '#ffcd45';
  const Y_SHADE = '#dc8a58';
  const palmY = 0.3; // where the two buttons end and the palm begins
  const head = buildHead(
    {
      a, b, c, n,
      flat: 0.86,
      body: paintBody({
        color: YELLOW,
        shade: Y_SHADE,
        spec: 0.72,
        specSize: 0.968,
        rim: 0.5,
        rimColor: '#fff1c4',
        edge: 0.28,
        // the split between the buttons (it stops at the palm) and the line where they end
        seams: [
          [1, 0, 0, 0],
          [0, 1, 0, palmY],
        ],
        seamMasks: [[0, 1, 0, palmY], null],
        seamWidth: 0.0075,
        seamDark: 0.55,
      }, F),
      outline: '#0e0d15',
      screen: {
        w: 0.8,
        h: 0.6,
        r: 0.19,
        y: -0.15,
        face: { tint: '#0a0a15', glow: '#6f8dff', amp: 0.085, width: 0.019, glowSize: 0.022 },
      },
    },
    8.3,
  );
  taperGroup(head.group, TAPER, b);
  const widthAt = (y: number) => 1 - (TAPER * y) / b;
  const zAt = (x: number, y: number) => head.frontAt(x / widthAt(y), y);

  const pivot = new THREE.Group();
  const body = new THREE.Group(); // clicks squash this, so the stage keeps the pivot
  pivot.add(body);
  body.add(head.group);

  // the scroll wheel, seated in the split just above the palm
  const wheelY = 0.5;
  const seat = new THREE.Group();
  const seatP = new THREE.Vector3(0, wheelY, zAt(0, wheelY));
  seat.position.copy(seatP);
  seat.lookAt(seatP.clone().add(surfaceNormal(new THREE.Vector3(0, wheelY, zAt(0, wheelY)), a, b, c, n)));
  const slot = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.26, 0.08, 2, 0.035), toon({ color: '#1b1924', shade: '#4a4660' }));
  slot.position.z = -0.02;
  seat.add(slot);
  const tread = treadTexture();
  tread.wrapS = THREE.RepeatWrapping;
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 28, 1), toon({ map: tread, shade: '#6e6a88', spec: 0.35, specSize: 0.94 }));
  wheel.rotation.z = Math.PI / 2;
  const wheelSpin = new THREE.Group();
  wheelSpin.position.z = 0.012;
  wheelSpin.add(wheel);
  addOutline(wheel, { color: '#0e0d15', thickness: 2.2 });
  seat.add(wheelSpin);
  body.add(seat);

  // the cable: out of the top, curling up like a tail, ending in a USB-C plug
  const tail = new THREE.Group();
  tail.position.set(0, b - 0.06, -0.14);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.12, -0.04),
    new THREE.Vector3(0.09, 0.22, -0.03),
    new THREE.Vector3(0.22, 0.22, 0.01),
    new THREE.Vector3(0.3, 0.3, 0.05),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.034, 12, false), toon({ color: role(F, '#f4f3fa', (f) => (f.body === '#f7f2f8' ? '#2a2733' : '#f4f3fa')), shade: '#9d9bc6', spec: 0.45, rim: 0.4 }));
  addOutline(cable, { color: '#0e0d15', thickness: 2.4 });
  tail.add(cable);
  const plug = new THREE.Group();
  plug.position.copy(curve.getPoint(1));
  plug.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(1));
  const boot = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.15, 0.07, 3, 0.028), toon({ color: '#2a2733', shade: '#5c5974', spec: 0.55, specSize: 0.95 }));
  boot.position.y = 0.05;
  addOutline(boot, { color: '#0e0d15', thickness: 2.2 });
  const metal = new THREE.Mesh(new RoundedBoxGeometry(0.072, 0.1, 0.03, 2, 0.013), toon({ color: '#e6e9f2', shade: '#8a90ac', spec: 0.9, specSize: 0.94 }));
  metal.position.y = 0.17;
  addOutline(metal, { color: '#0e0d15', thickness: 2 });
  const plugLed = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), new THREE.MeshBasicMaterial({ color: '#7dffb5', toneMapped: false }));
  plugLed.position.set(0, 0.07, 0.0355);
  plug.add(boot, metal, plugLed);
  tail.add(plug);
  body.add(tail);

  // RGB underglow round the base, drifting through the spectrum
  const glowY = -0.57;
  const K = Math.pow(1 - Math.pow(Math.abs(glowY / b), n), 1 / n);
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const phi = (i / 96) * Math.PI * 2;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    const xu = a * K * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n);
    let z = c * K * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
    if (z > 0) z = Math.min(z, head.frontAt(xu, glowY));
    ring.push(new THREE.Vector3(xu * widthAt(glowY) * 1.012, glowY, z * 1.012 + (z > 0 ? 0.004 : 0)));
  }
  const rgbMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        vec3 col = mix(vec3(1.0), hue(vUv.x * 2.0 + uTime * 0.07), 0.62);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  });
  const rgb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 192, 0.014, 6, true), rgbMat);
  body.add(rgb);

  // comic "click!" ticks that pop off the left button
  const tickMat = new THREE.MeshBasicMaterial({ color: '#0e0d15' });
  const ticks: THREE.Mesh[] = [];
  const clickAt = new THREE.Vector3(-0.3, b - 0.02, 0.16);
  for (const ang of [2.0, 2.45, 2.9]) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.1, 4, 8), tickMat);
    m.userData.dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.25).normalize();
    m.rotation.z = ang - Math.PI / 2;
    m.visible = false;
    ticks.push(m);
    body.add(m);
  }

  let spin = 0.8;
  let lastClick = -1;
  const update = (dt: number, t: number) => {
    // a click every few seconds: the body dips, ticks pop, the wheel gets a flick
    const period = 2.9;
    const k = t % period;
    const n0 = Math.floor(t / period);
    if (n0 !== lastClick && k < 0.05) {
      lastClick = n0;
      spin = 11;
    }
    const press = k < 0.16 ? Math.sin((k / 0.16) * Math.PI) : 0;
    body.scale.set(1 + press * 0.018, 1 - press * 0.035, 1);
    body.position.y = -press * 0.012;
    const pop = k < 0.32 ? Math.sin((k / 0.32) * Math.PI) : 0;
    ticks.forEach((m) => {
      m.visible = pop > 0.02;
      const d = m.userData.dir as THREE.Vector3;
      m.position.copy(clickAt).addScaledVector(d, 0.12 + pop * 0.1);
      m.scale.setScalar(Math.max(0.001, pop));
    });
    spin = 0.8 + (spin - 0.8) * Math.exp(-dt * 2.4);
    wheelSpin.rotation.x -= spin * dt;
    tail.rotation.z = Math.sin(t * 1.15) * 0.05;
    tail.rotation.x = Math.sin(t * 0.8 + 1) * 0.04;
    rgbMat.uniforms.uTime.value = t;
  };

  return makeShell(
    { id: 'clicky', name: 'Clicky', role: 'Computer use', accent: '#ffc233', asks: 'Which button, and what to do?' },
    { pivot, face: head.face, width: 2 * a * widthAt(-b) + 0.12, height: 2 * b + 0.46, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b - 0.02, 0.1), width: 0.7 } },
  );
}

// ─── Gatekeeper — approval gate for AI agents (guard cap, badge, earpiece) ─

function shieldShape(w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(0, h / 2);
  s.quadraticCurveTo(w * 0.28, h * 0.42, w / 2, h * 0.46);
  s.lineTo(w / 2, h * 0.02);
  s.quadraticCurveTo(w * 0.46, -h * 0.32, 0, -h / 2);
  s.quadraticCurveTo(-w * 0.46, -h * 0.32, -w / 2, h * 0.02);
  s.lineTo(-w / 2, h * 0.46);
  s.quadraticCurveTo(-w * 0.28, h * 0.42, 0, h / 2);
  return s;
}

export function createGatekeeper(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.7, b = 0.6, c = 0.58, n = 2.7;
  const NAVY = '#34448f';
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({ color: NAVY, shade: '#6d6cad', bright: 1.05, spec: 0.6, specSize: 0.97, rim: 0.6, rimColor: '#cfe0ff', seams: [[0, 0, 1, c * 0.32]], seamWidth: 0.006, seamDark: 0.3 }, F),
      outline: '#0e0d15',
      screen: {
        w: 1.0,
        h: 0.7,
        r: 0.2,
        y: -0.06,
        face: { tint: '#090b17', glow: '#6d8cff', amp: 0.085, width: 0.018, glowSize: 0.022 },
      },
    },
    11.9,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // peaked guard cap: flared crown, dark band with a gold stripe, glossy visor, shield badge
  const cap = new THREE.Group();
  // the cap is the uniform: it stays navy on every finish except the dark ones, where it turns white
  const capDark = !F || !['midnight', 'sky'].includes(F.id);
  const capMat = toon({ color: capDark ? '#26336f' : '#f4f2fb', shade: capDark ? '#6560a6' : '#aeb0dc', spec: 0.5, specSize: 0.96, rim: 0.5, rimColor: '#cfe0ff' });
  const crownPts: THREE.Vector2[] = [];
  const crownProfile: [number, number][] = [
    [0.47, 0.0],
    [0.5, 0.08],
    [0.58, 0.2],
    [0.6, 0.25],
    [0.54, 0.29],
    [0.3, 0.31],
    [0.0, 0.31],
  ];
  for (const [r, y] of crownProfile) crownPts.push(new THREE.Vector2(r, y));
  const crown = new THREE.Mesh(new THREE.LatheGeometry(crownPts, 48), capMat);
  crown.geometry.computeVertexNormals();
  fixLatheSeam(crown.geometry, crownPts.length, 48);
  addOutline(crown, { color: '#0e0d15', thickness: 2.4 });
  cap.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.478, 0.478, 0.1, 48, 1, true), toon({ color: '#141a3a', shade: '#5c5a90', spec: 0.6, specSize: 0.95 }));
  band.position.y = 0.05;
  cap.add(band);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.482, 0.012, 6, 64), toon({ color: '#f2c14e', shade: '#c58a6a', spec: 0.7, specSize: 0.94 }));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 0.1;
  cap.add(stripe);
  const visorShape = new THREE.Shape();
  visorShape.absarc(0, 0, 0.5, Math.PI * 0.08, Math.PI * 0.92, false);
  visorShape.absarc(0, -0.06, 0.34, Math.PI * 0.9, Math.PI * 0.1, true);
  const visor = new THREE.Mesh(
    new THREE.ExtrudeGeometry(visorShape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 }),
    toon({ color: '#10131f', shade: '#6f6f95', spec: 0.9, specSize: 0.94, rim: 0.4, rimColor: '#cfe0ff' }),
  );
  visor.rotation.set(-Math.PI / 2 + 0.3, 0, 0);
  visor.position.set(0, 0.02, 0.14);
  addOutline(visor, { color: '#0e0d15', thickness: 2 });
  cap.add(visor);
  const badge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shieldShape(0.16, 0.19), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 }),
    toon({ color: '#f5c64f', shade: '#c7866a', spec: 0.9, specSize: 0.93 }),
  );
  badge.position.set(0, 0.19, 0.555);
  badge.rotation.x = -0.32;
  addOutline(badge, { color: '#4a3208', thickness: 1.6 });
  cap.add(badge);
  cap.position.set(0, b * 0.72, -0.02);
  cap.rotation.x = -0.1;
  pivot.add(cap);

  const pod = { r: 0.23, depth: 0.19, color: role(F, '#1c2146', (f) => f.trim), shade: role(F, '#5c5a90', (f) => f.trimShade), cap: role(F, '#2c3470', (f) => f.trim), capR: 0.15 };
  const right = earPod(pod);
  right.position.set(a * 0.94, -0.04, -0.03);
  const left = earPod(pod);
  left.scale.x = -1;
  left.position.set(-a * 0.94, -0.04, -0.03);
  pivot.add(right, left);

  // the earpiece: a coiled cable dropping from the right pod
  const coilPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const ang = t * Math.PI * 2 * 6;
    coilPts.push(new THREE.Vector3(a * 0.94 + 0.05 + Math.cos(ang) * 0.03, -0.18 - t * 0.42, -0.06 + Math.sin(ang) * 0.03));
  }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 160, 0.008, 5, false), toon({ color: '#e9e6f2', shade: '#9f9dc4' }));
  pivot.add(coil);

  const chin = chinSocket(0.18, 0.1, role(F, '#1c2146', (f) => f.trim), '#f2c14e');
  chin.position.set(0, -b * 0.99, 0.02);
  pivot.add(chin);

  return makeShell(
    { id: 'gatekeeper', name: 'Gatekeeper', role: 'Agent guardrail', accent: '#6d8cff', asks: 'Run it, ask first, or block?' },
    { pivot, face: head.face, width: 2 * a + 0.24, height: 2 * b + 0.34, materials: collectToon(pivot), screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b * 0.72 + 0.3, -0.05), width: 0.8 } },
  );
}

// ─── Noir — paper-trading decision gate ─────────────────────────────────────

export function createNoir(finish: FinishId = 'signature'): Shell {
  const F = finishOf(finish);
  const a = 0.72, b = 0.63, c = 0.64, n = 2.5;
  const head = buildHead(
    {
      a, b, c, n,
      body: paintBody({
        color: '#2a2a33',
        shade: '#56556f',
        bright: 1.05,
        spec: 0.55,
        specSize: 0.978,
        rim: 0.6,
        rimColor: '#ffb3cc',
        seams: [
          [0, 0, 1, c * 0.3],
          [0, 0, 1, -c * 0.25],
          [1, 0, 0, 0.18],
          [1, 0, 0, -0.18],
        ],
        seamWidth: 0.007,
        seamDark: 0.5,
        bottomDark: 0.12,
      }, F),
      outline: '#0e0d15',
      screen: {
        w: 1.0,
        h: 0.68,
        r: 0.17,
        y: -0.03,
        face: { tint: '#0a0a10', line: '#ffffff', glow: '#ff2238', len: 1.16, amp: 0.28, width: 0.012, glowSize: 0.018, gasketColor: '#111116', chart: { points: 40 } },
      },
    },
    14.2,
  );
  const pivot = new THREE.Group();
  pivot.add(head.group);

  // armour ridges over the crown: they start behind the front plate and run to the back
  const ridgeMat = F ? toon(paintBody({ color: '#30303a', shade: '#56556f', spec: 0.6, specSize: 0.97, rim: 0.6, rimColor: '#ffb3cc' }, F)) : toon({ color: '#30303a', shade: '#56556f', spec: 0.6, specSize: 0.97, rim: 0.6, rimColor: '#ffb3cc' });
  for (const x of [-0.3, 0, 0.3]) {
    // arc from the back of the head (θ≈0) over the crown, stopping short of the front plate
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.034, 8, 32, Math.PI * 0.58), ridgeMat);
    ridge.rotation.set(0, Math.PI / 2, Math.PI * 0.02);
    const topY = superFrontZ(x, 0, a, c, b, n);
    ridge.scale.set(c * 0.96, topY + 0.012, 1);
    ridge.position.x = x;
    pivot.add(ridge);
  }

  const pod = { r: 0.25, depth: 0.2, color: role(F, '#202027', (f) => f.trim), shade: role(F, '#56556f', (f) => f.trimShade), outline: '#0e0d15', cap: role(F, '#2e2e38', (f) => f.trim), capR: 0.18, ring: '#ff3048', ringGlow: true, ringR: 0.17 };
  const right = earPod(pod);
  right.position.set(a * 0.95, -0.03, -0.04);
  const left = earPod(pod);
  left.scale.x = -1;
  left.position.set(-a * 0.95, -0.03, -0.04);
  pivot.add(right, left);
  const chin = chinSocket(0.2, 0.1, role(F, '#202027', (f) => f.trim), '#43434f');
  chin.position.set(0, -b * 0.99, 0.02);
  pivot.add(chin);

  // the LED rings and the glass follow the market: green on a rising leg, red on a falling one
  const leds: THREE.MeshBasicMaterial[] = [];
  const halos: THREE.ShaderMaterial[] = [];
  pivot.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m instanceof THREE.MeshBasicMaterial && m.color.getHexString() === 'ff3048') leds.push(m);
    if (m instanceof THREE.ShaderMaterial && m.uniforms.uStrength && m.uniforms.uColor) halos.push(m);
  });
  const up = new THREE.Color('#36f08a');
  const down = new THREE.Color('#ff3048');
  const tintUp = new THREE.Color('#06130d');
  const tintDown = new THREE.Color('#150709');
  const cur = new THREE.Color('#ff3048');
  const tint = head.face.material.uniforms.uTint.value as THREE.Color;
  const update = (dt: number) => {
    const rising = head.face.trend > 0;
    cur.lerp(rising ? up : down, 1 - Math.exp(-dt * 7));
    for (const m of leds) m.color.copy(cur);
    for (const m of halos) (m.uniforms.uColor.value as THREE.Color).copy(cur);
    tint.lerp(rising ? tintUp : tintDown, 1 - Math.exp(-dt * 3));
  };

  return makeShell(
    { id: 'noir', name: 'Noir', role: 'Paper-trading gate', accent: '#36f08a', asks: 'Enter, wait, or exit?' },
    { pivot, face: head.face, width: 2 * a + 0.22, height: 2 * b + 0.1, materials: collectToon(pivot), update, screen: head.screen, screenSpec: head.screenSpec, anchors: { top: new THREE.Vector3(0, b + 0.03, 0.0), width: 0.9 } },
  );
}

export { surfaceNormal, bevelPuck };
