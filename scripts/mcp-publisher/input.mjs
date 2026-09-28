// Recorder-only bridge: locate visible authored start/retry buttons, then let
// CDP send a trusted click at the returned point. Never change game state.
export function installRecorderInput(target = window) {
  target.addEventListener("message", (event) => {
    if (event.source !== target.parent || typeof event.data !== "string" || event.data.length > 512) return;
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message?.type !== "slopRecorderControls") return;
    const label = /^(?:start|play|start game|play game|play now|tap to play|tap to start|continue|resume|retry|try again|play again|scramble again|keep playing)[!\s.>…]*$/i;
    const points = [];
    for (const element of target.document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')) {
      if (element.disabled || !label.test((element.textContent || element.value || element.getAttribute("aria-label") || "").trim())) continue;
      const rect = element.getBoundingClientRect(), style = target.getComputedStyle(element);
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (rect.width <= 0 || rect.height <= 0 || style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0) continue;
      if (x < 0 || y < 0 || x >= target.innerWidth || y >= target.innerHeight) continue;
      const hit = target.document.elementFromPoint(x, y);
      if (hit !== element && !element.contains(hit)) continue;
      points.push({ x, y });
      break;
    }
    target.parent.postMessage(JSON.stringify({ type: "slopRecorderControlsResult", points }), "*");
  });
}

// A small, repeatable repertoire of ordinary canvas gestures. Bottom trays,
// board-to-board moves and velocity-sensitive flicks need different origins
// and durations; random short drags confined to the middle miss all three.
// Each second has a tap pair and one stroke, with two extra transfer pairs
// across the eight-second cycle. Coordinates are
// fractions of the game viewport, never game-state or debug coordinates.
const MOBILE_PATTERNS = [
  { taps: [[.5, .46], [.5, .36]], from: [.5, .86], to: [.5, .34], frames: 5 },
  { taps: [[.22, .91], [.25, .55]], from: [.22, .91], to: [.25, .48], frames: 12 },
  { taps: [[.4, .43], [.5, .56]], from: [.28, .48], to: [.72, .48], frames: 10, extraTaps: [[.4, .43], [.4, .74]] },
  { taps: [[.5, .91], [.5, .52]], from: [.5, .91], to: [.5, .43], frames: 12 },
  { taps: [[.6, .43], [.4, .74]], from: [.2, .22], to: [.5, .88], frames: 14 },
  { taps: [[.78, .91], [.72, .58]], from: [.78, .91], to: [.72, .56], frames: 12 },
  { taps: [[.6, .73], [.5, .56]], from: [.72, .35], to: [.45, .82], frames: 14, extraTaps: [[.6, .43], [.5, .56]] },
  { taps: [[.5, .4], [.5, .65]], from: [.5, .85], to: [.5, .32], frames: 5 },
];

export function mobileInputFrame(frame, { width, height, fps = 30 } = {}) {
  if (!Number.isInteger(frame) || frame < 0 || !Number.isFinite(width) || width <= 0 ||
      !Number.isFinite(height) || height <= 0 || fps !== 30) throw new TypeError('Invalid mobile input viewport or frame');
  const second = Math.floor(frame / fps), f = frame % fps;
  const pattern = MOBILE_PATTERNS[second % MOBILE_PATTERNS.length];
  const point = ([x, y]) => ({ x: x * width, y: y * height });
  if (f === 0 || f === 4) return [{ type: 'touchStart', ...point(pattern.taps[f === 0 ? 0 : 1]) }, { type: 'touchEnd' }];
  if ((f === 26 || f === 28) && pattern.extraTaps) return [{ type: 'touchStart', ...point(pattern.extraTaps[f === 26 ? 0 : 1]) }, { type: 'touchEnd' }];
  const start = 10;
  if (f === start) return [{ type: 'touchStart', ...point(pattern.from) }];
  if (f > start && f <= start + pattern.frames) {
    const t = (f - start) / pattern.frames;
    return [{ type: 'touchMove', ...point(pattern.from.map((a, i) => a + (pattern.to[i] - a) * t)) }];
  }
  if (f === start + pattern.frames + 1) return [{ type: 'touchEnd' }];
  return [];
}
