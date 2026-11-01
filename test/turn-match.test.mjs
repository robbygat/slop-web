import test from 'node:test';
import assert from 'node:assert/strict';
import {matchSnapshot,matchEntry,validMatchEvent,createTurnMatch} from '../src/lib/turn-match.js';
import {acceptPlayerEvent} from '../src/lib/player-contracts.js';
const game={id:'tankfall',slug:'tankfall',multiplayer_protocol:'turns-v1'};
const base={protocol:'turns-v1',code:'ROOM1234',game_id:game.id,game_slug:game.slug,release_digest:'a'.repeat(64),release_path:`releases/${'a'.repeat(64)}/${game.slug}`,epoch:1,revision:0,seed:'seed',seat:0,status:'active',turn:0,players:[true,true],actions:[],rematch_votes:[false,false]};
const action={revision:1,seat:0,action_id:'shot_0001',action:{angle:45,power:.5}};
test('room URLs use the immutable release and reject identity/path/log mismatches',()=>{
 const snapshot=matchSnapshot(base,game);assert.equal(matchEntry(snapshot),`https://api.slop.game/storage/v1/object/public/games/${base.release_path}/1.0.0/index.html`);
 for(const change of [{game_id:'other'},{game_slug:'other'},{release_path:'tankfall'},{release_digest:'b'.repeat(63)},{revision:1},{revision:1,actions:[{...action,seat:1}]}])assert.throws(()=>matchSnapshot({...base,...change},game),/Invalid match/);
});

test('published release identifiers are independent of the bundle digest',async()=>{
 const initial={...base,status:'waiting',players:[true,false],release_path:`releases/${'b'.repeat(64)}/${game.slug}`};
 const match=createTurnMatch({game,initial,currentScope:()=>1,rpc:async()=>({...initial,status:'active',players:[true,true]})});
 assert.equal(match.snapshot().status,'waiting');
 assert.equal(match.entry(),`https://api.slop.game/storage/v1/object/public/games/${initial.release_path}/1.0.0/index.html`);
 await match.refresh();assert.equal(match.snapshot().status,'active');match.close();
});

test('snapshot paths remain safe and scoped to the exact game',()=>{
 for(const release_path of [`releases/${'b'.repeat(64)}/other-game`,`releases/${'b'.repeat(63)}/${game.slug}`,`releases/${'b'.repeat(64)}/${game.slug}/../other`,`https://evil.example/${game.slug}`,`releases/${'b'.repeat(64)}/${game.slug}?override=1`]){
  assert.throws(()=>matchSnapshot({...base,release_path},game),/Invalid match/);
 }
});

test('refresh cannot replace a pinned release path even with the same digest',async()=>{
 const match=createTurnMatch({game,initial:base,currentScope:()=>1,rpc:async()=>({...base,release_path:`releases/${'b'.repeat(64)}/${game.slug}`})});
 await assert.rejects(match.refresh(),/Match identity changed/);
 assert.equal(match.snapshot().releasePath,base.release_path);match.close();
});
test('game messages require the current frame and a bounded turn envelope',()=>{
 const frame={},event={type:'match-submit',requestId:'m1',actionId:'shot_0001',expectedRevision:0,epoch:1,action:{angle:45,power:.5}};
 assert.equal(validMatchEvent(event),true);assert.equal(acceptPlayerEvent(frame,frame,JSON.stringify(event)).type,'match-submit');assert.equal(acceptPlayerEvent({},frame,JSON.stringify(event)),null);
 assert.equal(validMatchEvent({...event,actionId:'x'}),false);assert.equal(validMatchEvent({...event,action:{blob:'x'.repeat(2048)}}),false);
});
test('host ignores authored room/seat and accepts turns only in its bound room',async()=>{
 const calls=[],sent=[];const match=createTurnMatch({game,initial:base,currentScope:()=>1,rpc:async(name,args)=>{calls.push({name,args});return {...base,revision:1,turn:1,actions:[action]};}});
 await match.handle({type:'match-submit',requestId:'m1',actionId:'shot_0001',expectedRevision:0,epoch:1,action:action.action,room:'EVIL1234',seat:1},message=>sent.push(message));
 assert.equal(calls[0].args.p_code,'ROOM1234');assert.equal(calls[0].args.p_seat,undefined);assert.equal(sent[0].snapshot.revision,1);match.close();
});
test('account switch and closed players suppress delayed responses',async()=>{
 let scope=1,resolve;const sent=[];const match=createTurnMatch({game,initial:base,currentScope:()=>scope,rpc:()=>new Promise(done=>{resolve=done;})});
 const pending=match.handle({type:'match-submit',requestId:'m1',actionId:'shot_0001',expectedRevision:0,epoch:1,action:action.action},value=>sent.push(value));
 scope=2;resolve({...base,revision:1,actions:[action]});await pending;assert.equal(sent.length,0);assert.equal(match.snapshot().revision,0);match.close();
});
test('polling cannot rewind accepted revisions and both-vote rematch changes epochs',async()=>{
 let next={...base,revision:1,actions:[action]};const match=createTurnMatch({game,initial:base,currentScope:()=>1,rpc:async()=>next});
 await match.refresh();next=base;await match.refresh();assert.equal(match.snapshot().revision,1);
 next={...base,epoch:2};await match.rematch();assert.equal(match.snapshot().epoch,2);assert.equal(match.snapshot().revision,0);match.close();
});

test('polling recovers from a connection failure even when the room revision is unchanged',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const failure=new Error('Connection interrupted'),errors=[];let calls=0;
 const match=createTurnMatch({game,initial:base,currentScope:()=>1,pollMs:10,onError:error=>errors.push(error),rpc:async()=>{
  calls++;if(calls===1)throw failure;
  return calls===2?base:{...base,revision:1,turn:1,actions:[action]};
 }});t.after(()=>match.close());match.start();
 const poll=async()=>{t.mock.timers.tick(10);await new Promise(resolve=>setImmediate(resolve));};
 await poll();assert.deepEqual(errors,[failure]);
 await poll();assert.deepEqual(errors,[failure,null]);assert.equal(match.snapshot().revision,0);
 await poll();assert.equal(calls,3);assert.equal(match.snapshot().revision,1);assert.equal(errors.at(-1),null);
});

test('wrong-room and stale responses cannot dismiss a current connection error',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const initial={...base,revision:1,turn:1,actions:[action]},failure=new Error('Connection interrupted'),errors=[];let calls=0;
 const match=createTurnMatch({game,initial,currentScope:()=>1,pollMs:10,onError:error=>errors.push(error),rpc:async()=>{
  calls++;if(calls===1)throw failure;
  if(calls===2)return {...initial,code:'OTHER123'};
  return calls===3?base:initial;
 }});t.after(()=>match.close());match.start();
 const poll=async()=>{t.mock.timers.tick(10);await new Promise(resolve=>setImmediate(resolve));};
 await poll();await poll();assert.equal(errors.length,2);assert.match(errors[1].message,/Match identity changed/);
 await poll();assert.equal(errors.length,2);assert.equal(match.snapshot().revision,1);
 await poll();assert.equal(errors.at(-1),null);assert.equal(match.snapshot().room,base.code);
});

test('delayed recovery cannot dismiss errors after the account changes or player closes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const stop of ['account','close']){
  const failure=new Error('Connection interrupted'),errors=[];let scope=1,calls=0,resolve;
  const match=createTurnMatch({game,initial:base,currentScope:()=>scope,pollMs:10,onError:error=>errors.push(error),rpc:()=>{
   calls++;return calls===1?Promise.reject(failure):new Promise(done=>{resolve=done;});
  }});t.after(()=>match.close());match.start();
  const poll=async()=>{t.mock.timers.tick(10);await new Promise(done=>setImmediate(done));};
  await poll();await poll();assert.deepEqual(errors,[failure]);
  if(stop==='account')scope=2;else match.close();
  resolve(base);await new Promise(done=>setImmediate(done));await poll();
  assert.deepEqual(errors,[failure]);assert.equal(calls,2);match.close();
 }
});
