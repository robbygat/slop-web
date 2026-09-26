// The website's version of the app's Cover Studio ring: while the owner plays,
// keep the most recent gameplay frames so publishing never needs a separate
// "record" step. Frames are JPEG data URLs from the game's own canvas.
export const CLIP_FRAMES = 12;
const CAPACITY = 25; // about five seconds at one frame every 200 ms

const distinct = (frames) => new Set(frames.map((frame) => frame.data)).size;

export function createClipRing(capacity = CAPACITY) {
  let frames = [];
  const state = () => ({
    frames: frames.length,
    moving: distinct(frames.slice(-CLIP_FRAMES)) >= 3,
    poster: frames.at(-1)?.data ?? null,
  });
  return {
    push(data, background = null) {
      if (typeof data === 'string' && data.startsWith('data:image/jpeg;base64,')) {
        frames.push({ data, background: typeof background === 'string' ? background : null });
        if (frames.length > capacity) frames = frames.slice(frames.length - capacity);
      }
      return state();
    },
    frames: () => frames.slice(),
    clear() { frames = []; },
  };
}

// The most recent CLIP_FRAMES-long run that actually moves. A game that froze
// or paused right before Publish still yields the lively moment before it.
export function clipWindow(frames, size = CLIP_FRAMES) {
  for (let end = frames.length; end >= size; end--) {
    const slice = frames.slice(end - size, end);
    if (distinct(slice) >= 3) {
      return { frames: slice.map((frame) => frame.data), background: slice.find((frame) => frame.background)?.background ?? null };
    }
  }
  return null;
}
