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

/* Slop turns-v1 adapter. The host owns identity, rooms and transport. */
(function (g) {
  'use strict';
  const creator = g.Slop, originalReceive = g.__slopReceive;
  const listeners = new Set(), pending = new Map();
  let current = null, sequence = 0, closed = false, handshake = null, attempts = 0, hostRestarted = false;
  const issue = code => Object.assign(new Error(code), { code });
  function post(message) {
    const json = JSON.stringify(message);
    if (g.webkit && g.webkit.messageHandlers && g.webkit.messageHandlers.SlopBridge) g.webkit.messageHandlers.SlopBridge.postMessage(json);
    else if (g.SlopBridge && g.SlopBridge.postMessage) g.SlopBridge.postMessage(json);
    else if (g.parent !== g) g.parent.postMessage(json, '*');
  }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function normalize(value) {
    if (!value || value.protocol !== 'turns-v1' || !Number.isSafeInteger(value.epoch) || value.epoch < 1 ||
        !Number.isSafeInteger(value.revision) || value.revision < 0 || ![0, 1].includes(value.seat) ||
        !['waiting', 'active', 'complete'].includes(value.status) || !Array.isArray(value.actions) || value.actions.length > 256) return null;
    let next;
    try { const json = JSON.stringify(value); if (json.length > 262144) return null; next = JSON.parse(json); } catch (_) { return null; }
    next.room = next.room || next.code;
    next.gameId = next.gameId || next.game_id; next.gameSlug = next.gameSlug || next.game_slug;
    next.releaseDigest = next.releaseDigest || next.release_digest; next.releasePath = next.releasePath || next.release_path;
    next.rematchVotes = next.rematchVotes || next.rematch_votes; next.expiresAt = next.expiresAt || next.expires_at;
    next.actions = next.actions.map(action => ({ ...action, actionId: action.actionId || action.action_id }));
    if (typeof next.room !== 'string' || !next.room || typeof next.releaseDigest !== 'string' || !/^[a-f0-9]{64}$/.test(next.releaseDigest)) return null;
    return freeze(next);
  }
  function settle(requestId, error, value) {
    const request = pending.get(requestId); if (!request) return;
    pending.delete(requestId); clearTimeout(request.timer);
    if (error) request.reject(issue(error)); else request.resolve(value);
  }
  function accept(value, respondingTo) {
    const next = normalize(value); if (!next) return false;
    if (current && (next.room !== current.room || next.seat !== current.seat || next.releaseDigest !== current.releaseDigest ||
        next.epoch < current.epoch || next.epoch === current.epoch && next.revision < current.revision)) return false;
    const newRound = current && next.epoch > current.epoch;
    if (newRound) for (const [id, request] of pending) if (id !== respondingTo) {
      if (request.type === 'match-rematch') settle(id, null, next); else settle(id, 'match_epoch_changed');
    }
    current = next; clearTimeout(handshake); handshake = null;
    if (newRound) { if (!hostRestarted) originalReceive({ type: 'restart', request: 'match-' + next.epoch }); hostRestarted = false; }
    listeners.forEach(fn => { try { fn(current); } catch (error) { post({ type: 'loadError', code: 'match_callback_failure', message: String(error.message || error).slice(0, 300) }); } });
    return true;
  }
  function receive(value) {
    let message; try { message = typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return; }
    if (!message || closed) return;
    if (message.type === 'restart') hostRestarted = true;
    if (message.type === 'match-snapshot') accept(message.snapshot);
    if (message.type === 'match-response') {
      const request = pending.get(message.requestId); if (!request) return;
      const error = message.error && message.error.code || message.code;
      const response = normalize(message.snapshot);
      const accepted = response && (accept(response, message.requestId) || current && response.room === current.room && response.seat === current.seat && response.releaseDigest === current.releaseDigest && response.epoch === current.epoch && response.revision >= request.revision);
      if (error) settle(message.requestId, error);
      else if (!accepted || !current || current.epoch < request.epoch || current.epoch === request.epoch && current.revision < request.revision) settle(message.requestId, 'invalid_match_response');
      else settle(message.requestId, null, current);
    }
  }
  // Creator's message listener uses its original receiver. This listener handles
  // only match traffic; native hosts call the composed receiver below.
  g.addEventListener('message', event => { if (event.source === g.parent) receive(event.data); });
  g.__slopReceive = value => { originalReceive(value); receive(value); };
  function ready() {
    if (closed) return; post({ type: 'match-ready' });
    if (!current && attempts++ < 60) handshake = setTimeout(ready, 1000);
  }
  function request(type, payload) {
    if (closed) return Promise.reject(issue('match_closed'));
    if (!current) return Promise.reject(issue('match_not_ready'));
    const requestId = 'm' + (++sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => settle(requestId, 'match_timeout'), 18000);
      pending.set(requestId, { resolve, reject, timer, type, epoch: current.epoch, revision: current.revision });
      post({ type, requestId, ...payload });
    });
  }
  const match = Object.freeze({
    get active() { return g.__slopMatchExpected === true || current !== null; },
    snapshot: () => current,
    subscribe(fn) {
      if (typeof fn !== 'function') throw new TypeError('Expected a callback');
      listeners.add(fn); if (current) fn(current); return () => listeners.delete(fn);
    },
    submit({ actionId, expectedRevision, epoch, action } = {}) {
      if (!current) return Promise.reject(issue('match_not_ready'));
      if (epoch !== current.epoch || expectedRevision !== current.revision) return Promise.reject(issue('match_stale_revision'));
      if (typeof actionId !== 'string' || !/^[A-Za-z0-9_-]{8,96}$/.test(actionId) || !action || typeof action !== 'object' || Array.isArray(action)) return Promise.reject(issue('invalid_match_action'));
      let copy; try { const json = JSON.stringify(action); if (new TextEncoder().encode(json).length > 2048) return Promise.reject(issue('invalid_match_action')); copy = JSON.parse(json); } catch (_) { return Promise.reject(issue('invalid_match_action')); }
      return request('match-submit', { actionId, expectedRevision, epoch, action: copy });
    },
    rematch() { return request('match-rematch', { epoch: current && current.epoch }); }
  });
  const descriptors = Object.getOwnPropertyDescriptors(creator);
  descriptors.version = { value: 'multiplayer-v1', enumerable: true };
  descriptors.match = { value: match, enumerable: true };
  g.Slop = Object.freeze(Object.create(Object.getPrototypeOf(creator), descriptors));
  creator.onResume(() => { clearTimeout(handshake); attempts = 0; ready(); });
  g.addEventListener('pagehide', () => { closed = true; clearTimeout(handshake); for (const id of pending.keys()) settle(id, 'match_closed'); listeners.clear(); });
  ready();
})(window);
