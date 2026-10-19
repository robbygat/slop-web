import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=(await readFile(new URL('../runtime/multiplayer-v1.js',import.meta.url),'utf8')).split('/* Slop turns-v1 adapter.')[1];
const adapter='/* Slop turns-v1 adapter.'+source;
const base={protocol:'turns-v1',code:'ABC123',game_id:'id',game_slug:'slug',release_digest:'a'.repeat(64),release_path:'immutable',epoch:1,revision:0,seed:'seed',seat:0,status:'active',turn:0,players:[true,true],actions:[],rematch_votes:[false,false]};
function fixture(){
 const messages=[],received=[],listeners=new Map(),timers=new Map();let timer=0,resume,safe=12;
 const creator=Object.freeze({version:'creator-v1',get safeArea(){return {top:safe};},onResume(fn){resume=fn;},ready(){}});
 const parent={postMessage:value=>messages.push(JSON.parse(value))};
 const window={Slop:creator,__slopReceive(message){received.push(message);},parent,__slopMatchExpected:true,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}};
 runInNewContext(adapter,{window,TextEncoder,setTimeout(fn,ms){const id=++timer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
 return {window,messages,received,creator,setSafe(value){safe=value;},receive:message=>window.__slopReceive(message),emit:(type,event)=>listeners.get(type)?.forEach(fn=>fn(event)),resume:()=>resume(),timeout:()=>{for(const [id,item] of timers){if(item.ms===18000){timers.delete(id);item.fn();}}},snapshot:(changes={})=>window.__slopReceive({type:'match-snapshot',snapshot:{...base,...changes}})};
}
test('composed runtime preserves getter descriptors and asks for the initial room',()=>{
 const f=fixture();assert.equal(f.window.Slop.version,'multiplayer-v1');assert.equal(f.window.Slop.ready,f.creator.ready);assert.equal(f.window.Slop.match.active,true);f.setSafe(55);assert.equal(f.window.Slop.safeArea.top,55);assert.deepEqual(f.messages[0],{type:'match-ready'});assert.equal(Object.isFrozen(f.window.Slop),true);
});
test('snapshots freeze deeply, reject stale and other-room packets, and ignore foreign frames',()=>{
 const f=fixture();f.emit('message',{source:{},data:{type:'match-snapshot',snapshot:base}});assert.equal(f.window.Slop.match.snapshot(),null);
 f.snapshot({revision:2,actions:[{revision:1,seat:0,action_id:'one',action:{angle:45}}]});const value=f.window.Slop.match.snapshot();assert.equal(value.room,'ABC123');assert.equal(value.actions[0].actionId,'one');assert.equal(Object.isFrozen(value.actions[0].action),true);
 for(const change of [{revision:1},{epoch:0},{code:'OTHER'},{release_digest:'b'.repeat(64)},{seat:1}])f.snapshot(change);
 assert.equal(f.window.Slop.match.snapshot(),value);
});
test('submit uses host-owned identity and resolves only acknowledged responses',async()=>{
 const f=fixture();f.snapshot();const request=f.window.Slop.match.submit({actionId:'turn_0001',expectedRevision:0,epoch:1,action:{angle:45,power:.5},seat:1,room:'OTHER'});
 const message=f.messages.at(-1);assert.equal(message.type,'match-submit');assert.equal(message.room,undefined);assert.equal(message.seat,undefined);
 f.receive({type:'match-response',requestId:message.requestId,snapshot:{...base,revision:1}});assert.equal((await request).revision,1);
 await assert.rejects(f.window.Slop.match.submit({actionId:'turn_0002',expectedRevision:0,epoch:1,action:{}}),{code:'match_stale_revision'});
});
test('rematch accepts a new epoch, timeout and close reject outstanding work',async()=>{
 const f=fixture();f.snapshot({status:'complete',revision:20});const rematch=f.window.Slop.match.rematch();const id=f.messages.at(-1).requestId;
 f.receive({type:'match-response',requestId:id,snapshot:{...base,epoch:2}});assert.equal((await rematch).epoch,2);
 assert.equal(f.received.filter(message=>message.type==='restart'&&message.request==='match-2').length,1);
 const timed=f.window.Slop.match.rematch();f.timeout();await assert.rejects(timed,{code:'match_timeout'});
 const closed=f.window.Slop.match.rematch();f.emit('pagehide',{});await assert.rejects(closed,{code:'match_closed'});
});
test('epoch changes invalidate old submissions and host errors preserve readable codes',async()=>{
 const f=fixture();f.snapshot();const request=f.window.Slop.match.submit({actionId:'turn_0001',expectedRevision:0,epoch:1,action:{angle:45}});f.snapshot({epoch:2});await assert.rejects(request,{code:'match_epoch_changed'});
 const denied=f.window.Slop.match.rematch();f.receive({type:'match-response',requestId:f.messages.at(-1).requestId,error:{code:'match_not_complete'}});await assert.rejects(denied,{code:'match_not_complete'});
});
test('a rematch snapshot may precede its response and host restarts are not duplicated',async()=>{
 const f=fixture();f.snapshot({revision:20});const promise=f.window.Slop.match.rematch();
 f.receive({type:'restart',request:'host-epoch-2'});f.snapshot({epoch:2});
 assert.equal((await promise).epoch,2);assert.equal(f.received.filter(message=>message.type==='restart').length,1);
});
test('a delayed accepted response resolves to a newer snapshot without rolling state back',async()=>{
 const f=fixture();f.snapshot();const promise=f.window.Slop.match.submit({actionId:'turn_0001',expectedRevision:0,epoch:1,action:{angle:45}}),requestId=f.messages.at(-1).requestId;
 f.snapshot({revision:2});f.receive({type:'match-response',requestId,snapshot:{...base,revision:1}});
 assert.equal((await promise).revision,2);
});
