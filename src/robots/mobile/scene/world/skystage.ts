import * as THREE from 'three';
import { bevelPuck, fixLatheSeam, rng } from '../geometry';
import { addOutline, toon } from '../toon';
import { glowMaterial } from '../shells/common';
import { SKY } from './sky';

/*
  "Above the clouds": a floating ceramic stage for the Jev mind, a soft cloud sea
  receding into haze below the horizon, Mt. Fuji rising through it, and a dawn glow
  behind the stage. Everything is procedural and cheap: a handful of meshes.
*/

// ─── cloud geometry ─────────────────────────────────────────────────────

function mergeNonIndexed(geos: THREE.BufferGeometry[]) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return out;
}

/** One cumulus: overlapping spheres, cauliflower top, flattened base. */
function cumulus(rand: () => number, width: number, height: number, detail: [number, number] = [14, 9], extra: [number, number] = [2, 3]) {
  const parts: THREE.BufferGeometry[] = [];
  const unit = new THREE.SphereGeometry(1, detail[0], detail[1]);
  const add = (x: number, y: number, z: number, r: number) => {
    const g = unit.clone();
    g.scale(r, r * 0.9, r);
    g.translate(x, y, z);
    parts.push(g);
  };
  const base = Math.max(3, Math.round(width / (height * 0.6)));
  const bumps: [number, number, number][] = [];
  for (let i = 0; i < base; i++) {
    const t = base === 1 ? 0.5 : i / (base - 1);
    const x = (t - 0.5) * width * 0.9 + (rand() - 0.5) * width * 0.06;
    const hump = Math.sin(t * Math.PI);
    const r = height * (0.3 + 0.36 * hump) * (0.85 + rand() * 0.3);
    const y = r * 0.35 + hump * height * 0.16;
    add(x, y, (rand() - 0.5) * height * 0.5, r);
    bumps.push([x, y, r]);
  }
  for (const [x, y, r] of bumps) {
    const n = extra[0] + Math.floor(rand() * extra[1]);
    for (let k = 0; k < n; k++) {
      const a = (rand() * 0.9 + 0.05) * Math.PI;
      add(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.7, (rand() - 0.3) * r * 0.5, r * (0.32 + rand() * 0.24));
    }
  }
  const g = mergeNonIndexed(parts);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const floor = height * 0.04;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < floor) {
      pos.setY(i, floor + (pos.getY(i) - floor) * 0.1);
      if (nor.getY(i) < 0) nor.setXYZ(i, nor.getX(i) * 0.4, -1, nor.getZ(i) * 0.4);
    }
  }
  return g;
}

/**
 * The cloud sea: a few rows of broad, flattened cumulus well below eye level that
 * recede into the haze, plus two far cloud banks. Soft gradient shading on purpose:
 * the world is painted soft so the cel-shaded, ink-lined cast reads crisp in front of it.
 */
export function createCloudSea() {
  const rand = rng(501);
  const parts: THREE.BufferGeometry[] = [];
  // [depth, height, count]: widths overlap so each row reads as one rolling bank
  const rows: [number, number, number][] = [
    [-38, -10.5, 6],
    [-60, -11, 7],
    [-95, -12, 8],
    [-145, -13.5, 9],
    [-215, -15, 10],
    [-310, -17, 11],
    [-440, -20, 12],
  ];
  rows.forEach(([z0, y0, count], row) => {
    const spread = 20 + -z0 * 0.8;
    const spacing = (spread * 2) / count;
    for (let i = 0; i < count; i++) {
      const x = -spread + spacing * (i + 0.5) + (rand() - 0.5) * spacing * 0.5;
      const w = spacing * (1.15 + rand() * 0.45);
      const h = w * (0.26 + rand() * 0.1);
      // detail falls off with distance: far rows are small on screen and dissolve in fog
      const detail: [number, number] = row < 2 ? [14, 9] : row < 4 ? [11, 7] : [8, 6];
      const g = cumulus(rng(row * 97 + i * 13 + 7), w, h, detail, row < 4 ? [2, 3] : [1, 2]);
      g.translate(x, y0 - rand() * 1.5, z0 + (rand() - 0.5) * spacing * 0.3);
      parts.push(g);
    }
  });
  // far banks: a tall one on the right, a low one on the left (the headline side stays open)
  const banks: [number, number, number, number, number][] = [
    [205, -24, -360, 170, 80],
    [-170, -28, -420, 190, 46],
  ];
  for (const [x, y, z, w, h] of banks) {
    const g = cumulus(rng(Math.abs(x) + -z), w, h, [10, 7]);
    g.translate(x, y, z);
    parts.push(g);
  }
  const geo = mergeNonIndexed(parts);
  geo.computeBoundingSphere();
  const mat = toon({
    color: '#fff8f3',
    shade: '#adb6f1',
    terminator: -0.16,
    soft: 0.4,
    rim: 0.7,
    rimColor: '#ffe2d2',
    bottomDark: 0.1,
    hi: 0.22,
    edge: 0.0,
  });
  // the cloud sea is backlit by the dawn behind the stage (the cast keeps the front key
  // light): warm bright tops, lavender faces towards us. World updates it per frame.
  mat.uniforms.uLightDirV = { value: new THREE.Vector3() };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -4;
  return { mesh, light: mat.uniforms.uLightDirV.value as THREE.Vector3 };
}

/** Where the cloud sea's light comes from (world space, towards the light). */
export const CLOUD_SUN = new THREE.Vector3(0.2, 0.55, -0.81).normalize();

/**
 * Aerial haze, drawn after the far world and before the cast (it blends in the opaque
 * pass at renderOrder -3). It thickens along the horizon and pools softly behind the
 * orbit, so the background recedes and the shells stay crisp. One cheap full-screen pass.
 */
export function createHaze() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uHaze: { value: new THREE.Color(SKY.haze) },
      uGlow: { value: new THREE.Color(SKY.glow) },
      uHorizon: { value: 0.42 },
      uFocus: { value: new THREE.Vector2(0.62, 0.55) },
      uAspect: { value: 1.5 },
      uAmount: { value: 1 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHaze, uGlow; uniform float uHorizon, uAspect, uAmount; uniform vec2 uFocus; varying vec2 vUv;
      void main() {
        float dy = vUv.y - uHorizon;
        // thickest on the horizon, thinning fast into the sky and slowly over the near clouds
        float band = exp(-dy * dy / (dy > 0.0 ? 0.006 : 0.018));
        vec2 q = (vUv - uFocus) * vec2(uAspect, 1.0);
        float pool = exp(-dot(q, q) / 0.08);
        float a = clamp(band * 0.42 + pool * 0.08, 0.0, 0.6) * uAmount;
        vec3 col = mix(uHaze, uGlow, clamp(pool * 0.8 + band * 0.2, 0.0, 1.0));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    // custom blending still blends in the opaque pass, which is what slots it between world and cast
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -3;
  return mesh;
}

/** The floating ceramic stage the equipped shell hovers over. */
export function createPlatform() {
  const g = new THREE.Group();
  const R = 1.08;
  const pts: THREE.Vector2[] = [];
  const profile: [number, number][] = [
    [0, 0.0],
    [R - 0.12, 0.0],
    [R - 0.03, -0.02],
    [R, -0.07],
    [R - 0.03, -0.13],
    [R - 0.16, -0.18],
    [R * 0.78, -0.24],
    [R * 0.55, -0.34],
    [R * 0.3, -0.42],
    [0, -0.45],
  ];
  for (const [r, y] of profile) pts.push(new THREE.Vector2(r, y));
  pts.reverse(); // bottom → top, so the lathe's normals face outward
  const geo = new THREE.LatheGeometry(pts, 96);
  geo.computeVertexNormals();
  fixLatheSeam(geo, pts.length, 96);
  const ceramic = toon({ color: '#f3f1fb', shade: '#b0b1de', spec: 0.55, specSize: 0.96, rim: 0.5, rimColor: '#ffe3ef', bottomDark: 0.18, edge: 0.25 });
  const disc = new THREE.Mesh(geo, ceramic);
  addOutline(disc, { color: '#0e0d15', thickness: 2.2 });
  g.add(disc);

  // engraved rings on the stage top
  const groove = toon({ color: '#d9d8ee', shade: '#a3a3d2' });
  for (const r of [R * 0.62, R * 0.86]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 128), groove);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    g.add(ring);
  }
  // a glowing inlay ring that pulses with the mind
  const inlayMat = new THREE.MeshBasicMaterial({ color: '#8fb4ff', toneMapped: false, transparent: true, opacity: 0.85 });
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(R * 0.74, 0.01, 6, 160), inlayMat);
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = 0.004;
  g.add(inlay);
  const inlayGlow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.02, 96), glowMaterial('#7aa0ff', 0.5, 'ring', 0.74 / 1.02, 0.08));
  inlayGlow.rotation.x = -Math.PI / 2;
  inlayGlow.position.y = 0.006;
  g.add(inlayGlow);

  // light the stage casts on the clouds below
  const under = new THREE.Mesh(new THREE.CircleGeometry(R * 2.6, 64), glowMaterial('#9bb8ff', 0.28, 'ring', 0.0, 0.55));
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.5;
  g.add(under);

  // three little runner lights around the rim
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(bevelPuck(0.022, 0.012, 0.004, 10, 1), new THREE.MeshBasicMaterial({ color: '#cfe0ff', toneMapped: false }));
    m.position.set(Math.cos(a) * (R - 0.01), -0.07, Math.sin(a) * (R - 0.01));
    m.rotation.z = Math.PI / 2;
    m.rotation.y = -a;
    lights.push(m);
    g.add(m);
  }

  return {
    group: g,
    radius: R,
    update(t: number, pulse: number) {
      inlayMat.opacity = 0.65 + 0.2 * Math.sin(t * 1.8) + pulse * 0.3;
      lights.forEach((m, i) => {
        const on = 0.5 + 0.5 * Math.sin(t * 2.4 - i * 0.52);
        (m.material as THREE.MeshBasicMaterial).color.setRGB(0.55 + 0.45 * on, 0.7 + 0.3 * on, 1);
      });
    },
  };
}

/** The faint orbit path the shells travel along (rebuilt from the layout's ellipse). */
export class OrbitPath {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffffff') }, uAlpha: { value: 0.5 }, uOpen: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uAlpha; uniform float uOpen; varying vec2 vUv;
        void main() {
          float dash = smoothstep(0.35, 0.5, fract(vUv.x * 120.0 - uTime * 0.6)) * smoothstep(1.0, 0.85, fract(vUv.x * 120.0 - uTime * 0.6));
          float a = (0.35 + dash * 0.65) * uAlpha;
          // an open arc fades out at both ends
          a *= mix(1.0, smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x), uOpen);
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  setPath(points: THREE.Vector3[], radius: number, closed = true) {
    if (points.length < 2 || points.some((p) => !p || !Number.isFinite(p.x + p.y + p.z))) return;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), 256, radius, 5, closed);
    this.mat.uniforms.uOpen.value = closed ? 0 : 1;
  }

  update(t: number) {
    this.mat.uniforms.uTime.value = t;
  }
}

/**
 * Synapses: thin light threads from the mind at the centre to every shell in orbit,
 * with pulses flowing outward. Camera-facing quads, updated each frame (cheap).
 */
export class Synapses {
  readonly group = new THREE.Group();
  private quads: THREE.Mesh[] = [];
  private mat: THREE.ShaderMaterial;
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private side = new THREE.Vector3();

  constructor(count: number) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#b9ccff') }, uAlpha: { value: 0.55 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
        void main() {
          float across = 1.0 - pow(abs(vUv.y - 0.5) * 2.0, 2.0);
          float ends = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float pulse = pow(0.5 + 0.5 * sin((vUv.x * 3.0 - uTime * 0.9) * 6.2831), 8.0);
          float a = across * ends * (0.18 + pulse * 0.82) * uAlpha;
          gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const q = new THREE.Mesh(geo, this.mat);
      q.frustumCulled = false;
      q.renderOrder = -1;
      this.quads.push(q);
      this.group.add(q);
    }
  }

  set(i: number, a: THREE.Vector3, b: THREE.Vector3, camera: THREE.Camera, width: number, visible = true) {
    const q = this.quads[i];
    q.visible = visible;
    if (!visible) return;
    this.dir.copy(b).sub(a);
    this.tmp.copy(camera.position).sub(a);
    this.side.crossVectors(this.dir, this.tmp).normalize().multiplyScalar(width / 2);
    const p = q.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, a.x - this.side.x, a.y - this.side.y, a.z - this.side.z);
    p.setXYZ(1, b.x - this.side.x, b.y - this.side.y, b.z - this.side.z);
    p.setXYZ(2, b.x + this.side.x, b.y + this.side.y, b.z + this.side.z);
    p.setXYZ(3, a.x + this.side.x, a.y + this.side.y, a.z + this.side.z);
    p.needsUpdate = true;
  }

  update(t: number, alpha: number) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uAlpha.value = alpha;
  }
}
