import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {PersistentStore} from '../src/lib/persist-store.js';
import {PersistentSession} from '../src/lib/persist-session.js';
import {acceptPersistEvent, activeRun, saveData, PERSIST_LIMITS} from '../src/lib/persist-contracts.js';
import {claimPersistentDeviceSaves} from '../src/lib/persist-claim.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const init = {type:'persist-init',version:3,scopes:['run','profile']};
const write = (scope,revision,data,request=`${scope}-${revision}`) => ({type:'persist-write',scope,revision,schema_version:3,data,request});
const checkpoint = (revision,run,profile,request='checkpoint',status) => ({type:'persist-checkpoint',revision,run,profile,request,status,schema_version:3});
const remoteRow = (scope,revision,data,extra={}) => ({game_id:'root-game',scope,slot:0,schema_version:3,revision,data,run_status:scope==='run'?'active':null,run_label:null,...extra});
async function setup(t,options={}) {
 const indexedDB=options.indexedDB||new IDBFactory(),store=new PersistentStore({indexedDB,name:'test'});
 let live={owner:options.owner||'device',epoch:0},clock=10000,counter=0;
 const timers=new Map(),messages=[],states=[];
 const session=new PersistentSession({store,game:'game',...live,currentScope:()=>live,
  rpc:options.rpc,send:m=>messages.push(m),onState:s=>states.push(s),now:()=>clock,
  setTimer:(fn,delay)=>{const id=++counter;timers.set(id,{fn,at:clock+delay});return id;},clearTimer:id=>timers.delete(id)});
 t.after(async()=>{session.dispose();await store.close();});
 await session.load();session.start();await session.handle(init);
 return {session,store,indexedDB,messages,states,timers,setScope:value=>{live=value;},
  advance:async ms=>{clock+=ms;for(const[id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}await tick();await tick();await session.serial;}};
}
test('actual IndexedDB survives host recreation and restores both scope versions and label',async t=>{
 const h=await setup(t);await h.session.handle(checkpoint({run:0,profile:0},{floor:12,__label:'Floor 12 · 23 min'},{unlocks:['forge']}));
 h.session.dispose();await h.store.close();
 const second=await setup(t,{indexedDB:h.indexedDB});
 assert.deepEqual(second.session.data(),{type:'persist-data',generation:0,run:{floor:12,__label:'Floor 12 · 23 min'},profile:{unlocks:['forge']},resumed:true,revision:{run:1,profile:1},schema_version:{run:3,profile:3}});
 assert.equal(second.session.rows.run.run_label,'Floor 12 · 23 min');
});
test('ACK occurs only after device transaction resolves, never before durable write',async t=>{
 const h=await setup(t),gate=deferred(),change=h.store.change.bind(h.store);
 h.store.change=async(...args)=>{await gate.promise;return change(...args);};
 const operation=h.session.handle(write('run',0,{hp:83}));await tick();
 assert.equal(h.messages.filter(m=>m.type==='persist-ack').length,0);
 gate.resolve();await operation;
 assert.equal(h.messages.at(-1).revision,1);assert.equal((await h.store.read('device','game','run')).data.hp,83);
});
test('ordered barrier accepts prior ACK revision but competing tab cannot overwrite current row',async t=>{
 const h=await setup(t);await h.session.handle(write('run',0,{hp:83}));
 await h.session.handle(checkpoint({run:0,profile:0},{hp:71},{gold:5}));
 assert.equal(h.session.rows.run.revision,2);assert.equal(h.session.rows.run.data.hp,71);
 const other=await setup(t,{indexedDB:h.indexedDB});await other.session.handle(write('run',2,{hp:62},'other'));
 await h.session.handle(checkpoint({run:2,profile:1},{hp:1},{gold:9},'stale'));
 assert.match(h.messages.at(-1).error,/changed/);
 assert.equal((await h.store.read('device','game','run')).data.hp,62);
 assert.equal((await h.store.read('device','game','profile')).data.gold,5,'checkpoint rollback is atomic');
 const db=await h.store.open(),history=await new Promise(resolve=>{const r=db.transaction('history').objectStore('history').getAll();r.onsuccess=()=>resolve(r.result);});
 assert.ok(history.some(row=>row.reason==='competing-tab'&&row.row.scope==='run'&&row.row.data.hp===1));
 assert.ok(history.some(row=>row.reason==='competing-tab'&&row.row.scope==='profile'&&row.row.data.gold===9));
});
test('UTF8 limits count actual bytes and invalid JSON/bridge messages are rejected',()=>{
 assert.equal(saveData('profile',{x:'a'.repeat(PERSIST_LIMITS.profile-8)}).bytes,PERSIST_LIMITS.profile);
 assert.throws(()=>saveData('profile',{x:'😀'.repeat(32768)}),/limit/);
 assert.throws(()=>saveData('run',{x:Infinity}),/JSON/);
 const cycle={};cycle.self=cycle;assert.throws(()=>saveData('run',cycle));
 for(const event of [write('secrets',0,{}),write('run',-1,{}),write('run',0,{bad:undefined}),{...init,version:0},checkpoint({run:0,profile:0},{},[]),{...write('run',0,{}),request:''}])assert.equal(acceptPersistEvent(event),false);
});
test('new run clears only run, keeps profile, and fresh host can begin after tombstone',async t=>{
 const h=await setup(t);await h.session.handle(checkpoint({run:0,profile:0},{floor:12},{gold:50}));
 await h.session.newRun();assert.equal(h.session.data().run,null);assert.deepEqual(h.session.data().profile,{gold:50});
 assert.equal(h.session.rows.run.run_status,'abandoned');
 h.session.dispose();const second=await setup(t,{indexedDB:h.indexedDB});
 await second.session.handle(write('run',second.session.rows.run.revision,{floor:1},'fresh'));
 assert.equal(second.session.rows.run.data.floor,1);assert.equal(second.messages.at(-1).error,undefined);
});
test('finished checkpoint keeps meta progression and late pause cannot resurrect ended run',async t=>{
 const h=await setup(t);await h.session.handle(checkpoint({run:0,profile:0},{floor:3},{gold:1}));
 await h.session.handle(checkpoint({run:1,profile:1},null,{gold:9},'finish','finished'));
 assert.equal(h.session.rows.run.run_status,'finished');assert.equal(h.session.data().run,null);
 await h.session.handle(checkpoint({run:2,profile:2},{floor:3},{gold:9},'late'));
 assert.match(h.messages.at(-1).error,/already ended/);assert.equal(h.session.data().run,null);
 assert.deepEqual(h.session.data().profile,{gold:9});
});
test('newrun generation rejects already queued prior-run checkpoints before barrier rebasing',async t=>{
 const h=await setup(t);await h.session.handle(checkpoint({run:0,profile:0},{floor:12},{gold:50}));
 const clear=h.session.newRun();
 const stale=h.session.handle({...checkpoint({run:1,profile:1},{floor:12},{gold:999},'queued-old'),generation:0});
 await Promise.all([clear,stale]);assert.equal(h.session.generation,1);assert.match(h.messages.at(-1).error,/earlier run/);
 assert.equal(h.session.data().run,null);assert.equal(h.session.data().profile.gold,50);
 await h.session.handle({...write('run',2,{floor:1},'new-generation'),generation:1});
 assert.equal(h.session.data().run.floor,1);assert.equal(h.messages.at(-1).generation,1);
});
test('duplicate requests acknowledge one committed revision even queued together',async t=>{
 const h=await setup(t),event=write('run',0,{hp:4},'once');await Promise.all([h.session.handle(event),h.session.handle(event)]);
 assert.equal(h.session.rows.run.revision,1);assert.deepEqual(h.messages.at(-1),h.messages.at(-2));
});
test('host flush correlates response, waits checkpoint commit, timeout never claims save',async t=>{
 const h=await setup(t);const work=h.session.flush(),request=h.messages.at(-1).request;
 await h.session.handle(checkpoint({run:0,profile:0},{x:17},{},request));await work;
 assert.equal(h.session.rows.run.data.x,17);
 const timeout=h.session.flush();const rejection=assert.rejects(timeout,/last durable/);await h.advance(1500);await rejection;
});
test('default host timers preserve the browser global receiver through close flush',async()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const indexedDB=new IDBFactory(),store=new PersistentStore({indexedDB,name:'receiver-test'}),messages=[];
 let session,setCalls=0,clearCalls=0;
 try {
  globalThis.setTimeout=function(...args){assert.equal(this,globalThis,'Window.setTimeout must not receive the PersistentSession');setCalls++;return originalSet(...args);};
  globalThis.clearTimeout=function(...args){assert.equal(this,globalThis,'Window.clearTimeout must not receive the PersistentSession');clearCalls++;return originalClear(...args);};
  session=new PersistentSession({store,game:'game',owner:'device',epoch:0,currentScope:()=>({owner:'device',epoch:0}),send:m=>messages.push(m)});
  await session.load();session.start();await session.handle(init);
  const flushed=session.flush(),request=messages.at(-1).request;
  // A rejected flush remains observed even if no postMessage was reached.
  const outcome=flushed.then(()=>null,error=>error);
  if(request)await session.handle(checkpoint({run:0,profile:0},{steps:2},{visits:2},request));
  assert.equal(await outcome,null);
  assert.equal(setCalls,1);assert.equal(clearCalls,1);
  assert.equal((await store.read('device','game','run')).data.steps,2);
  assert.equal(session.flushes.size,0);
 } finally {
  session?.dispose();globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;await store.close();
 }
});
async function platformCheckpoint(h,run={x:17},profile={gold:3}){
 const revision=h.session.revisions(),work=h.session.flush(),request=h.messages.at(-1).request;
 await h.session.handle(checkpoint(revision,run,profile,request));await work;return revision;
}
test('stale write after this document platform flush rejects and offers exact safe revision resync only',async t=>{
 const h=await setup(t),offered=await platformCheckpoint(h);
 await h.session.handle(write('run',offered.run,{x:999},'lagged-run'));
 const error=h.messages.at(-1);
 assert.equal(error.code,'stale_revision');assert.equal(error.scope,'run');assert.equal(error.request,'lagged-run');
 assert.equal(error.generation,0);assert.deepEqual(error.revision,{run:1,profile:1});assert.equal(error.revision_resync,true);
 assert.equal((await h.store.read('device','game','run')).data.x,17,'no failed write or automatic retry');
 await h.session.handle(write('run',error.revision.run,{x:18},'explicit-later-save'));
 assert.equal(h.messages.at(-1).error,undefined);assert.equal(h.session.rows.run.data.x,18);
});
test('unrecorded stale checkpoint or scope revision never receives resync permission',async t=>{
 const h=await setup(t);await h.session.handle(checkpoint({run:0,profile:0},{x:17},{}));
 await h.session.handle(write('run',0,{x:999},'unrecorded'));
 assert.equal(h.messages.at(-1).code,'stale_revision');assert.equal(h.messages.at(-1).revision_resync,undefined);
 await platformCheckpoint(h);await h.session.handle(write('run',0,{x:999},'not-flush-offered'));
 assert.equal(h.messages.at(-1).revision_resync,undefined);
});
test('recorded flush cannot authorize resync after competing tab changes either durable scope',async t=>{
 for(const scope of ['run','profile']){
  const h=await setup(t),offered=await platformCheckpoint(h),other=await setup(t,{indexedDB:h.indexedDB});
  await other.session.handle(write(scope,1,{other:true},'other-tab'));
  await h.session.handle(write('run',offered.run,{x:999},'stale'));
  assert.equal(h.messages.at(-1).code,'stale_revision');assert.equal(h.messages.at(-1).revision_resync,undefined);
  assert.equal((await h.store.read('device','game',scope)).data.other,true);
 }
});
test('recorded flush cannot authorize resync while either scope has a cloud conflict',async t=>{
 const h=await setup(t),offered=await platformCheckpoint(h);
 const changed=await h.store.change('device','game',[{scope:'profile',update:old=>({...old,conflict:remoteRow('profile',5,{gold:8})})}]);
 h.session.rows.profile=changed.profile;
 await h.session.handle(write('run',offered.run,{x:999},'cloud-conflict'));
 assert.equal(h.messages.at(-1).revision_resync,undefined);assert.equal(h.session.rows.run.data.x,17);
});
test('same-counter replacement of durable content is not this document flush drift',async t=>{
 const h=await setup(t),offered=await platformCheckpoint(h);
 await h.store.change('device','game',[{scope:'profile',update:old=>({...old,data:{gold:800}})}]);
 await h.session.handle(write('run',offered.run,{x:999},'same-counter-other-copy'));
 assert.equal(h.messages.at(-1).revision_resync,undefined);
 assert.equal((await h.store.read('device','game','profile')).data.gold,800);
});
test('recorded flush is retired by New run generation and same-owner account ABA',async t=>{
 const h=await setup(t),offered=await platformCheckpoint(h);await h.session.newRun();
 await h.session.handle({...write('run',offered.run,{x:999},'old-generation'),generation:0});
 assert.equal(h.messages.at(-1).revision_resync,undefined);assert.equal(h.messages.at(-1).generation,1);
 const count=h.messages.length;h.setScope({owner:'account:b',epoch:1});h.setScope({owner:'device',epoch:2});
 await h.session.handle({...write('run',offered.run,{x:999},'retired-owner'),generation:1});
 assert.equal(h.messages.length,count);assert.equal(h.session.data().run,null);
});
test('owner ABA during resync durable verification cannot send a late safe marker',async t=>{
 const h=await setup(t),offered=await platformCheckpoint(h),gate=deferred(),entered=deferred(),change=h.store.change.bind(h.store);
 h.store.change=async(owner,game,updates)=>{
  if(updates.length===2){entered.resolve();await gate.promise;}
  return change(owner,game,updates);
 };
 const count=h.messages.length,operation=h.session.handle(write('run',offered.run,{x:999},'late-proof'));
 await entered.promise;h.setScope({owner:'account:b',epoch:1});h.setScope({owner:'device',epoch:2});
 gate.resolve();await operation;
 assert.equal(h.messages.length,count);assert.equal((await h.store.read('device','game','run')).data.x,17);
});
test('cloud coalesces per scope and writes no more than once every two seconds',async t=>{
 const calls=[];let remote=null;
 const h=await setup(t,{owner:'account:a',rpc:async(name,p)=>{
  if(name==='load_game_state')return {game_id:'root-game',run:null,profile:null};
  calls.push(p);remote=remoteRow(p.p_scope,(remote?.revision||0)+1,p.p_data);return {current:remote,conflict:false};
 }});
 await h.session.handle(write('run',0,{x:1}));await h.advance(0);await h.session.serial;
 await h.session.handle(write('run',1,{x:2}));await h.session.handle(write('run',2,{x:3}));
 await h.advance(1999);assert.equal(calls.length,1);await h.advance(1);
 assert.equal(calls.length,2);assert.deepEqual(calls[1].p_data,{x:3});
});
test('offline queue survives reload and reconnect syncs the same local copy',async t=>{
 let online=false,calls=0;
 const rpc=async(name,p)=>{if(!online)throw Error('offline');if(name==='load_game_state')return {game_id:'root-game',run:null,profile:null};calls++;return {current:remoteRow(p.p_scope,1,p.p_data),conflict:false};};
 const h=await setup(t,{owner:'account:a',rpc});await h.session.handle(write('run',0,{x:7}));await h.advance(0);
 assert.equal(h.session.rows.run.pending,true);h.session.dispose();
 const second=await setup(t,{owner:'account:a',rpc,indexedDB:h.indexedDB});assert.equal(second.session.data().run.x,7);
 online=true;second.session.reconnect();await second.advance(2000);await second.session.serial;
 assert.equal(calls,1);assert.equal(second.session.rows.run.pending,false);
});
test('cloud conflict preserves device copy and requires explicit choice before replacing progress',async t=>{
 const h=await setup(t,{owner:'account:a',rpc:async(name)=>name==='load_game_state'?{game_id:'root-game',run:null,profile:null}:{conflict:true,current:remoteRow('run',8,{floor:20})}});
 await h.session.handle(write('run',0,{floor:12}));await h.advance(0);await h.session.serial;
 assert.equal(h.session.rows.run.data.floor,12);assert.equal(h.session.rows.run.conflict.data.floor,20);
 await h.session.chooseConflict('run','cloud');assert.equal(h.session.rows.run.data.floor,20);assert.equal(h.session.rows.run.pending,false);
 const db=await h.store.open();const history=await new Promise(resolve=>{const r=db.transaction('history').objectStore('history').getAll();r.onsuccess=()=>resolve(r.result);});
 assert.ok(history.some(x=>x.row.data.floor===12));assert.ok(history.some(x=>x.row.data.floor===20));
});
test('high local counters never outrank newer canonical cloud base revisions',async t=>{
 const indexedDB=new IDBFactory(),seed=new PersistentStore({indexedDB,name:'test'});
 await seed.change('account:a','game',[{scope:'run',update:()=>({...remoteRow('run',100,{floor:2}),base_revision:2,pending:false})}]);
 await seed.close();const h=await setup(t,{indexedDB,owner:'account:a',rpc:async()=>({game_id:'root-game',run:remoteRow('run',3,{floor:9}),profile:null})});
 assert.equal(h.session.data().run.floor,9);assert.equal(h.session.rows.run.base_revision,3);
 assert.equal(h.session.rows.run.revision,101,'replacing payload invalidates the previous tab counter');
 assert.equal(h.session.rows.run.pending,false);assert.equal(h.timers.size,0,'clean local counter is not uploaded over cloud');
});
test('newer cloud hydration invalidates an older live tab even when its local counter exceeds cloud',async t=>{
 const indexedDB=new IDBFactory(),seed=new PersistentStore({indexedDB,name:'test'});
 await seed.change('account:a','game',[{scope:'run',update:()=>({...remoteRow('run',100,{floor:2}),base_revision:2,pending:false})}]);await seed.close();
 const old=await setup(t,{indexedDB,owner:'account:a'});
 const fresh=await setup(t,{indexedDB,owner:'account:a',rpc:async()=>({game_id:'root-game',run:remoteRow('run',3,{floor:9}),profile:null})});
 assert.equal(fresh.session.rows.run.revision,101);
 await old.session.handle(write('run',100,{floor:3},'old-tab-after-cloud'));
 assert.equal(old.messages.at(-1).code,'stale_revision');assert.equal(old.messages.at(-1).revision_resync,undefined);
 assert.equal((await fresh.store.read('account:a','game','run')).data.floor,9);
 const db=await fresh.store.open(),history=await new Promise(resolve=>{const r=db.transaction('history').objectStore('history').getAll();r.onsuccess=()=>resolve(r.result);});
 assert.ok(history.some(row=>row.row.data.floor===2));assert.ok(history.some(row=>row.reason==='competing-tab'&&row.row.data.floor===3));
});
test('unchanged cloud content retains local counter and metadata-only refresh does not create a dirty save',async t=>{
 const indexedDB=new IDBFactory(),seed=new PersistentStore({indexedDB,name:'test'});
 await seed.change('account:a','game',[{scope:'run',update:()=>({...remoteRow('run',100,{floor:2}),base_revision:2,pending:false})}]);await seed.close();
 const h=await setup(t,{indexedDB,owner:'account:a',rpc:async()=>({game_id:'root-game',run:remoteRow('run',3,{floor:2}),profile:null})});
 assert.equal(h.session.rows.run.revision,100);assert.equal(h.session.rows.run.base_revision,3);assert.equal(h.session.rows.run.pending,false);assert.equal(h.timers.size,0);
});
test('cloud read delayed behind a competing-tab write preserves the newer local row',async t=>{
 const indexedDB=new IDBFactory(),old=await setup(t,{indexedDB,owner:'account:a'});
 await old.session.handle(write('run',0,{floor:2},'first'));
 const gate=deferred(),entered=deferred(),loading=setup(t,{indexedDB,owner:'account:a',rpc:async()=>{entered.resolve();return gate.promise;}});
 await entered.promise;await old.session.handle(write('run',1,{floor:4},'while-cloud-loading'));
 gate.resolve({game_id:'root-game',run:remoteRow('run',3,{floor:9}),profile:null});const h=await loading;
 assert.equal(h.session.data().run.floor,4);assert.equal((await h.store.read('account:a','game','run')).data.floor,4);
 assert.match(h.states.at(-1).error?.message||h.states.find(state=>state.error)?.error.message||'',/changed in another tab/);
});
test('dirty high local counter/base2 keeps both copies against cloud3, never silently rebases',async t=>{
 const indexedDB=new IDBFactory(),seed=new PersistentStore({indexedDB,name:'test'});
 await seed.change('account:a','game',[{scope:'run',update:()=>({...remoteRow('run',100,{floor:2}),base_revision:2,pending:true})}]);await seed.close();
 const store=new PersistentStore({indexedDB,name:'test'}),session=new PersistentSession({store,game:'game',owner:'account:a',epoch:0,currentScope:()=>({owner:'account:a',epoch:0}),rpc:async()=>({game_id:'root-game',run:remoteRow('run',3,{floor:9}),profile:null})});
 t.after(async()=>{session.dispose();await store.close();});await session.load();
 assert.equal(session.rows.run.data.floor,2);assert.equal(session.rows.run.base_revision,2);assert.equal(session.rows.run.conflict.data.floor,9);
 assert.throws(()=>session.start(),/Choose a save/);assert.equal(session.timers.size,0);
});
test('late cloud result cannot acknowledge or reconcile after account ABA epoch',async t=>{
 const gate=deferred();let writes=0;
 const h=await setup(t,{owner:'account:a',rpc:async(name)=>{if(name==='load_game_state')return{game_id:'root-game',run:null,profile:null};writes++;return gate.promise;}});
 await h.session.handle(write('run',0,{hp:3}));await h.advance(0);assert.equal(writes,1);
 const count=h.messages.length;h.setScope({owner:'account:b',epoch:1});h.setScope({owner:'account:a',epoch:2});
 gate.resolve({current:remoteRow('run',1,{hp:3})});await tick();await tick();
 assert.equal(h.messages.length,count);assert.equal((await h.store.read('account:a','game','run')).pending,true);
});
test('corrupt current row falls back to last good history while retaining other scope',async t=>{
 const h=await setup(t);await h.session.handle(checkpoint({run:0,profile:0},{floor:2},{gold:9}));await h.session.handle(write('run',1,{floor:3},'second'));
 const db=await h.store.open();await new Promise((resolve,reject)=>{const tx=db.transaction('saves','readwrite'),s=tx.objectStore('saves');s.put({...h.session.rows.run,data:{floor:999}});tx.oncomplete=resolve;tx.onerror=reject;});
 const restored=await h.store.read('device','game','run');assert.equal(restored.data.floor,2);assert.equal(restored.recovered,true);
 assert.equal((await h.store.read('device','game','profile')).data.gold,9);
});
test('separate accounts and game lineage keys never see each other’s saves',async t=>{
 const h=await setup(t);await h.session.handle(write('run',0,{hp:2}));
 assert.equal(await h.store.read('account:a','game','run'),null);assert.equal(await h.store.read('device','other-game','run'),null);
 assert.equal(activeRun(await h.store.read('device','game','run')),true);
});
test('guest claim keeps originals and losing recovery copy, confirms each scope once',async t=>{
 const h=await setup(t);await h.session.handle(checkpoint({run:0,profile:0},{floor:4},{gold:9}));let calls=0;
 const claim=()=>claimPersistentDeviceSaves({store:h.store,owner:'account:a',assertCurrent:()=>{},rpc:async(name,p)=>{
  assert.equal(name,'claim_device_saves');calls++;assert.equal(p.p_saves.length,2);
  return {saves:p.p_saves.map(row=>({game_id:'root-game',conflict:true,current:remoteRow(row.scope,15,{kept:'cloud'})}))};
 }});
 await claim();assert.equal(calls,1);await claim();assert.equal(calls,1);
 const row=await h.store.read('device','game','run');assert.equal(row.data.floor,4);assert.equal(row.claimedBy,'account:a');
 const db=await h.store.open();const records=await new Promise(resolve=>{const r=db.transaction('history').objectStore('history').getAll();r.onsuccess=()=>resolve(r.result);});
 assert.ok(records.some(x=>x.reason==='device-transfer'&&x.row.owner==='account:a'&&x.row.data.floor===4));
});
test('guest claim late account switch cannot mark device progress claimed',async t=>{
 const h=await setup(t);await h.session.handle(write('run',0,{floor:4}));let current=true;const gate=deferred();
 const claim=claimPersistentDeviceSaves({store:h.store,owner:'account:a',assertCurrent:()=>{if(!current)throw Error('retired');},rpc:()=>gate.promise});await tick();
 current=false;gate.resolve({saves:[{game_id:'root-game',current:remoteRow('run',1,{floor:4})}]});await assert.rejects(claim,/retired/);
 assert.equal((await h.store.read('device','game','run')).claimedBy,null);
});
test('unconfirmed or throttled guest transfer never consumes the local claim',async t=>{
 const h=await setup(t);await h.session.handle(write('run',0,{floor:4}));
 await claimPersistentDeviceSaves({store:h.store,owner:'account:a',assertCurrent:()=>{},rpc:async()=>({saves:[{throttled:true,current:remoteRow('run',2,{floor:1})}]})});
 assert.equal((await h.store.read('device','game','run')).claimedBy,null);
 await assert.rejects(claimPersistentDeviceSaves({store:h.store,owner:'account:a',assertCurrent:()=>{},rpc:async()=>({saves:[]})}),/not confirmed/);
});
test('genuine new guest progress after a claimed snapshot becomes eligible for its own later transfer',async t=>{
 const h=await setup(t);await h.session.handle(write('run',0,{floor:4}));
 await h.store.change('device','game',[{scope:'run',update:old=>({...old,claimedBy:'account:a'})}]);
 await h.session.handle(write('run',1,{floor:5},'guest-after-signout'));
 assert.equal((await h.store.read('device','game','run')).claimedBy,null);
});
test('300 deterministic close/reopen cycles retain exact run/profile and only five history rows per scope',async t=>{
 const indexedDB=new IDBFactory();let expected=0;
 for(let cycle=0;cycle<300;cycle++){
  const store=new PersistentStore({indexedDB,name:'soak'}),messages=[];
  const session=new PersistentSession({store,game:'lineage',owner:'device',epoch:0,currentScope:()=>({owner:'device',epoch:0}),send:m=>messages.push(m)});
  await session.load();session.start();await session.handle(init);
  assert.equal(session.data().run?.steps||0,expected);assert.equal(session.data().profile?.gold||0,cycle);
  expected+=7;await session.handle(checkpoint(session.revisions(),{steps:expected,inventory:['key',cycle]},{gold:cycle+1},`cycle-${cycle}`));
  assert.equal(messages.at(-1).error,undefined);session.dispose();await store.close();
 }
 const store=new PersistentStore({indexedDB,name:'soak'});t.after(()=>store.close());
 assert.equal((await store.read('device','lineage','run')).data.steps,2100);
 const db=await store.open();const rows=await new Promise(resolve=>{const r=db.transaction('history').objectStore('history').getAll();r.onsuccess=()=>resolve(r.result);});
 assert.equal(rows.length,10);assert.equal(rows.filter(x=>x.row.scope==='run').length,5);
});
