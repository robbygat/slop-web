import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionVerifier,createVerifiedOwnerGuard,createSessionResolver} from '../src/lib/session-contracts.js';
import {SlopError} from '../src/lib/contracts.js';
const a={user:{id:'owner-a',is_anonymous:false},access_token:'token-a',epoch:1};
const b={user:{id:'owner-b',is_anonymous:false},access_token:'token-b',epoch:2};
const later=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('a cached JWT must resolve to the same actual auth user before use',async()=>{
 let sent,calls=0,time=0;
 const verify=createSessionVerifier({publicKey:'public-fixture',now:()=>time,fetcher:async(url,options)=>{calls++;sent={url,...options};return Response.json({id:a.user.id,is_anonymous:false,display:'authoritative'});}});
 const valid=await verify(a);assert.equal(valid.user.display,'authoritative');assert.equal(sent.url,'https://api.slop.game/auth/v1/user');assert.equal(sent.headers.Authorization,'Bearer token-a');assert.equal(sent.headers.apikey,'public-fixture');assert.equal(sent.credentials,'omit');assert.equal(sent.redirect,'error');
 await verify(a);assert.equal(calls,1);await assert.rejects(verify({...a,user:b.user}),{code:'authentication_required'});time=30001;await verify(a);assert.equal(calls,2);await verify(a,{force:true});assert.equal(calls,3);
 const wrong=createSessionVerifier({publicKey:'fixture',fetcher:async()=>Response.json({id:b.user.id})});await assert.rejects(wrong(a),{code:'authentication_required'});
});

test('deleted and expired auth users fail closed; service outages are distinct',async()=>{
 const legacy=createSessionVerifier({publicKey:'fixture',fetcher:async()=>Response.json({code:403,error_code:'user_not_found'},{status:403})});await assert.rejects(legacy(a),{code:'authentication_required'});
 for(const status of [401,403,404]){const verify=createSessionVerifier({publicKey:'fixture',fetcher:async()=>Response.json({code:'user_not_found'},{status})});await assert.rejects(verify(a),{code:'authentication_required'});}
 for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response('',{status:503})]){const verify=createSessionVerifier({publicKey:'fixture',fetcher});await assert.rejects(verify(a),{code:'service_unavailable'});}
});

test('deleted-account validation stops the Shop RPC before entitlement sync',async()=>{
 let current=a,invalidated=0,called=0;
 const guard=createVerifiedOwnerGuard({getSession:()=>current,verify:async()=>{throw new SlopError('authentication_required');},invalidate:owner=>{assert.equal(owner,a);invalidated++;current=null;}});
 await assert.rejects(guard(()=>{called++;}),{code:'authentication_required'});assert.equal(called,0);assert.equal(invalidated,1);
});

test('the exact entitlement FK rechecks the account and becomes sign-in recovery',async()=>{
 let current=a,checks=[],invalidated=0;
 const guard=createVerifiedOwnerGuard({getSession:()=>current,verify:async(_s,{force})=>{checks.push(force);if(force)throw new SlopError('authentication_required');},invalidate:()=>{invalidated++;current=null;}});
 await assert.rejects(guard(()=>{throw new SlopError('23503','insert violates slop_cosmetic_entitlements_user_id_fkey');}),{code:'authentication_required'});
 assert.deepEqual(checks,[false,true]);assert.equal(invalidated,1);
});

test('valid accounts retain real RPC errors; unrelated constraints do not sign out',async()=>{
 let checks=0,invalidated=0;const guard=createVerifiedOwnerGuard({getSession:()=>a,verify:async()=>{checks++;},invalidate:()=>invalidated++});
 const fk=new SlopError('23503','slop_cosmetic_entitlements_user_id_fkey');await assert.rejects(guard(()=>{throw fk;}),error=>error===fk);assert.equal(checks,2);
 const other=new SlopError('23503','game_revision_fkey');await assert.rejects(guard(()=>{throw other;}),error=>error===other);assert.equal(checks,3);assert.equal(invalidated,0);
});

test('a delayed invalid-token result cannot clear a newly selected account',async()=>{
 let current=a,invalidated=0,called=0;const check=later();
 const guard=createVerifiedOwnerGuard({getSession:()=>current,verify:()=>check.promise,invalidate:()=>invalidated++});
 const work=guard(()=>called++);current=b;check.reject(new SlopError('authentication_required'));
 await assert.rejects(work,{code:'account_changed'});assert.equal(invalidated,0);assert.equal(called,0);
});

test('session restoration waits for auth verification and discards stale events',async()=>{
 const waiting=new Map(),applied=[],invalid=[];
 const resolver=createSessionResolver({verify:s=>{const d=later();waiting.set(s.user.id,d);return d.promise;},onPending:()=>{},onVerified:s=>applied.push(s?.user.id??null),onInvalid:s=>invalid.push(s.user.id),onUnavailable:assert.fail});
 const first=resolver.accept(a,'INITIAL_SESSION');assert.deepEqual(applied,[]);
 const next=resolver.accept(b,'SIGNED_IN');waiting.get(a.user.id).reject(new SlopError('authentication_required'));await first;assert.deepEqual(invalid,[]);
 waiting.get(b.user.id).resolve(b);await next;assert.deepEqual(applied,['owner-b']);
 const pending=resolver.accept(a,'TOKEN_REFRESHED');await resolver.accept(null,'SIGNED_OUT');waiting.get(a.user.id).resolve(a);await pending;assert.deepEqual(applied,['owner-b',null]);
});

test('resolver teardown and network failure never pretend a session is authenticated',async()=>{
 const d=later();let invalid=0,applied=0,unavailable=0;
 const resolver=createSessionResolver({verify:()=>d.promise,onPending:()=>{},onVerified:()=>applied++,onInvalid:()=>invalid++,onUnavailable:()=>unavailable++});
 const work=resolver.accept(a);d.reject(new SlopError('service_unavailable'));await work;assert.equal(applied,0);assert.equal(invalid,0);assert.equal(unavailable,1);
 const d2=later();const cancelled=createSessionResolver({verify:()=>d2.promise,onPending:()=>{},onVerified:()=>applied++,onInvalid:()=>invalid++,onUnavailable:()=>unavailable++});
 const stopped=cancelled.accept(a);cancelled.cancel();d2.resolve(a);await stopped;assert.equal(applied,0);
});

test('generic gateway failures are not mislabeled as deleted auth accounts',async()=>{
 for(const response of [new Response('<h1>Not Found</h1>',{status:404}),Response.json({message:'Proxy unavailable'},{status:403}),Response.json({message:'Invalid API key'},{status:401}),Response.json({code:'unexpected_failure'},{status:500})]){
  const verify=createSessionVerifier({publicKey:'fixture',fetcher:async()=>response});await assert.rejects(verify(a),{code:'service_unavailable'});
 }
});

test('an old rejected token cannot invalidate its newly refreshed same-account session',async()=>{
 let current=a,invalidated=0;const validation=later();
 const guard=createVerifiedOwnerGuard({getSession:()=>current,verify:()=>validation.promise,invalidate:()=>invalidated++});
 const work=guard(()=>assert.fail('stale verification must not run work'));
 current={...a,access_token:'fresh-token-a'};validation.reject(new SlopError('authentication_required'));
 await assert.rejects(work,{code:'account_changed'});assert.equal(invalidated,0);assert.equal(current.access_token,'fresh-token-a');
});

test('late cached-session reads cannot replace a newer sign-in event',async()=>{
 const read=later(),applied=[];
 const resolver=createSessionResolver({verify:async s=>s,onPending:()=>{},onVerified:s=>applied.push(s?.user.id),onInvalid:assert.fail,onUnavailable:assert.fail});
 const old=resolver.read(()=>read.promise);
 await resolver.accept(b,'SIGNED_IN');read.resolve(a);await old;
 assert.deepEqual(applied,['owner-b']);
});

test('a missing-user force check invalidates the earlier success cache',async()=>{
 let valid=true,calls=0;const verify=createSessionVerifier({publicKey:'fixture',fetcher:async()=>{calls++;return valid?Response.json(a.user):Response.json({code:'user_not_found'},{status:404});}});
 await verify(a);valid=false;await assert.rejects(verify(a,{force:true}),{code:'authentication_required'});
 await assert.rejects(verify(a),{code:'authentication_required'});assert.equal(calls,3);
});

test('verified OAuth return preserves the bounded draft and gives a valid pair priority',async()=>{
 const {pendingAuthReturn}=await import('../src/lib/session-contracts.js');
 const id='11111111-1111-4111-8111-111111111111',ownerId='22222222-2222-4222-8222-222222222222',now=Date.now();
 const value={version:1,id,prompt:'A frog jumps between stars',ownerId:null,updatedAt:now,awaitingAuth:true};
 const route=idea=>pendingAuthReturn({idea:JSON.stringify(idea),ownerId,now});
 assert.equal(route(value),'/build?idea='+id);
 assert.equal(route({...value,ownerId}),'/build?idea='+id);
 assert.equal(route({...value,ownerId:id}),null);assert.equal(route({...value,awaitingAuth:false}),null);assert.equal(route({...value,updatedAt:now-86400001}),null);
 const pairing=JSON.stringify({id,code:'a'.repeat(32),expires:now+60000});
 assert.equal(pendingAuthReturn({pairing,idea:JSON.stringify(value),ownerId,now}),'/connect');
 assert.equal(pendingAuthReturn({pairing:'malformed',idea:JSON.stringify(value),ownerId,now}),'/build?idea='+id);
 assert.equal(value.awaitingAuth,true); // Route selection never consumes or submits the draft.
});
