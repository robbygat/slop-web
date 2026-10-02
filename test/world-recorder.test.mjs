import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {gameTemplate} from '../mcp/game-template.mjs';
import {installWorldRecorder} from '../scripts/mcp-publisher/world-recorder-host.js';
import {hasWorldMarker,recorderWorldConfig,recorderManifest,recorderFileBytes,scriptJson,worldEngineScript,worldMobileInputFrame,worldCaptureProblem} from '../scripts/mcp-publisher/world-recorder.mjs';

const template=await gameTemplate({persistent:true,target_platform:'mobile'});
const init={type:'persist-init',version:1,scopes:['run','profile']};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=Buffer.alloc(140000,37);
const asset={path:'1.0.0/scene.bin',bytes:bytes.length,sha256:hash(bytes)};
const config={manifest:[asset],firstLoad:['scene.bin'],entry:`https://api.slop.game/storage/v1/object/public/games/releases/${'a'.repeat(64)}/world/1.0.0/index.html`};
async function setup(t,{fetcher=()=>new Response(bytes),...override}={}){
 const indexedDB=new IDBFactory(),messages=[],fetches=[],listeners=new Map();
 let consumer=()=>{};
 const frame={contentWindow:{postMessage(text){const message=JSON.parse(text);messages.push(message);consumer(message);}}};
 const target={indexedDB,location:{href:'http://127.0.0.1:5311/host.html'},fetch:(...args)=>{fetches.push(args);return fetcher(...args);},
  addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name)};
 const host=await installWorldRecorder(frame,{...config,...override},target);
 const receive=(message,source=frame.contentWindow)=>listeners.get('message')?.({source,data:JSON.stringify(message)});
 t.after(()=>host.dispose());
 return {host,frame,target,messages,fetches,receive,setConsumer:fn=>consumer=fn,
  async rows(){const name=(await indexedDB.databases()).find(row=>row.name.endsWith('-saves')).name;
   const db=await new Promise(resolve=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);});
   try{return await new Promise(resolve=>{const request=db.transaction('saves').objectStore('saves').getAll();request.onsuccess=()=>resolve(request.result);});}finally{db.close();}
  }};
}

test('World admission requires the exact runtime and true persistent contract; Arcade stays Arcade',async()=>{
 assert.ok(recorderWorldConfig(template.files));
 assert.equal(recorderWorldConfig((await gameTemplate()).files),null);
 assert.throws(()=>recorderWorldConfig({...template.files,'slop.js':template.files['slop.js']+'\n'}),/runtime_invalid/);
 assert.throws(()=>recorderWorldConfig({...template.files,'slop.spec.json':JSON.stringify({persistent:true,first_load:[]})}),/first_load/);
 assert.throws(()=>recorderWorldConfig({...template.files,'game.js':'Slop.ready();'}));
});
test('inert or unrelated HTML markers never promote Arcade into a World',()=>{
 const marker='<meta name="slop-runtime" content="persistent-v1">';
 for(const html of [`<!-- ${marker} -->`,`<template>${marker}</template>`,'<meta name="example" content="persistent-v1">','<meta name="slop-runtime" content="creator-v1">']){
  assert.equal(hasWorldMarker(html),false);assert.equal(recorderWorldConfig({'index.html':html}),null);
 }
 assert.equal(hasWorldMarker('<META content=persistent-v1 NAME=slop-runtime>'),true);
});
test('binary descriptors hash decoded bytes and reject malformed encodings',()=>{
 const value={encoding:'base64',data:bytes.toString('base64')};
 assert.deepEqual(recorderFileBytes('scene.bin',value),bytes);
 assert.deepEqual(recorderManifest({'scene.bin':value}),[asset]);
 assert.throws(()=>recorderFileBytes('scene.bin',{encoding:'base64',data:'A==='}));
 assert.throws(()=>recorderFileBytes('scene.bin',String(value)));
});
test('World scaffold escapes script closures and supplies the actual pinned local engine',async()=>{
 assert.equal(scriptJson({x:'</script>\u2028'}).includes('</script>'),false);
 const engine=await worldEngineScript(recorderWorldConfig(template.files));
 assert.match(engine,/__slopPersistAssets/);assert.match(engine,/REVISION/);assert.doesNotMatch(engine,/<script[^>]+src=/);
});
test('World input gives sustained balanced holds and bounded taps without manipulating state',()=>{
 let held=false,starts=0,ends=0,longest=0,start=0;
 for(let frame=0;frame<480;frame++)for(const event of worldMobileInputFrame(frame,{width:360,height:640})){
  if(event.type==='touchStart'){assert.equal(held,false);held=true;starts++;start=frame;assert.ok(event.x>30&&event.x<330&&event.y>30&&event.y<610);}
  else {assert.equal(event.type,'touchEnd');assert.equal(held,true);held=false;ends++;longest=Math.max(longest,frame-start);}
 }
 assert.equal(held,false);assert.equal(starts,ends);assert.ok(longest>=150);assert.throws(()=>worldMobileInputFrame(-1,{width:360,height:640}));
});
test('bridge ignores foreign/oversize messages, document-ready, and writes real isolated durable checkpoints',async t=>{
 const h=await setup(t);
 await h.receive(init,{});await h.receive({type:'ready',source:'document'});
 await h.receive({...init,padding:'x'.repeat(750000)});
 assert.equal(h.host.inspect().initialized,false);assert.equal(h.host.inspect().ready,false);
 await h.receive(init);assert.equal(h.messages.at(-1).type,'persist-data');
 await h.receive({type:'persist-checkpoint',request:'checkpoint',generation:0,schema_version:1,revision:{run:0,profile:0},run:{hp:77},profile:{coins:4}});
 assert.equal(h.messages.at(-1).action,'checkpoint');assert.equal(h.messages.at(-1).error,undefined);
 const rows=await h.rows();assert.equal(rows.length,2);assert.equal(rows.find(r=>r.scope==='run').data.hp,77);assert.equal(rows.find(r=>r.scope==='profile').data.coins,4);
 assert.ok(rows.every(r=>r.owner==='device'&&!r.pending));assert.equal(h.fetches.length,0,'there is no cloud RPC');
});
test('assets are same-release verified bytes split into at most 64KiB chunks, with no credentials',async t=>{
 const h=await setup(t);await h.receive(init);
 await h.receive({type:'persist-asset-request',request:'asset',path:'scene.bin'});
 const chunks=h.messages.filter(m=>m.type==='persist-asset-data');assert.equal(chunks.length,3);
 assert.deepEqual(Buffer.concat(chunks.map(m=>Buffer.from(m.data,'base64'))),bytes);
 assert.ok(chunks.every(m=>Buffer.from(m.data,'base64').length<=65536));
 assert.equal(h.fetches[0][0],'http://127.0.0.1:5311/game/scene.bin');assert.equal(h.fetches[0][1].credentials,'omit');assert.equal(h.fetches[0][1].redirect,'error');
 assert.equal(h.host.inspect().errors,0);assert.equal(h.host.inspect().assets,1);
});
for(const kind of ['corrupt','truncated','missing'])test(`${kind} asset failures are counted and redacted rather than accepted as moving gameplay`,async t=>{
 const h=await setup(t,{fetcher:()=>kind==='missing'?new Response('private-path',{status:404}):new Response(kind==='corrupt'?Buffer.alloc(bytes.length,2):bytes.subarray(0,100))});
 await h.receive(init);await h.receive({type:'ready'});await h.receive({type:'persist-asset-request',request:'asset',path:'scene.bin'});
 assert.equal(h.fetches.length,1);assert.equal(h.host.inspect().errors,1);assert.equal(h.messages.at(-1).error,'This release asset is not available in this capture session.');assert.equal(h.messages.at(-1).data,undefined);
});
test('undeclared first-load and unknown assets fail without network, late runtime failures remain fatal',async t=>{
 const h=await setup(t,{firstLoad:[]});await h.receive(init);
 await h.receive({type:'persist-asset-request',request:'early',path:'scene.bin'});
 await h.receive({type:'ready'});await h.receive({type:'persist-asset-request',request:'unknown',path:'unknown.bin'});
 await h.receive({type:'webGameError',message:'untrusted private diagnostic'});await h.receive({type:'loadError'});
 assert.equal(h.host.inspect().errors,4);assert.equal(h.fetches.length,0);assert.equal(JSON.stringify(h.host.inspect()).includes('private'),false);
});
test('finalization rejects a pending asset before a late integrity failure can escape acceptance',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const h=await setup(t,{fetcher:async()=>{await gate;return new Response(Buffer.alloc(bytes.length,2));}});
 await h.receive(init);await h.receive({type:'ready'});
 const inflight=h.receive({type:'persist-asset-request',request:'pending',path:'scene.bin'});
 assert.equal(h.host.inspect().active,1);assert.equal(worldCaptureProblem(h.host.inspect()),'recorder_error');
 release();await inflight;assert.equal(h.host.inspect().active,0);assert.equal(worldCaptureProblem(h.host.inspect()),'boot_error');
});
test('host restart flushes current profile, durably ends only run, then waits for matching ACK',async t=>{
 const h=await setup(t);await h.receive(init);let revision={run:0,profile:0};
 h.setConsumer(message=>{
  if(message.type==='persist-flush')void h.receive({type:'persist-checkpoint',request:message.request,generation:0,schema_version:1,revision,run:{hp:33},profile:{coins:99}});
  if(message.type==='persist-ack'&&message.revision?.run!=null)revision=message.revision;
  if(message.type==='restart'){assert.equal(message.persistent_newrun,true);assert.equal(message.generation,1);void h.receive({type:'restart-ack',request:message.request,handled:true});}
 });
 await h.host.restart('capture-start');
 const rows=await h.rows();assert.equal(rows.find(r=>r.scope==='profile').data.coins,99);assert.equal(rows.find(r=>r.scope==='run').run_status,'abandoned');assert.equal(h.host.inspect().restartAcks,1);
});

test('real pinned SDK restarts under the frozen recorder clock and produces moving MP4', {skip:process.env.SLOP_RECORDER_BROWSER_TEST!=='1',timeout:90000},async()=>{
 const {recordVideo}=await import('../scripts/mcp-publisher/video.mjs'),diagnostics={};
 // The starter's tiny bobbing dot correctly fails the normal motion gate.
 // A broad, genuine canvas movement makes this a recording/clock test, not
 // an exception to that gate. Runtime and persistence remain unchanged.
 const files={...template.files,'game.js':template.files['game.js'].replace('ctx.beginPath();ctx.arc(width/2,height*.56-Math.abs(Math.sin(time*2))*25,38,0,Math.PI*2);ctx.fill();',"ctx.fillRect((time*220)%(width+180)-180,height*.25,180,height*.5);")};
 const result=await recordVideo({files},{seconds:2,diagnostics});
 assert.equal(result.width,720);assert.equal(diagnostics.world.initialized,true);assert.equal(diagnostics.world.restartAcks,1);assert.equal(diagnostics.world.errors,0);assert.ok(diagnostics.moving>30);
});
for(const type of ['loadError','webGameError'])test(`World capture rejects ${type} after ready even while the canvas moves`,{skip:process.env.SLOP_RECORDER_BROWSER_TEST!=='1',timeout:90000},async()=>{
 const {recordVideo}=await import('../scripts/mcp-publisher/video.mjs');
 const files={...template.files,'game.js':template.files['game.js'].replace('Slop.ready();',`Slop.ready();setTimeout(()=>parent.postMessage(JSON.stringify({type:'${type}'}),'*'),1800);`)};
 await assert.rejects(recordVideo({files},{seconds:1}),{code:'boot_error'});
});
