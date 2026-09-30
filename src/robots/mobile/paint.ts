import * as THREE from 'three';
import type { ToonOptions } from './scene/toon';

/**
 * Finishes: the shell's paint job. `signature` is each shell exactly as JevBot
 * ships it; every other finish repaints the shell's three paint roles:
 *
 *  - body:   the shell itself (the big glossy toy surface)
 *  - accent: the second colour (ears, pods, plates, crests, roofs)
 *  - trim:   the dark hardware (sockets, stalks, caps)
 *
 * `shade` is a multiplier on the base colour in shadow (JevBot's cel ramp),
 * so it reads as "the colour of the shadow light", not the shadow colour.
 */
export interface Finish {
  id: string;
  name: string;
  body: string;
  shade: string;
  rim: string;
  bright?: number;
  /** Liquid chrome body (the base colour tints the reflection bands). */
  chrome?: boolean;
  spec?: number;
  accent: string;
  accentShade: string;
  accentRim: string;
  trim: string;
  trimShade: string;
  /** LED rings / little lights on the shell. */
  led: string;
}

export const CHROME = { sky: '#a6c6ff', horizon: '#f6f8ff', dark: '#1d2142', ground: '#e8b9a8' };

export const FINISHES = {
  chrome: {
    id: 'chrome', name: 'Liquid chrome', body: '#ffffff', shade: '#a3a1d6', rim: '#ffe0ee', chrome: true, spec: 0.9,
    accent: '#23263a', accentShade: '#4c5078', accentRim: '#cfd6ff', trim: '#23263a', trimShade: '#4c5078', led: '#5b82ff',
  },
  pearl: {
    id: 'pearl', name: 'Pearl', body: '#f7f2f8', shade: '#b6addc', rim: '#ffc9ec', spec: 0.7,
    accent: '#8b7bff', accentShade: '#6a5cc8', accentRim: '#e8e0ff', trim: '#2a2733', trimShade: '#5c5974', led: '#9d8dff',
  },
  midnight: {
    id: 'midnight', name: 'Midnight', body: '#2b2b36', shade: '#5a5a78', rim: '#aebfff', bright: 1.05, spec: 0.55,
    accent: '#5b6cff', accentShade: '#4a4aa8', accentRim: '#cfd6ff', trim: '#1c1c24', trimShade: '#56556f', led: '#6d8cff',
  },
  bubblegum: {
    id: 'bubblegum', name: 'Bubblegum', body: '#ff8fd2', shade: '#c27ec4', rim: '#ffe0f5', spec: 0.65,
    accent: '#fff4fb', accentShade: '#d2aee0', accentRim: '#ffe0f5', trim: '#7a2c72', trimShade: '#9a7fc0', led: '#ffb8ee',
  },
  sunny: {
    id: 'sunny', name: 'Sunny', body: '#ffcd45', shade: '#dc8a58', rim: '#fff1c4', spec: 0.72,
    accent: '#2a2733', accentShade: '#5c5974', accentRim: '#fff1c4', trim: '#2a2733', trimShade: '#5c5974', led: '#fff1a8',
  },
  mint: {
    id: 'mint', name: 'Mint', body: '#72e6c2', shade: '#5aa2b4', rim: '#e0fff4', spec: 0.62,
    accent: '#f8f1e4', accentShade: '#b0a8d6', accentRim: '#e0fff4', trim: '#1f3b3a', trimShade: '#4d7a78', led: '#8fffe0',
  },
  sky: {
    id: 'sky', name: 'Sky', body: '#7fa8ff', shade: '#7a78c8', rim: '#e6efff', spec: 0.62,
    accent: '#f7f2f8', accentShade: '#b6addc', accentRim: '#e6efff', trim: '#1c2146', trimShade: '#5c5a90', led: '#bcd2ff',
  },
  tangerine: {
    id: 'tangerine', name: 'Tangerine', body: '#ff9838', shade: '#d06a6a', rim: '#ffe6c8', spec: 0.62,
    accent: '#fff1dc', accentShade: '#d4a8b4', accentRim: '#ffe6c8', trim: '#3a2330', trimShade: '#6b4a5c', led: '#ffd08a',
  },
  grape: {
    id: 'grape', name: 'Grape', body: '#9b6dff', shade: '#6a4fc8', rim: '#ffd9f4', spec: 0.62,
    accent: '#ff9ef0', accentShade: '#b86ac0', accentRim: '#ffe0f8', trim: '#2a2140', trimShade: '#5c4f90', led: '#e3c8ff',
  },
  cherry: {
    id: 'cherry', name: 'Cherry', body: '#ff5a55', shade: '#c2507a', rim: '#ffd6cc', spec: 0.62,
    accent: '#f6f1ec', accentShade: '#bfaec8', accentRim: '#ffe6e0', trim: '#2a1a22', trimShade: '#5c3f55', led: '#ffc2b8',
  },
  gold: {
    id: 'gold', name: 'Gold', body: '#ffd06a', shade: '#c79a6a', rim: '#fff2c4', chrome: true, spec: 0.9,
    accent: '#2a2733', accentShade: '#5c5974', accentRim: '#fff2c4', trim: '#2a2733', trimShade: '#5c5974', led: '#ffe08a',
  },
  holo: {
    id: 'holo', name: 'Holographic', body: '#ffffff', shade: '#b8a6e6', rim: '#e8fff8', chrome: true, spec: 0.9,
    accent: '#2a2733', accentShade: '#5c5974', accentRim: '#e8fff8', trim: '#2a2440', trimShade: '#5c5a90', led: '#9ff5ff',
  },
  carbon: {
    id: 'carbon', name: 'Carbon', body: '#33353f', shade: '#646684', rim: '#9fb4ff', bright: 1.08, spec: 0.95,
    accent: '#ff5a3c', accentShade: '#a8364a', accentRim: '#ffd0c4', trim: '#1a1b22', trimShade: '#4a4b60', led: '#ff7a5c',
  },
  candy: {
    id: 'candy', name: 'Candy', body: '#ff9bd5', shade: '#b69cf0', rim: '#e8fbff', spec: 0.95,
    accent: '#7fe3ff', accentShade: '#6a8ce0', accentRim: '#e8fbff', trim: '#6a3a8a', trimShade: '#8f7fc0', led: '#bff4ff',
  },
  matte: {
    id: 'matte', name: 'Matte clay', body: '#ece6dc', shade: '#b8aec4', rim: '#fff4e6', spec: 0,
    accent: '#e57b5a', accentShade: '#a8545a', accentRim: '#ffe0d0', trim: '#4a4040', trimShade: '#7a6c78', led: '#ffd0a8',
  },
} satisfies Record<string, Finish>;

export type FinishId = 'signature' | keyof typeof FINISHES;
export const FINISH_IDS: FinishId[] = ['signature', ...(Object.keys(FINISHES) as (keyof typeof FINISHES)[])];

export function finishOf(id: FinishId): Finish | null {
  return id === 'signature' ? null : FINISHES[id];
}

/** Gold chrome reflects a warmer world than silver chrome. */
const GOLD_CHROME = { sky: '#ffe9a8', horizon: '#fff8e6', dark: '#5a3a12', ground: '#d8914a' };
/** Iridescent bands: the holographic foil look. */
const HOLO_CHROME = { sky: '#c9a8ff', horizon: '#e6fff9', dark: '#4a3a8a', ground: '#ffadd9' };

/**
 * Repaint a shell body's toon options. Everything shape-specific (seams, dots,
 * edges, masks) survives; colour, shadow light, rim and chrome come from the finish.
 */
export function body(base: ToonOptions, f: Finish | null): ToonOptions {
  if (!f) return base;
  const out: ToonOptions = { ...base, color: f.body, shade: f.shade, rimColor: f.rim, bright: f.bright ?? 1 };
  delete out.chrome;
  if (f.chrome) {
    out.chrome = f.id === 'gold' ? GOLD_CHROME : f.id === 'holo' ? HOLO_CHROME : CHROME;
    out.spec = 0.9;
    out.specSize = 0.976;
    out.edgeColor = '#ffffff';
  } else if (f.spec !== undefined) {
    out.spec = f.spec;
    if (f.id === 'matte') {
      out.rim = 0.25;
      out.edge = 0.12;
      out.hi = 0.12;
    }
    if (f.id === 'candy') out.specSize = 0.95;
  }
  return out;
}

/** Pick the finish's value for a paint role, or the shell's own when signature. */
export function role<T>(f: Finish | null, signature: T, pick: (f: Finish) => T): T {
  return f ? pick(f) : signature;
}

/** A small deterministic palette around a colour (for voxels). */
export function jitterPalette(hex: string, count: number, spread: number, seed = 1) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const out: string[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const d = (rnd() - 0.5) * spread;
    const k = new THREE.Color().setHSL(hsl.h + d * 0.04, THREE.MathUtils.clamp(hsl.s + d * 0.15, 0, 1), THREE.MathUtils.clamp(hsl.l + d, 0, 1));
    out.push('#' + k.getHexString());
  }
  return out;
}
