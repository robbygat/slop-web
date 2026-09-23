import test from 'node:test';
import assert from 'node:assert/strict';
import {gamePlatform,platformValues,filterPlatform} from '../src/lib/game-platforms.js';
import {gameFormat} from '../src/lib/game-format.js';
test('product support is separate from preview shape and filters do not mix mobile-only with cross-play',()=>{
 assert.equal(gamePlatform({preview_width:1280,preview_height:720}),'mobile');assert.equal(gamePlatform({supported_platforms:['desktop'],preview_width:360,preview_height:640}),'desktop');assert.equal(gamePlatform({supported_platforms:['mobile','desktop']}),'cross-play');assert.deepEqual(platformValues('cross-play'),['mobile','desktop']);assert.deepEqual(platformValues('cross-platform'),['mobile','desktop']);assert.throws(()=>platformValues('racing'));
 const calls=[],q={contains:(...x)=>{calls.push(['contains',...x]);return q;},containedBy:(...x)=>{calls.push(['containedBy',...x]);return q;}};filterPlatform(q,'mobile');assert.deepEqual(calls,[['contains','supported_platforms',['mobile']],['containedBy','supported_platforms',['mobile']]]);
 assert.equal(gameFormat().aspect,9/16);assert.equal(gameFormat().playerAspect,9/19.5);assert.equal(gameFormat({preview_width:1280,preview_height:720}).playerAspect,16/9);assert.equal(gameFormat({supported_platforms:['desktop']}).playerAspect,16/9);
});
