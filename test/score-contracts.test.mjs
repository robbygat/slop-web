import test from 'node:test';
import assert from 'node:assert/strict';
import {createScoreRun,parseScoreReceipt,parseLeaderboard} from '../src/lib/score-contracts.js';
const owner='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const session={user:{id:owner},epoch:1};
const receipt=e=>({accepted:true,user_id:e.owner,game_id:e.game,score:e.score,submission_request_id:e.requestId,submission_id:'33333333-3333-4333-8333-333333333333',score_authority:'community_unverified'});
test('finished is idempotent per run and binds exact owner, game, request and score receipt',async()=>{
 let calls=0;
 const run=createScoreRun({game:'night-drift',getSession:()=>session,requestId,submit:async e=>{calls++;return receipt(e);}});
 const first=run.finish(42);assert.equal(first,run.finish(999));assert.deepEqual(await first,{state:'saved',score:42,authority:'community_unverified',crown:null});assert.equal(calls,1);
 for(const field of ['owner','game','requestId','score']){const expected={owner,game:'night-drift',requestId,score:42};const wrong={...expected,[field]:field==='score'?43:'wrong'};assert.throws(()=>parseScoreReceipt(receipt(wrong),expected));}
});
test('only the exact atomic takeover receipt can start a Crown animation',()=>{
 const expected={owner,game:'night-drift',requestId,score:42};
 const takeover={...receipt(expected),claimed:true,display_authority:'community_unverified',transition_id:'44444444-4444-4444-8444-444444444444',winning_score:42,previous_score:41,winner:{user_id:owner,username:'winner',slop_look:{palette:'mint'}},previous_holder:{user_id:'55555555-5555-4555-8555-555555555555',username:'previous',slop_look:{palette:'tangerine'}}};
 const parsed=parseScoreReceipt(takeover,expected);assert.equal(parsed.crown.winner.name,'winner');assert.equal(parsed.crown.previous.name,'previous');
 for(const invalid of [{...takeover,transition_id:'bad'},{...takeover,winning_score:99},{...takeover,previous_score:42},{...takeover,winner:{...takeover.winner,user_id:'66666666-6666-4666-8666-666666666666'}}])assert.throws(()=>parseScoreReceipt(invalid,expected));
});
test('account switches cannot assign a finished game to another account or save a guest run after sign-in',async()=>{
 let current=session,calls=0;
 const run=createScoreRun({game:'night-drift',getSession:()=>current,submit:async e=>{calls++;return receipt(e);}});
 current={user:{id:'other'},epoch:2};await assert.rejects(()=>run.finish(42),e=>e.code==='account_changed');assert.equal(calls,0);
 current=null;const guest=createScoreRun({game:'night-drift',getSession:()=>current,submit:async()=>{calls++;}});current=session;
 assert.equal((await guest.finish(12)).state,'guest');assert.equal(calls,0);
});
test('late receipts, invalid scores and forged verification labels do not become saved verified results',async()=>{
 let current=session;
 const run=createScoreRun({game:'night-drift',getSession:()=>current,submit:async e=>{current={...session,epoch:3};return receipt(e);}});
 await assert.rejects(()=>run.finish(42),e=>e.code==='account_changed');
 for(const score of [-1,1.5,NaN,100000000])await assert.rejects(()=>createScoreRun({game:'night-drift',getSession:()=>null}).finish(score));
 const expected={owner,game:'night-drift',requestId,score:42};assert.throws(()=>parseScoreReceipt({...receipt(expected),score_authority:'verified_receipt'},expected));
 assert.equal(parseLeaderboard([{username:'player',score:7}])[0].authority,'community_unverified');
});
