import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicPageCache} from '../src/lib/public-page-cache.js';
import {expressiveFace} from '../src/lib/robot-expression.js';

test('public pages share pending requests, expire, and keep filters isolated',async()=>{
 let now=100,calls=0;const cache=createPublicPageCache({ttl:50,now:()=>now});
 const load=async()=>({revision:++calls});
 const first=cache.read('all',load),concurrent=cache.read('all',load);
 assert.equal(first,concurrent);assert.equal((await first).revision,1);
 assert.equal((await cache.read('all',load)).revision,1);
 assert.equal((await cache.read('desktop',load)).revision,2);
 now=151;assert.equal((await cache.read('all',load)).revision,3);
});
test('failed reads can retry immediately and the cache is bounded',async()=>{
 const cache=createPublicPageCache({limit:2});let calls=0;
 await assert.rejects(cache.read('all',async()=>{throw new Error('offline');}),/offline/);
 assert.equal(await cache.read('all',async()=>++calls),1);
 await cache.read('mobile',async()=>++calls);await cache.read('desktop',async()=>++calls);
 assert.equal(await cache.read('all',async()=>++calls),4);
});
test('idle and click reactions retain every equipped face, including the Slop logo',()=>{
 for(const face of ['slop','happy','hearts','wink','grille'])for(const time of [0,3.5,7,8.5,12])for(const reaction of [0,.3,.9]){
  const spec={face,seed:.1,glow:'#c8ff63'};
  assert.equal(expressiveFace(spec,time,reaction).face,face);
  assert.deepEqual(spec,{face,seed:.1,glow:'#c8ff63'});
 }
});
