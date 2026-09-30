/**
 * Where the shells live on screen.
 *
 * The equipped shell sits in the centre above the stage; the other six hold seats on a
 * halo arc around it (screen-space, so they never pass in front of the mind or behind
 * the stage) and sway gently. Desktop numbers are pixels in the 1536×1024 comp, scaled uniformly like the
 * CSS `--u` unit; mobile numbers are points in the 390pt phone comp, mapped into the
 * band between the CTA row and the dock.
 */

export type SlotId = 'center' | number;

export interface CenterSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface Orbit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Box each orbiting shell is fitted into. */
  w: number;
  h: number;
  depth: number;
  /** The orbit is tilted: its lower half swings back behind the stage. */
  depthSwing: number;
  sizeSwing: number;
  /** Angle of ring seat 0 (radians, screen space, y down). */
  start: number;
  /**
   * Fixed seat angles instead of a full, circling ring (phones): the shells hold a crown
   * over the mind and sway gently, because a narrow screen has no room beside the stage
   * and anything on the lower arc would hide behind it.
   */
  seats?: number[];
}

export interface Layout {
  center: CenterSlot;
  orbit: Orbit;
}

export const DESKTOP: Layout = {
  center: { x: 978, y: 402, w: 284, h: 222, depth: 6.9, yaw: -0.22, pitch: 0.03, roll: 0 },
  orbit: {
    cx: 1000,
    cy: 382,
    rx: 278,
    ry: 206,
    w: 146,
    h: 140,
    depth: 7.4,
    depthSwing: 0.5,
    sizeSwing: 0.08,
    start: (-2 * Math.PI) / 3,
    // a halo over the mind: evenly spaced round the top, clear of the stage below
    seats: [247, 293, 339, 25, 155, 201].map((d) => (d * Math.PI) / 180),
  },
};

// Phone comp (points). The comp's CTA row ends at y≈278 and the dock starts at y≈676.
export const MOBILE_BAND = { top: 278, bottom: 676, width: 390 };

export const MOBILE: Layout = {
  center: { x: 196, y: 484, w: 150, h: 118, depth: 6.9, yaw: -0.14, pitch: 0.03, roll: 0 },
  orbit: {
    cx: 196,
    cy: 470,
    rx: 136,
    ry: 158,
    w: 86,
    h: 82,
    depth: 7.3,
    depthSwing: 0.8,
    sizeSwing: 0.1,
    start: (-2 * Math.PI) / 3,
    // same neighbours as desktop: top-left, top-right, right, lower right, lower left, left
    seats: [238, 302, 340, 18, 162, 200].map((d) => (d * Math.PI) / 180),
  },
};

/** Ring seats: 0 top-left, 1 top-right, 2 right, 3 bottom-right, 4 bottom-left, 5 left. */
export const INITIAL: Record<string, SlotId> = {
  core: 'center',
  neko: 0,
  blocky: 1,
  chip: 2,
  noir: 3,
  gatekeeper: 4,
  clicky: 5,
};

/** Order of shells in the dock. */
export const DOCK_ORDER = ['blocky', 'neko', 'clicky', 'gatekeeper', 'chip', 'noir'];

export const SEATS = 6;

export function isPortrait(w: number, h: number) {
  return w <= 760 || w / h < 0.8;
}
