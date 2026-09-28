import test from 'node:test';
import assert from 'node:assert/strict';
import {finishPublicationVideo} from '../src/lib/publication-video.js';

test('unsupported browser never reaches publication',async()=>{
 let published=false;
 await assert.rejects(async()=>{await finishPublicationVideo({supported:false});published=true;},/Video recording is unavailable/);
 assert.equal(published,false);
});
test('failed or incomplete recordings block publication',async()=>{
 for(const clip of [null,{video:new Uint8Array(2),poster:new Uint8Array(1)},{video:new Uint8Array(2),poster:new Uint8Array(1),durationMs:1000},{video:new Uint8Array(0),poster:new Uint8Array(1),durationMs:7000}]){
  let published=false;
  await assert.rejects(async()=>{await finishPublicationVideo({supported:true,finish:async()=>clip});published=true;},/video preview is required/);
  assert.equal(published,false);
 }
});
test('completed MP4 and poster can proceed without discarding the real clip',async()=>{
 const clip={video:new Uint8Array(8),poster:new Uint8Array(4),durationMs:7000};
 assert.equal(await finishPublicationVideo({supported:true,finish:async()=>clip}),clip);
});
