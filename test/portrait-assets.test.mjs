import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {createPortraitLoader} from '../src/lib/portrait-assets.js';
import {ROBOT_IDS,ROBOT_FINISHES} from '../src/lib/robot-catalog.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('portrait requests share decoding and limit concurrent work',async()=>{
 const pending=new Map();let active=0,max=0,calls=0;
 const load=createPortraitLoader(url=>{calls++;active++;max=Math.max(max,active);return new Promise(resolve=>pending.set(url,()=>{active--;resolve({url});}));},{concurrency:2,capacity:4});
 const a=load('a'),again=load('a'),b=load('b'),c=load('c');assert.equal(a,again);
 await turn();assert.equal(calls,2);pending.get('a')();await a;await turn();assert.equal(calls,3);pending.get('b')();pending.get('c')();await Promise.all([b,c]);assert.equal(max,2);assert.equal((await load('a')).url,'a');assert.equal(calls,3);
});
test('a failed portrait can retry and completed shells evict by recent use',async()=>{
 const attempts=new Map();const load=createPortraitLoader(async url=>{attempts.set(url,(attempts.get(url)||0)+1);if(url==='a'&&attempts.get(url)===1)throw new Error('offline');return url;},{capacity:2});
 await assert.rejects(load('a'),/offline/);assert.equal(await load('a'),'a');await load('b');await turn();await load('a');await load('c');await turn();await load('b');assert.equal(attempts.get('a'),2);assert.equal(attempts.get('b'),2);
});
test('every profile shell and finish has real artwork and a screen projection',async()=>{
 const meta=JSON.parse(await readFile(new URL('../src/data/robots.json',import.meta.url),'utf8'));
 for(const shell of ROBOT_IDS){assert.ok(meta.shells[shell]?.screen?.quad?.length===4,shell);for(const finish of ROBOT_FINISHES)await assert.doesNotReject(access(new URL(`../public/assets/robots/shells/${shell}/${finish}.webp`,import.meta.url)),`${shell}/${finish}`);}
});
