import test from 'node:test';
import assert from 'node:assert/strict';
import {matchSnapshot,matchEntry,validMatchEvent,createTurnMatch} from '../src/lib/turn-match.js';
import {acceptPlayerEvent} from '../src/lib/player-contracts.js';
const game={id:'tankfall',slug:'tankfall',multiplayer_protocol:'turns-v1'};
const base={protocol:'turns-v1',code:'ROOM1234',game_id:game.id,game_slug:game.slug,release_digest:'a'.repeat(64),release_path:`releases/${'a'.repeat(64)}/${game.slug}`,epoch:1,revision:0,seed:'seed',seat:0,status:'active',turn:0,players:[true,true],actions:[],rematch_votes:[false,false]};
const action={revision:1,seat:0,action_id:'shot_0001',action:{angle:45,power:.5}};
test('room URLs use the immutable release and reject identity/path/log mismatches',()=>{
 const snapshot=matchSnapshot(base,game);assert.equal(matchEntry(snapshot),`https://api.slop.game/storage/v1/object/public/games/${base.release_path}/1.0.0/index.html`);
 for(const change of [{game_id:'other'},{game_slug:'other'},{release_path:'tankfall'},{release_digest:'b'.repeat(64)},{revision:1},{revision:1,actions:[{...action,seat:1}]}])assert.throws(()=>matchSnapshot({...base,...change},game),/Invalid match/);
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
