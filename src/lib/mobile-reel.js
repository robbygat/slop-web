export const MOBILE_REEL_STARTS = Object.freeze([0, 5, 10, 16, 21, 26]);
export const MOBILE_REEL_DURATION = 31;

export function mobileReelIndex(time) {
  const value = Number.isFinite(time) ? Math.max(0, time) : 0;
  for (let index = MOBILE_REEL_STARTS.length - 1; index > 0; index--) {
    if (value >= MOBILE_REEL_STARTS[index]) return index;
  }
  return 0;
}

export function mobileReelStart(index) {
  return MOBILE_REEL_STARTS[Math.max(0, Math.min(MOBILE_REEL_STARTS.length - 1, index))];
}
