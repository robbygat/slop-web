// Execute the restored originals' actual end/restart boundaries in a small host.
// This complements the recorded manual gameplay; it does not simulate a race win.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root = process.argv[2] || '/tmp/slop-web-redesign/restored-desktop';
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json')));
const hash = data => createHash('sha256').update(data).digest('hex');
let checks = 0;
for (const game of manifest) {
  for (const [file, receipt] of Object.entries(game.files)) {
    const bytes = await fs.readFile(path.join(root, game.id, file));
    assert.equal(bytes.length, receipt.bytes); assert.equal(hash(bytes), receipt.sha256);
    checks++;
  }
  assert.equal(game.supported_platforms.join(','), 'desktop');
  assert.equal(game.runtime_sha256, game.files['slop.js'].sha256);
  const source = await fs.readFile(path.join(root, game.id, 'game-source.js'), 'utf8');
  const dom = new Map();
  const scores = [];
  const storage = new Map();
  const host = {
    $: id => { if (!dom.has(id)) dom.set(id, {style:{}}); return dom.get(id); },
    Slop: {finished: score => scores.push(score), score: () => {}},
    localStorage: {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)},
    slopEnded: false, window: {dispatchEvent(){}}, CustomEvent: class {},
    EMBED:false, saveBest(){}, queueXP(){}, COLORS:['green'], FIELD:4,
  };
  if (game.id === 'slopkart-desktop') {
    const fn = source.slice(source.indexOf('function finishRace() {'), source.indexOf('\nfunction queueXP('));
    for (let placement = 1; placement <= 4; placement++) {
      scores.length = 0;
      const karts = Array.from({length:4}, (_, i) => ({finished:true,progress:3,finishTime:100+i*10,ai:true}));
      Object.assign(host, {game:{state:'racing',mode:'single',karts},player:karts[placement-1]});
      vm.runInNewContext(fn + ';finishRace();finishRace();', host);
      assert.deepEqual(scores, [5-placement]); assert.equal(host.slopEnded, true); checks++;
    }
  } else if(game.score_kind==='unscored') {
    assert.equal(game.score,'0');
    assert.equal(source.includes('Slop.finished('),false,'Open-ended originals must not invent a scored end');
    checks++;
  } else if(game.id==='dungeon-panic-desktop') {
    const fn=source.slice(source.indexOf('function gameOver() {'),source.indexOf('\nfunction backToTitle()'));
    host.game={score:230,floorNum:2,kills:5,mode:'single'};
    host.getBest=()=>230;
    vm.runInNewContext(fn+';gameOver();gameOver();',host);
    assert.deepEqual(scores,[230]);assert.equal(host.slopEnded,true);checks++;
  } else {
    const runner = game.id === 'run-infinite-desktop';
    const fn = runner
      ? source.slice(source.indexOf('function endRun() {'), source.indexOf('\nfunction finishRace(won)'))
      : source.slice(source.indexOf('function gameOver() {'), source.indexOf('\n// ---------------------------------------------------------------- input'));
    host.game = runner ? {dist:123.9,best:0,orbs:2,difficulty:'normal'} : {round:7,players:[{kills:20}],mode:'single'};
    vm.runInNewContext(fn + (runner ? ';endRun();endRun();' : ';gameOver();gameOver();'), host);
    assert.deepEqual(scores, [runner ? 123 : 7]); assert.equal(host.slopEnded, true); checks++;
  }
  const reset = source.slice(source.indexOf('function clearSlopInput(){'), source.indexOf('\nSlop.onPause('));
  let restarts = 0;
  Object.assign(host, {keys:{w:true,Space:true},mouseDown:true,slopPaused:true,slopLastScore:99,
    startSolo:() => restarts++, startRace:() => restarts++, startSingle:() => restarts++,
    startGame:()=>restarts++,spawnOnSurface:()=>restarts++,confirmPressed:true,
    player:{vel:{set(){}},yaw:1,pitch:1},leaveSlopLook(){},setSlopAudio(){},slopMuted:false});
  if(!host.game)host.game={battle:{},dialog:{}};
  vm.runInNewContext(reset + ';resetSlopRun();', host);
  assert.equal(restarts, 1); assert.equal(host.slopEnded,false); assert.equal(host.slopPaused,false);
  assert.equal(Object.keys(host.keys).length,0);
  if (game.id === 'sloppy-zombies-desktop') assert.equal(host.mouseDown,false);
  if(game.id==='umbral-red-desktop'){
    assert.equal(host.confirmPressed,false);assert.equal(host.game.battle,null);assert.equal(host.game.dialog,null);
  }
  checks++;
}
console.log(`${checks} source-byte, finish-idempotency, placement-score and replay checks passed.`);
