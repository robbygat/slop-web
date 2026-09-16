import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../../supabase/functions/slop-mcp/handler.mjs';
const base='https://api.slop.game/functions/v1/slop-mcp';
test('only the exact web origin can preflight owner routes; no caller reaches authority during preflight',async()=>{
 let calls=0;const handler=createHandler({verifyUser:()=>calls++,phone:()=>calls++,service:()=>calls++});
 for(const origin of ['https://evil.example','null','http://slop.game','https://slop.game.evil.example','https://slop.game:444']){
  const res=await handler(new Request(base+'/connections',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET'}}));
  assert.equal(res.status,403);assert.equal(res.headers.get('access-control-allow-origin'),null);
 }
 const res=await handler(new Request(base+'/pair/confirm',{method:'OPTIONS',headers:{Origin:'https://slop.game','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization, Content-Type'}}));
 assert.equal(res.status,204);assert.equal(res.headers.get('access-control-allow-origin'),'https://slop.game');assert.equal(res.headers.get('access-control-allow-credentials'),null);assert.equal(calls,0);
});
test('web route still requires a verified user and preserves owner-bound responses',async()=>{
 let verified=0;let passed;
 const handler=createHandler({verifyUser:async(token)=>{assert.equal(token,'user.jwt');verified++;},phone:async(token,action)=>{passed={token,action};return {owner_id:'owner',connections:[]};}});
 const noAuth=await handler(new Request(base+'/connections',{headers:{Origin:'https://slop.game'}}));
 assert.equal(noAuth.status,401);assert.equal(noAuth.headers.get('access-control-allow-origin'),'https://slop.game');assert.equal(verified,0);
 const res=await handler(new Request(base+'/connections',{headers:{Origin:'https://slop.game',Authorization:'Bearer user.jwt'}}));
 assert.equal(res.status,200);assert.deepEqual(passed,{token:'user.jwt',action:'connections'});assert.equal(verified,1);
});
test('browser cannot initiate agent pairing, poll secrets, or submit agent drafts',async()=>{
 const handler=createHandler({});
 for(const path of ['/pair/start','/pair/status','/agent/drafts','/agent/status','/agent/revoke']){
  const res=await handler(new Request(base+path,{headers:{Origin:'https://slop.game'}}));assert.equal(res.status,403);
 }
});
test('public authorization link uses one fixed web review destination without consuming pairing data',async()=>{
 const handler=createHandler({});
 const res=await handler(new Request(base+'/authorize?next=https://evil.example#id=11111111-1111-4111-8111-111111111111&code='+'a'.repeat(32)));
 assert.equal(res.status,303);assert.equal(res.headers.get('location'),'https://slop.game/mcp/pair');assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(await res.text(),'');
 const denied=await handler(new Request(base+'/authorize',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));assert.equal(denied.status,401);
});
