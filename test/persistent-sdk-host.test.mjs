import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {PersistentStore} from '../src/lib/persist-store.js';
import {PersistentSession} from '../src/lib/persist-session.js';
import {acceptPlayerEvent} from '../src/lib/player-contracts.js';

const source=await readFile(new URL('../mcp/runtime/persistent-v1.js',import.meta.url),'utf8');
const three=await readFile(new URL('../src/lib/vendor/three-r128.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// Real packaged SDK + real host/store. Only DOM/clock and IndexedDB's engine
// are doubled; no RPC, account initialization, or fabricated durable ACKs.
function runtime(send){
 let clock=100000,sequence=0;const timers=new Map(),frames=new Map(),listeners=new Map();
 function node(tag){return {tagName:tag.toUpperCase(),style:{setProperty(){},getPropertyValue(){return'';}},classList:{add(){},remove(){},toggle(){}},children:[],
  appendChild(child){this.children.push(child);child.parentNode=this;return child;},remove(){},setAttribute(){},getAttribute(){return null;},addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},getContext(){return{setTransform(){},fillRect(){},clearRect(){}};},clientWidth:390,clientHeight:844,getBoundingClientRect(){return{left:0,top:0,width:390,height:844};}};}
 const document={body:node('body'),head:node('head'),documentElement:node('html'),hidden:false,readyState:'loading',createElement:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},removeEventListener(){}};
 const window={document,URL,Blob,TextDecoder,atob,innerWidth:390,innerHeight:844,devicePixelRatio:1,addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(){},matchMedia:()=>({matches:false}),requestAnimationFrame(fn){frames.set(++sequence,fn);return sequence;},cancelAnimationFrame(id){frames.delete(id);},webkit:{messageHandlers:{SlopBridge:{postMessage:send}}}};
 window.window=window;window.parent=window;
 const context=vm.createContext({window,self:window,document,URL,Blob,TextDecoder,navigator:{userAgent:'Local SDK/host test'},Date:class extends Date{static now(){return clock;}},console,
  setTimeout(fn,delay=0){timers.set(++sequence,{fn,at:clock+delay});return sequence;},clearTimeout:id=>timers.delete(id),setInterval(fn,delay){timers.set(++sequence,{fn,at:clock+delay,interval:delay});return sequence;},clearInterval:id=>timers.delete(id),getComputedStyle:()=>({getPropertyValue:()=> '0'})});
 vm.runInContext(three,context,{filename:'host-pinned-three-r128.js'});window.THREE=context.THREE;
 vm.runInContext(source,context,{filename:'packaged-persistent-v1.js'});
 return {window,run:code=>vm.runInContext(code,context),receive:message=>window.__slopReceive(plain(message)),advance(ms){clock+=ms;for(const[id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);if(timer.interval)timers.set(id,{...timer,at:clock+timer.interval});timer.fn();}},frame(){clock+=16;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(clock));}};
}
async function player(t,indexedDB=new IDBFactory()){
 const store=new PersistentStore({indexedDB,name:'sdk-host'}),frame={},messages=[],operations=[];let sdk;
 const session=new PersistentSession({store,game:'world',owner:'device',epoch:0,currentScope:()=>({owner:'device',epoch:0}),send:message=>sdk.receive(message)});
 await session.load();session.start();
 sdk=runtime(text=>{const message=acceptPlayerEvent(frame,frame,text);messages.push(JSON.parse(text));if(message?.type.startsWith('persist-'))operations.push(session.handle(message));});
 t.after(async()=>{session.dispose();await store.close();});
 const save=await sdk.run('window.Slop.persist({version:1,run:{floor:1,hp:100},profile:{gold:0}}).then(s=>window.save=s)');
 return {sdk,session,store,indexedDB,save,messages,drain:async()=>{for(let count=-1;count!==operations.length;){count=operations.length;await Promise.all(operations);}}};
}
test('packaged composed SDK commits through typed host to IndexedDB and real flush restores on recreation',async t=>{
 const first=await player(t);first.sdk.run('window.save.run.floor=12;window.save.profile.gold=37;window.save.commit();');
 first.sdk.advance(2100);await tick();await first.session.serial;
 first.sdk.run('window.save.run.hp=61;');await first.session.flush();
 assert.equal((await first.store.read('device','world','run')).data.hp,61);
 first.session.dispose();await first.store.close();
 const second=await player(t,first.indexedDB);assert.equal(second.save.resumed,true);
 assert.deepEqual(plain(second.save.run),{floor:12,hp:61});assert.equal(second.save.profile.gold,37);
 assert.equal(second.messages.filter(x=>x.type==='persist-init').length,1);
});
test('World host engine has the exact mobile SRI pin and real r128 GLTF loader',async t=>{
 assert.equal(createHash('sha384').update(three).digest('base64'),'CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu');
 const p=await player(t),engine=await p.sdk.run('window.Slop.three()');
 assert.equal(engine.REVISION,'128');assert.equal(typeof engine.GLTFLoader,'function');
});
test('SDK newRun waits for host durability, preserves profile and subsequent writes use new generation',async t=>{
 const p=await player(t);p.sdk.run('window.save.run.floor=7;window.save.profile.gold=90;');await p.session.flush();
 const original=p.store.change.bind(p.store);let release;const gate=new Promise(resolve=>release=resolve);
 p.store.change=async(...args)=>{await gate;return original(...args);};
 const reset=p.sdk.run('window.Slop.persist.newRun()');await tick();assert.equal(p.save.run.floor,7);
 release();await reset;assert.equal(p.save.run.floor,1);assert.equal(p.save.profile.gold,90);assert.equal(p.session.generation,1);
 p.sdk.run('window.save.run.floor=2;window.save.checkpoint("Floor 2");');await tick();await p.session.serial;
 assert.equal(p.messages.filter(x=>x.type==='persist-checkpoint').at(-1).generation,1);
 assert.equal((await p.store.read('device','world','run')).data.floor,2);
});
test('host New run restart adopts the durable tombstone revision before authored callbacks',async t=>{
 const p=await player(t);p.sdk.run('window.save.run.floor=8;window.save.profile.gold=91;');await p.session.flush();
 const before=p.session.revisions();await p.session.newRun();const revision=p.session.revisions();
 assert.ok(revision.run>before.run);assert.ok(revision.profile>=before.profile);
 p.sdk.run('window.Slop.onRestart(function(){window.save.run.floor=2;window.save.checkpoint("Floor 2");});');
 p.sdk.receive({type:'restart',request:33,persistent_newrun:true,generation:p.session.generation,revision});
 await tick();await p.session.serial;
 const snapshot=p.messages.filter(x=>x.type==='persist-checkpoint').at(-1);
 assert.deepEqual(snapshot.revision,revision);assert.equal(snapshot.generation,p.session.generation);
 assert.equal((await p.store.read('device','world','run')).data.floor,2);assert.equal(p.save.profile.gold,91);
});
test('real SDK rejects stale post-flush writes, adopts safe counters and waits for an explicit later save',async t=>{
 const p=await player(t),deliver=p.session.send,errors=[];
 // Model a platform checkpoint becoming durable before its ACK round-trips.
 // Every error below still comes from the genuine host/store, not this fixture.
 p.session.send=message=>{
  if(message.error)errors.push(message);
  if(message.action!=='checkpoint')deliver(message);
 };
 p.sdk.run('window.save.run.floor=17;window.save.profile.gold=5;');await p.session.flush();
 p.sdk.run('window.save.run.floor=18;window.save.commit();');p.sdk.advance(2100);await p.drain();
 assert.equal(errors.length,2);assert.ok(errors.every(e=>e.code==='stale_revision'&&e.revision_resync===true));
 assert.equal((await p.store.read('device','world','run')).data.floor,17,'rejected writes do not mutate saves');
 const writes=p.messages.filter(e=>e.type==='persist-write').length;
 p.sdk.advance(2100);await p.drain();
 assert.equal(p.messages.filter(e=>e.type==='persist-write').length,writes,'no blind stale retry');
 p.sdk.run('window.save.commit();');p.sdk.advance(2100);await p.drain();
 const later=p.messages.filter(e=>e.type==='persist-write').slice(-2);
 assert.ok(later.every(e=>e.revision===1),'explicit later save uses the verified durable counters');
 assert.equal((await p.store.read('device','world','run')).data.floor,18);
});
