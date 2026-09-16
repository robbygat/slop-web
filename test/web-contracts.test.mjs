import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createOwnerScope,ownerRequest,parsePairing,trustedEntry,boundedJson} from '../src/lib/contracts.js';
import {futureExpiry,publicationReceipt,creatorRevisionId} from '../src/lib/creator-contracts.js';
import {gamePolicy,acceptPlayerEvent} from '../src/lib/player-contracts.js';
import {bundleIdentity,mime} from '../src/lib/bundle-contracts.js';
import {pendingPairing,oauthCallbackUrl} from '../src/lib/pairing-contracts.js';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const session=(id=owner,epoch=1,access_token='owner.jwt')=>({user:{id,is_anonymous:false},epoch,access_token});

test('delayed SDK work is fenced before another account token can be requested',async()=>{
 let current=session(),tokenCalls=0;
 const asOwner=createOwnerScope({getSession:()=>current,clientFactory:token=>({token:async()=>{tokenCalls++;return token();}})});
 await assert.rejects(asOwner(async(id,client)=>{assert.equal(id,owner);assert.equal(await client.token(),'owner.jwt');current=session(other,2,'other.jwt');return client.token();}),{code:'account_changed'});
 assert.equal(tokenCalls,2);
 current=session();await assert.rejects(asOwner(async()=>{current=session(owner,3,'returned.jwt');return {private:'old-account-data'};}),{code:'account_changed'});
 current=session();await assert.rejects(asOwner(async()=>{current=null;throw Error('Original account error');}),{code:'account_changed'});
});
test('token refresh within the same owner does not rebind an in-flight SDK operation',async()=>{
 let current=session();const asOwner=createOwnerScope({getSession:()=>current,clientFactory:token=>({token})});
 assert.equal(await asOwner(async(_id,client)=>{current=session(owner,1,'refreshed.jwt');return client.token();}),'owner.jwt');
 current={...session(),user:{id:owner,is_anonymous:true}};await assert.rejects(asOwner(()=>{}),{code:'authentication_required'});
});
test('owner HTTP requests discard responses after account switches and reject forged owner receipts',async()=>{
 let current=session();let sent;
 const request=ownerRequest({getSession:()=>current,fetcher:async(_url,options)=>{sent=options;current=session(other,2,'other.jwt');return Response.json({owner_id:owner});}});
 await assert.rejects(request('slop-mcp','/drafts'),{code:'account_changed'});assert.equal(sent.headers.Authorization,'Bearer owner.jwt');assert.equal(sent.credentials,'omit');assert.equal(sent.redirect,'error');
 current=session();const forged=ownerRequest({getSession:()=>current,fetcher:async()=>Response.json({owner_id:other})});await assert.rejects(forged('slop-mcp','/drafts'),{code:'account_changed'});
 const empty=ownerRequest({getSession:()=>null,fetcher:()=>assert.fail('must not fetch')});await assert.rejects(empty('slop-creator','/projects'),{code:'authentication_required'});
});
test('bounded response parsing rejects oversized streams, malformed JSON, and missing bodies',async()=>{
 await assert.rejects(boundedJson(new Response('x'.repeat(40)),12),{code:'invalid_response'});
 await assert.rejects(boundedJson(new Response('{oops}')),{code:'invalid_response'});
 await assert.rejects(boundedJson(new Response(null)),{code:'invalid_response'});
});
test('publication confirmation follows actual mobile SQL candidate and canonical receipts',()=>{
 const project={owner_id:owner,id:other,game_slug:'creator-canonical'},revision={id:'33333333-3333-4333-8333-333333333333'},buildId='b3-'+'a'.repeat(32);
 const data={owner_id:owner,project_id:other,revision_id:revision.id,target_slug:project.game_slug,candidate_slug:`creator-release-${revision.id}`,build_id:buildId,status:'draft'};
 assert.equal(publicationReceipt(data,{project,revision,buildId}),false);
 const complete={...data,status:'pending_review',review_submission_id:owner};assert.equal(publicationReceipt(complete,{project,revision,buildId}),true);
 for(const change of [{owner_id:other},{project_id:owner},{revision_id:owner},{target_slug:'other-game'},{candidate_slug:'other-candidate'},{build_id:'other-build'},{review_submission_id:null},{status:'claimed-ready'}])assert.throws(()=>publicationReceipt({...complete,...change},{project,revision,buildId}),{code:'invalid_response'});
 assert.throws(()=>publicationReceipt({...complete,candidate_slug:undefined,slug:data.candidate_slug},{project,revision,buildId}),{code:'invalid_response'});
});
test('upload and preview expirations cannot be absent, invalid, expired, or arbitrarily extended',()=>{
 const now=Date.now();assert.equal(futureExpiry(new Date(now+60000).toISOString(),600000,now),true);
 for(const value of [null,undefined,'invalid-date',new Date(now-1).toISOString(),new Date(now+600001).toISOString()])assert.equal(futureExpiry(value,600000,now),false);
});
test('source identity matches canonical mobile byte framing and changes with any source change',async()=>{
 const files={'index.html':'<canvas>🌈</canvas>','slop.js':'const ready = true;'};
 const a=await bundleIdentity(files),b=await bundleIdentity({'slop.js':files['slop.js'],'index.html':files['index.html']});assert.deepEqual(a,b);
 assert.equal(a.buildId,'b3-d3bb4a609ebf585bb06ac5c9d31701cb');
 assert.notEqual((await bundleIdentity({...files,'slop.js':'const ready = false;'})).buildId,a.buildId);
 await assert.rejects(bundleIdentity({...files,'../escape.js':'bad'}),{code:'invalid_response'});
});
test('untrusted games have no authenticated origin, navigation, or unrelated network capability',()=>{
 const base='https://api.slop.game/storage/v1/object/public/games/demo/1.0.0/';const csp=gamePolicy(base);
 assert.ok(csp.includes("default-src 'none'"));assert.ok(csp.includes(`connect-src ${base} blob:`));assert.ok(csp.includes("form-action 'none'"));assert.ok(csp.includes("frame-src 'none'"));
 assert.throws(()=>gamePolicy('https://attacker.example/'));assert.equal(trustedEntry(base+'index.html?token=secret'),false);
 const frame={};assert.equal(acceptPlayerEvent({},frame,JSON.stringify({type:'ready'})),null);assert.equal(acceptPlayerEvent(null,null,JSON.stringify({type:'ready'})),null);
 assert.equal(acceptPlayerEvent(frame,frame,JSON.stringify({type:'score',value:-1})),null);assert.equal(acceptPlayerEvent(frame,frame,JSON.stringify({type:'publish',slug:'victim'})),null);
 assert.deepEqual(acceptPlayerEvent(frame,frame,'slop-player-loaded-v1'),{type:'loaded'});
});
test('public pairing fallback preserves only a valid fragment challenge and never grants access',async()=>{
 const code='a'.repeat(32),source=await readFile(new URL('../public/mcp/pair/pair.js',import.meta.url),'utf8');
 const testLink=(hash,search='')=>{let target;const status={};runInNewContext(source,{location:{hash,search,replace:value=>target=value},document:{getElementById:()=>status},URLSearchParams});return target;};
 const valid=`#id=${owner}&code=${code}`;assert.equal(testLink(valid),`/#/connect?id=${owner}&code=${code}`);
 const parsed=new URL(testLink(valid),'https://slop.game');assert.equal(parsed.search,'');assert.ok(parsed.hash.includes(code));
 for(const hash of [valid+'&extra=1',valid+'&id='+owner,'#id='+owner,'#id='+owner+'&code=%61'.repeat(32),valid.replace(owner,'bad'),valid+'#x'])assert.equal(testLink(hash),undefined);
 assert.equal(testLink(valid,'?redirect=https://attacker.example'),undefined);
 assert.ok(parsePairing('https://slop.game/mcp/pair'+valid));assert.equal(parsePairing('https://slop.game.attacker.example/mcp/pair'+valid),null);
});
test('OAuth return can restore only an unexpired validated pending pairing',()=>{
 const now=Date.now(),saved={id:owner,code:'a'.repeat(32),expires:now+300000};
 assert.deepEqual(pendingPairing(JSON.stringify(saved),now),{id:owner,code:saved.code});
 for(const change of [{expires:now},{expires:now+600001},{expires:'tomorrow'},{id:other+'&redirect=evil'},{code:'bad'}])assert.equal(pendingPairing(JSON.stringify({...saved,...change}),now),null);
 assert.equal(oauthCallbackUrl('https://slop.game/?code=pkce-callback'),true);
 for(const url of ['https://slop.game/#/connect','https://slop.game/?code=','https://slop.game/?code=a&code=b','https://slop.game/?code=a&error=denied'])assert.equal(oauthCallbackUrl(url),false);
});

// The gateway hashes persisted object MIME receipts as well as source bytes.
// application/javascript is rejected even though browsers can execute it.
test('creator text uploads match the mobile bundle gateway MIME contract',()=>{
 for(const path of ['game.js','slop.js','runtime.mjs'])assert.equal(mime(path),'text/javascript; charset=utf-8');
 assert.equal(mime('index.html'),'text/html; charset=utf-8');
 assert.equal(mime('styles.css'),'text/css; charset=utf-8');
 assert.equal(mime('slop.game.json'),'application/json; charset=utf-8');
});

test('ready creator display selects the accepted head instead of a stale preview candidate',()=>{
 const head='11111111-1111-4111-8111-111111111111',candidate='22222222-2222-4222-8222-222222222222';
 assert.equal(creatorRevisionId({head_revision_id:head},{state:'waiting_feedback',revision_id:candidate}),candidate);
 assert.equal(creatorRevisionId({head_revision_id:head},{state:'ready',revision_id:candidate}),head);
 assert.equal(creatorRevisionId({head_revision_id:head},null),head);
 assert.equal(creatorRevisionId({head_revision_id:null},{state:'ready',revision_id:candidate}),null);
});
