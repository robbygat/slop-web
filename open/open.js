// HTTPS is the share format. Only this explicit button uses the custom scheme,
// so current app releases work without claiming a new Universal Link route
// that older installed clients would swallow without opening the game.
(function () {
  'use strict';
  var query = new URLSearchParams(location.search);
  var allowed = ['game', 'room', 'beat', 'by'];
  var invalid = false;
  query.forEach(function (_, key) {
    if (allowed.indexOf(key) < 0 || query.getAll(key).length !== 1) invalid = true;
  });
  var game = query.get('game') || '';
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(game) || game === 'play' || game === 'bridge') invalid = true;
  var room = query.get('room');
  if (room !== null && !/^(?:[A-HJ-NP-Z2-9]{5}|[A-HJ-NP-Z2-9]{13})$/.test(room)) invalid = true;
  var beat = query.get('beat');
  if (beat !== null && (!/^[1-9][0-9]*$/.test(beat) || !Number.isSafeInteger(Number(beat)))) invalid = true;
  var by = query.get('by');
  if (by !== null && by.length > 80) invalid = true;
  if (location.hash) invalid = true;
  if (invalid) {
    document.getElementById('link-error').hidden = false;
    document.getElementById('description').textContent = 'We couldn’t read this game link.';
    return;
  }
  if (room === null) {
    var browser = new URL('https://slop.game/web-player/');
    browser.searchParams.set('g', game);
    if (beat !== null) browser.searchParams.set('beat', beat);
    if (by !== null) browser.searchParams.set('by', by);
    var play = document.getElementById('play-browser');
    play.href = browser.href;
    play.hidden = false;
  } else {
    document.getElementById('description').textContent =
      'This room invitation opens in the Slop app. Browser play is not available for rooms yet.';
  }
  var app = new URL('io.slop.game://play');
  app.searchParams.set('game', game);
  if (room !== null) app.searchParams.set('room', room);
  if (beat !== null) app.searchParams.set('beat', beat);
  // "by" is share attribution; released native routes accept only game/room/beat.
  var open = document.getElementById('open-app');
  open.href = app.href;
  open.hidden = false;
  var label = document.getElementById('game-label');
  label.textContent = game;
  label.hidden = false;
})();
