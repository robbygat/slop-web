// This document has no account credentials. Never execute generated code in
// the relay itself: it belongs in the second, opaque sandbox below.
(() => {
  'use strict';
  let game = null;
  let loaded = false;
  let blocked = false;
  const maxMessageChars = 2100000;
  const send = (message) => parent.postMessage(message, '*');
  // The host focuses this outer relay. Hand that focus to the actual game so
  // native keydown/keyup (including a release after a hostKey) reach its code.
  const focusGame = () => {
    if (!game || !loaded || blocked) return;
    game.focus({preventScroll: true});
    game.contentWindow.focus();
    game.contentWindow.postMessage(JSON.stringify({type: 'hostFocus'}), '*');
  };
  addEventListener('focus', focusGame);
  // There is one browser task between focusing this relay and focusing the
  // inner game. Catch only real keys during that handoff; inner native events
  // never bubble here, so they cannot be delivered twice.
  const keyCode = /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(?:Left|Right|Up|Down)|Space|Enter|Escape|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Backspace|Delete|Home|End|PageUp|PageDown|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Numpad(?:Add|Subtract|Multiply|Divide|Decimal|Enter))$/;
  const forwardKey = (event, down) => {
    if (!game || !loaded || blocked || !event.isTrusted || !keyCode.test(event.code) ||
        event.isComposing || event.metaKey || (event.ctrlKey && !/^Control/.test(event.code)) ||
        (event.altKey && !/^Alt/.test(event.code))) return;
    event.preventDefault();
    focusGame();
    game.contentWindow.postMessage(JSON.stringify({type: 'hostKey', down, key: event.key, code: event.code,
      repeat: !!event.repeat, shiftKey: !!event.shiftKey, ctrlKey: !!event.ctrlKey, altKey: !!event.altKey,
      metaKey: !!event.metaKey, keyCode: event.keyCode, location: event.location}), '*');
    if (down) send(JSON.stringify({type: 'webInteraction'}));
  };
  addEventListener('keydown', event => forwardKey(event, true));
  addEventListener('keyup', event => forwardKey(event, false));

  addEventListener('message', (event) => {
    if (event.source === parent && parent !== window) {
      const message = event.data;
      if (!game) {
        if (!message || message.type !== 'slop-player-init-v1' ||
            typeof message.html !== 'string' || message.html.length > 8388608 ||
            typeof message.csp !== 'string' || message.csp.length > 16384 ||
            !message.csp.startsWith("default-src 'none';")) return;
        game = document.createElement('iframe');
        game.title = 'Generated game';
        game.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
        game.setAttribute('credentialless', '');
        game.setAttribute('csp', message.csp);
        game.allow = 'autoplay; gamepad';
        game.referrerPolicy = 'no-referrer';
        game.addEventListener('load', () => {
          if (blocked) return;
          if (!loaded) {
            loaded = true;
            if (document.hasFocus()) focusGame();
            send('slop-player-loaded-v1');
            return;
          }
          blocked = true;
          game.remove();
          send(JSON.stringify({type: 'loadError', code: 'main_frame_failure',
            phase: 'post_ready', message: 'The game tried to leave its isolated player.'}));
        });
        // Set before attachment so the initial about:blank load cannot count as
        // a game load or be mistaken for an attempted navigation.
        game.srcdoc = message.html;
        document.body.appendChild(game);
      } else if (!blocked && typeof message === 'string' &&
                 message.length <= maxMessageChars) {
        if (message === '{"type":"hostFocus"}') { focusGame(); return; }
        game.contentWindow.postMessage(message, '*');
      }
      return;
    }
    // Publish-time video capture: one transferred ImageBitmap per request,
    // re-sent as a fixed-shape object (nothing else of the game's is kept).
    if (game && !blocked && event.source === game.contentWindow && event.data &&
        typeof event.data === 'object' && event.data.type === 'webFrameResult' &&
        typeof event.data.request === 'string' && event.data.request.length <= 64) {
      const bitmap = typeof ImageBitmap === 'function' && event.data.bitmap instanceof ImageBitmap ? event.data.bitmap : null;
      const background = typeof event.data.background === 'string' ? event.data.background.slice(0, 64) : null;
      parent.postMessage({type: 'webFrameResult', request: event.data.request, bitmap, background}, '*', bitmap ? [bitmap] : []);
      return;
    }
    if (game && !blocked && event.source === game.contentWindow &&
        typeof event.data === 'string' && event.data.length <= maxMessageChars) {
      // Control messages belong to the relay; game code cannot forge them.
      if (event.data === 'slop-player-loaded-v1') return;
      send(event.data);
    }
  });
})();
