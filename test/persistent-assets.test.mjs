import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {PersistentAssetCache,sendPersistentAsset,validAssetRequest} from '../src/lib/persist-assets.js';
const entry=`https://api.slop.game/storage/v1/object/public/games/releases/${'a'.repeat(64)}/game/1.0.0/index.html`;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const descriptor=(bytes,path='zone.glb')=>({path:`1.0.0/${path}`,sha256:hash(bytes),bytes:bytes.length});
test('default browser fetch retains its Window receiver and verified assets remain cached',async t=>{
 const bytes=new Uint8Array([2,4,6]),manifest=[descriptor(bytes)];let calls=0;
 t.mock.method(globalThis,'fetch',async function(url,options){
  if(this!==globalThis)throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
  calls++;assert.equal(url,entry.replace('index.html','zone.glb'));
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
  assert.equal(options.referrerPolicy,'no-referrer');assert.ok(options.signal instanceof AbortSignal);
  return new Response(bytes);
 });
 const cache=new PersistentAssetCache({indexedDB:new IDBFactory()});t.after(()=>cache.close());
 assert.deepEqual(await cache.get({entry,path:'zone.glb',manifest}),bytes);
 assert.deepEqual(await cache.get({entry,path:'zone.glb',manifest}),bytes);assert.equal(calls,1);
});
test('default browser fetch works through the asset bridge without replacing an error with progress',async t=>{
 const bytes=new Uint8Array([7,8,9]);let rejectNetwork=true;
 t.mock.method(globalThis,'fetch',async function(){
  if(this!==globalThis)throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
  if(rejectNetwork)throw new TypeError('Network unavailable');
  return new Response(bytes);
 });
 const cache=new PersistentAssetCache({indexedDB:new IDBFactory()});t.after(()=>cache.close());
 const messages=[],request={event:{type:'persist-asset-request',request:'native-fetch',path:'zone.glb'},entry,manifest:[descriptor(bytes)],cache,current:()=>true,send:event=>messages.push(event)};
 await sendPersistentAsset(request);assert.equal(messages[0].error,'Network unavailable');
 assert.equal(await cache.cached(hash(bytes)),null);assert.equal(cache.inflight.size,0);
 rejectNetwork=false;await sendPersistentAsset(request);
 assert.equal(messages.length,2);assert.equal(messages[1].error,undefined);
 assert.deepEqual(Buffer.from(messages[1].data,'base64'),Buffer.from(bytes));
});
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
test('real browser default fetch loads a cold immutable asset and reuses native IndexedDB', {skip:process.env.SLOP_RECORDER_BROWSER_TEST!=='1',timeout:45000},async t=>{
 const [{createServer},{readFile},{launchChrome}]=await Promise.all([import('node:http'),import('node:fs/promises'),import('../scripts/mcp-publisher/cdp.mjs')]);
 const sources=new Map(await Promise.all(['persist-assets.js','contracts.js'].map(async name=>[`/${name}`,await readFile(new URL(`../src/lib/${name}`,import.meta.url))])));
 const server=createServer((request,response)=>{
  const source=sources.get(request.url);
  if(source){response.writeHead(200,{'content-type':'text/javascript'});response.end(source);}
  else if(request.url==='/'){response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><title>Isolated asset receiver test</title>');}
  else {response.writeHead(404);response.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const chrome=await launchChrome({gpu:false});t.after(()=>chrome.close());const {session}=chrome;
 const bytes=new Uint8Array([17,23,29]),assetUrl=entry.replace('index.html','zone.glb');let calls=0;const failures=[];
 session.on('Fetch.requestPaused',event=>{
  if(event.request.url!==assetUrl){failures.push(event.request.url);void session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});return;}
  calls++;
  void session.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/octet-stream'},{name:'access-control-allow-origin',value:'*'},{name:'content-length',value:String(bytes.length)}],body:Buffer.from(bytes).toString('base64')}).catch(error=>failures.push(error.message));
 });
 await session.send('Fetch.enable',{patterns:[{urlPattern:'https://*',requestStage:'Request'}]});
 const loaded=new Promise(resolve=>session.on('Page.loadEventFired',resolve));
 await session.send('Page.enable');await session.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});await loaded;
 const result=await session.send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const {PersistentAssetCache}=await import('/persist-assets.js');
  const options=${JSON.stringify({entry,path:'zone.glb',manifest:[descriptor(bytes)]})};
  // Recreate the old constructor in the actual browser, not a receiver mock.
  const broken=new PersistentAssetCache({name:'old-receiver-test-assets',fetcher:globalThis.fetch});let receiverError;
  try {await broken.get(options);} catch(error){receiverError=error.message;} finally {await broken.close();}
  const nativeFetch=globalThis.fetch,cache=new PersistentAssetCache({name:'receiver-test-assets'});
  try {
   const first=await cache.get(options),second=await cache.get(options);
   return {first:Array.from(first),second:Array.from(second),nativeFetchUnchanged:nativeFetch===globalThis.fetch,receiverError};
  } finally {await cache.close();}
 })()`});
 assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));
 const {receiverError,...observed}=result.result.value;
 assert.match(receiverError,/Illegal invocation/);
 assert.deepEqual(observed,{first:[17,23,29],second:[17,23,29],nativeFetchUnchanged:true});
 assert.equal(calls,1);assert.deepEqual(failures,[]);
});
