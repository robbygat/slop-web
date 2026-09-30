import * as THREE from 'three';
import { createBlocky, createChip } from './shells/special';
import { createClicky, createCore, createNeko, createNoir, createGatekeeper } from './shells/heads';
import type { Shell } from './shells/common';
import { DESKTOP, INITIAL, MOBILE, MOBILE_BAND, SEATS, isPortrait, type Orbit, type SlotId } from './layout';
import {heroComposition} from '../../../lib/hero-composition.js';
import { updateSharedUniforms } from './toon';
import { mind, type Expr } from './face';
import { VISUAL_WEIGHT, visibleBounds } from './bounds';
import { Ribbon, Sparkles, Shockwave } from './fx';
import { World } from './world/World';
import { disposeStageTree } from '../live-loop.mjs';

interface Placement {
  pos: THREE.Vector3;
  boxW: number;
  boxH: number;
  yaw: number;
  pitch: number;
  roll: number;
}

interface Pose {
  pos: THREE.Vector3;
  scale: number;
  yaw: number;
  pitch: number;
  roll: number;
}

/** A scripted flight along a cubic Bézier (the swap choreography). */
interface Motion {
  t: number;
  delay: number;
  dur: number;
  p0: THREE.Vector3;
  c1: THREE.Vector3;
  c2: THREE.Vector3;
  s0: number;
  yaw0: number;
  pitch0: number;
  roll0: number;
  spin: number;
  bank: number;
  crouch: number;
  stretch: number;
  trail: THREE.Color | null;
  onLand?: () => void;
}

interface Actor {
  shell: Shell;
  slot: SlotId;
  seed: number;
  pose: Pose;
  motion: Motion | null;
  impact: number;
  pop: number;
  push: THREE.Vector3;
  pushTarget: THREE.Vector3;
  hover: number;
  hello: number;
  helloAt: number;
  lookYaw: number;
  lookPitch: number;
  accent: THREE.Color;
}

export interface StageEvents {
  onEquip?: (id: string, shell: Shell) => void;
  onLanded?: (id: string, shell: Shell) => void;
  onFocus?: (id: string) => void;
  onHover?: (id: string | null) => void;
  beforeRender?: (time: number) => void;
}

export interface StageOptions {
  brandBackdrop?: boolean;
  dprCap?: number;
  maxFPS?: number;
  particles?: number;
  intro?: boolean;
  powerPreference?: WebGLPowerPreference;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

function bezier(p0: THREE.Vector3, c1: THREE.Vector3, c2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return out.set(
    a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    a * p0.y + b * c1.y + c * c2.y + d * p3.y,
    a * p0.z + b * c1.z + c * c2.z + d * p3.z,
  );
}

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const V4 = new THREE.Vector2();

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 2000);
  readonly world: World;
  readonly actors = new Map<string, Actor>();
  private sparkles: Sparkles;
  private shock = new Shockwave('#9fbcff');
  private ribbon = new Ribbon();
  private events: StageEvents;
  private placements = new Map<SlotId, Placement>();
  private orbitScreen = { cx: 0, cy: 0, rx: 1, ry: 1, w: 1, h: 1 };
  private orbitSpec: Orbit = DESKTOP.orbit;
  private orbitAngle = 0;
  private orbitSpeed = 0;
  private baseCam = new THREE.Vector3();
  private baseTarget = new THREE.Vector3();
  private pointer = new THREE.Vector2(0, 0);
  private pointerSmoothed = new THREE.Vector2(0, 0);
  private pointerActive = 0;
  private pointerDirty = false;
  private lastPointerMove = -10;
  private raycaster = new THREE.Raycaster();
  private hovered: Actor | null = null;
  private lastFrame = 0;
  private time = 0;
  /** QA hook: slow the whole show down (e.g. 0.2) to inspect choreography. */
  timeScale = 1;
  private running = false;
  private disposed = false;
  private queuedTimer = 0;
  private visible = true;
  private raf = 0;
  private w = 1;
  private h = 1;
  private portrait = false;
  private reduced: boolean;
  private equipped = 'core';
  private hero: Actor | null = null;
  private pending: string | null = null;
  private showcaseOn = true;
  private showcaseT = 0;
  private showcaseIdx = 0;
  private flash = 0;
  private dprCap = 2;
  private maxFPS = 30;
  private introEnabled = true;
  private frameTimes: number[] = [];
  private introStarted = false;
  /** QA: no intro, frozen idle (headless screenshots / OG image). */
  still = false;
  framed = false;
  measure: () => { ctaBottom: number; dockTop: number } = () => ({ ctaBottom: 0, dockTop: 0 });
  onParallax?: (x: number, y: number) => void;

  constructor(private canvas: HTMLCanvasElement, events: StageEvents = {}, options: StageOptions = {}) {
    this.events = events;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mind.reduced = this.reduced;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: options.powerPreference || 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    // 1.75× is visually indistinguishable from 2× with MSAA and ~25% cheaper to fill
    this.dprCap = Math.min(window.devicePixelRatio || 1, options.dprCap || 1.75);
    this.maxFPS = Math.max(15, Math.min(30, options.maxFPS || 30));
    this.introEnabled = options.intro !== false;
    this.sparkles = new Sparkles(Math.max(60, Math.min(360, options.particles || 360)));

    this.world = new World(this.scene, {brandBackdrop: options.brandBackdrop});
    this.scene.add(this.sparkles.mesh, this.ribbon.mesh);
    this.world.pedestal.group.add(this.shock.mesh);
    this.shock.mesh.position.y = this.world.pedestal.height + 0.02;
    this.shock.mesh.scale.setScalar(this.world.pedestal.radius * 4.2);

    const makers = [createCore, createNeko, createBlocky, createClicky, createGatekeeper, createChip, createNoir];
    makers.forEach((make, i) => {
      const shell = make();
      shell.face.reduced = this.reduced;
      this.scene.add(shell.root);
      this.actors.set(shell.id, {
        shell,
        slot: INITIAL[shell.id],
        seed: i * 1.37 + 0.4,
        pose: { pos: new THREE.Vector3(), scale: 1, yaw: 0, pitch: 0, roll: 0 },
        motion: null,
        impact: -1,
        pop: 1,
        push: new THREE.Vector3(),
        pushTarget: new THREE.Vector3(),
        hover: 0,
        hello: 0,
        helloAt: Infinity,
        lookYaw: 0,
        lookPitch: 0,
        accent: new THREE.Color(shell.accent),
      });
    });

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    this.visible = document.visibilityState === 'visible';
    this.lastFrame = 0;
  };

  setReduced(value: boolean) {
    this.reduced = value;
    mind.reduced = value;
    for (const a of this.actors.values()) a.shell.face.reduced = value;
  }

  /** React owns visibility and motion preferences, including a still first frame. */
  drawStill() {
    if (this.disposed) return;
    for (const a of this.actors.values()) { a.pop = 1; if (!a.motion) this.snap(a); }
    this.update(0);
    this.render();
  }

  redraw() { if (!this.disposed) this.render(); }

  setRenderBudget(dprCap: number, maxFPS: number) {
    this.maxFPS = Math.max(15, Math.min(30, maxFPS));
    this.dprCap = Math.max(.5, Math.min(window.devicePixelRatio || 1, 1.75, dprCap));
  }

  dispose() {
    this.disposed = true;
    this.stop();
    window.clearTimeout(this.queuedTimer);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    document.removeEventListener('visibilitychange', this.onVisibility);
    // Pick proxies are shared by every live stage; retire only owned resources.
    for (const a of this.actors.values()) {
      this.scene.remove(a.shell.root);
      disposeStageTree(a.shell.pivot);
    }
    disposeStageTree(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ─── Layout ────────────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.portrait = !this.framed && isPortrait(w, h);
    this.renderer.setPixelRatio(this.dprCap);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;

    const cam = this.world.cameraFor(w, h, this.portrait);
    this.camera.fov = cam.fov;
    this.baseCam.copy(cam.position);
    this.baseTarget.copy(cam.target);
    this.camera.position.copy(this.baseCam);
    this.camera.lookAt(this.baseTarget);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    this.computeLayout();
    this.updateOrbit();
    for (const a of this.actors.values()) if (!a.motion) this.snap(a);
    const center = this.placements.get('center')!;
    // trace the orbit path in world space for the faint ring the shells travel on
    const o = this.orbitScreen;
    const path: THREE.Vector3[] = [];
    const seats = this.orbitSpec.seats;
    // with fixed seats the path is the halo arc they sit on (through the top), else the full ring
    if (this.world.brandBackdrop) {this.world.layout(this.camera, center.pos, center.boxW, path, !seats); return;}
    const from = seats ? Math.min(...seats.map((a) => (a < Math.PI / 2 ? a + Math.PI * 2 : a))) - 0.35 : 0;
    const to = seats ? Math.max(...seats.map((a) => (a < Math.PI / 2 ? a + Math.PI * 2 : a))) + 0.35 : Math.PI * 2;
    for (let i = 0; i <= 96; i++) {
      const th = from + ((to - from) * i) / 96;
      path.push(this.screenToWorld(o.cx + o.rx * Math.cos(th), o.cy + o.ry * Math.sin(th), this.orbitDepth(th) + 0.5));
    }
    this.world.layout(this.camera, center.pos, center.boxW, path, !seats);
  }

  /** Make the equipped shell's face pull an expression (the decision preview drives this). */
  expressCenter(name: Expr | null) {
    if (this.hero) return; // mid-swap, the landing choreography owns the face
    this.actors.get(this.equipped)?.shell.face.express(name);
  }

  get isPortrait() {
    return this.portrait;
  }

  private screenToWorld(sx: number, sy: number, depth: number, out = new THREE.Vector3()) {
    V1.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    this.camera.getWorldDirection(V2);
    const t = depth / V1.dot(V2);
    return out.copy(this.camera.position).addScaledVector(V1, t);
  }

  private worldPerPx(depth: number) {
    return (2 * depth * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.h;
  }

  /** Screen-space geometry for the current layout (comp units → pixels). */
  private computeLayout() {
    const L = this.portrait ? MOBILE : DESKTOP;
    let map: (x: number, y: number) => { x: number; y: number };
    let k: number;
    let ky: number;
    if (this.framed) {
      const frame=heroComposition(this.w,this.h);k=frame.scale;ky=k;
      map=(x,y)=>({x:frame.x+(x-DESKTOP.center.x)*k,y:frame.y+(y-DESKTOP.center.y)*k});
    } else if (this.portrait) {
      const sx = this.w / MOBILE_BAND.width;
      const m = this.measure();
      const bandTop = m.ctaBottom || this.h * 0.36;
      const bandBottom = m.dockTop || this.h * 0.86;
      const bandH = Math.max(160, bandBottom - bandTop);
      const refH = MOBILE_BAND.bottom - MOBILE_BAND.top;
      k = Math.min(sx, bandH / refH) * 1.02;
      ky = bandH / refH;
      const kx = Math.min(sx, k * 1.2);
      map = (x, y) => ({ x: this.w / 2 + (x - 195) * kx, y: bandTop + (y - MOBILE_BAND.top) * ky });
    } else {
      const u = Math.min(this.w / 100, (1.5 * this.h) / 100);
      k = u / 15.36;
      ky = k;
      map = (x, y) => ({ x: this.w / 2 + (x - 768) * k, y: this.h / 2 + (y - 512) * k });
    }
    const c = L.center;
    const cs = map(c.x, c.y);
    const kd = this.worldPerPx(c.depth);
    this.placements.set('center', {
      pos: this.screenToWorld(cs.x, cs.y, c.depth),
      boxW: c.w * k * kd,
      boxH: c.h * k * kd,
      yaw: c.yaw,
      pitch: c.pitch,
      roll: c.roll,
    });
    const o = L.orbit;
    const oc = map(o.cx, o.cy);
    this.orbitScreen = { cx: oc.x, cy: oc.y, rx: o.rx * k, ry: o.ry * ky, w: o.w * k, h: o.h * k };
    this.orbitSpec = o;
  }

  /** Tilted orbit: the lower half (sin θ > 0 in screen space) swings back behind the stage. */
  private orbitDepth(th: number) {
    return this.orbitSpec.depth + Math.sin(th) * this.orbitSpec.depthSwing;
  }

  /** Seat positions around the orbit for the current orbit angle. */
  private updateOrbit() {
    const o = this.orbitScreen;
    const fixed = this.orbitSpec.seats;
    // fixed seats sway with the same clock that turns the ring (so they hold still on hover too)
    const sway = Math.sin(this.orbitAngle * 2.4) * 0.07;
    for (let i = 0; i < SEATS; i++) {
      const th = fixed ? fixed[i] + sway : this.orbitSpec.start + this.orbitAngle + (i * Math.PI * 2) / SEATS;
      const sx = o.cx + o.rx * Math.cos(th);
      const sy = o.cy + o.ry * Math.sin(th);
      const depth = this.orbitDepth(th);
      const size = 1 - Math.sin(th) * this.orbitSpec.sizeSwing;
      const kd = this.worldPerPx(depth);
      let p = this.placements.get(i);
      if (!p) {
        p = { pos: new THREE.Vector3(), boxW: 1, boxH: 1, yaw: 0, pitch: 0, roll: 0 };
        this.placements.set(i, p);
      }
      this.screenToWorld(sx, sy, depth, p.pos);
      p.boxW = o.w * size * kd;
      p.boxH = o.h * size * kd;
      // every orbiting shell turns a little toward the mind at the centre
      p.yaw = -Math.cos(th) * 0.5;
      p.pitch = -Math.sin(th) * 0.16;
      p.roll = Math.cos(th) * Math.sin(th) * 0.12;
    }
  }

  private fitScale(a: Actor, slot: SlotId) {
    const p = this.placements.get(slot)!;
    return Math.min(p.boxW / a.shell.width, p.boxH / a.shell.height);
  }

  private snap(a: Actor) {
    const p = this.placements.get(a.slot)!;
    a.pose.pos.copy(p.pos);
    a.pose.scale = this.fitScale(a, a.slot);
    a.pose.yaw = p.yaw;
    a.pose.pitch = p.pitch;
    a.pose.roll = p.roll;
  }

  // ─── Interaction ───────────────────────────────────────────────────────

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerMove = (e: PointerEvent) => {
    const p = this.local(e);
    this.pointer.set((p.x / this.w) * 2 - 1, -(p.y / this.h) * 2 + 1);
    if (e.pointerType === 'mouse') {
      this.lastPointerMove = this.time;
      this.pointerDirty = true;
    }
  };

  private pickActor(x: number, y: number): Actor | null {
    V4.set((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.raycaster.setFromCamera(V4, this.camera);
    let best: { a: Actor; d: number } | null = null;
    for (const a of this.actors.values()) {
      if (!a.shell.root.visible || a.pop < 0.5) continue;
      const hits = this.raycaster.intersectObjects(a.shell.pick, false);
      if (hits.length && (!best || hits[0].distance < best.d)) best = { a, d: hits[0].distance };
    }
    return best?.a ?? null;
  }

  private onPointerDown = (e: PointerEvent) => {
    const p = this.local(e);
    const a = this.pickActor(p.x, p.y);
    if (!a) return;
    this.stopShowcase();
    this.activate(a.shell.id);
  };

  activate(id: string) {
    if (this.disposed) return;
    window.clearTimeout(this.queuedTimer);
    this.stopShowcase();
    if (this.reduced) { this.equipNow(id); this.drawStill(); return; }
    if (id !== this.equipped) { this.equip(id); return; }
    const a = this.actors.get(id);
    if (!a || this.hero) return;
    this.hero = a;
    const p = a.pose.pos.clone();
    a.motion = {t:0,delay:0,dur:1.4,p0:p,
      c1:p.clone().add(new THREE.Vector3(-1.1,.85,1.8)),
      c2:p.clone().add(new THREE.Vector3(1.15,1.2,1.1)),
      s0:a.pose.scale,yaw0:a.pose.yaw,pitch0:a.pose.pitch,roll0:a.pose.roll,
      spin:Math.PI*2,bank:.5,crouch:.12,stretch:.12,trail:a.accent,onLand:()=>this.land(a)};
    a.shell.face.react('happy');
    this.ribbon.start(a.accent,a.pose.scale*a.shell.width*.22);
  }

  stopShowcase() {
    this.showcaseOn = false;
  }

  /** Brief "hello" hop from a floating shell (dock hover + showcase). */
  greet(id: string) {
    const a = this.actors.get(id);
    if (!a || a.motion || a.hello > 0.2) return;
    a.hello = 1;
    a.shell.face.react('happy');
  }

  get equippedId() {
    return this.equipped;
  }

  /** Put a shell on the pedestal with no animation (QA / deep links). */
  equipNow(id: string) {
    const incoming = this.actors.get(id);
    if (!incoming || id === this.equipped) return;
    const outgoing = this.actors.get(this.equipped)!;
    outgoing.slot = incoming.slot;
    incoming.slot = 'center';
    this.equipped = id;
    this.snap(incoming);
    this.snap(outgoing);
    this.events.onEquip?.(id, incoming.shell);
    this.events.onLanded?.(id, incoming.shell);
  }

  get busy() {
    return !!this.hero;
  }

  /**
   * The swap: the chosen shell crouches, leaps along an arc *in front of* everyone with a full
   * spin and lands on the pedestal (squash, shockwave, sparkles, screen boot) while the previous
   * shell twirls back to the vacated slot *behind* the others. Everyone else watches it fly,
   * makes room, then cheers. Requests made mid-flight are queued, never dropped or tangled.
   */
  equip(id: string) {
    if (this.disposed) return;
    if (id === this.equipped) return;
    const incoming = this.actors.get(id);
    if (!incoming) return;
    if (this.hero) {
      this.pending = id;
      return;
    }
    const outgoing = this.actors.get(this.equipped)!;
    const freed = incoming.slot;
    incoming.slot = 'center';
    outgoing.slot = freed;
    this.equipped = id;
    this.hero = incoming;
    this.events.onEquip?.(id, incoming.shell);

    const center = this.placements.get('center')!;
    const home = this.placements.get(freed)!;
    const quick = this.reduced ? 0.01 : 1;

    // hero: arc toward the camera and up, so it passes in front of every other shell
    const p0 = incoming.pose.pos.clone();
    const span = V1.copy(center.pos).sub(p0);
    const lift = THREE.MathUtils.clamp(span.length() * 0.22, 0.18, 0.6);
    incoming.motion = {
      t: 0,
      delay: 0.17 * quick,
      dur: 1.0 * quick,
      p0,
      c1: p0.clone().add(new THREE.Vector3(span.x * 0.2, lift, 1.15)),
      c2: center.pos.clone().add(new THREE.Vector3(-span.x * 0.1, lift * 0.35, 0.9)),
      s0: incoming.pose.scale,
      yaw0: incoming.pose.yaw,
      pitch0: incoming.pose.pitch,
      roll0: incoming.pose.roll,
      spin: Math.PI * 2,
      bank: -Math.sign(span.x || 1) * 0.38,
      crouch: 0.14,
      stretch: 0.1,
      trail: incoming.accent,
      onLand: () => this.land(incoming),
    };
    incoming.shell.face.react('happy');
    incoming.shell.face.setExcited(true);
    if (!this.reduced) this.ribbon.start(incoming.accent, this.fitScale(incoming, 'center') * incoming.shell.width * 0.22);

    // previous shell: twirls back behind the others to the freed slot
    const q0 = outgoing.pose.pos.clone();
    outgoing.motion = {
      t: 0,
      delay: 0.08 * quick,
      dur: 1.05 * quick,
      p0: q0,
      c1: q0.clone().add(new THREE.Vector3(0, 0.45, -1.6)),
      c2: home.pos.clone().add(new THREE.Vector3(0, 0.25, -1.4)),
      s0: outgoing.pose.scale,
      yaw0: outgoing.pose.yaw,
      pitch0: outgoing.pose.pitch,
      roll0: outgoing.pose.roll,
      spin: -Math.PI * 2,
      bank: 0.2,
      crouch: 0.06,
      stretch: 0.05,
      trail: null,
      onLand: () => {
        outgoing.impact = 0;
        outgoing.shell.face.react('boot');
      },
    };
    outgoing.shell.face.react('curious');
  }

  private land(a: Actor) {
    this.ribbon.stop();
    a.impact = 0;
    a.shell.face.setExcited(false);
    a.shell.face.react('boot');
    this.flash = 1;
    this.world.pulse();
    this.shock.fire();
    const wpos = a.pose.pos;
    const size = this.fitScale(a, 'center') * a.shell.width;
    this.sparkles.burst(wpos, size * 0.55, a.accent, this.time, this.reduced ? 0 : 70);
    // everyone cheers, rippling outward from the landing
    for (const o of this.actors.values()) {
      if (o === a || o.motion) continue;
      const d = o.pose.pos.distanceTo(wpos);
      o.helloAt = this.time + 0.06 + d * 0.06;
    }
    this.hero = null;
    this.events.onLanded?.(a.shell.id, a.shell);
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      if (next !== this.equipped) this.queuedTimer = window.setTimeout(() => this.equip(next), 180);
    }
  }

  // ─── Loop ──────────────────────────────────────────────────────────────

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrame = 0;
    if (!this.introStarted) this.intro();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      if (!this.visible) return;
      if (this.lastFrame && now - this.lastFrame < 1000 / this.maxFPS - 1) return;
      const raw = this.still ? 1 / 60 : this.lastFrame ? (now - this.lastFrame) / 1000 : 1 / 60;
      this.lastFrame = now;
      const dt = Math.min(raw, 1 / 24);
      this.update(dt * this.timeScale);
      this.render();
      this.watchPerformance(raw);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Shells pop in one by one, the centre Jev boots last on its pedestal. */
  private intro() {
    this.introStarted = true;
    if (this.reduced || this.still || !this.introEnabled) return;
    const order = ['neko', 'blocky', 'clicky', 'chip', 'gatekeeper', 'noir'];
    order.forEach((id, i) => {
      const a = this.actors.get(id)!;
      a.pop = -0.35 - i * 0.12;
    });
    const core = this.actors.get('core')!;
    core.pop = -1.25;
  }

  private watchPerformance(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    this.frameTimes.length = 0;
    // step resolution down on slow devices; never below 1× device pixels
    if (p75 > 1.4 / this.maxFPS && this.dprCap > 1) {
      this.dprCap = Math.max(1, this.dprCap - 0.35);
      this.renderer.setPixelRatio(this.dprCap);
      this.renderer.setSize(this.w, this.h, false);
    }
  }

  private update(dt: number) {
    this.time += dt;
    const t = this.time;

    // pointer: smoothed, and relaxes back to centre when idle or on touch
    const idle = t - this.lastPointerMove > 3.5;
    this.pointerActive = damp(this.pointerActive, idle ? 0 : 1, 2, dt);
    this.pointerSmoothed.lerp(this.pointer, 1 - Math.exp(-3 * dt));
    const px = this.pointerSmoothed.x * this.pointerActive;
    const py = this.pointerSmoothed.y * this.pointerActive;

    const par = this.reduced ? 0 : 1;
    this.camera.position.set(this.baseCam.x + px * 0.14 * par, this.baseCam.y + py * 0.08 * par, this.baseCam.z);
    this.camera.lookAt(this.baseTarget);
    this.camera.updateMatrixWorld();
    this.onParallax?.(px * par, py * par);

    if (this.pointerDirty && this.pointerActive > 0.5) {
      this.pointerDirty = false;
      const hit = this.pickActor(((this.pointer.x + 1) / 2) * this.w, ((1 - this.pointer.y) / 2) * this.h);
      if (hit !== this.hovered) {
        if (this.hovered && this.hovered !== this.hero) this.hovered.shell.face.setExcited(false);
        this.hovered = hit;
        if (hit && !hit.motion) hit.shell.face.setExcited(true);
        this.canvas.style.cursor = hit ? 'pointer' : '';
        this.events.onHover?.(hit?.shell.id ?? null);
      }
    }

    if (this.showcaseOn && !this.reduced && !this.hero) {
      this.showcaseT += dt;
      if (this.showcaseT > 4.2) {
        this.showcaseT = 0;
        const order = ['neko', 'clicky', 'gatekeeper', 'chip', 'noir', 'blocky'];
        this.showcaseIdx = (this.showcaseIdx + 1) % order.length;
        const id = order[this.showcaseIdx];
        this.greet(id);
        this.events.onFocus?.(id);
      }
    }

    mind.tick(dt, t);
    // the orbit drifts slowly; it holds still while you point at a shell or one is flying
    const wantSpeed = this.reduced || this.still || this.hovered || this.hero ? 0 : 0.075;
    this.orbitSpeed = damp(this.orbitSpeed, wantSpeed, 2.2, dt);
    this.orbitAngle += this.orbitSpeed * dt;
    this.updateOrbit();
    const pointerWorld = this.screenToWorld(((px + 1) / 2) * this.w, ((1 - py) / 2) * this.h, 3.2, V3);
    const hero = this.hero;

    for (const a of this.actors.values()) {
      const place = this.placements.get(a.slot)!;
      const targetScale = this.fitScale(a, a.slot);
      let crouch = 0;
      let stretch = 0;
      let bankRoll = 0;

      if (a.motion) {
        const m = a.motion;
        m.t += dt;
        if (m.t < m.delay) {
          crouch = Math.sin((Math.PI * m.t) / m.delay) * m.crouch;
        }
        const k = clamp01((m.t - m.delay) / m.dur);
        const u = easeInOutCubic(k);
        bezier(m.p0, m.c1, m.c2, place.pos, u, a.pose.pos);
        a.pose.scale = THREE.MathUtils.lerp(m.s0, targetScale, u);
        a.pose.yaw = THREE.MathUtils.lerp(m.yaw0, place.yaw, u) + m.spin * easeInOutQuad(k);
        a.pose.pitch = THREE.MathUtils.lerp(m.pitch0, place.pitch, u);
        a.pose.roll = THREE.MathUtils.lerp(m.roll0, place.roll, u);
        const arc = Math.sin(Math.PI * k);
        stretch = arc * m.stretch;
        bankRoll = arc * m.bank;
        if (m.trail && k > 0 && m.t > m.delay) this.ribbon.push(a.pose.pos);
        if (m.trail && k > 0.02 && k < 0.98 && !this.reduced) {
          const r = a.pose.scale * a.shell.width * 0.32;
          for (let i = 0; i < 2; i++) {
            V1.set((Math.random() - 0.5) * r * 2, (Math.random() - 0.5) * r * 1.6, (Math.random() - 0.5) * r);
            V2.copy(a.pose.pos).add(V1);
            V1.multiplyScalar(0.6).y += 0.15;
            this.sparkles.emit(V2, V1, m.trail, 0.45 + Math.random() * 0.35, r * (0.16 + Math.random() * 0.2), t, (Math.random() - 0.5) * 6);
          }
        }
        if (k >= 1) {
          a.motion = null;
          a.pose.yaw = place.yaw;
          m.onLand?.();
        }
      } else {
        const l = 6;
        a.pose.pos.x = damp(a.pose.pos.x, place.pos.x, l, dt);
        a.pose.pos.y = damp(a.pose.pos.y, place.pos.y, l, dt);
        a.pose.pos.z = damp(a.pose.pos.z, place.pos.z, l, dt);
        a.pose.scale = damp(a.pose.scale, targetScale, l, dt);
        a.pose.yaw = damp(a.pose.yaw, place.yaw, l, dt);
        a.pose.pitch = damp(a.pose.pitch, place.pitch, l, dt);
        a.pose.roll = damp(a.pose.roll, place.roll, l, dt);
      }

      // make way for the flying hero, and watch it
      a.pushTarget.set(0, 0, 0);
      let lookTarget = pointerWorld;
      let lookWeight = this.pointerActive;
      if (hero && hero !== a && !a.motion) {
        V1.copy(a.pose.pos).sub(hero.pose.pos);
        V1.z = 0;
        const d = V1.length();
        const reach = hero.pose.scale * hero.shell.width * 0.75 + a.pose.scale * a.shell.width * 0.5;
        if (d < reach && d > 1e-4) a.pushTarget.copy(V1).multiplyScalar(((reach - d) / d) * 0.55);
        lookTarget = hero.pose.pos;
        lookWeight = 1;
      }
      a.push.x = damp(a.push.x, a.pushTarget.x, 7, dt);
      a.push.y = damp(a.push.y, a.pushTarget.y, 7, dt);

      V1.copy(lookTarget).sub(a.pose.pos);
      const dz = Math.abs(V1.z) + 1.6;
      const wantYaw = THREE.MathUtils.clamp(Math.atan2(V1.x, dz), -0.75, 0.75) * 0.85 * lookWeight;
      const wantPitch = THREE.MathUtils.clamp(-Math.atan2(V1.y, dz), -0.5, 0.5) * 0.6 * lookWeight;
      a.lookYaw = damp(a.lookYaw, a.motion ? 0 : wantYaw, 4, dt);
      a.lookPitch = damp(a.lookPitch, a.motion ? 0 : wantPitch, 4, dt);

      a.hover = damp(a.hover, this.hovered === a && !a.motion ? 1 : 0, 10, dt);
      if (t >= a.helloAt) {
        a.helloAt = Infinity;
        a.hello = 1;
        a.shell.face.react('happy');
      }
      a.hello = Math.max(0, a.hello - dt * 1.4);

      // landing squash: damped spring
      let impact = 0;
      if (a.impact >= 0) {
        a.impact += dt;
        impact = Math.exp(-5.5 * a.impact) * Math.cos(15 * a.impact) * 0.16;
        if (a.impact > 1.4) a.impact = -1;
      }

      // intro pop
      let pop = 1;
      if (a.pop < 1) {
        a.pop = Math.min(1, a.pop + dt / 0.62);
        const pk = clamp01(a.pop);
        pop = a.pop <= 0 ? 0 : easeOutBack(pk);
        if (a.pop > 0 && a.pop - dt / 0.62 <= 0) {
          a.shell.face.react('boot');
          if (a.shell.id === this.equipped) {
            this.world.pulse();
            this.shock.fire();
          }
        }
      }

      const s = a.seed;
      const m = this.reduced ? 0.15 : 1;
      const helloHop = a.hello > 0 ? Math.sin((1 - a.hello) * Math.PI) : 0;
      const bob = Math.sin(t * 0.95 + s * 2.1) * 0.05 * m;
      const root = a.shell.root;
      const size = a.pose.scale;
      root.visible = pop > 0.001;
      root.position.set(
        a.pose.pos.x + a.push.x,
        a.pose.pos.y + a.push.y + (bob + helloHop * 0.16 - (1 - Math.min(1, pop)) * 0.25) * size * a.shell.height,
        a.pose.pos.z,
      );
      const sy = stretch - crouch - impact + helloHop * 0.04;
      const sc = size * pop * (1 + a.hover * 0.045);
      root.scale.set(sc * (1 - sy * 0.5), sc * (1 + sy), sc * (1 - sy * 0.5));
      root.rotation.set(
        a.pose.pitch + a.lookPitch + Math.sin(t * 0.7 + s) * 0.045 * m + crouch * 0.8,
        a.pose.yaw + a.lookYaw + Math.sin(t * 0.5 + s * 1.3) * 0.08 * m + helloHop * 0.22,
        a.pose.roll + bankRoll + Math.sin(t * 0.6 + s * 0.7) * 0.04 * m - helloHop * 0.08,
        'YXZ',
      );

      // eyes (the squiggle) glance at whatever the shell is looking at
      a.shell.face.look(THREE.MathUtils.clamp(V1.x * 0.5, -1, 1) * lookWeight, THREE.MathUtils.clamp(V1.y * 0.5, -1, 1) * lookWeight);
      a.shell.update(dt, t);
    }

    // synapses: the mind at the centre wired to every shell in orbit
    const centerActor = this.actors.get(this.equipped)!;
    let si = 0;
    for (const a of this.actors.values()) {
      if (a === centerActor) continue;
      const vis = !a.motion && !centerActor.motion && a.pop >= 1 && centerActor.pop >= 1;
      this.world.synapses.set(si++, centerActor.shell.root.position, a.shell.root.position, this.camera, centerActor.pose.scale * 0.035, vis);
    }
    this.world.synapses.update(t, this.portrait ? 0.35 : 0.55);

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.4);
      const eq = this.actors.get(this.equipped)!;
      const v = this.flash * this.flash * 0.6;
      for (const mat of eq.shell.materials) mat.uniforms.uFlash.value = v;
    }

    this.sparkles.update(t);
    this.ribbon.update(this.camera);
    this.shock.update(dt);
    this.world.update(dt, t, this.camera);
  }

  private render() {
    this.events.beforeRender?.(this.time);
    updateSharedUniforms(this.camera, this.h, this.time);
    this.renderer.setViewport(0, 0, this.w, this.h);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);
  }

  // ─── Dock thumbnails ───────────────────────────────────────────────────

  /** Renders a transparent portrait of each shell, returned as data URLs. */
  thumbnails(size = 176): Record<string, string> {
    const out: Record<string, string> = {};
    const thumbScene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 80);
    const pr = this.renderer.getPixelRatio();
    const px = Math.round(size * pr);
    const c2 = document.createElement('canvas');
    c2.width = size * 2;
    c2.height = size * 2;
    const ctx = c2.getContext('2d')!;
    const glCanvas = this.renderer.domElement;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const box = new THREE.Box3();
    const size3 = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (const a of this.actors.values()) {
      const root = a.shell.root;
      const parent = root.parent!;
      const saved = { p: root.position.clone(), r: root.rotation.clone(), s: root.scale.clone(), v: root.visible };
      thumbScene.add(root);
      root.visible = true;
      root.position.set(0, 0, 0);
      root.scale.setScalar(1);
      // the same gentle three-quarter turn for everyone
      root.rotation.set(0.06, a.shell.id === 'blocky' ? -0.5 : -0.3, 0, 'YXZ');
      a.shell.update(0.016, 0.8);
      // frame what's visible, with the same padding for every character
      visibleBounds(root, box);
      box.getSize(size3);
      box.getCenter(center);
      const fill = 0.8 * (VISUAL_WEIGHT[a.shell.id] ?? 1);
      const dist = Math.max(size3.x, size3.y) / 2 / (tanV * fill) + size3.z * 0.15;
      cam.position.set(center.x, center.y + dist * 0.05, center.z + dist);
      cam.lookAt(center);
      cam.near = dist * 0.1;
      cam.far = dist * 4;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      updateSharedUniforms(cam, size, 0.8);
      this.renderer.setScissorTest(true);
      this.renderer.setViewport(0, 0, size, size);
      this.renderer.setScissor(0, 0, size, size);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, true, true);
      this.renderer.render(thumbScene, cam);
      ctx.clearRect(0, 0, c2.width, c2.height);
      ctx.drawImage(glCanvas, 0, glCanvas.height - px, px, px, 0, 0, c2.width, c2.height);
      out[a.shell.id] = c2.toDataURL('image/png');

      parent.add(root);
      root.position.copy(saved.p);
      root.rotation.copy(saved.r);
      root.scale.copy(saved.s);
      root.visible = saved.v;
    }
    this.renderer.setScissorTest(false);
    return out;
  }
}
