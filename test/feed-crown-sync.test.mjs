import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedCrownSync} from '../src/lib/feed-crown-sync.js';
import {scoreSavedEvent,isCurrentScoreSavedEvent} from '../src/lib/score-saved-event.js';
import {createScoreRun} from '../src/lib/score-contracts.js';
import {acceptPlayerEvent} from '../src/lib/player-contracts.js';

const owner='12345678-1234-4234-8234-123456789abc',requestId='23456789-1234-4234-8234-123456789abc';
const game={id:'game-one',slug:'night-drift'},other={id:'game-two',slug:'rail-rush'};
const session={user:{id:owner},epoch:4};
const context=(game,session)=>({gameId:game.id,slug:game.slug,ownerId:session?.user?.id,sessionEpoch:session?.epoch});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const receipt=e=>({accepted:true,user_id:e.owner,game_id:e.game,submission_request_id:e.requestId,score:e.score,submission_id:'34567890-1234-4234-8234-123456789abc',score_authority:'community_unverified'});
const holder={user_id:owner,username:'winner',score:42};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function harness(){
 let current=context(game,session),time=0;const requests=[],shown=[];
 const sync=createFeedCrownSync({getContext:()=>current,now:()=>time,load:slug=>{const d=deferred();requests.push({...d,slug});return d.promise;},onHolder:(slug,holder)=>shown.push({slug,holder})});
 return {sync,requests,shown,setContext:value=>current=value,setTime:value=>time=value};
}

test('validated score save refreshes canonical crown and supersedes a pre-save response; raw game events cannot do so',async()=>{
 const h=harness(),initial=h.sync.refresh();await tick();
 let expected;const submission=deferred();
 const run=createScoreRun({game:game.slug,getSession:()=>session,requestId,submit:e=>{expected=e;return submission.promise;}});
 const saving=run.finish(42);assert.equal(h.requests.length,1);
 const frame={};assert.equal(acceptPlayerEvent(frame,frame,JSON.stringify({type:'score-saved',gameId:game.id,gameSlug:game.slug,ownerId:owner,sessionEpoch:4})),null);
 assert.equal(isCurrentScoreSavedEvent({type:'score-saved'},{game,session}),false);
 submission.resolve(receipt(expected));
 const notice=scoreSavedEvent(await saving,{game,session},session);
 assert.equal(isCurrentScoreSavedEvent(notice,{game,session}),true);
 assert.equal(isCurrentScoreSavedEvent({...notice},{game,session}),false);
 assert.equal(isCurrentScoreSavedEvent(notice,{game:other,session}),false);
 const afterSave=h.sync.refresh({force:true});await tick();assert.equal(h.requests.length,2);
 h.requests[1].resolve(holder);await afterSave;
 h.requests[0].resolve({username:'old-winner',score:40});await initial;
 assert.deepEqual(h.shown,[{slug:game.slug,holder}]);
});

test('guest, rejected receipts, and changed owner/session epochs never produce a saved notice',async()=>{
 const guest=createScoreRun({game:game.slug,getSession:()=>null,requestId});
 assert.equal(scoreSavedEvent(await guest.finish(42),{game,session:null},null),null);
 assert.equal(scoreSavedEvent({state:'failed'},{game,session},session),null);
 const bad=createScoreRun({game:game.slug,getSession:()=>session,requestId,submit:async e=>({...receipt(e),game_id:other.slug})});
 await assert.rejects(bad.finish(42),error=>error.code==='invalid_response');
 const valid=createScoreRun({game:game.slug,getSession:()=>session,requestId,submit:async e=>receipt(e)});
 const saved=await valid.finish(42);
 for(const changed of [null,{user:{id:'other'},epoch:5},{...session,epoch:6}])assert.equal(scoreSavedEvent(saved,{game,session},changed),null);
 const notice=scoreSavedEvent(saved,{game,session},session);
 assert.equal(isCurrentScoreSavedEvent(notice,{game,session:{...session,epoch:6}}),false);
});

test('focus/resume and quick revisits coalesce; an aged revisit fetches once without polling',async()=>{
 const h=harness(),first=h.sync.refresh();assert.equal(h.sync.refresh(),first);await tick();
 h.requests[0].resolve(holder);await first;
 h.setTime(1000);await h.sync.refresh();await h.sync.refresh();assert.equal(h.requests.length,1);
 h.setContext(context(other,session));const second=h.sync.refresh();await tick();h.requests[1].resolve(null);await second;
 h.setContext(context(game,session));await h.sync.refresh();assert.equal(h.requests.length,2);
 h.setTime(30001);const aged=h.sync.refresh();assert.equal(h.sync.refresh(),aged);await tick();assert.equal(h.requests.length,3);h.requests[2].resolve(holder);await aged;
});

test('responses are fenced to current game and current owner epoch, including away then back',async()=>{
 const h=harness(),first=h.sync.refresh();await tick();
 h.setContext(context(other,session));h.requests[0].resolve(holder);await first;assert.deepEqual(h.shown,[]);
 h.setContext(context(game,session));const second=h.sync.refresh({force:true});await tick();
 h.setContext(context(game,{...session,epoch:6}));h.requests[1].resolve(holder);await second;assert.deepEqual(h.shown,[]);
 const current=h.sync.refresh();await tick();h.requests[2].resolve(holder);await current;assert.deepEqual(h.shown,[{slug:game.slug,holder}]);
});

test('failed reads preserve known holder and retry on later navigation; valid empty results expire',async()=>{
 const h=harness(),first=h.sync.refresh();await tick();h.requests[0].reject(new Error('offline'));await first;
 assert.deepEqual(h.shown,[]);await h.sync.refresh();assert.equal(h.requests.length,1);
 h.setTime(3001);const retry=h.sync.refresh();await tick();h.requests[1].resolve(holder);await retry;
 const update=h.sync.refresh({force:true});await tick();h.requests[2].reject(new Error('offline'));await update;assert.deepEqual(h.shown,[{slug:game.slug,holder}]);
 h.setTime(6002);const empty=h.sync.refresh();await tick();h.requests[3].resolve(null);await empty;assert.deepEqual(h.shown.at(-1),{slug:game.slug,holder:null});
 h.setTime(10000);await h.sync.refresh();assert.equal(h.requests.length,4);
 h.setTime(36003);const expired=h.sync.refresh();await tick();h.requests[4].resolve(holder);await expired;assert.equal(h.shown.at(-1).holder,holder);
});

test('unmounted feed ignores pending responses and stops new reads',async()=>{
 const h=harness(),first=h.sync.refresh();await tick();h.sync.dispose();h.requests[0].resolve(holder);await first;
 await h.sync.refresh({force:true});assert.equal(h.requests.length,1);assert.deepEqual(h.shown,[]);
});
