import test from 'node:test';
import assert from 'node:assert/strict';
import { checkApiHealth, ApiHealthFailure, createVideoRetryPass } from '../scripts/mcp-publisher/safety.mjs';
import { installRecorderInput, mobileInputFrame } from '../scripts/mcp-publisher/input.mjs';

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

test('forced retry pass keeps one server cutoff and refuses missing or changed receipts', () => {
  const pass = createVideoRetryPass(true);
  assert.deepEqual(pass.claimInput(), { retry_failed: true });
  assert.throws(() => pass.acceptClaim({ games: [] }), /video_retry_cutoff_invalid/);
  const cutoff = '2026-09-28T05:00:00.123456+00:00';
  pass.acceptClaim({ retry_before: cutoff });
  assert.deepEqual(pass.claimInput(), { retry_failed: true, retry_before: cutoff });
  pass.acceptClaim({ retry_before: cutoff });
  assert.throws(() => pass.acceptClaim({ retry_before: '2026-09-28T05:00:01+00:00' }), /video_retry_cutoff_invalid/);
  assert.deepEqual(pass.claimInput(), { retry_failed: true, retry_before: cutoff });
  const ordinary = createVideoRetryPass(false);
  ordinary.acceptClaim({ games: [] });
  assert.deepEqual(ordinary.claimInput(), { retry_failed: false });
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


test('mobile repertoire keeps touches balanced, in bounds and clear of the screen edges', () => {
  let active = false, starts = 0, ended = 0;
  for (let frame = 0; frame < 30 * 16; frame++) {
    for (const event of mobileInputFrame(frame, { width: 360, height: 640 })) {
      if (event.type === 'touchStart') { assert.equal(active, false, 'a new gesture cannot replace a held finger'); active = true; starts++; }
      if (event.type === 'touchMove') assert.equal(active, true);
      if (event.type === 'touchEnd') { assert.equal(active, true); active = false; ended++; }
      else { assert.ok(event.x > 0 && event.x < 360); assert.ok(event.y > 0 && event.y < 640); }
    }
  }
  assert.equal(active, false);
  assert.equal(starts, ended);
  assert.ok(starts < 60, 'coverage must remain human-paced and bounded');
});

test('mobile repertoire covers bottom-tray placement and a fast upward flick', () => {
  const gestures = []; let current;
  for (let frame = 0; frame < 30 * 8; frame++) {
    for (const event of mobileInputFrame(frame, { width: 360, height: 640 })) {
      if (event.type === 'touchStart') current = { start: event, end: event, frame, moves: 0 };
      if (event.type === 'touchMove') { current.end = event; current.moves++; }
      if (event.type === 'touchEnd') gestures.push({ ...current, ms: (frame - current.frame) * 1000 / 30 });
    }
  }
  assert.ok(gestures.some(g => g.start.y > 640 * .88 && g.end.y < 640 * .6 && g.moves >= 6), 'a tray drag must reach from the bottom into the board');
  assert.ok(gestures.some(g => g.start.y - g.end.y > 640 * .45 && g.ms <= 220), 'a flick must travel far enough and release quickly');
  assert.ok(gestures.some(g => g.end.y - g.start.y > 640 * .5), 'digging needs a connected top-to-bottom stroke');
  assert.throws(() => mobileInputFrame(-1, { width: 360, height: 640 }), TypeError);
});

for (const gesture of ['bottom-tray', 'fast-flick']) {
  test(`isolated browser starts a canvas requiring a trusted ${gesture} gesture`, { skip: process.env.SLOP_RECORDER_BROWSER_TEST !== '1', timeout: 90000 }, async () => {
    const { recordVideo } = await import('../scripts/mcp-publisher/video.mjs');
    const diagnostics = {};
    const files = {
      'index.html': '<!doctype html><html><head></head><body style="margin:0;touch-action:none"><canvas width="360" height="640"></canvas><script src="game.js"></script></body></html>',
      'game.js': `const c=document.querySelector('canvas'),ctx=c.getContext('2d');let started=false,frame=0,start=null,end=null;
        c.addEventListener('pointerdown',e=>{if(e.isTrusted){start={x:e.clientX,y:e.clientY,t:performance.now()};end=start;}});
        c.addEventListener('pointermove',e=>{if(e.isTrusted&&start)end={x:e.clientX,y:e.clientY};});
        c.addEventListener('pointerup',e=>{if(!e.isTrusted||!start)return;
          if(${JSON.stringify(gesture)}==='bottom-tray')started ||= start.y>560&&start.x<110&&end.y<390&&Math.abs(end.x-start.x)<70;
          else started ||= start.y-end.y>280&&performance.now()-start.t<=220;
          start=null;});
        parent.postMessage(JSON.stringify({type:'ready'}),'*');
        function draw(){frame++;ctx.fillStyle='#ffd660';ctx.fillRect(0,0,360,640);ctx.fillStyle='#1b4089';ctx.fillRect(started?(frame*5)%280:50,200,80,200);requestAnimationFrame(draw)}draw();`,
    };
    const clip = await recordVideo({ files }, { seconds: 3, diagnostics });
    assert.equal(diagnostics.errors, 0);
    assert.equal(diagnostics.controlClicks, 0);
    assert.ok(diagnostics.moving > 25, 'normal canvas controls must produce sustained visible gameplay');
    assert.equal(clip.video.toString('ascii', 4, 8), 'ftyp');
  });
}


test('isolated browser still rejects a static canvas despite trusted gestures', { skip: process.env.SLOP_RECORDER_BROWSER_TEST !== '1', timeout: 90000 }, async () => {
  const { recordVideo } = await import('../scripts/mcp-publisher/video.mjs');
  const diagnostics = {};
  const files = {
    'index.html': '<!doctype html><html><head></head><body style="margin:0;touch-action:none"><canvas width="360" height="640"></canvas><script src="game.js"></script></body></html>',
    'game.js': `const ctx=document.querySelector('canvas').getContext('2d');ctx.fillStyle='#ffd660';ctx.fillRect(0,0,360,640);ctx.fillStyle='#1b4089';ctx.fillRect(50,200,80,200);parent.postMessage(JSON.stringify({type:'ready'}),'*');`,
  };
  await assert.rejects(recordVideo({ files }, { seconds: 1, diagnostics }), { code: 'no_motion' });
  assert.equal(diagnostics.moving, 0);
  assert.equal(diagnostics.errors, 0);
});


test('crossfade encoder preserves every 720p30 output frame and the upload byte ceiling', {skip:process.env.SLOP_RECORDER_ENCODER_TEST !== '1',timeout:60000}, async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process');
 const {encodeLoop}=await import('../scripts/mcp-publisher/video.mjs');
 const {validateVideo,validatePoster}=await import('../supabase/functions/slop-mcp/publisher.mjs');
 const ffmpeg=process.env.FFMPEG_PATH ?? 'ffmpeg';
 const dir=await mkdtemp(join(tmpdir(),'slop-quality-test-'));
 try {
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=720x1280:rate=30','-frames:v','72','-q:v','2','-start_number','0',join(dir,'f%05d.jpg')]);
  const clip=await encodeLoop(dir,72,{width:720,height:1280});
  assert.equal(clip.crf,21);assert.ok(clip.video.length<=2600000);
  const info=validateVideo(clip.video);assert.equal(info.codec,'avc1');assert.equal(info.width,720);assert.equal(info.height,1280);assert.equal(info.duration_ms,2000);assert.ok(validatePoster(clip.poster,720,1280));
  const decoded=execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-i',join(dir,'preview.mp4'),'-map','0:v:0','-f','framemd5','-'],{encoding:'utf8'});
  assert.match(decoded,/^#tb 0: 1\/30$/m);
  assert.match(decoded,/^#dimensions 0: 720x1280$/m);
  const frames=decoded.trim().split(/\r?\n/).filter(line=>!line.startsWith('#')).map(line=>line.split(',').map(value=>value.trim()));
  assert.equal(clip.frames,60);assert.equal(frames.length,60);
  for(const [index,frame] of frames.entries()) {
   assert.equal(Number(frame[1]),index);assert.equal(Number(frame[2]),index);assert.equal(Number(frame[3]),1);
   assert.equal(Number(frame[4]),720*1280*3/2,'decoded frame must retain 8-bit 4:2:0 pixels');
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
