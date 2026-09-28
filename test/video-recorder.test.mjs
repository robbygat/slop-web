import test from 'node:test';
import assert from 'node:assert/strict';
import { checkApiHealth, ApiHealthFailure, retryFailedForClaim } from '../scripts/mcp-publisher/safety.mjs';
import { installRecorderInput } from '../scripts/mcp-publisher/input.mjs';

test('background recorder stops for slow response bodies, HTTP errors and network errors', async () => {
  for (const scenario of ['slow-body', 'http-error', 'network-error']) {
    let elapsed = 0, calls = 0;
    const fetchImpl = async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.slop.game/rest/v1/games?select=slug&limit=1');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.deepEqual(Object.keys(options.headers), ['apikey']);
      if (scenario === 'network-error') throw new TypeError('offline');
      return { ok: scenario !== 'http-error', arrayBuffer: async () => { elapsed = scenario === 'slow-body' ? 1000 : 20; } };
    };
    await assert.rejects(checkApiHealth({ fetchImpl, now: () => elapsed }), ApiHealthFailure);
    assert.equal(calls, 1, 'an unhealthy API must not be retried');
  }
});

test('background recorder accepts a complete fast healthy response', async () => {
  let elapsed = 0;
  await checkApiHealth({ fetchImpl: async () => ({ ok: true, arrayBuffer: async () => { elapsed = 190; } }), now: () => elapsed });
});

test('forced failures are eligible only for the first claim of a pass', () => {
  assert.equal(retryFailedForClaim(true, 0), true);
  assert.equal(retryFailedForClaim(true, 1), false);
  assert.equal(retryFailedForClaim(false, 0), false);
});

test('start bridge returns only visible unobstructed play controls and ignores foreign messages', () => {
  let handler, sent = [], hit;
  const element = (text, options = {}) => ({ textContent: text, disabled: false,
    getBoundingClientRect: () => ({ left: 40, top: 300, width: 100, height: 40 }),
    getAttribute: () => null, contains: () => false, ...options });
  const buttons = [element('Delete'), element('Start', { disabled: true }), element('Play')];
  const target = { parent: { postMessage: message => sent.push(JSON.parse(message)) }, innerWidth: 360, innerHeight: 640,
    document: { querySelectorAll: () => buttons, elementFromPoint: () => hit },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }),
    addEventListener: (name, cb) => { assert.equal(name, 'message'); handler = cb; } };
  installRecorderInput(target);
  const request = source => handler({ source, data: JSON.stringify({ type: 'slopRecorderControls' }) });
  hit = buttons[2];
  request({}); assert.equal(sent.length, 0);
  request(target.parent); assert.deepEqual(sent.pop().points, [{ x: 90, y: 320 }]);
  hit = {}; request(target.parent); assert.deepEqual(sent.pop().points, []);
});

test('isolated browser records a module game after activating its Start button', { skip: process.env.SLOP_RECORDER_BROWSER_TEST !== '1', timeout: 90000 }, async () => {
  const { recordVideo } = await import('../scripts/mcp-publisher/video.mjs');
  const diagnostics = {};
  const files = {
    'index.html': '<!doctype html><html><head></head><body style="margin:0"><canvas width="360" height="640"></canvas><button style="position:absolute;left:120px;top:300px">Start</button><script type="module" src="game.js"></script></body></html>',
    'game.js': `const c=document.querySelector('canvas'),ctx=c.getContext('2d');let started=false,frame=0;
      document.querySelector('button').onclick=e=>{started=true;e.target.remove()};
      parent.postMessage(JSON.stringify({type:'ready'}),'*');
      function draw(){frame++;ctx.fillStyle='#ffd660';ctx.fillRect(0,0,360,640);ctx.fillStyle='#1b4089';ctx.fillRect(started?(frame*5)%280:50,200,80,200);requestAnimationFrame(draw)}draw();`,
  };
  const clip = await recordVideo({ files }, { seconds: 1, diagnostics });
  assert.equal(diagnostics.ready, true);
  assert.equal(diagnostics.controlClicks, 1);
  assert.equal(diagnostics.errors, 0);
  assert.ok(diagnostics.moving > 20);
  assert.equal(clip.width, 720);
  assert.equal(clip.video.toString('ascii', 4, 8), 'ftyp');
});


test('isolated browser restarts a settled game and plays its upward-swipe control', { skip: process.env.SLOP_RECORDER_BROWSER_TEST !== '1', timeout: 90000 }, async () => {
  const { recordVideo } = await import('../scripts/mcp-publisher/video.mjs');
  const diagnostics = {};
  const files = {
    'index.html': '<!doctype html><html><head></head><body style="margin:0;touch-action:none"><canvas width="360" height="640"></canvas><script src="game.js"></script></body></html>',
    'game.js': `const c=document.querySelector('canvas'),ctx=c.getContext('2d');let restarted=false,started=false,y0=0,dy=0,frame=0;
      addEventListener('message',e=>{if(JSON.parse(e.data).type==='restart')restarted=true});
      c.addEventListener('touchstart',e=>{y0=e.changedTouches[0].clientY;dy=0});
      c.addEventListener('touchmove',e=>{dy=e.changedTouches[0].clientY-y0;e.preventDefault()},{passive:false});
      c.addEventListener('touchend',()=>{if(restarted&&dy < -30)started=true});
      parent.postMessage(JSON.stringify({type:'ready'}),'*');
      function draw(){frame++;ctx.fillStyle='#ffd660';ctx.fillRect(0,0,360,640);ctx.fillStyle='#1b4089';ctx.fillRect(started?(frame*5)%280:50,200,80,200);requestAnimationFrame(draw)}draw();`,
  };
  await recordVideo({ files }, { seconds: 2, diagnostics });
  assert.equal(diagnostics.errors, 0);
  assert.ok(diagnostics.moving > 20, 'game must respond to its real swipe control after restart');
});
