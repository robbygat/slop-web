import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftPreparer,shouldWarmDraft} from '../src/lib/mcp-draft-preparation.js';
const draft={submission_id:'draft',digest:'exact'};

test('a failed prewarm shared by a click does not start another retry cycle',async()=>{
 let reject,calls=0;
 const failure={code:'invalid_response'};
 const prepare=createDraftPreparer({request:()=>{calls++;return new Promise((_,r)=>{reject=r;});}});
 const warm=prepare(draft),click=prepare(draft);
 reject(failure);
 const results=await Promise.allSettled([warm,click]);
 assert.equal(calls,1);assert.ok(results.every(r=>r.status==='rejected'&&r.reason===failure));
 const retry=prepare(draft);assert.equal(calls,2);reject(failure);await assert.rejects(retry);
});

test('each attempt and retry pause fit the original total time budget',async()=>{
 let time=0;const timeouts=[],pauses=[];
 const failure={code:'service_unavailable'};
 const prepare=createDraftPreparer({now:()=>time,budgetMs:240000,pause:async ms=>{pauses.push(ms);time+=ms;},request:async(_service,_path,options)=>{timeouts.push(options.timeout);time+=options.timeout;throw failure;}});
 await assert.rejects(prepare(draft));
 assert.deepEqual(timeouts,[150000,86000]);assert.deepEqual(pauses,[4000]);assert.equal(time,240000);
});

test('ready receipts reuse their exact digest; queued jobs are left to their publisher',async()=>{
 let calls=0;
 const prepare=createDraftPreparer({now:()=>0,request:async()=>{calls++;return{preview_expires_at:'2030-01-01T00:00:00Z'};}});
 await prepare(draft);await prepare(draft);assert.equal(calls,1);
 await prepare({...draft,digest:'new'});assert.equal(calls,2);
 for(const status of ['requested','recording','publishing'])assert.equal(shouldWarmDraft({publication:{status}}),false);
 for(const status of ['failed',undefined])assert.equal(shouldWarmDraft({publication:{status}}),true);
});

test('transient browser fetch failure retries within the same preparation budget',async()=>{
 let time=0,calls=0;const pauses=[];
 const prepare=createDraftPreparer({now:()=>time,pause:async ms=>{pauses.push(ms);time+=ms;},budgetMs:10000,request:async()=>{if(++calls===1)throw new TypeError('Failed to fetch');return {preview_expires_at:new Date(time+300000).toISOString()};}});
 const result=await prepare({submission_id:'network-draft',digest:'source'});
 assert.equal(calls,2);assert.deepEqual(pauses,[4000]);assert.ok(result.preview_expires_at);
});
