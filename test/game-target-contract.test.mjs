import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalGameTarget,catalogPlatformForTarget,creatorTargetInstruction,gameTargetFromFiles,previewGameForTarget,supportedPlatformsForTarget} from '../src/lib/game-target-contract.js';

test('one target vocabulary maps builder, catalog and preview dimensions',()=>{
 assert.equal(canonicalGameTarget('cross-play'),'cross-platform');
 assert.equal(catalogPlatformForTarget('cross-platform'),'cross-play');
 assert.deepEqual(supportedPlatformsForTarget('cross-platform'),['mobile','desktop']);
 assert.deepEqual(previewGameForTarget('mobile'),{supported_platforms:['mobile'],preview_width:360,preview_height:640,target_platform:'mobile'});
 assert.deepEqual(previewGameForTarget('desktop'),{supported_platforms:['desktop'],preview_width:640,preview_height:360,target_platform:'desktop'});
 assert.throws(()=>canonicalGameTarget('console'),/Choose phone/);
});

test('target stays sealed across HTML and MCP metadata',()=>{
 const index=target=>`<!doctype html><head><meta content="${target}" name="slop-target"></head>`;
 assert.equal(gameTargetFromFiles({'index.html':index('mobile')}),'mobile');
 assert.equal(gameTargetFromFiles({'index.html':index('desktop'),'slop-platform.json':'{"target_platform":"desktop"}'}),'desktop');
 assert.equal(gameTargetFromFiles({'index.html':'<canvas></canvas>'}),'mobile');
 assert.throws(()=>gameTargetFromFiles({'index.html':index('mobile'),'slop-platform.json':'{"target_platform":"desktop"}'}),/conflicting target/);
 assert.throws(()=>gameTargetFromFiles({'slop-platform.json':'{"target_platform":"console"}'}),/invalid target/);
});

test('creator brief requires the unchanged shared lifecycle and device controls',()=>{
 const phone=creatorTargetInstruction('mobile'),both=creatorTargetInstruction('cross-platform');
 for(const word of ['slop-target','slop.js','Slop.ready','Slop.score','Slop.finished','Slop.onRestart','Slop.loop','Slop.input'])assert.match(phone,new RegExp(word.replace('.','\\.')));
 assert.match(phone,/touch-first/);assert.match(both,/keyboard\/mouse controls/);assert.match(both,/letterbox/);
});
