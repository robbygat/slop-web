/* Slop Creator Runtime 1 — platform integration, no game templates. */
(function (g) {
  'use strict';
  const callbacks = { pause: [], resume: [], restart: [], resize: [] };
  const pointers = new Map(), keys = new Set();
  const input = { pointers, keys, x: 0, y: 0, down: false, pressed: false, released: false };
  let surface, frame = 0, lastTime = 0, elapsed = 0, draw;
  let paused = false, muted = false, ready = false, over = false, restartRequest = null;
  let audio, threePromise;
  let safeArea = { top: 72, right: 16, bottom: 40, left: 16 };
  function post(message) {
    const json = JSON.stringify(message);
    if (g.webkit && g.webkit.messageHandlers && g.webkit.messageHandlers.SlopBridge) {
      g.webkit.messageHandlers.SlopBridge.postMessage(json);
    } else if (g.SlopBridge && g.SlopBridge.postMessage) {
      g.SlopBridge.postMessage(json);
    } else if (g.parent !== g) { g.parent.postMessage(json, '*'); }
  }
  function failure(error) {
    const message = String(error && error.message || error || 'Game error').slice(0, 1800);
    post({ type: 'loadError', message, code: 'runtime_failure' });
  }
  function clearInput() {
    pointers.clear(); keys.clear(); input.down = false; input.pressed = false; input.released = false;
  }
  function audioState() {
    if (!audio) return;
    const operation = paused || muted || document.hidden ? audio.suspend() : audio.resume();
    if (operation && operation.catch) operation.catch(function () {});
  }
  function resize() {
    if (!surface) return;
    surface.width = Math.max(1, g.innerWidth);
    surface.height = Math.max(1, g.innerHeight);
    surface.dpr = Math.min(2, Math.max(1, g.devicePixelRatio || 1));
    surface.canvas.width = Math.round(surface.width * surface.dpr);
    surface.canvas.height = Math.round(surface.height * surface.dpr);
    if (surface.ctx) surface.ctx.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0);
    callbacks.resize.forEach(fn => { try { fn(surface); } catch (e) { failure(e); } });
  }
  function tick(now) {
    frame = 0;
    if (!draw || paused || document.hidden) { lastTime = 0; return; }
    const dt = lastTime ? Math.min(.05, Math.max(0, (now - lastTime) / 1000)) : 0;
    lastTime = now; elapsed += dt;
    try { draw({ dt, time: elapsed, width: surface.width, height: surface.height }); }
    catch (error) { draw = null; failure(error); return; }
    input.pressed = false; input.released = false;
    if (!frame) frame = g.requestAnimationFrame(tick);
  }
  function wake() { lastTime = 0; if (draw && !frame && !paused && !document.hidden) frame = g.requestAnimationFrame(tick); }
  function suspend() { if (frame) g.cancelAnimationFrame(frame); frame = 0; lastTime = 0; clearInput(); audioState(); }
  function receive(value) {
    let m;
    try { m = typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'restart') {
      over = false; elapsed = 0; clearInput(); restartRequest = m.request;
      let handled = false;
      try { callbacks.restart.forEach(fn => { fn(); handled = true; }); }
      catch (e) { failure(e); handled = false; }
      finally { restartRequest = null; }
      post({ type: 'restart-ack', request: m.request, handled }); return;
    }
    if (m.type === 'pause') { paused = true; suspend(); }
    if (m.type === 'resume') { paused = false; audioState(); wake(); }
    if (m.type === 'mute') { muted = m.on === true; audioState(); }
    if (m.type === 'preferences' && m.preferences) { muted = m.preferences.muted === true || m.preferences.sound === false; audioState(); }
    if (m.type === 'host-regions' && m.safeInsets) {
      for (const key of ['top', 'right', 'bottom', 'left']) {
        const n = m.safeInsets[key]; if (Number.isFinite(n) && n >= 0) safeArea[key] = Math.min(1000, n);
      }
    }
    if (callbacks[m.type]) callbacks[m.type].forEach(fn => { try { fn(m); } catch (e) { failure(e); } });
  }
  g.__slopReceive = receive;
  g.addEventListener('message', event => { if (event.source === g.parent) receive(event.data); });
  g.addEventListener('resize', resize);
  g.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { audioState(); wake(); } });
  g.addEventListener('error', event => failure(event.error || event.message));
  g.addEventListener('unhandledrejection', event => failure(event.reason));
  function scoreNumber(n) { return Number.isFinite(n) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(n))) : 0; }
  function on(type, fn) { if (typeof fn !== 'function') throw new TypeError('Expected a callback'); callbacks[type].push(fn); return () => { const i = callbacks[type].indexOf(fn); if (i >= 0) callbacks[type].splice(i, 1); }; }
  g.Slop = Object.freeze({
    version: 'creator-v1', input,
    get safeArea() { return Object.assign({}, safeArea); },
    create(options = {}) {
      if (surface) return surface;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', 'Game'); canvas.tabIndex = 0;
      Object.assign(document.documentElement.style, { width: '100%', height: '100%', overflow: 'hidden', overscrollBehavior: 'none' });
      Object.assign(document.body.style, { margin: '0', width: '100%', height: '100%', overflow: 'hidden', background: options.background || '#171b2b' });
      Object.assign(canvas.style, { display: 'block', width: '100vw', height: '100dvh', touchAction: 'none' });
      document.body.appendChild(canvas);
      surface = { canvas, ctx: options.renderer === '3d' ? null : canvas.getContext('2d'), width: 1, height: 1, dpr: 1 };
      resize();
      function pointer(event) {
        const rect = canvas.getBoundingClientRect();
        input.x = (event.clientX - rect.left) * surface.width / rect.width;
        input.y = (event.clientY - rect.top) * surface.height / rect.height;
        return { x: input.x, y: input.y };
      }
      canvas.addEventListener('pointerdown', e => {
        e.preventDefault(); canvas.focus({ preventScroll: true });
        pointers.set(e.pointerId, pointer(e)); input.down = true; input.pressed = true;
        canvas.setPointerCapture(e.pointerId); audioState();
      });
      canvas.addEventListener('pointermove', e => { const p = pointer(e); if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p); });
      function release(e) { pointers.delete(e.pointerId); input.down = pointers.size > 0; input.released = true; }
      canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
      g.addEventListener('keydown', e => {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        keys.add(e.code); if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
      });
      g.addEventListener('keyup', e => keys.delete(e.code));
      return surface;
    },
    loop(fn) { if (!surface) throw new Error('Call Slop.create before Slop.loop'); draw = fn; wake(); return () => { draw = null; suspend(); }; },
    onRestart: fn => on('restart', fn), onPause: fn => on('pause', fn), onResume: fn => on('resume', fn), onResize: fn => on('resize', fn),
    ready() {
      if (ready) return; ready = true; g.__slopOperationalReady = true;
      if (g.__slopStartupGate && g.__slopStartupGate.pause) { paused = true; g.__slopStartupGate.pause(); }
      post({ type: 'ready' });
    },
    score(value) { const message = { type: 'score', value: scoreNumber(value) }; if (restartRequest != null) message.request = restartRequest; post(message); },
    finished(value) { if (!ready || over) return; over = true; post({ type: 'finished', score: scoreNumber(value) }); },
    haptic(style = 'light') { post({ type: 'haptic', style }); },
    tone(frequency = 440, duration = .1, volume = .08) {
      if (muted || paused || document.hidden) return;
      if (!audio) audio = new (g.AudioContext || g.webkitAudioContext)();
      audioState(); const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.frequency.value = Math.max(30, Math.min(12000, frequency));
      const end = audio.currentTime + Math.max(.01, Math.min(2, duration));
      gain.gain.setValueAtTime(Math.max(.0001, Math.min(.2, volume)), audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, end);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(end);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    },
    three() {
      if (g.THREE) return Promise.resolve(g.THREE);
      if (threePromise) return threePromise;
      threePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script.integrity = 'sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu';
        script.crossOrigin = 'anonymous'; script.referrerPolicy = 'no-referrer';
        const timer = setTimeout(() => { script.remove(); reject(new Error('3D runtime could not load. Reconnect and retry.')); }, 18000);
        script.onload = () => { clearTimeout(timer); g.THREE ? resolve(g.THREE) : reject(new Error('3D runtime unavailable')); };
        script.onerror = () => { clearTimeout(timer); reject(new Error('3D runtime could not load')); };
        document.head.appendChild(script);
      }).catch(error => { threePromise = null; throw error; });
      return threePromise;
    }
  });
})(window);
