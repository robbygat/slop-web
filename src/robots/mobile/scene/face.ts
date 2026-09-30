import * as THREE from 'three';
import { shared } from './toon';

/**
 * The Jev "mind": a glossy black screen with the living squiggle.
 * The squiggle is a smooth polyline the CPU evaluates every frame (the flowing wave,
 * blended with whatever expression the face is making) and the fragment shader draws
 * with exact segment distances, round caps and layered glow, so it stays razor sharp,
 * even in width, and never pops.
 */

/** Points in the squiggle polyline. */
export const SQ_N = 72;

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform float uShape;
  uniform float uRadius;
  uniform vec3 uTint;
  uniform vec3 uLine;
  uniform vec3 uGlow;
  uniform float uLen;
  uniform float uAmp;
  uniform float uTh0;
  uniform float uTh1;
  uniform float uPhase;
  uniform float uWidth;
  uniform float uGlowSize;
  uniform float uBright;
  uniform vec2 uOffset;
  uniform float uGlitch;
  uniform float uPower;
  uniform float uSheen;
  uniform float uBezel;
  uniform float uGasket;
  uniform vec3 uGasketColor;
  uniform float uReveal;
  uniform sampler2D uAppFace;
  uniform float uAppFaceEnabled;
  #ifdef CHART
    uniform float uPts[CHART_N];
    uniform float uScroll;
    uniform vec3 uTrend;
    uniform float uBaseY;
  #else
    uniform float uSq[SQ_N];
  #endif
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float sd = uShape < 0.5 ? sdRoundRect(p, vec2(uAspect * 0.5, 0.5), uRadius) : length(p) - 0.5;
    float aa = fwidth(sd);
    float alpha = 1.0 - smoothstep(-aa, aa, sd);
    if (alpha <= 0.001) discard;

    vec3 N = normalize(vNormalV);
    vec3 V = normalize(-vViewPos);
    float sdIn = sd + uGasket;

    // deep glass: a lit display, brightest in the middle, easing (not slamming) into the lip
    float centre = smoothstep(0.95, 0.0, length(p * vec2(0.7, 1.0)));
    vec3 col = uTint * (0.75 + 0.85 * centre);
    float inner = smoothstep(-uBezel * 1.6, 0.0, sdIn);
    col *= 1.0 - inner * 0.28;
    // the mind lights the whole pane faintly, so the screen never reads as a black hole
    col += uGlow * 0.055 * (0.35 + centre);

    // glossy reflection band + fresnel sheen
    float band = smoothstep(0.16, 0.0, abs((p.x * 0.42 + p.y) - 0.33)) * smoothstep(-0.2, 0.25, p.y);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
    col += vec3(0.55, 0.6, 0.85) * (band * 0.06 + fres * 0.18) * uSheen;

    // Paint the app's face into this glass pass. A second, coplanar display mesh
    // produces depth fighting during rotation and lets the old expression bleed through.
    if (uAppFaceEnabled > 0.5) {
      vec4 appFace = texture2D(uAppFace, vUv);
      col += appFace.rgb * appFace.a;
    } else {
    vec2 q = p - uOffset;
    float w = uWidth;
    float power = uPower;
    #ifdef CHART
      // live crypto ticker: jagged auto-scaled price line, gradient area, dotted open, pulsing last price
      float halfLen = uLen * 0.5;
      float dx = uLen / float(CHART_N - 2);
      float xEnd = mix(-halfLen, halfLen, uReveal);
      float fi = (q.x + halfLen) / dx + uScroll;
      int i0 = int(floor(fi));
      float dMin = length(q - vec2(-halfLen, mix(uPts[0], uPts[1], uScroll) * uAmp));
      for (int k = -6; k <= 6; k++) {
        int i = i0 + k;
        if (i < 0 || i >= CHART_N - 1) continue;
        float x0 = -halfLen + (float(i) - uScroll) * dx;
        float x1 = x0 + dx;
        if (x1 < -halfLen || x0 > xEnd) continue;
        vec2 a = vec2(x0, uPts[i] * uAmp);
        vec2 b = vec2(x1, uPts[i + 1] * uAmp);
        vec2 ca = x0 < -halfLen ? mix(a, b, (-halfLen - x0) / dx) : a;
        vec2 cb = x1 > xEnd ? mix(a, b, (xEnd - x0) / dx) : b;
        dMin = min(dMin, sdSegment(q, ca, cb));
      }
      int ic = clamp(i0, 0, CHART_N - 2);
      float yl = mix(uPts[ic], uPts[ic + 1], clamp(fi - float(ic), 0.0, 1.0)) * uAmp;
      float inX = step(-halfLen, q.x) * step(q.x, xEnd);
      float floorY = -0.46;
      float ft = clamp((q.y - floorY) / max(yl - floorY, 1e-3), 0.0, 1.0);
      float fill = inX * step(q.y, yl) * step(floorY, q.y) * (0.03 + 0.3 * ft * ft * ft);
      // AA from the pixel footprint (stable), not from dMin (which jumps at spikes)
      float aaL = length(fwidth(q)) * 0.75 + 0.0004;
      float core = 1.0 - smoothstep(w - aaL, w + aaL, dMin);
      float halo = exp(-max(dMin - w, 0.0) / uGlowSize);
      // dotted line at the window's open price
      float dash = step(0.45, fract((q.x + halfLen) * 26.0));
      float by = uBaseY * uAmp;
      float baseLine = (1.0 - smoothstep(0.0035, 0.0075, abs(q.y - by))) * dash * inX;
      // last price: pulsing dot + expanding ring
      float yHead = mix(uPts[CHART_N - 2], uPts[CHART_N - 1], uScroll) * uAmp;
      float dh = length(q - vec2(xEnd, yHead));
      float ph = fract(uTime * 0.9);
      float ringR = w * (2.0 + ph * 6.0);
      float ring = (1.0 - smoothstep(0.0, aaL * 2.0 + 0.004, abs(dh - ringR))) * (1.0 - ph) * step(0.999, uReveal);
      float headDot = (1.0 - smoothstep(w * 2.2 - aaL, w * 2.2 + aaL, dh)) * step(0.999, uReveal);
      float dotGlow = exp(-dh / (uGlowSize * 1.8));
      // faint terminal grid
      vec2 g = abs(fract(p * vec2(7.0, 5.0)) - 0.5);
      col += vec3(0.3, 0.34, 0.46) * smoothstep(0.487, 0.5, max(g.x, g.y)) * 0.06;
      col += uTrend * (fill + halo * 0.7 + baseLine * 0.35 + dotGlow * 0.8 + ring * 0.7) * uBright * power;
      col += mix(uTrend, vec3(1.0), 0.25) * (core + headDot) * uBright * power;
    #else
    // squiggle: exact distance to the nearby segments of the polyline, round caps at the ends
    float halfLen = uLen * 0.5;
    float dx = uLen / float(SQ_N - 1);
    float xEnd = mix(-halfLen, halfLen, uReveal);
    float fi = (q.x + halfLen) / dx;
    int i0 = int(floor(fi));
    // the two ends are round caps: exact distance to them keeps the glow smooth past the tips
    float fe0 = (xEnd + halfLen) / dx;
    int ie0 = clamp(int(floor(fe0)), 0, SQ_N - 2);
    vec2 tipEnd = vec2(xEnd, mix(uSq[ie0], uSq[ie0 + 1], clamp(fe0 - float(ie0), 0.0, 1.0)));
    float d = min(length(q - vec2(-halfLen, uSq[0])), length(q - tipEnd));
    for (int k = -6; k <= 6; k++) {
      int i = i0 + k;
      if (i < 0 || i >= SQ_N - 1) continue;
      float x0 = -halfLen + float(i) * dx;
      if (x0 > xEnd) continue;
      float x1 = min(x0 + dx, xEnd);
      vec2 a = vec2(x0, uSq[i]);
      vec2 b = vec2(x1, mix(uSq[i], uSq[i + 1], (x1 - x0) / dx));
      d = min(d, sdSegment(q, a, b));
    }
    // AA from the pixel footprint: stable as the line moves (no shimmer at the peaks)
    float aaL = length(fwidth(q)) * 0.75 + 0.0004;
    float core = 1.0 - smoothstep(w - aaL, w + aaL, d);
    float halo = exp(-max(d - w, 0.0) / uGlowSize);
    float haze = exp(-max(d - w, 0.0) / (uGlowSize * 4.0));
    // while the line writes itself on, its pen tip glows hot
    float fe = (xEnd + halfLen) / dx;
    int ie = clamp(int(floor(fe)), 0, SQ_N - 2);
    vec2 pen = vec2(xEnd, mix(uSq[ie], uSq[ie + 1], clamp(fe - float(ie), 0.0, 1.0)));
    float writing = step(uReveal, 0.999);
    float tip = exp(-length(q - pen) / (uGlowSize * 1.6)) * writing * 1.4;
    col += (uGlow * (halo * 0.75 + haze * 0.14 + tip) + uLine * (core + tip * 0.5)) * uBright * power;
    #endif
    // a soft wash of light across the glass as the mind wakes up
    col += uGlow * uGlitch * 0.18 * smoothstep(0.9, 0.0, length(p));
    col = mix(col, col * (0.93 + 0.07 * sin(vUv.y * 360.0 + uTime * 2.0)), 0.6);
    }

    // gasket: the ink-dark lip where the glass meets the shell
    float gaa = fwidth(sdIn) * 1.2;
    float gasket = smoothstep(-gaa, gaa, sdIn);
    vec3 gcol = uGasketColor * (0.85 + 0.6 * fres);
    col = mix(col, gcol, gasket);

    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export interface FaceOptions {
  aspect: number;
  shape?: 'rect' | 'circle';
  radius?: number;
  tint?: THREE.ColorRepresentation;
  line?: THREE.ColorRepresentation;
  glow?: THREE.ColorRepresentation;
  len?: number;
  amp?: number;
  width?: number;
  glowSize?: number;
  cycles?: [number, number];
  seed?: number;
  gasket?: number;
  gasketColor?: THREE.ColorRepresentation;
  /** Live crypto-chart face instead of the squiggle. */
  chart?: { points?: number; up?: THREE.ColorRepresentation; down?: THREE.ColorRepresentation };
}

export function faceMaterial(o: FaceOptions) {
  const n = o.chart ? o.chart.points ?? 14 : 0;
  const mat = new THREE.ShaderMaterial({
    defines: o.chart ? { CHART: '', CHART_N: n } : { SQ_N },
    uniforms: {
      uTime: shared.uTime,
      uAspect: { value: o.aspect },
      uShape: { value: o.shape === 'circle' ? 1 : 0 },
      uRadius: { value: o.radius ?? 0.2 },
      uTint: { value: new THREE.Color(o.tint ?? '#0b0d1a') },
      uLine: { value: new THREE.Color(o.line ?? '#ffffff') },
      uGlow: { value: new THREE.Color(o.glow ?? '#6f8dff') },
      uLen: { value: o.len ?? 0.8 * o.aspect },
      uAmp: { value: o.amp ?? 0.085 },
      uTh0: { value: (o.cycles?.[0] ?? -0.5) * Math.PI },
      uTh1: { value: (o.cycles?.[1] ?? 2.2) * Math.PI },
      uPhase: { value: 0 },
      uWidth: { value: o.width ?? 0.022 },
      uGlowSize: { value: o.glowSize ?? 0.028 },
      uBright: { value: 1 },
      uOffset: { value: new THREE.Vector2() },
      uGlitch: { value: 0 },
      uPower: { value: 1 },
      uSheen: { value: 1 },
      uBezel: { value: 0.07 },
      uGasket: { value: o.gasket ?? 0.016 },
      uReveal: { value: 1 },
      uAppFace: { value: null },
      uAppFaceEnabled: { value: 0 },
      uPts: { value: new Float32Array(Math.max(1, n)) },
      uSq: { value: new Float32Array(SQ_N) },
      uScroll: { value: 0 },
      uTrend: { value: new THREE.Color(o.chart?.up ?? '#2ee88a') },
      uBaseY: { value: 0 },
      uGasketColor: { value: new THREE.Color(o.gasketColor ?? '#2a2b38') },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: true,
  });
  return mat;
}

type Mood = 'idle' | 'happy' | 'boot' | 'curious';

/** The faces a screen can pull. Every one is a curve over the line's width (u in -1..1). */
export type Expr = 'smile' | 'eyes' | 'think' | 'heartbeat' | 'buzz' | 'hello' | 'wow' | 'sleepy' | 'zigzag';

const gauss = (v: number, w: number) => Math.exp(-(v / w) * (v / w));

/** y in units of the face's amplitude, for position u and time k since the expression began. */
const SHAPES: Record<Expr, (u: number, k: number, phase: number) => number> = {
  // ‿ a big soft smile
  smile: (u) => 1.45 * u * u - 0.6,
  // ^ ^ closed happy eyes
  eyes: (u) => 1.2 * Math.abs(Math.sin(Math.PI * (u + 1))) - 0.4,
  // a thought scanning back and forth
  think: (u, k) => 0.62 * gauss(u - Math.sin(k * 2.1) * 0.72, 0.16) - 0.08,
  // a pulse monitor blip travelling across: alive
  heartbeat: (u, k) => {
    const v = u - (-1.25 + ((k * 0.95) % 1) * 2.5);
    return 1.75 * gauss(v, 0.045) - 0.8 * gauss(v - 0.075, 0.045) + 0.3 * gauss(v + 0.21, 0.07);
  },
  // excited: a quick, bright buzz
  buzz: (u, _k, phase) => 0.78 * Math.sin(Math.PI * 4.2 * (u + 1) + phase * 3.1),
  // hello: a wave packet rolling left to right
  hello: (u, k) => {
    const x0 = -1.35 + ((k * 1.75) % 2.9);
    return 1.35 * gauss(u - x0, 0.34) * Math.cos(3.4 * Math.PI * (u - x0));
  },
  // wow: one tall peak
  wow: (u) => 1.75 * gauss(u, 0.2) - 0.25,
  // sleepy: low, slow and drooping
  sleepy: (u, _k, phase) => 0.22 * Math.sin(Math.PI * 1.15 * (u + 1) + phase * 0.35) - 0.34,
  // grumpy / electric zigzag
  zigzag: (u, k) => {
    const x = (u + 1) * 2.6 + k * 1.2;
    return 0.85 * (2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1);
  },
};

/** How long each expression holds, and how often idle faces choose it. */
const EXPRS: [Expr, number, number][] = [
  ['smile', 2.4, 3],
  ['eyes', 2.2, 3],
  ['hello', 1.7, 2],
  ['think', 2.8, 2],
  ['heartbeat', 2.3, 1.6],
  ['wow', 1.3, 1],
  ['buzz', 1.4, 1],
  ['sleepy', 3.2, 0.8],
  ['zigzag', 1.4, 0.5],
];

const smoother = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

function seeded(seed: number) {
  let a = Math.floor(seed * 9973 + 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The one mind every shell shares: a single, ever-forward clock for the squiggle's flow.
 * "Different shells. Same mind.": every wave flows in step; faces only differ in the
 * expressions they pull, each on its own time.
 */
export const mind = {
  phase: 0,
  /** Kept for callers; the shared blink is gone (in unison it read as a glitch). */
  blink: 1,
  breath: 0,
  reduced: false,
  lastTick: -1,
  tick(dt: number, t: number) {
    // the hero and the portraits both drive the mind: only the first call in a frame counts
    const now = performance.now();
    if (now - this.lastTick < 4) return;
    this.lastTick = now;
    this.phase += dt * (this.reduced ? 0.4 : 1.2);
    this.breath = this.reduced ? 0 : Math.sin(t * 0.9) * 0.06;
  },
};

/** Animates one face: the shared flow, plus its own glances, blinks and expressions. */
export class Face {
  readonly material: THREE.ShaderMaterial;
  private u: Record<string, THREE.IUniform>;
  private baseAmp: number;
  /** Extra phase while excited; it only ever moves forward and wraps back into step at 2π. */
  private lead = 0;
  private mood: Mood = 'idle';
  private moodT = 0;
  private glance = new THREE.Vector2();
  private glanceTarget = new THREE.Vector2();
  private excite = 0;
  private exciteTarget = 0;
  private rand: () => number;
  private sq: Float32Array | null = null;
  private expr: { name: Expr; t: number; dur: number; held: boolean } | null = null;
  private weight = 0;
  /** The expression being replaced, fading out underneath the new one (a true cross-fade). */
  private prev: { name: Expr; t: number; weight: number } | null = null;
  private pending: { name: Expr; delay: number } | null = null;
  private nextExpr: number;
  private blinkT = -1;
  private nextBlink: number;
  private time = 0;
  private chart: {
    pts: Float32Array;
    prices: number[];
    scroll: number;
    price: number;
    vol: number;
    drift: number;
    lo: number;
    hi: number;
    up: THREE.Color;
    down: THREE.Color;
  } | null = null;
  /** +1 while a chart face is above its window open, -1 while below. */
  trend = 1;
  reduced = false;

  constructor(material: THREE.ShaderMaterial, seed = 0) {
    this.material = material;
    this.u = material.uniforms;
    this.baseAmp = this.u.uAmp.value;
    this.rand = seeded(seed + 0.37);
    this.nextExpr = 3 + this.rand() * 9;
    this.nextBlink = 5 + this.rand() * 8;
    if (material.defines?.CHART !== undefined) {
      const pts = material.uniforms.uPts.value as Float32Array;
      this.chart = {
        pts,
        prices: [],
        scroll: 0,
        price: 64000,
        vol: 0.0016,
        drift: 0.0004,
        lo: 0,
        hi: 0,
        up: new THREE.Color('#2ee88a'),
        down: new THREE.Color('#ff3d57'),
      };
      for (let i = 0; i < pts.length; i++) this.chart.prices.push(this.tick());
      this.rescale(1, 1);
    } else {
      this.sq = material.uniforms.uSq.value as Float32Array;
      this.shape(0);
    }
  }

  /** One tick of a crypto-like price: log returns with volatility clustering, regime drift and rare wicks. */
  private tick() {
    const c = this.chart!;
    const g = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    if (Math.random() < 0.05) c.drift = (Math.random() - 0.45) * 0.0022; // regime change: pump, dump or chop
    c.vol = c.vol * 0.93 + 0.0015 * 0.07 + (Math.random() < 0.03 ? 0.003 : 0);
    let ret = c.drift + c.vol * g;
    if (Math.random() < 0.015) ret += (Math.random() - 0.5) * 0.009; // a wick
    c.price *= Math.exp(ret);
    return c.price;
  }

  /**
   * Auto-scale the visible window into -1..1 like an exchange chart: expand quickly when the
   * price breaks out, contract slowly, so the line never "breathes" from frame to frame.
   */
  private rescale(kOut: number, kIn: number) {
    const c = this.chart!;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of c.prices) {
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
    }
    const pad = (hi - lo) * 0.14 + c.price * 0.0005;
    const tLo = lo - pad;
    const tHi = hi + pad;
    c.lo += (tLo - c.lo) * (tLo < c.lo ? kOut : kIn);
    c.hi += (tHi - c.hi) * (tHi > c.hi ? kOut : kIn);
    const span = Math.max(1e-6, c.hi - c.lo);
    for (let i = 0; i < c.pts.length; i++) c.pts[i] = ((c.prices[i] - c.lo) / span) * 2 - 1;
  }

  /** Where the bot is "looking", in screen units (-1..1). */
  look(x: number, y: number) {
    const aspect = this.u.uAspect.value as number;
    this.glanceTarget.set(x * 0.045 * aspect, y * 0.05);
  }

  /** Pull a face. Held expressions last until released with `express(null)`. */
  express(name: Expr | null, held = false) {
    if (!this.sq) return;
    this.pending = null;
    if (name === null) {
      if (this.expr?.held) this.expr = { ...this.expr, held: false, dur: this.expr.t };
      return;
    }
    const spec = EXPRS.find((e) => e[0] === name)!;
    // the old expression keeps fading out underneath while the new one fades in
    if (this.expr && this.weight > 0.01) this.prev = { name: this.expr.name, t: this.expr.t, weight: this.weight };
    this.expr = { name, t: 0, dur: held ? Infinity : spec[1], held };
    this.weight = 0;
  }

  react(mood: Mood = 'happy') {
    this.mood = mood;
    this.moodT = 0;
    if (mood === 'boot') this.u.uReveal.value = 0;
    // a cheer ripples: every face joins in on its own beat, never in unison
    if (mood === 'happy' && this.sq) this.pending = { name: this.rand() < 0.5 ? 'smile' : 'eyes', delay: this.rand() * 0.55 };
    if (mood === 'curious') this.express('think');
  }

  setExcited(on: boolean) {
    this.exciteTarget = on ? 1 : 0;
    if (!this.sq) return;
    if (on) this.express('eyes', true);
    else this.express(null);
  }

  private pick(): Expr {
    const total = EXPRS.reduce((a, e) => a + e[2], 0);
    let r = this.rand() * total;
    for (const [name, , w] of EXPRS) {
      r -= w;
      if (r <= 0) return name;
    }
    return 'smile';
  }

  /** Evaluate the squiggle: the flowing wave blended into the current expression. */
  private shape(amp: number) {
    const sq = this.sq!;
    const th0 = this.u.uTh0.value as number;
    const th1 = this.u.uTh1.value as number;
    const phase = mind.phase + this.lead;
    const e = this.expr;
    const w = this.weight;
    const fn = e ? SHAPES[e.name] : null;
    const pv = this.prev;
    const fp = pv ? SHAPES[pv.name] : null;
    for (let i = 0; i < SQ_N; i++) {
      const t = i / (SQ_N - 1);
      const u = t * 2 - 1;
      let y = Math.sin(th0 + (th1 - th0) * t + phase);
      if (fp && pv!.weight > 0) y += (fp(u, pv!.t, phase) - y) * pv!.weight;
      if (fn && w > 0) y += (fn(u, e!.t, phase) - y) * w;
      // the wave settles a touch towards both tips, so the ends glide instead of flicking
      sq[i] = y * amp * (0.86 + 0.14 * Math.sin(Math.PI * t));
    }
  }

  update(dt: number, _t: number) {
    const u = this.u;
    this.time += dt;
    this.excite += (this.exciteTarget - this.excite) * Math.min(1, dt * 5);
    // excited faces run ahead; afterwards they keep moving forward until back in step (never backwards)
    if (this.excite > 0.02) this.lead += dt * 1.6 * this.excite;
    else if (this.lead > 0) {
      this.lead += dt * 1.1;
      if (this.lead >= Math.PI * 2) this.lead = 0;
    }

    let reveal = 1;
    let glitch = 0;
    let power = u.uPower.value as number;
    let react = 1;

    this.moodT += dt;
    if (this.mood === 'boot') {
      // power-on: the line draws itself from left to right, then settles with a soft bounce
      const k = this.moodT;
      power = 1;
      reveal = smoother((k - 0.06) / 0.5);
      glitch = Math.max(0, 1 - k / 0.8);
      react = 1 + 0.3 * Math.sin(smoother(k / 1.0) * Math.PI);
      if (k > 1.1) {
        this.mood = 'idle';
        if (this.sq) this.express('heartbeat');
      }
    } else if (this.mood !== 'idle') {
      if (this.moodT > 1.2) this.mood = 'idle';
      power += (1 - power) * Math.min(1, dt * 4);
    } else {
      power += (1 - power) * Math.min(1, dt * 4);
    }

    if (this.chart) {
      // a price chart keeps a fixed scale: no blink, no breathing, no bounce
      const c = this.chart;
      c.scroll += (dt / (this.reduced ? 1.2 : 0.42)) * (1 + this.excite * 0.6);
      while (c.scroll >= 1) {
        c.scroll -= 1;
        c.prices.shift();
        c.prices.push(this.tick());
      }
      this.rescale(1 - Math.exp(-dt * 6), 1 - Math.exp(-dt * 0.8));
      const open = c.prices[1] + (c.prices[2] - c.prices[1]) * c.scroll;
      // hysteresis so the colour doesn't flicker while the price hugs the open
      const band = (c.hi - c.lo) * 0.05;
      if (this.trend > 0 && c.price < open - band) this.trend = -1;
      else if (this.trend < 0 && c.price > open + band) this.trend = 1;
      const tc = u.uTrend.value as THREE.Color;
      tc.lerp(this.trend > 0 ? c.up : c.down, 1 - Math.exp(-dt * 10));
      u.uBaseY.value = ((open - c.lo) / Math.max(1e-6, c.hi - c.lo)) * 2 - 1;
      u.uScroll.value = c.scroll;
      u.uAmp.value = this.baseAmp;
    } else {
      // expressions: each face chooses its own, on its own schedule
      const calm = this.reduced || mind.reduced;
      if (!this.expr && !calm && this.mood === 'idle') {
        this.nextExpr -= dt;
        if (this.nextExpr <= 0) {
          this.express(this.pick());
          this.nextExpr = 6 + this.rand() * 10;
        }
      }
      if (this.pending) {
        this.pending.delay -= dt;
        if (this.pending.delay <= 0) this.express(this.pending.name);
      }
      if (this.prev) {
        this.prev.t += dt;
        this.prev.weight *= Math.exp(-dt * 7);
        if (this.prev.weight < 0.01) this.prev = null;
      }
      if (this.expr) {
        const e = this.expr;
        e.t += dt;
        const target = e.t < e.dur ? 1 : 0;
        // ease in over ~0.35 s, out over ~0.45 s
        this.weight += (target - this.weight) * (1 - Math.exp(-dt * (target ? 9 : 7)));
        if (!e.held && e.t >= e.dur && this.weight < 0.01) {
          this.expr = null;
          this.weight = 0;
        }
      }
      // a gentle, private blink now and then: a slow dip, never a snap
      let blink = 1;
      if (!calm && !this.expr) {
        this.nextBlink -= dt;
        if (this.nextBlink <= 0 && this.blinkT < 0) {
          this.blinkT = 0;
          this.nextBlink = 7 + this.rand() * 11;
        }
      }
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const b = this.blinkT / 0.55;
        blink = 1 - 0.62 * Math.sin(smoother(b) * Math.PI);
        if (b >= 1) this.blinkT = -1;
      }
      const amp = this.baseAmp * (1 + mind.breath + this.excite * 0.12) * blink * react;
      u.uAmp.value = amp;
      this.shape(amp);
    }

    this.glance.lerp(this.glanceTarget, 1 - Math.exp(-dt * 4));
    u.uOffset.value.copy(this.glance);
    u.uGlitch.value = glitch;
    u.uReveal.value = reveal;
    u.uPower.value = power;
  }
}
