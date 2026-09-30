import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Superellipsoid |x/a|^n + |y/b|^n + |z/c|^n = 1 built from a subdivided cube
 * projected radially onto the surface, with analytic normals (no seams, no
 * pole pinching) — the rounded "TV head" every Jev shell is built on.
 */
export function superEllipsoid(a: number, b: number, c: number, n = 3, seg = 28) {
  const geo = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const s = Math.pow(Math.pow(Math.abs(v.x), n) + Math.pow(Math.abs(v.y), n) + Math.pow(Math.abs(v.z), n), -1 / n);
    const x = v.x * s;
    const y = v.y * s;
    const z = v.z * s;
    pos.setXYZ(i, x * a, y * b, z * c);
    const nx = (Math.sign(x) * Math.pow(Math.abs(x), n - 1)) / a;
    const ny = (Math.sign(y) * Math.pow(Math.abs(y), n - 1)) / b;
    const nz = (Math.sign(z) * Math.pow(Math.abs(z), n - 1)) / c;
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(i, nx / l, ny / l, nz / l);
  }
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** z of the front (+z) surface of a superellipsoid at (x, y), or 0 outside it. */
export function superFrontZ(x: number, y: number, a: number, b: number, c: number, n = 3) {
  const k = 1 - Math.pow(Math.abs(x / a), n) - Math.pow(Math.abs(y / b), n);
  return k <= 0 ? 0 : c * Math.pow(k, 1 / n);
}

/** A plane grid whose z follows `zAt(x, y)`, normals from the surface gradient. */
export function conformingPlane(w: number, h: number, zAt: (x: number, y: number) => number, segX = 40, segY = 28) {
  const geo = new THREE.PlaneGeometry(w, h, segX, segY);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const e = 1e-3;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = zAt(x, y);
    pos.setZ(i, z);
    const dzdx = (zAt(x + e, y) - zAt(x - e, y)) / (2 * e);
    const dzdy = (zAt(x, y + e) - zAt(x, y - e)) / (2 * e);
    const n = new THREE.Vector3(-dzdx, -dzdy, 1).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeBoundingSphere();
  return geo;
}

export function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A rounded triangle (cat ear) shape, base on the x axis, apex at (0, h). */
export function roundedTriangleShape(w: number, h: number, r: number) {
  const pts = [new THREE.Vector2(-w / 2, 0), new THREE.Vector2(0, h), new THREE.Vector2(w / 2, 0)];
  const s = new THREE.Shape();
  for (let i = 0; i < 3; i++) {
    const p = pts[i];
    const prev = pts[(i + 2) % 3];
    const next = pts[(i + 1) % 3];
    const toPrev = prev.clone().sub(p).normalize();
    const toNext = next.clone().sub(p).normalize();
    const a = p.clone().addScaledVector(toPrev, r);
    const b = p.clone().addScaledVector(toNext, r);
    if (i === 0) s.moveTo(a.x, a.y);
    else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p.x, p.y, b.x, b.y);
  }
  s.closePath();
  return s;
}

/** Lathe profile helper: rounded puck / cylinder with bevelled rims (axis = y). */
export function bevelPuck(radius: number, height: number, bevel: number, radialSeg = 48, bevelSeg = 5) {
  const pts: THREE.Vector2[] = [];
  const h = height / 2;
  pts.push(new THREE.Vector2(0, h));
  for (let i = 0; i <= bevelSeg; i++) {
    const t = (i / bevelSeg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.sin(t) * bevel, h - bevel + Math.cos(t) * bevel));
  }
  for (let i = 0; i <= bevelSeg; i++) {
    const t = (i / bevelSeg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(t) * bevel, -h + bevel - Math.sin(t) * bevel));
  }
  pts.push(new THREE.Vector2(0, -h));
  // LatheGeometry's normals face outward only when the profile runs bottom → top
  pts.reverse();
  const geo = new THREE.LatheGeometry(pts, radialSeg);
  geo.computeVertexNormals();
  return fixLatheSeam(geo, pts.length, radialSeg);
}

/** Merge several geometries (all attributes must match) into one. */
export function mergeGeos(geos: THREE.BufferGeometry[]) {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(nonIndexed[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const first = nonIndexed[0].getAttribute(name) as THREE.BufferAttribute;
    const itemSize = first.itemSize;
    let total = 0;
    for (const g of nonIndexed) total += g.getAttribute(name).count * itemSize;
    const arr = new Float32Array(total);
    let off = 0;
    for (const g of nonIndexed) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, off);
      off += a.count * itemSize;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  out.computeBoundingSphere();
  return out;
}

/** Bakes a flat vertex colour into a geometry (for merged, vertex-coloured props). */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0, seed = 1) {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const j = jitter ? 1 + (rnd() - 0.5) * jitter : 1;
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r * j;
    arr[i * 3 + 1] = c.g * j;
    arr[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Strip to position/normal/uv so geometries from different generators can merge. */
export function normalizeAttrs(geo: THREE.BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  }
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Signed distance to a rounded rectangle centred at the origin (negative inside). */
export function sdRoundRect(x: number, y: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

export interface FrontSpec {
  /** Where the front plate starts, as a fraction of c (flatter TV face). */
  flat: number;
  /** How much of the natural bulge survives on the plate (0 = dead flat). */
  dome: number;
  screen: { w: number; h: number; r: number; y: number };
  /** Screen pocket: depth and bevel width. */
  depth: number;
  bevel: number;
}

/** z of the head's front after flattening and pocketing (the screen sits on this). */
export function frontZ(x: number, y: number, a: number, b: number, c: number, n: number, f: FrontSpec) {
  let z = superFrontZ(x, y, a, b, c, n);
  const zf = c * f.flat;
  if (z > zf) z = zf + (z - zf) * f.dome;
  const sd = sdRoundRect(x, y - f.screen.y, f.screen.w / 2, f.screen.h / 2, f.screen.r);
  const k = THREE.MathUtils.smoothstep(-sd, -f.bevel, 0);
  return z - f.depth * k;
}

/**
 * The shell body: a superellipsoid whose front is pressed into a gently domed
 * TV plate with a real pocket for the screen (bevelled lip, smooth normals).
 */
export function shellBody(a: number, b: number, c: number, n: number, f: FrontSpec, seg = 44) {
  const geo = superEllipsoid(a, b, c, n, seg);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (z <= 0) continue;
    const zf = c * f.flat;
    let nz = z > zf ? zf + (z - zf) * f.dome : z;
    const sd = sdRoundRect(x, y - f.screen.y, f.screen.w / 2, f.screen.h / 2, f.screen.r);
    nz -= f.depth * THREE.MathUtils.smoothstep(-sd, -f.bevel, 0);
    pos.setZ(i, nz);
  }
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-4);
  merged.computeVertexNormals();
  merged.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(merged.getAttribute('position').count * 2), 2));
  merged.computeBoundingSphere();
  return merged;
}

/** Average the normals across a LatheGeometry's seam so toon shading shows no line there. */
export function fixLatheSeam(geo: THREE.BufferGeometry, points: number, segments: number) {
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let j = 0; j < points; j++) {
    const i0 = j;
    const i1 = segments * points + j;
    v.fromBufferAttribute(nor, i0);
    w.fromBufferAttribute(nor, i1);
    v.add(w).normalize();
    nor.setXYZ(i0, v.x, v.y, v.z);
    nor.setXYZ(i1, v.x, v.y, v.z);
  }
  nor.needsUpdate = true;
  return geo;
}
