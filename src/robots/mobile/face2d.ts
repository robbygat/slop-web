/**
 * The robot's screen face on a 2D canvas: a port of the app's Dart painter
 * (lib/widgets/robot/robot_face.dart) so the live 3D stage shows exactly the
 * same faces, line styles, glows and screen effects as every sprite robot.
 *
 * Everything is drawn in face space — the glass as a box `aspect` wide and 1
 * tall, centred on the origin, y down — then scaled onto the canvas, which is
 * UV-mapped straight onto the glass mesh.
 */

import {slopBrandBounds, slopBrandPath} from './slop-brand-path';

const slopShape = new Path2D(slopBrandPath);

export interface FaceState {
  face: string;
  glow: string;
  glow2: string | null;
  rainbow: boolean;
  line: string;
  fx: string;
  mood: 'happy' | 'curious' | 'excited' | 'thinking' | 'proud';
  gazeX: number;
  gazeY: number;
  talk: number;
  seed: number;
}

// Each live face owns one reusable LED raster surface. Weak keys let a
// disposed stage release its scratch canvas without retaining other robots.
const ledSurfaces = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
function ledSurface(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  let context = ledSurfaces.get(canvas);
  if (!context) {
    const scratch = document.createElement('canvas');
    context = scratch.getContext('2d')!;
    ledSurfaces.set(canvas, context);
  }
  const scratch = context.canvas;
  if (scratch.width !== canvas.width) scratch.width = canvas.width;
  if (scratch.height !== canvas.height) scratch.height = canvas.height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, scratch.width, scratch.height);
  return context;
}

const TAU = Math.PI * 2;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const gauss = (v: number, w: number) => Math.exp(-(v / w) * (v / w));
const hash = (i: number, j: number) => {
  const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// expressions (face.ts SHAPES)
const SMILE = 0, EYES = 1, THINK = 2, HEART = 3, BUZZ = 4, HELLO = 5, WOW = 6;
function shape(expr: number, u: number, k: number, phase: number) {
  switch (expr) {
    case SMILE: return 1.45 * u * u - 0.6;
    case EYES: return 1.2 * Math.abs(Math.sin(Math.PI * (u + 1))) - 0.4;
    case THINK: return 0.62 * gauss(u - Math.sin(k * 2.1) * 0.72, 0.16) - 0.08;
    case HEART: {
      const v = u - (-1.25 + ((k * 0.95) % 1) * 2.5);
      return 1.75 * gauss(v, 0.045) - 0.8 * gauss(v - 0.075, 0.045) + 0.3 * gauss(v + 0.21, 0.07);
    }
    case BUZZ: return 0.78 * Math.sin(Math.PI * 4.2 * (u + 1) + phase * 3.1);
    case HELLO: {
      const x0 = -1.35 + ((k * 1.75) % 2.9);
      return 1.35 * gauss(u - x0, 0.34) * Math.cos(3.4 * Math.PI * (u - x0));
    }
    default: return 1.75 * gauss(u, 0.2) - 0.25;
  }
}

function expression(mood: FaceState['mood'], t: number, seed: number): [number, number, number] {
  const table: Record<string, [number[], number, number]> = {
    happy: [[SMILE, EYES, HELLO, SMILE, HEART], 6.5, 2.4],
    curious: [[THINK, WOW, THINK], 4.2, 2.6],
    excited: [[BUZZ, HELLO, EYES, BUZZ], 3.0, 2.2],
    thinking: [[THINK, HEART, THINK], 3.4, 3.0],
    proud: [[EYES, WOW, SMILE], 4.0, 2.6],
  };
  const [deck, period, hold] = table[mood];
  const shifted = t + seed * 2.3;
  const slot = Math.floor(shifted / period);
  const local = shifted - slot * period;
  const k = local - (period - hold - 0.5);
  const w = k < 0 ? 0 : smooth(k / 0.35) * (1 - smooth((k - hold) / 0.45));
  return [deck[Math.abs(slot) % deck.length], w, k];
}

function blinkAt(t: number, seed: number) {
  const local = (t + seed * 3.1) % 5.3;
  return local > 0.55 ? 1 : 1 - 0.9 * Math.sin(smooth(local / 0.55) * Math.PI);
}

class Paths {
  stroke = new Path2D();
  fill = new Path2D();
  dim = new Path2D();
  cutout = new Path2D();
  glint = new Path2D();
  hasStroke = false;
  hasFill = false;
  hasDim = false;
  hasCutout = false;
  hasGlint = false;
}

function oval(path: Path2D, x: number, y: number, rx: number, ry: number) {
  // Canvas ellipse otherwise connects the previous contour to this one.
  path.moveTo(x + rx, y);
  path.ellipse(x, y, rx, ry, 0, 0, TAU);
  path.closePath();
}

function caret(p: Paths, x: number, y: number, w: number) {
  p.stroke.moveTo(x - w, y + w * 0.45);
  p.stroke.quadraticCurveTo(x, y - w * 1.15, x + w, y + w * 0.45);
  p.hasStroke = true;
}
function capsule(p: Paths, x: number, y: number, w: number, h: number) {
  p.fill.roundRect(x - w / 2, y - h / 2, w, h, w / 2);
  p.hasFill = true;
}

function build(p: Paths, s: FaceState, aspect: number, t: number) {
  const phase = t * 1.2 + s.seed;
  const [expr, weight, ek] = expression(s.mood, t, s.seed);
  const blink = blinkAt(t, s.seed);
  const unit = (Math.min(aspect, 1.45) / 1.45) * 1.12;
  const eyeX = 0.215 * unit + 0.02;
  const lx = Math.max(-1, Math.min(1, s.gazeX)) * 0.045 * aspect;
  const ly = Math.max(-1, Math.min(1, s.gazeY)) * 0.05;
  const eyeY = -0.03 + ly;
  const happyBeat = s.mood === 'happy' || s.mood === 'proud' || s.mood === 'excited';
  const joy = happyBeat && (expr === EYES || expr === SMILE || expr === WOW) ? weight : 0;
  const talk = s.talk;
  const sides = [-1, 1];
  const S = p.stroke;
  const mark = () => (p.hasStroke = true);

  const wave = (ex: number, w: number, k: number) => {
    const len = 0.8 * aspect;
    const excite = s.mood === 'excited' ? 1 : 0;
    const amp = 0.085 * (1 + Math.sin(phase * 0.75) * 0.06 + excite * 0.12) * blink;
    for (let i = 0; i < 72; i++) {
      const tt = i / 71;
      const u = tt * 2 - 1;
      let y = Math.sin(-0.5 * Math.PI + 2.7 * Math.PI * tt + phase * (1 + excite * 0.8));
      if (w > 0) y += (shape(ex, u, k, phase) - y) * w;
      if (talk > 0) y += talk * 0.55 * Math.sin(u * 9 + phase * 9) * Math.sin(Math.PI * tt);
      y *= amp * (0.86 + 0.14 * Math.sin(Math.PI * tt));
      const x = -len / 2 + len * tt + lx;
      if (i === 0) S.moveTo(x, -y + ly);
      else S.lineTo(x, -y + ly);
    }
    mark();
  };

  switch (s.face) {
    case 'slop': {
      const b = slopBrandBounds;
      const breath = .98 + .02 * Math.sin(t * 1.7 + s.seed);
      const scale = Math.min(aspect * .72 / (b.right - b.left), .66 / (b.bottom - b.top)) * breath;
      p.fill.addPath(slopShape, {
        a: scale, b: 0, c: 0, d: scale,
        e: -(b.left + b.right) * .5 * scale,
        f: -(b.top + b.bottom) * .5 * scale,
      });
      p.hasFill = true;
      break;
    }
    case 'pulse': wave(HEART, 1, t); break;
    case 'pixel':
      for (const sd of sides) {
        const x = sd * eyeX + lx;
        if (joy > 0.5) caret(p, x, eyeY + 0.02, 0.085 * unit);
        else capsule(p, x, eyeY, 0.1 * unit, Math.max(0.1 * unit, 0.25 * blink * (s.mood === 'excited' ? 1.12 : 1)));
      }
      break;
    case 'happy':
      for (const sd of sides) caret(p, sd * eyeX + lx, eyeY + 0.03, 0.095 * unit);
      S.moveTo(-0.07 * unit + lx, 0.16);
      S.quadraticCurveTo(lx, 0.23 + talk * 0.05, 0.07 * unit + lx, 0.16);
      break;
    case 'cyclops': {
      const r = 0.17 * unit;
      const cx = lx * 1.4, cy = -0.01 + ly * 0.6;
      if (joy > 0.5) caret(p, cx, cy + 0.04, r * 0.9);
      else {
        S.ellipse(cx, cy, r, Math.max(0.01, r * blink), 0, 0, TAU); mark();
        p.fill.ellipse(cx + s.gazeX * r * 0.45, cy + s.gazeY * r * 0.35, r * 0.4, Math.max(0.01, r * 0.4 * blink), 0, 0, TAU);
        p.hasFill = true;
      }
      break;
    }
    case 'visor': {
      const half = 0.36 * aspect;
      p.dim.roundRect(-half, -0.055, half * 2, 0.11, 0.055); p.hasDim = true;
      const sweep = s.mood === 'excited' ? 3.4 : s.mood === 'thinking' ? 2.2 : 1.35;
      const x = Math.sin(t * sweep + s.seed) * (half - 0.1) + lx;
      p.fill.roundRect(x - 0.1, -0.05, 0.2, 0.1, 0.05); p.hasFill = true;
      break;
    }
    case 'hearts': {
      const beat = 1 + 0.1 * Math.pow(Math.abs(Math.sin(t * 5.2)), 6);
      for (const sd of sides) {
        const x = sd * eyeX + lx, y = eyeY, sz = 0.2 * unit * beat, h = sz * Math.max(0.25, blink);
        S.moveTo(x, y + h * 0.42);
        S.bezierCurveTo(x - sz * 0.2, y + h * 0.26, x - sz * 0.5, y + h * 0.06, x - sz * 0.46, y - h * 0.16);
        S.bezierCurveTo(x - sz * 0.42, y - h * 0.42, x - sz * 0.08, y - h * 0.46, x, y - h * 0.2);
        S.bezierCurveTo(x + sz * 0.08, y - h * 0.46, x + sz * 0.42, y - h * 0.42, x + sz * 0.46, y - h * 0.16);
        S.bezierCurveTo(x + sz * 0.5, y + h * 0.06, x + sz * 0.2, y + h * 0.26, x, y + h * 0.42);
      }
      mark();
      break;
    }
    case 'stars':
      for (const sd of sides) {
        const x = sd * eyeX + lx, r = 0.12 * unit * Math.max(0.4, blink), rot = t * 0.8 * sd + s.seed;
        for (let i = 0; i <= 10; i++) {
          const rr = i % 2 === 0 ? r : r * 0.45;
          const a = -Math.PI / 2 + (i * Math.PI) / 5 + rot * 0.3;
          if (i === 0) S.moveTo(x + Math.cos(a) * rr, eyeY + Math.sin(a) * rr);
          else S.lineTo(x + Math.cos(a) * rr, eyeY + Math.sin(a) * rr);
        }
      }
      mark();
      break;
    case 'money':
      for (const sd of sides) {
        const x = sd * eyeX + lx, y = eyeY + Math.sin(t * 3 + sd) * 0.01, h = 0.2 * unit * Math.max(0.3, blink), w = h * 0.34;
        S.moveTo(x + w, y - h * 0.28);
        S.bezierCurveTo(x + w * 0.4, y - h * 0.42, x - w * 1.2, y - h * 0.34, x - w, y - h * 0.12);
        S.bezierCurveTo(x - w * 0.8, y + h * 0.06, x + w * 1.1, y - h * 0.02, x + w, y + h * 0.16);
        S.bezierCurveTo(x + w * 0.9, y + h * 0.4, x - w * 0.6, y + h * 0.42, x - w, y + h * 0.28);
        S.moveTo(x, y - h * 0.5);
        S.lineTo(x, y + h * 0.5);
      }
      mark();
      break;
    case 'spiral':
      for (const sd of sides) {
        const x = sd * eyeX + lx, r = 0.1 * unit, rot = t * 3.2 * (s.mood === 'excited' ? 1.8 : 1);
        for (let i = 0; i <= 40; i++) {
          const k = i / 40, a = k * 2.2 * TAU + rot;
          if (i === 0) S.moveTo(x + Math.cos(a) * r * k, eyeY + Math.sin(a) * r * k);
          else S.lineTo(x + Math.cos(a) * r * k, eyeY + Math.sin(a) * r * k);
        }
      }
      mark();
      break;
    case 'sleepy':
      for (const sd of sides) {
        const x = sd * eyeX + lx;
        S.moveTo(x - 0.085 * unit, eyeY + 0.02);
        S.quadraticCurveTo(x, eyeY + 0.08, x + 0.085 * unit, eyeY + 0.02);
      }
      for (let i = 0; i < 2; i++) {
        const k = (t * 0.35 + i * 0.5 + s.seed) % 1;
        const zx = aspect * 0.22 + k * 0.08, zy = -0.12 - k * 0.24, zs = 0.035 + k * 0.03;
        S.moveTo(zx - zs, zy - zs); S.lineTo(zx + zs, zy - zs); S.lineTo(zx - zs, zy + zs); S.lineTo(zx + zs, zy + zs);
      }
      mark();
      break;
    case 'wink':
      caret(p, -eyeX + lx, eyeY + 0.03, 0.09 * unit);
      capsule(p, eyeX + lx, eyeY, 0.1 * unit, Math.max(0.1 * unit, 0.25 * blink));
      S.moveTo(-0.06 * unit + lx, 0.17);
      S.quadraticCurveTo(0.01 + lx, 0.23 + talk * 0.05, 0.08 * unit + lx, 0.15);
      break;
    case 'chart': {
      const n = 36, len = 0.84 * aspect, scroll = t * 1.6, base = Math.floor(scroll), frac = scroll - base;
      const price = (i: number) => {
        let v = 0;
        for (let k = 0; k < 3; k++) v += (((Math.sin((i + k * 17 + s.seed * 31) * 12.9898 + k) * 43758.5453) % 1) + 1) % 1 * (0.9 - k * 0.25);
        return Math.sin(i * 0.21 + s.seed) * 0.55 + v * 0.35;
      };
      for (let i = 0; i < n; i++) {
        const x = Math.max(-len / 2, Math.min(len / 2, -len / 2 + ((i - frac) / (n - 2)) * len));
        const y = -price(base + i) * 0.26;
        if (i === 0) S.moveTo(x, y); else S.lineTo(x, y);
      }
      mark();
      p.fill.arc(len / 2, -price(base + n - 1) * 0.26, 0.032 + 0.01 * Math.sin(t * 5), 0, TAU); p.hasFill = true;
      break;
    }
    case 'cat': {
      for (const sd of sides) {
        const x = sd * eyeX + lx;
        if (blink < 0.6 || joy > 0.5) caret(p, x, eyeY + 0.03, 0.085 * unit);
        else { p.fill.ellipse(x, eyeY, 0.05 * unit, 0.095 * blink, 0, 0, TAU); p.hasFill = true; }
      }
      const my = 0.15 + ly * 0.5, mw = 0.055 * unit;
      S.moveTo(lx - mw * 2, my);
      S.quadraticCurveTo(lx - mw, my + 0.07 + talk * 0.04, lx, my);
      S.quadraticCurveTo(lx + mw, my + 0.07 + talk * 0.04, lx + mw * 2, my);
      mark();
      break;
    }
    case 'angry':
      for (const sd of sides) {
        const x = sd * eyeX + lx;
        S.moveTo(x - sd * 0.09 * unit, eyeY - 0.12); S.lineTo(x + sd * 0.07 * unit, eyeY - 0.05);
        capsule(p, x, eyeY + 0.04, 0.13 * unit, Math.max(0.05, 0.08 * blink));
      }
      S.moveTo(lx - 0.07 * unit, 0.2); S.quadraticCurveTo(lx, 0.15 - talk * 0.04, lx + 0.07 * unit, 0.2);
      mark();
      break;
    case 'dizzy':
      for (const sd of sides) {
        const x = sd * eyeX + lx, r = 0.07 * unit, wob = Math.sin(t * 6 + sd) * 0.01;
        S.moveTo(x - r, eyeY - r + wob); S.lineTo(x + r, eyeY + r + wob);
        S.moveTo(x + r, eyeY - r + wob); S.lineTo(x - r, eyeY + r + wob);
      }
      S.moveTo(lx - 0.08 * unit, 0.18); S.bezierCurveTo(lx - 0.03, 0.14, lx + 0.03, 0.22, lx + 0.08 * unit, 0.18);
      mark();
      break;
    case 'uwu': {
      for (const sd of sides) {
        const x = sd * eyeX + lx, r = 0.07 * unit;
        S.moveTo(x - sd * r, eyeY - r); S.lineTo(x + sd * r * 0.6, eyeY); S.lineTo(x - sd * r, eyeY + r);
      }
      const mw = 0.045 * unit;
      S.moveTo(lx - mw * 2, 0.15); S.quadraticCurveTo(lx - mw, 0.21, lx, 0.15); S.quadraticCurveTo(lx + mw, 0.21, lx + mw * 2, 0.15);
      mark();
      break;
    }
    case 'shades': {
      const lw = 0.2 * unit, lh = 0.12;
      for (const sd of sides) {
        const rx = sd * eyeX - lw / 2, ry = eyeY - lh / 2;
        p.dim.roundRect(rx, ry, lw, lh, lh * 0.35); p.hasDim = true;
        S.roundRect(rx, ry, lw, lh, lh * 0.35);
        const gx = rx + ((t * 0.5 + (sd > 0 ? 0.5 : 0)) % 1) * lw;
        S.moveTo(gx, ry + lh * 0.25); S.lineTo(gx - lh * 0.3, ry + lh * 0.75);
      }
      S.moveTo(-eyeX + lw / 2, eyeY - 0.02); S.lineTo(eyeX - lw / 2, eyeY - 0.02);
      S.moveTo(-0.05 * unit, 0.19); S.quadraticCurveTo(0.02, 0.22 + talk * 0.03, 0.08 * unit, 0.16);
      mark();
      break;
    }
    case 'equalizer': {
      const bars = 9, w = 0.62 * aspect;
      const energy = s.mood === 'excited' ? 1.25 : s.mood === 'thinking' ? 0.6 : 1;
      for (let i = 0; i < bars; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / bars;
        const h = 0.08 + 0.3 * Math.abs(0.5 + 0.5 * Math.sin(t * (4 + i * 0.7) + i * 1.3)) * energy + talk * 0.12;
        capsule(p, x, 0.02, (w / bars) * 0.55, Math.max(0.05, Math.min(0.62, h)));
      }
      break;
    }
    case 'loading': {
      const r = 0.2 * unit, start = t * 5.5, sweep = Math.PI * (0.6 + 0.5 * Math.abs(Math.sin(t * 2.2)));
      S.arc(0, 0, r, start, start + sweep); mark();
      p.dim.arc(0, 0, r * 1.18, 0, TAU); p.hasDim = true;
      break;
    }
    case 'kawaii':
      for (const sd of sides) {
        const x = sd * eyeX + lx, y = eyeY - .025;
        if (joy > .5 || blink < .45) { caret(p, x, y + .03, .105 * unit); continue; }
        oval(p.fill, x, y, .1225 * unit, .16 * blink); p.hasFill = true;
        oval(p.cutout, x + .014 * unit, y + .012, .0775 * unit, .119 * blink); p.hasCutout = true;
        const cx = x - .018 * unit, cy = y - .043 * blink, r = .048 * unit;
        p.glint.moveTo(cx, cy - r); p.glint.lineTo(cx + r * .68, cy);
        p.glint.lineTo(cx, cy + r); p.glint.lineTo(cx - r * .68, cy);
        p.glint.closePath(); p.hasGlint = true;
      }
      S.moveTo(lx - .065 * unit, .19); S.quadraticCurveTo(lx, .25 + talk * .04, lx + .065 * unit, .19);
      mark();
      break;
    case 'grille': {
      for (const sd of sides) {
        const x = sd * eyeX + lx, w = .205 * unit, h = Math.max(.028, .19 * blink);
        S.roundRect(x - w / 2, eyeY - h / 2, w, h, Math.min(.032 * unit, h / 2));
      }
      for (let i = -1; i <= 1; i++) capsule(p, lx + i * .105 * unit, .20, .05 * unit, .075 + talk * .06);
      mark();
      break;
    }
    default: // 'wave'
      wave(expr, weight, ek);
  }
}

function fx(ctx: CanvasRenderingContext2D, kind: string, A: number, glow: string, glow2: string, t: number) {
  const b = { l: -A / 2, t: -0.5, w: A, h: 1 };
  ctx.save();
  switch (kind) {
    case 'scanlines':
      ctx.fillStyle = glow; ctx.globalAlpha = 0.07;
      for (let y = b.t; y < b.t + b.h; y += 0.056) ctx.fillRect(b.l, y, b.w, 0.028);
      break;
    case 'sparkle':
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.012; ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const tw = Math.abs(Math.sin(t * 3 + i * 1.7));
        const x = b.l + hash(i, 1) * b.w, y = b.t + hash(i, 2) * b.h, r = 0.035 * tw;
        ctx.globalAlpha = 0.7 * tw;
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      }
      break;
    case 'rain':
      ctx.fillStyle = glow2;
      for (let i = 0; i < 12; i++) {
        const x = b.l + ((i + 0.5) * b.w) / 12;
        const head = b.t + ((t * (0.4 + hash(i, 4) * 0.6) + hash(i, 5)) % 1) * 1.3;
        for (let k = 0; k < 6; k++) {
          const y = head - k * 0.07;
          if (y < b.t || y > b.t + 1) continue;
          ctx.globalAlpha = Math.max(0, 0.45 - k * 0.07);
          ctx.fillRect(x - 0.0125, y - 0.0225, 0.025, 0.045);
        }
      }
      break;
    case 'stars':
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 18; i++) {
        const z = (t * 0.25 + hash(i, 6)) % 1;
        const x = (hash(i, 7) - 0.5) * A * 1.1 * z, y = (hash(i, 8) - 0.5) * A * 1.1 * z;
        ctx.globalAlpha = 0.6 * z;
        ctx.beginPath(); ctx.arc(x, y, 0.012 * (0.5 + z), 0, TAU); ctx.fill();
      }
      break;
    case 'hearts':
      ctx.fillStyle = '#ff6fd8';
      for (let i = 0; i < 5; i++) {
        const k = (t * 0.3 + i / 5) % 1;
        const x = b.l + b.w * (0.15 + 0.7 * hash(i, 9)), y = 0.5 - k, sz = 0.07;
        ctx.globalAlpha = 0.4 * Math.sin(k * Math.PI);
        ctx.beginPath();
        ctx.moveTo(x, y + sz * 0.5);
        ctx.bezierCurveTo(x - sz, y - sz * 0.1, x - sz * 0.5, y - sz * 0.8, x, y - sz * 0.25);
        ctx.bezierCurveTo(x + sz * 0.5, y - sz * 0.8, x + sz, y - sz * 0.1, x, y + sz * 0.5);
        ctx.fill();
      }
      break;
    case 'grid': {
      const horizon = 0.05;
      ctx.strokeStyle = glow2; ctx.globalAlpha = 0.35; ctx.lineWidth = 0.008;
      ctx.beginPath();
      for (let i = -6; i <= 6; i++) { ctx.moveTo(i * A * 0.02, horizon); ctx.lineTo(i * A * 0.22, 0.5); }
      for (let k = 0; k < 6; k++) { const z = (k + ((t * 0.8) % 1)) / 6; const y = horizon + (0.5 - horizon) * z * z; ctx.moveTo(b.l, y); ctx.lineTo(b.l + b.w, y); }
      ctx.stroke();
      ctx.globalAlpha = 0.18; ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, horizon, 0.18, 0, TAU); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function hsl(h: number) {
  return `hsl(${h % 360}, 90%, 62%)`;
}

/**
 * Draw one frame. The canvas is the glass rect (aspect : 1); `radius` is the
 * glass corner radius as a fraction of height, `power` brightens (1 = normal).
 */
export function drawFace(
  canvas: HTMLCanvasElement,
  s: FaceState,
  aspect: number,
  radius: number,
  circle: boolean,
  t: number,
  power = 1,
) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(H, 0, 0, H, W / 2, H / 2);
  let glow = s.glow, glow2 = s.glow2 ?? s.glow;
  if (s.rainbow) { glow = hsl(t * 40); glow2 = hsl(t * 40 + 140); }

  // clip to the glass
  ctx.save();
  ctx.beginPath();
  const g = 0.026;
  if (circle) ctx.arc(0, 0, 0.5 - g, 0, TAU);
  else ctx.roundRect(-aspect / 2 + g, -0.5 + g, aspect - 2 * g, 1 - 2 * g, Math.max(0, radius - g));
  ctx.clip();

  // the mind lights the pane faintly
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, aspect * 0.62);
  wash.addColorStop(0, glow);
  wash.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.1 * power;
  ctx.fillStyle = wash;
  ctx.fillRect(-aspect / 2, -0.5, aspect, 1);
  ctx.globalAlpha = 1;
  if (s.fx !== 'none') fx(ctx, s.fx, aspect, glow, glow2, t);

  const p = new Paths();
  build(p, s, aspect, t);
  const detailedFace = s.face === 'kawaii' || s.face === 'grille';
  const lineW = detailedFace ? .026 : .036;
  const grad = (() => {
    if (!s.glow2 && !s.rainbow) return glow;
    const lg = ctx.createLinearGradient(-aspect / 2, 0, aspect / 2, 0);
    lg.addColorStop(0, glow);
    lg.addColorStop(1, glow2);
    return lg;
  })();
  const flicker = s.line === 'holo' ? 0.72 + 0.28 * Math.abs(Math.sin(t * 31)) * Math.abs(Math.sin(t * 7.3)) : 1;
  const passes = (path: Path2D, fill: boolean, alpha: number, tint?: string) => {
    // WebKit offsets blurred Path2D strokes when their canvas transform scales
    // face units. Bake the current face transform into
    // the path and rasterize its glow in pixels, under an identity transform.
    const pixels = new Path2D();
    pixels.addPath(path, ctx.getTransform());
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let colour: string | CanvasGradient = tint ?? glow;
    if (!tint && (s.glow2 || s.rainbow)) {
      const gradient = ctx.createLinearGradient(0, H / 2, W, H / 2);
      gradient.addColorStop(0, glow);
      gradient.addColorStop(1, glow2);
      colour = gradient;
    }
    const layer = (width: number, blur: number, a: number, style: string | CanvasGradient, shadow: string) => {
      ctx.globalAlpha = a * flicker * Math.min(1, power);
      ctx.shadowColor = shadow;
      ctx.shadowBlur = blur * H;
      if (fill) { ctx.fillStyle = style; ctx.fill(pixels); }
      else { ctx.lineWidth = width * H; ctx.strokeStyle = style; ctx.stroke(pixels); }
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.line === 'dashed' && !fill) ctx.setLineDash([lineW * H * 2.6, lineW * H * 2.2]);
    if (s.line !== 'solid') layer(lineW * (s.line === 'scope' ? 7 : 5), 0.07, (detailedFace ? .1 : .22) * alpha, colour, tint ?? glow);
    layer(lineW * (s.line === 'tube' ? 3.4 : detailedFace ? 1.45 : 2.4), detailedFace ? .012 : .025, .85 * alpha, colour, tint ?? glow);
    ctx.shadowBlur = 0;
    const solid = s.face === 'slop' || s.line === 'solid' || s.line === 'scope';
    layer(lineW * (s.line === 'tube' ? 0.45 : 1), 0, alpha, solid ? colour : '#f4f7ff', 'transparent');
    ctx.restore();
  };
  const drawAll = (tint?: string, alpha = 1) => {
    if (p.hasDim) passes(p.dim, true, 0.32 * alpha, tint);
    if (p.hasFill) passes(p.fill, true, alpha, tint);
    if (p.hasStroke) passes(p.stroke, false, alpha, tint);
  };
  if (s.line === 'led') {
    // LED matrix: rasterise the face into a dot grid
    const o = ledSurface(canvas);
    o.setTransform(H, 0, 0, H, W / 2, H / 2);
    o.lineWidth = lineW * 1.4; o.lineCap = 'round'; o.strokeStyle = '#fff'; o.fillStyle = '#fff';
    if (p.hasStroke) o.stroke(p.stroke);
    if (p.hasFill) o.fill(p.fill);
    if (p.hasCutout) { o.globalCompositeOperation = 'destination-out'; o.fill(p.cutout); o.globalCompositeOperation = 'source-over'; }
    if (p.hasGlint) o.fill(p.glint);
    const data = o.getImageData(0, 0, W, H).data;
    const cell = Math.max(4, Math.round(H * 0.045));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = typeof grad === 'string' ? grad : glow;
    ctx.shadowColor = glow; ctx.shadowBlur = cell;
    for (let y = cell / 2; y < H; y += cell) {
      for (let x = cell / 2; x < W; x += cell) {
        if (data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] > 40) {
          ctx.globalAlpha = 0.95;
          ctx.fillRect(x - cell * 0.38, y - cell * 0.38, cell * 0.76, cell * 0.76);
        }
      }
    }
    ctx.restore();
  } else {
    // Line styles can flicker or scan, but the selected expression has one
    // position. Offset copies turned eyes and mouths into a ghost second face.
    drawAll();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = Math.min(1, power) * flicker;
    if (p.hasCutout) { ctx.fillStyle = '#09111f'; ctx.fill(p.cutout); }
    if (p.hasGlint) { ctx.fillStyle = '#f4f7ff'; ctx.fill(p.glint); }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  if (s.line === 'crt' || s.line === 'scope') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = -0.5; y < 0.5; y += 0.05) ctx.fillRect(-aspect / 2, y, aspect, 0.025);
    ctx.fillStyle = glow; ctx.globalAlpha = 0.06;
    ctx.fillRect(-aspect / 2, -0.5 + ((t * 0.35) % 1), aspect, 0.12);
  }
  if (s.line === 'glitch' && Math.floor(t * 5) % 7 === 0) {
    ctx.fillStyle = glow; ctx.globalAlpha = 0.35;
    ctx.fillRect(-aspect / 2, -0.5 + ((t * 13) % 1), aspect, 0.06);
  }
  ctx.restore();
}
