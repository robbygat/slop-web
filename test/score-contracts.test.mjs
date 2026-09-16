import test from 'node:test';
import assert from 'node:assert/strict';
import {createScoreRun,parseScoreReceipt,parseLeaderboard} from '../src/lib/score-contracts.js';
const owner='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const session={user:{id:owner},epoch:1};
const receipt=e=>({accepted:true,user_id:e.owner,game_id:e.game,score:e.score,submission_request_id:e.requestId,submission_id:'33333333-3333-4333-8333-333333333333',score_authority:'community_unverified'});
test('finished is idempotent per run and binds exact owner, game, request and score receipt',async()=>{
 let calls=0;
 const run=createScoreRun({game:'night-drift',getSession:()=>session,requestId,submit:async e=>{calls++;return receipt(e);}});
 const first=run.finish(42);assert.equal(first,run.finish(999));assert.deepEqual(await first,{state:'saved',score:42,authority:'community_unverified'});assert.equal(calls,1);
 for(const field of ['owner','game','requestId','score']){const expected={owner,game:'night-drift',requestId,score:42};const wrong={...expected,[field]:field==='score'?43:'wrong'};assert.throws(()=>parseScoreReceipt(receipt(wrong),expected));}
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
