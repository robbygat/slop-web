import test from 'node:test';import assert from 'node:assert/strict';import gifenc from 'gifenc';
import {animatedGifInfo,requireAnimatedGif} from '../src/lib/gif-contracts.js';
const{GIFEncoder}=gifenc;
function fixture(count=3){const gif=GIFEncoder();const palette=[[0,0,0],[255,170,65]];for(let i=0;i<count;i++)gif.writeFrame(Uint8Array.from([i%2,(i+1)%2,i%2,(i+1)%2]),2,2,{palette,delay:200});gif.finish();return gif.bytes();}
test('moving GIF contract requires every timed encoded frame',()=>{const bytes=fixture(4),info=requireAnimatedGif(bytes,4);assert.equal(info.frames,4);assert.deepEqual(info.delays,[20,20,20,20]);assert.throws(()=>requireAnimatedGif(bytes,3),/lost frames/);assert.throws(()=>animatedGifInfo(fixture(1)),/at least three/);assert.throws(()=>animatedGifInfo(new Uint8Array([1,2,3])),/valid animated GIF/);});
