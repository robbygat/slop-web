import test from 'node:test';
import assert from 'node:assert/strict';
import {gameFormat} from '../src/lib/game-format.js';
import {gamePlayFormat} from '../src/lib/game-play-format.js';
import {REVIEWED_DESKTOP_RELEASES} from '../src/lib/reviewed-desktop-games.js';

const crossPlay=Object.freeze({supported_platforms:Object.freeze(['mobile','desktop']),preview_width:360,preview_height:640});
const phone=Object.freeze({supported_platforms:Object.freeze(['mobile']),preview_width:360,preview_height:640});
const audited=Object.freeze({supported_platforms:Object.freeze(['desktop']),preview_width:1280,preview_height:720,
  published_bundle_path:'releases/a4ff1b4e360daffd53058f3d4d726f79fceb4e6f4f2eeea96b4c768365c6b766/run-infinite-desktop'});
const portrait={orientation:'portrait',playerAspect:9/19.5};
const wide={orientation:'landscape',playerAspect:16/9};

test('cross-play and mobile games keep the same portrait playfield on desktop and phones',()=>{
  assert.deepEqual(gamePlayFormat(crossPlay,{desktop:true}),portrait);
  assert.deepEqual(gamePlayFormat(crossPlay),portrait);
  assert.deepEqual(gamePlayFormat(crossPlay,{mode:'wide'}),portrait);
  assert.deepEqual(gamePlayFormat(phone,{desktop:true}),portrait);
  assert.deepEqual(gamePlayFormat(),portrait);
  assert.deepEqual(gamePlayFormat(null),portrait);
});
test('mobile games cannot be widened by desktop view choices or stale selections',()=>{
  const preview=gameFormat(crossPlay);
  for(const game of [phone,crossPlay])for(const mode of ['auto','original','wide','unknown']){
    assert.deepEqual(gamePlayFormat(game,{desktop:true,mode}),portrait);
  }
  assert.deepEqual(gameFormat(crossPlay),preview);
  assert.equal(preview.aspect,9/16);
  assert.equal(preview.orientation,'portrait');
});
test('desktop-only games still allow an explicit wide view without changing their recording',()=>{
  const game={supported_platforms:['desktop'],preview_width:800,preview_height:600};
  const original={orientation:'landscape',playerAspect:4/3};
  for(const mode of ['auto','original','unknown'])assert.deepEqual(gamePlayFormat(game,{desktop:true,mode}),original);
  assert.deepEqual(gamePlayFormat(game,{desktop:true,mode:'wide'}),wide);
  assert.deepEqual(gamePlayFormat(game,{mode:'wide'}),original);
  assert.equal(gameFormat(game).aspect,4/3);
});
test('already landscape and square originals keep their authored aspect in automatic mode',()=>{
  const landscape={...crossPlay,preview_width:800,preview_height:600};
  assert.deepEqual(gamePlayFormat(landscape,{desktop:true}),{orientation:'landscape',playerAspect:4/3});
  assert.deepEqual(gamePlayFormat({...crossPlay,preview_width:640,preview_height:640},{desktop:true}),{orientation:'square',playerAspect:1});
  assert.deepEqual(gamePlayFormat({supported_platforms:['desktop']}),wide);
});
test('audited immutable desktop viewports win over every view choice and recordings',()=>{
  const fixed={orientation:'landscape',playerAspect:4/3};
  for(const mode of ['auto','original','wide'])for(const desktop of [false,true])assert.deepEqual(gamePlayFormat(audited,{desktop,mode}),fixed);
  // A later release cannot inherit an old fixed-viewport exception.
  assert.deepEqual(gamePlayFormat({...audited,published_bundle_path:'releases/new-revision/run-infinite-desktop'},{desktop:true,mode:'wide'}),wide);
  assert.deepEqual(gamePlayFormat({...audited,preview_width:360,preview_height:640,supported_platforms:['mobile','desktop']},{desktop:true,mode:'wide'}),fixed);
});
test('locked capture stages take precedence over desktop choices and fixed game viewports',()=>{
  assert.deepEqual(gamePlayFormat(audited,{desktop:true,mode:'wide',stageAspect:9/19.5}),portrait);
  assert.deepEqual(gamePlayFormat(crossPlay,{desktop:true,mode:'wide',stageAspect:1}),{orientation:'square',playerAspect:1});
  assert.deepEqual(gamePlayFormat(phone,{stageAspect:16/9}),wide);
});
test('invalid stage overrides cannot produce invalid iframe dimensions',()=>{
  for(const stageAspect of [0,-1,NaN,Infinity,-Infinity,'16/9',null,undefined])assert.deepEqual(gamePlayFormat(crossPlay,{desktop:true,stageAspect}),portrait);
});

test('mouse-compatible phone releases retain mobile framing and capture dimensions',()=>{
  for(const review of REVIEWED_DESKTOP_RELEASES){
    const game={...phone,status:'published',published_bundle_path:review.root,bundle_version:review.version};
    assert.deepEqual(gamePlayFormat(game,{desktop:true}),portrait);
    assert.deepEqual(gamePlayFormat(game),portrait);
    assert.deepEqual(gamePlayFormat(game,{desktop:true,mode:'original'}),portrait);
    assert.deepEqual(gamePlayFormat(game,{desktop:true,mode:'wide'}),portrait);
    assert.deepEqual(gamePlayFormat({...game,bundle_version:'2.0.0'},{desktop:true}),portrait);
    assert.deepEqual(gamePlayFormat(game,{desktop:true,stageAspect:9/16}),{orientation:'portrait',playerAspect:9/16});
  }
});
