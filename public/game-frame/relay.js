// This document has no account credentials. Never execute generated code in
// the relay itself: it belongs in the second, opaque sandbox below.
(() => {
  'use strict';
  let game = null;
  let loaded = false;
  let blocked = false;
  const maxMessageChars = 2100000;
  const send = (message) => parent.postMessage(message, '*');

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
        game.contentWindow.postMessage(message, '*');
      }
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
