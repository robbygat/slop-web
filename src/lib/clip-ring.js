// The website's version of the app's Cover Studio ring: while the owner plays,
// keep the most recent gameplay frames so publishing never needs a separate
// "record" step. Frames are JPEG data URLs from the game's own canvas, stamped
// with their capture time so the clip plays back in real time.
export const CLIP_FRAMES = 12;
export const MAX_CLIP_FRAMES = 30;
const CAPACITY = 40;

const distinct = (frames) => new Set(frames.map((frame) => frame.data)).size;

export function createClipRing(capacity = CAPACITY) {
  let frames = [];
  const state = () => ({
    frames: frames.length,
    moving: distinct(frames.slice(-CLIP_FRAMES)) >= 3,
    poster: frames.at(-1)?.data ?? null,
  });
  return {
    push(data, background = null, at = Date.now()) {
      // A paused or finished game repeats one frame; never let it evict the
      // gameplay the owner just played while they fill in the title.
      if (typeof data === 'string' && data.startsWith('data:image/jpeg;base64,') && frames.at(-1)?.data !== data) {
        frames.push({ data, background: typeof background === 'string' ? background : null, at: Number.isFinite(at) ? at : Date.now() });
        if (frames.length > capacity) frames = frames.slice(frames.length - capacity);
      }
      return state();
    },
    frames: () => frames.slice(),
    clear() { frames = []; },
  };
}

// The most recent run of up to MAX_CLIP_FRAMES (at least CLIP_FRAMES) that
// actually moves. A game that froze right before Publish still yields the
// lively moment before it.
export function clipWindow(input, { min = CLIP_FRAMES, max = MAX_CLIP_FRAMES } = {}) {
  // Repeated frames (a pause, a finished run) would play as a freeze.
  const frames = input.filter((frame, index) => index === 0 || frame.data !== input[index - 1].data);
  for (let size = Math.min(max, frames.length); size >= min; size -= 6) {
    for (let end = frames.length; end >= size; end--) {
      const slice = frames.slice(end - size, end);
      if (distinct(slice) >= 3) {
        return { frames: slice.map(({ data, at }) => ({ data, at })), background: slice.find((frame) => frame.background)?.background ?? null };
      }
    }
  }
  return null;
}
