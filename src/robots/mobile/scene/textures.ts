import * as THREE from 'three';

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

export function canvasTexture(c: HTMLCanvasElement, o: { srgb?: boolean; nearest?: boolean; aniso?: number; repeat?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
  }
  t.anisotropy = o.aniso ?? 4;
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ─── Card suits (drawn as paths so they never depend on system fonts) ────

export function drawSuit(ctx: CanvasRenderingContext2D, suit: 'spade' | 'club' | 'heart' | 'diamond', x: number, y: number, size: number, rot = 0, sx = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sx * size, size);
  ctx.beginPath();
  if (suit === 'spade') {
    ctx.moveTo(0, -0.5);
    ctx.bezierCurveTo(0.12, -0.3, 0.5, -0.12, 0.44, 0.12);
    ctx.bezierCurveTo(0.4, 0.3, 0.16, 0.32, 0.06, 0.18);
    ctx.lineTo(0.14, 0.46);
    ctx.lineTo(-0.14, 0.46);
    ctx.lineTo(-0.06, 0.18);
    ctx.bezierCurveTo(-0.16, 0.32, -0.4, 0.3, -0.44, 0.12);
    ctx.bezierCurveTo(-0.5, -0.12, -0.12, -0.3, 0, -0.5);
  } else if (suit === 'heart') {
    ctx.moveTo(0, 0.46);
    ctx.bezierCurveTo(-0.2, 0.28, -0.5, 0.08, -0.46, -0.16);
    ctx.bezierCurveTo(-0.42, -0.42, -0.08, -0.46, 0, -0.22);
    ctx.bezierCurveTo(0.08, -0.46, 0.42, -0.42, 0.46, -0.16);
    ctx.bezierCurveTo(0.5, 0.08, 0.2, 0.28, 0, 0.46);
  } else if (suit === 'diamond') {
    ctx.moveTo(0, -0.5);
    ctx.quadraticCurveTo(0.18, -0.2, 0.36, 0);
    ctx.quadraticCurveTo(0.18, 0.2, 0, 0.5);
    ctx.quadraticCurveTo(-0.18, 0.2, -0.36, 0);
    ctx.quadraticCurveTo(-0.18, -0.2, 0, -0.5);
  } else {
    ctx.arc(0, -0.24, 0.2, 0, Math.PI * 2);
    ctx.moveTo(0.43, 0.07);
    ctx.arc(0.23, 0.07, 0.2, 0, Math.PI * 2);
    ctx.moveTo(-0.03, 0.07);
    ctx.arc(-0.23, 0.07, 0.2, 0, Math.PI * 2);
    ctx.moveTo(0.06, 0.02);
    ctx.lineTo(0.14, 0.46);
    ctx.lineTo(-0.14, 0.46);
    ctx.lineTo(-0.06, 0.02);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Face of the High Roller chip: red disc, eight white inserts with suits. Planar UV. */
export function chipFaceTexture(red = '#e3302d', white = '#f6f1ec') {
  const S = 1024;
  const { c, ctx } = canvas(S, S);
  const cx = S / 2;
  const R = S / 2;
  ctx.fillStyle = red;
  ctx.fillRect(0, 0, S, S);
  // subtle inner groove where the screen bezel sits
  ctx.strokeStyle = 'rgba(90, 0, 10, 0.35)';
  ctx.lineWidth = R * 0.03;
  ctx.beginPath();
  ctx.arc(cx, cx, R * 0.69, 0, Math.PI * 2);
  ctx.stroke();

  const inserts = 8;
  const half = (Math.PI * 2) / inserts / 4; // insert spans a quarter of its 45° slot on each side → 22.5°
  const suits: ('spade' | 'club')[] = ['spade', 'club'];
  for (let k = 0; k < inserts; k++) {
    const a = (k / inserts) * Math.PI * 2;
    // insert block (annular sector with softened corners)
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.arc(cx, cx, R * 1.02, -(a + half), -(a - half), false);
    ctx.arc(cx, cx, R * 0.73, -(a - half * 0.92), -(a + half * 0.92), true);
    ctx.closePath();
    ctx.fill();
    // suit on the insert, pointing outwards
    ctx.fillStyle = '#121016';
    const rx = cx + Math.cos(a) * R * 0.86;
    const ry = cx - Math.sin(a) * R * 0.86;
    drawSuit(ctx, suits[k % 2], rx, ry, R * 0.15, -a + Math.PI / 2);
    // small suit on the red between inserts
    const b = a + Math.PI / inserts;
    ctx.fillStyle = 'rgba(20, 6, 10, 0.82)';
    drawSuit(ctx, suits[(k + 1) % 2], cx + Math.cos(b) * R * 0.85, cx - Math.sin(b) * R * 0.85, R * 0.1, -b + Math.PI / 2);
  }
  return canvasTexture(c, { aniso: 8 });
}

/** Rim band texture for the chip lathe (u = angle, v = profile). */
export function chipRimTexture(red = '#e3302d', white = '#f6f1ec') {
  const W = 2048;
  const H = 256;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = red;
  ctx.fillRect(0, 0, W, H);
  const inserts = 8;
  const bw = W / inserts / 2;
  for (let k = 0; k < inserts; k++) {
    const u = (k / inserts) * W;
    ctx.fillStyle = white;
    ctx.fillRect(u - bw / 2, 0, bw, H);
    if (k === 0) ctx.fillRect(W - bw / 2, 0, bw, H);
    ctx.fillStyle = '#121016';
    drawSuit(ctx, k % 2 ? 'club' : 'spade', u === 0 ? bw * 0.02 : u, H * 0.5, H * 0.3, 0, 0.72);
    if (k === 0) drawSuit(ctx, 'spade', W, H * 0.5, H * 0.3, 0, 0.72);
  }
  return canvasTexture(c, { aniso: 8 });
}

/** Label texture with hand-lettered text (books, signs, mugs). */
export function labelTexture(
  lines: string[],
  o: { w?: number; h?: number; bg?: string; fg?: string; font?: string; size?: number; lineHeight?: number; align?: CanvasTextAlign; squiggle?: boolean; padX?: number; letterSpacing?: number } = {},
) {
  const w = o.w ?? 512;
  const h = o.h ?? 256;
  const { c, ctx } = canvas(w, h);
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = o.fg ?? '#2b2733';
  const size = o.size ?? h * 0.4;
  ctx.font = `${size}px ${o.font ?? '"Patrick Hand", "Comic Sans MS", cursive'}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  const lh = size * (o.lineHeight ?? 1.1);
  const total = lh * lines.length + (o.squiggle ? lh * 0.9 : 0);
  let y = h / 2 - total / 2 + lh / 2;
  const x = o.align === 'left' ? (o.padX ?? 20) : w / 2;
  if (o.letterSpacing && 'letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.letterSpacing}px`;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lh;
  }
  if (o.squiggle) {
    drawSquiggle(ctx, w / 2, y - lh * 0.1, size * 1.1, size * 0.16, size * 0.09, o.fg ?? '#2b2733');
  }
  return canvasTexture(c, { aniso: 8 });
}

export function drawSquiggle(ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number, amp: number, width: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const th0 = -0.42 * Math.PI;
  const th1 = 1.92 * Math.PI;
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const x = cx - len / 2 + len * t;
    const y = cy - amp * Math.sin(th0 + (th1 - th0) * t);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}
