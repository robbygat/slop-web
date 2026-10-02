import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {PersistentAssetCache,sendPersistentAsset,validAssetRequest} from '../src/lib/persist-assets.js';
const entry=`https://api.slop.game/storage/v1/object/public/games/releases/${'a'.repeat(64)}/game/1.0.0/index.html`;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const descriptor=(bytes,path='zone.glb')=>({path:`1.0.0/${path}`,sha256:hash(bytes),bytes:bytes.length});
test('actual IDB release cache validates hashes and reuses unchanged bytes across immutable releases',async t=>{
 const bytes=new Uint8Array([1,2,3]),manifest=[descriptor(bytes)];let calls=0;
 const cache=new PersistentAssetCache({indexedDB:new IDBFactory(),fetcher:async()=>{calls++;return new Response(bytes);}});t.after(()=>cache.close());
 assert.deepEqual(await cache.get({entry,path:'zone.glb',manifest}),bytes);
 assert.deepEqual(await cache.get({entry:entry.replace('a'.repeat(64),'b'.repeat(64)),path:'zone.glb',manifest}),bytes);assert.equal(calls,1);
});
test('only exact own-release manifest paths load; traversal, external and unhashed bytes fail closed',async t=>{
 let calls=0;const bytes=new Uint8Array([1,2,3]),cache=new PersistentAssetCache({indexedDB:new IDBFactory(),fetcher:async()=>{calls++;return new Response(new Uint8Array([1,2,9]));}});t.after(()=>cache.close());
 for(const path of ['../x.glb','a/../x.glb','https://evil/x.glb','x.glb?x','x.glb#x','x%2eglb','/x.glb','x.exe'])assert.equal(validAssetRequest({type:'persist-asset-request',path,request:'1'}),false);
 await assert.rejects(cache.get({entry,path:'other.glb',manifest:[descriptor(bytes)]}),/manifest/);
 await assert.rejects(cache.get({entry:entry.replace(/releases\/[a-f0-9]{64}\//,''),path:'zone.glb',manifest:[descriptor(bytes)]}),/immutable/);
 await assert.rejects(cache.get({entry,path:'zone.glb',manifest:[descriptor(bytes)]}),/integrity/);assert.equal(calls,1);
 assert.equal(await cache.cached(hash(bytes)),null);
});
test('chunk bridge emits exact64KiB boundaries and discards late retired response',async t=>{
 const bytes=new Uint8Array(65539).fill(3),cache=new PersistentAssetCache({indexedDB:new IDBFactory(),fetcher:async()=>new Response(bytes)});t.after(()=>cache.close());
 const messages=[],event={type:'persist-asset-request',request:'asset-1',path:'zone.glb'};
 await sendPersistentAsset({event,entry,manifest:[descriptor(bytes)],cache,current:()=>true,send:e=>messages.push(e)});
 assert.equal(messages.length,2);assert.equal(Buffer.from(messages[0].data,'base64').length,65536);assert.equal(Buffer.from(messages[1].data,'base64').length,3);assert.equal(messages[1].byte_length,65539);
 await sendPersistentAsset({event,entry,manifest:[descriptor(bytes)],cache,current:()=>false,send:e=>messages.push(e)});assert.equal(messages.length,2);
});
test('LRU evicts old release objects but keeps current World and shared content',async t=>{
 const one=new Uint8Array([1,2,3]),two=new Uint8Array([4,5,6]);
 const cache=new PersistentAssetCache({indexedDB:new IDBFactory(),cap:4,fetcher:async url=>new Response(url.includes('other')?two:one)});t.after(()=>cache.close());
 await cache.get({entry,path:'zone.glb',manifest:[descriptor(one)]});
 await cache.get({entry:entry.replace('/game/','/other/'),path:'zone.glb',manifest:[descriptor(two)]});
 assert.equal(await cache.cached(hash(one)),null);assert.deepEqual(await cache.cached(hash(two)),two);
});
