import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {gameTemplate} from '../mcp/game-template.mjs';
import {recorderTurnsConfig,globalMotionStats,localMotionStats,motionProblem,localMotionSize,LOCAL_MOTION_MAX_FRAMES} from '../scripts/mcp-publisher/motion.mjs';

const base = new URL('./fixtures/turns-motion/', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('provenance.json', base), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(name, type) {
  const entry = provenance.cases.find(c => c.name === name).samples[type];
  const compressed = await readFile(new URL(entry.file, base));
  assert.equal(sha(compressed), entry.sha256);
  const data = gunzipSync(compressed), {width,height} = provenance[type], size = width * height;
  // Lossless frame delta packing keeps complete 7-second captures small.
  for (let i = size; i < data.length; i++) data[i] ^= data[i - size];
  assert.equal(sha(data), entry.rawSha256);
  return data;
}

test('only explicit fully validated turns bundles receive the local metric', async () => {
  const {files} = await gameTemplate({game_type:'multiplayer'});
  assert.deepEqual(recorderTurnsConfig(files), {protocol:'turns-v1'});
  assert.equal(recorderTurnsConfig(null), null, 'remote URL has no source attestation');
  assert.equal(recorderTurnsConfig({'index.html':'<meta name="slop-runtime" content="multiplayer-v1">'}), null);
  assert.equal(recorderTurnsConfig((await gameTemplate({game_type:'single-player'})).files), null);
  const spec = JSON.parse(files['slop.spec.json']);
  delete spec.game_type;
  assert.equal(recorderTurnsConfig({...files,'slop.spec.json':JSON.stringify(spec)}), null, 'legacy untyped source remains on original policy');
  for (const changed of [
    {...files,'slop.js':files['slop.js']+'\n'},
    {...files,'index.html':files['index.html'].replace('multiplayer-v1','creator-v1')},
    {...files,'index.html':files['index.html'].replace('src="slop.js"','async src="slop.js"')},
    {...files,'slop.spec.json':JSON.stringify({...spec,game_type:'multiplayer',multiplayer:{...spec.multiplayer,max_turns:257}})},
    {...files,'slop.spec.json':JSON.stringify({game_type:'multiplayer',multiplayer:false})},
    {...files,'game.js':(await gameTemplate({game_type:'single-player'})).files['game.js']},
  ]) assert.throws(() => recorderTurnsConfig(changed));
});

for (const [name, expectedGlobal, expectedLocal] of [['pocket-play',1,156],['blob-play',0,107]]) {
  test(`real ${name} retains small visible gameplay lost by the whole-frame average`, async () => {
    const global = globalMotionStats(await fixture(name,'global'),222);
    const local = localMotionStats(await fixture(name,'local'),222,144,256);
    assert.deepEqual(global,{moving:expectedGlobal,lit:222});
    assert.equal(local.moving,expectedLocal);
    assert.equal(motionProblem(global,222),'no_motion', 'ordinary policy is unchanged');
    assert.equal(motionProblem(global,222,local),null);
  });
}

for (const [name, expectedLocal] of [['pocket-idle',0],['blob-idle',6]]) {
  test(`actual ${name} ambient animation still fails with the local metric`, async () => {
    const global = globalMotionStats(await fixture(name,'global'),222);
    const local = localMotionStats(await fixture(name,'local'),222,144,256);
    assert.deepEqual(global,{moving:0,lit:222});
    assert.equal(local.moving,expectedLocal);
    assert.equal(motionProblem(global,222,local),'no_motion');
  });
}

test('static real scene, low-amplitude noise, isolated hot pixel and outer decoration do not count', async () => {
  const width=144,height=256,size=width*height,count=60;
  const first=(await fixture('blob-idle','local')).subarray(0,size);
  for(const kind of ['static','noise','hot-pixel','outer-decoration']) {
    const data=Buffer.alloc(size*count);
    for(let f=0;f<count;f++) {
      first.copy(data,f*size);
      if(kind==='noise') for(let y=90;y<98;y++)for(let x=65;x<73;x++) {
        const p=f*size+y*width+x;
        data[p]=Math.max(0,Math.min(255,data[p]+((f+x+y)%5)-2));
      }
      if(kind==='hot-pixel') data[f*size+96*width+70]=f%2?255:0;
      if(kind==='outer-decoration') for(let y=0;y<12;y++)for(let x=0;x<12;x++)data[f*size+y*width+x]=f%2?255:0;
    }
    const local=localMotionStats(data,count,width,height);
    assert.equal(local.moving,0,kind);
    assert.equal(motionProblem({moving:0,lit:count},count,local),'no_motion',kind);
  }
});

test('blank frames cannot use the fallback and the exact 15% minimum is retained', () => {
  assert.equal(motionProblem({lit:110,moving:221},222,{moving:221}),'blank_canvas');
  assert.equal(motionProblem({lit:222,moving:0},222,{moving:33}),'no_motion');
  assert.equal(motionProblem({lit:222,moving:0},222,{moving:34}),null);
  assert.equal(motionProblem({lit:222,moving:33},222),'no_motion');
  assert.equal(motionProblem({lit:222,moving:34},222),null);
  const blank=Buffer.alloc(960*60);
  assert.deepEqual(globalMotionStats(blank,60),{lit:0,moving:0});
  assert.equal(motionProblem(globalMotionStats(blank,60),60,{moving:59}),'blank_canvas');
});

test('original whole-frame strict difference threshold and lit threshold remain unchanged', () => {
  const frames=Buffer.alloc(960*2);
  frames[0]=13;frames[960]=13;frames[961]=168;frames[962]=168;
  assert.deepEqual(globalMotionStats(frames,2),{lit:2,moving:0}); // exactly .35
  frames[962]++;
  assert.deepEqual(globalMotionStats(frames,2),{lit:2,moving:1});
  assert.deepEqual(globalMotionStats(Buffer.from([12,...Array(959).fill(0)]),1),{lit:0,moving:0});
});

test('local analysis supports both capture orientations and bounds decoded input', () => {
  for(const desktop of [false,true]) {
    const [w,h]=localMotionSize(desktop),size=w*h,data=Buffer.alloc(size*2);
    for(let y=60;y<68;y++)for(let x=60;x<68;x++)data[size+y*w+x]=255;
    assert.deepEqual(localMotionStats(data,2,w,h),{moving:1});
  }
  for(const [data,count,w,h] of [[Buffer.alloc(0),0,144,256],[Buffer.alloc(4),2,144,256],
    [Buffer.alloc(1),1,100000,100000],[Buffer.alloc(0),LOCAL_MOTION_MAX_FRAMES+1,144,256]]) {
    assert.throws(()=>localMotionStats(data,count,w,h),/motion_frames_invalid/);
  }
  assert.throws(()=>globalMotionStats(Buffer.alloc(959),1),/motion_frames_invalid/);
});
