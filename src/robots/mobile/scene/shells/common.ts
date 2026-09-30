import * as THREE from 'three';
import { Face, faceMaterial, type FaceOptions } from '../face';
import { bevelPuck, conformingPlane, frontZ, shellBody, superEllipsoid, type FrontSpec } from '../geometry';
import { addOutline, toon, type ToonMaterial, type ToonOptions } from '../toon';

export interface Shell {
  id: string;
  name: string;
  role: string;
  accent: string;
  /** The question this shell makes the Jev mind answer. */
  asks: string;
  /** Positioned by the stage. */
  root: THREE.Group;
  /** Local animation pivot (spins, hops, squash). */
  pivot: THREE.Group;
  face: Face;
  /** Object-space size used to fit the shell into a layout slot. */
  width: number;
  height: number;
  pick: THREE.Object3D[];
  materials: ToonMaterial[];
  update(dt: number, t: number): void;
  /** The glass: where the app paints the living face. */
  screen: THREE.Object3D;
  screenSpec: ScreenSpec;
  /** Where headwear sits (pivot space): the crown point, its up direction and room. */
  anchors: { top: THREE.Vector3; up?: THREE.Vector3; width: number };
}

export interface ScreenSpec {
  w: number;
  h: number;
  r: number;
  shape: 'rect' | 'circle';
  gasket: number;
  /** The object whose local space holds the glass. */
  frame: THREE.Object3D;
  /** Corners TL, TR, BR, BL and the centre, in `frame` space (read at render time). */
  corners(): THREE.Vector3[];
}

/** Corners of a (conforming) PlaneGeometry's grid, with the centre's depth. */
export function planeCorners(mesh: THREE.Mesh, segX: number, segY: number) {
  return () => {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const row = segX + 1;
    const at = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i);
    const c = at(Math.floor(segY / 2) * row + Math.floor(segX / 2));
    const pts = [at(0), at(segX), at(row * (segY + 1) - 1), at(row * segY)];
    for (const p of pts) p.z = c.z;
    return [...pts, c];
  };
}

export interface ShellBuild {
  pivot: THREE.Group;
  face: Face;
  width: number;
  height: number;
  materials: ToonMaterial[];
  update?: (dt: number, t: number) => void;
  screen: THREE.Object3D;
  screenSpec: ScreenSpec;
  anchors: { top: THREE.Vector3; up?: THREE.Vector3; width: number };
}

const proxyGeo = new THREE.SphereGeometry(0.5, 12, 8);
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

export function makeShell(meta: { id: string; name: string; role: string; accent: string; asks: string }, build: ShellBuild): Shell {
  const root = new THREE.Group();
  root.name = meta.id;
  root.add(build.pivot);
  // an invisible ellipsoid is all we raycast against: cheap, and easy to hit
  const proxy = new THREE.Mesh(proxyGeo, proxyMat);
  proxy.scale.set(build.width * 0.92, build.height * 0.92, build.width * 0.8);
  proxy.name = 'pick';
  root.add(proxy);
  const pick: THREE.Object3D[] = [proxy];
  return {
    ...meta,
    root,
    pivot: build.pivot,
    face: build.face,
    width: build.width,
    height: build.height,
    pick,
    materials: build.materials,
    screen: build.screen,
    screenSpec: build.screenSpec,
    anchors: build.anchors,
    update(dt, t) {
      build.face.update(dt, t);
      build.update?.(dt, t);
    },
  };
}

/** Collects every toon material inside a group (for flashes on equip). */
export function collectToon(obj: THREE.Object3D) {
  const out: ToonMaterial[] = [];
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as ToonMaterial | undefined;
    if (m && (m as ToonMaterial).isToon && !out.includes(m)) out.push(m);
  });
  return out;
}

export interface HeadSpec {
  a: number;
  b: number;
  c: number;
  n: number;
  /** Front plate flatness (fraction of c) and screen pocket. */
  flat?: number;
  dome?: number;
  depth?: number;
  bevel?: number;
  body: ToonOptions;
  outline: THREE.ColorRepresentation;
  outlineWidth?: number;
  screen: {
    w: number;
    h: number;
    r: number;
    y?: number;
    face?: Partial<FaceOptions>;
  };
}

/** Rounded body + conforming screen. Returns the pieces so shells can decorate them. */
export function buildHead(spec: HeadSpec, seed = 1) {
  const group = new THREE.Group();
  const bodyMat = toon(spec.body);
  const { w, h, r } = spec.screen;
  const sy = spec.screen.y ?? 0;
  const front: FrontSpec = {
    flat: spec.flat ?? 0.9,
    dome: spec.dome ?? 0.22,
    screen: { w, h, r, y: sy },
    depth: spec.depth ?? 0.03,
    bevel: spec.bevel ?? 0.05,
  };
  const body = new THREE.Mesh(shellBody(spec.a, spec.b, spec.c, spec.n, front, 44), bodyMat);
  body.name = 'body';
  addOutline(body, { color: spec.outline, thickness: spec.outlineWidth ?? 2.5, geometry: superEllipsoid(spec.a, spec.b, spec.c, spec.n, 20) });
  group.add(body);

  // the glass sits on the floor of the pocket, following its (slight) dome
  const zAt = (x: number, y: number) => frontZ(x, y + sy, spec.a, spec.b, spec.c, spec.n, front) + 0.0035;
  const screenGeo = conformingPlane(w, h, zAt, 48, 32);
  const faceOpts: FaceOptions = {
    aspect: w / h,
    radius: r / h,
    ...spec.screen.face,
  };
  const mat = faceMaterial(faceOpts);
  const screen = new THREE.Mesh(screenGeo, mat);
  screen.position.y = sy;
  screen.name = 'screen';
  screen.renderOrder = 2;
  group.add(screen);

  const face = new Face(mat, seed);
  const screenSpec: ScreenSpec = {
    w,
    h,
    r,
    shape: 'rect',
    gasket: faceOpts.gasket ?? 0.016,
    frame: screen,
    corners: planeCorners(screen, 48, 32),
  };
  /** z of the real (flattened, pocketed) front surface, for placing details flush on it. */
  const frontAt = (x: number, y: number) => frontZ(x, y, spec.a, spec.b, spec.c, spec.n, front);
  return { group, body, bodyMat, screen, face, frontAt, screenSpec };
}

export interface PodSpec {
  r: number;
  depth: number;
  color: THREE.ColorRepresentation;
  shade?: THREE.ColorRepresentation;
  outline?: THREE.ColorRepresentation;
  cap?: THREE.ColorRepresentation;
  capR?: number;
  ring?: THREE.ColorRepresentation;
  ringGlow?: boolean;
  ringR?: number;
  spec?: number;
}

/** Headphone-style ear pod, axis along +x (mirror with scale.x = -1). */
export function earPod(s: PodSpec) {
  const g = new THREE.Group();
  const podMat = toon({ color: s.color, shade: s.shade ?? '#6f6f95', spec: s.spec ?? 0.5, specSize: 0.94, rim: 0.35, rimColor: '#cfd6ff' });
  const pod = new THREE.Mesh(bevelPuck(s.r, s.depth, Math.min(s.depth * 0.45, s.r * 0.3), 40, 4), podMat);
  pod.rotation.z = -Math.PI / 2;
  addOutline(pod, { color: s.outline ?? '#15151d', thickness: 2.3 });
  g.add(pod);
  if (s.cap) {
    const capMat = toon({ color: s.cap, shade: '#8886b0', spec: 0.35 });
    const cap = new THREE.Mesh(bevelPuck(s.capR ?? s.r * 0.66, s.depth * 0.25, s.depth * 0.1, 36, 3), capMat);
    cap.rotation.z = -Math.PI / 2;
    cap.position.x = s.depth * 0.5;
    g.add(cap);
  }
  if (s.ring) {
    const ringMat = s.ringGlow
      ? new THREE.MeshBasicMaterial({ color: s.ring, fog: false, toneMapped: false })
      : toon({ color: s.ring, shade: '#8a88b2', spec: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(s.ringR ?? s.r * 0.72, s.r * 0.07, 10, 48), ringMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = s.depth * 0.52;
    g.add(ring);
    if (s.ringGlow) {
      const rr = s.ringR ?? s.r * 0.72;
      const halo = new THREE.Mesh(new THREE.RingGeometry(rr * 0.2, rr * 1.6, 48), glowMaterial(s.ring, 0.9, 'ring', 1 / 1.6, 0.16));
      halo.rotation.y = Math.PI / 2;
      halo.position.x = s.depth * 0.56;
      g.add(halo);
    }
  }
  return g;
}

/** Socket under the chin. */
export function chinSocket(r: number, h: number, color: THREE.ColorRepresentation, ring?: THREE.ColorRepresentation) {
  const g = new THREE.Group();
  const mat = toon({ color, shade: '#6f6f95', spec: 0.45, specSize: 0.95, rim: 0.3, rimColor: '#cfd6ff' });
  const puck = new THREE.Mesh(bevelPuck(r, h, h * 0.35, 36, 3), mat);
  addOutline(puck, { color: '#0e0d15', thickness: 2.4 });
  g.add(puck);
  if (ring) {
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, h * 0.12, 8, 40), toon({ color: ring, shade: '#8a88b2', spec: 0.5 }));
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = -h * 0.5;
    g.add(ringMesh);
  }
  return g;
}

/**
 * Soft additive glow. `ring` mode peaks at a radius (RingGeometry / CircleGeometry
 * planar UVs); `band` mode fades across uv.y (for beams and strips).
 */
export function glowMaterial(color: THREE.ColorRepresentation, strength = 1, mode: 'ring' | 'band' = 'ring', peak = 0.62, width = 0.22) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uPeak: { value: peak },
      uWidth: { value: width },
    },
    defines: mode === 'ring' ? { RING: '' } : {},
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength; uniform float uPeak; uniform float uWidth;
      varying vec2 vUv;
      void main() {
        #ifdef RING
          float r = length(vUv - 0.5) * 2.0;
          float a = exp(-pow((r - uPeak) / uWidth, 2.0)) * smoothstep(1.0, 0.9, r);
        #else
          float d = abs(vUv.y - 0.5) * 2.0;
          float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.2);
        #endif
        a *= uStrength;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** Point on a superellipsoid surface in the given direction (for decals & attachments). */
export function surfacePoint(dir: THREE.Vector3, a: number, b: number, c: number, n: number) {
  const d = dir.clone().normalize();
  const s = Math.pow(Math.pow(Math.abs(d.x / a), n) + Math.pow(Math.abs(d.y / b), n) + Math.pow(Math.abs(d.z / c), n), -1 / n);
  return d.multiplyScalar(s);
}

export function surfaceNormal(p: THREE.Vector3, a: number, b: number, c: number, n: number) {
  const nx = (Math.sign(p.x) * Math.pow(Math.abs(p.x / a), n - 1)) / a;
  const ny = (Math.sign(p.y) * Math.pow(Math.abs(p.y / b), n - 1)) / b;
  const nz = (Math.sign(p.z) * Math.pow(Math.abs(p.z / c), n - 1)) / c;
  return new THREE.Vector3(nx, ny, nz).normalize();
}
