// Serialized into the recorded game frame before any game script (see
// video.mjs). It replaces the frame's clocks with one the recorder advances
// exactly 1/30 s per video frame, so a scene that takes a second to render
// under software GL still plays at its true speed in the clip.
//
// Until the recorder freezes it, the clock is real time and the game boots
// normally. After `freeze`, requestAnimationFrame callbacks, timers,
// performance.now/Date and Web Animations only move when the parent sends
// `step`. Self-contained: it is stringified into the page.
export function installRecorderClock(target = window) {
  const W = target, P = W.performance;
  const nNow = P.now.bind(P), nRAF = W.requestAnimationFrame.bind(W);
  const nST = W.setTimeout.bind(W), nCT = W.clearTimeout.bind(W);
  const nSI = W.setInterval.bind(W), nCI = W.clearInterval.bind(W);
  const NDate = W.Date;
  let virtual = false, vt = 0, seq = 0;
  const now = () => (virtual ? vt : nNow());
  try { Object.defineProperty(P, "now", { value: now, configurable: true, writable: true }); } catch { try { P.now = now; } catch {} }
  const epoch = NDate.now() - nNow();
  class VDate extends NDate {
    constructor(...args) { if (args.length === 0) super(epoch + now()); else super(...args); }
    static now() { return Math.floor(epoch + now()); }
  }
  W.Date = VDate;

  let rafId = 0, rafQueue = new Map();
  W.requestAnimationFrame = (cb) => { const id = ++rafId; rafQueue.set(id, cb); return id; };
  W.cancelAnimationFrame = (id) => { rafQueue.delete(id); };
  const report = (error) => nST(() => { throw error; }, 0);
  const flush = (t) => {
    const queue = rafQueue; rafQueue = new Map();
    for (const cb of queue.values()) { try { cb(t); } catch (e) { report(e); } }
  };
  const pump = () => { if (!virtual) flush(nNow()); nRAF(pump); };
  nRAF(pump);

  let timerId = 0;
  const timers = new Map();
  const callable = (fn) => (typeof fn === "function" ? fn : () => (0, eval)(String(fn)));
  const run = (t) => { try { t.fn.apply(W, t.args); } catch (e) { report(e); } };
  const add = (fn, ms, args, repeat) => {
    const id = ++timerId, delay = Math.max(0, Number(ms) || 0);
    const t = { fn: callable(fn), args, delay, repeat, due: now() + delay, native: 0 };
    timers.set(id, t);
    if (!virtual) {
      t.native = repeat
        ? nSI(() => { t.due = nNow() + delay; run(t); }, delay)
        : nST(() => { timers.delete(id); run(t); }, delay);
    }
    return id;
  };
  const clear = (id) => {
    const t = timers.get(id);
    if (!t) return;
    if (t.native) (t.repeat ? nCI : nCT)(t.native);
    timers.delete(id);
  };
  W.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  W.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  W.clearTimeout = clear;
  W.clearInterval = clear;

  function freeze() {
    if (virtual) return;
    vt = nNow();
    virtual = true;
    for (const t of timers.values()) {
      if (t.native) { (t.repeat ? nCI : nCT)(t.native); t.native = 0; }
      if (t.repeat) t.due = vt + t.delay;
    }
  }
  function step(dt) {
    const until = vt + dt;
    // Timers fire in due order at their own due time, bounded so a zero-delay
    // interval cannot hang the frame.
    for (let guard = 0; guard < 2000; guard++) {
      let nextId = 0, next = null;
      for (const [id, t] of timers) if (t.due <= until && (!next || t.due < next.due)) { next = t; nextId = id; }
      if (!next) break;
      vt = Math.max(vt, next.due);
      if (next.repeat) next.due += Math.max(4, next.delay); else timers.delete(nextId);
      run(next);
    }
    vt = until;
    // CSS and Web Animations follow the same clock.
    try {
      for (const a of W.document.getAnimations()) {
        if (a.playState === "running") { a.pause(); a.__slopClock = true; }
        if (a.__slopClock && a.playState === "paused") a.currentTime = (Number(a.currentTime) || 0) + dt;
      }
    } catch {}
    flush(vt);
  }
  W.addEventListener("message", (event) => {
    if (event.source !== W.parent || typeof event.data !== "string" || event.data.length > 512) return;
    let m; try { m = JSON.parse(event.data); } catch { return; }
    if (!m || m.type !== "slopClock") return;
    if (m.op === "freeze") freeze();
    else if (m.op === "step" && virtual) step(Math.min(1000, Math.max(1, Number(m.dt) || 1000 / 30)));
    else return;
    event.stopImmediatePropagation();
    // Acknowledge after this task's rendering work has been queued; the
    // recorder screenshots the composited frame only after the ack.
    W.parent.postMessage(JSON.stringify({ type: "slopClockAck", seq: m.seq ?? ++seq }), "*");
  });
}
