import test from 'node:test';
import assert from 'node:assert/strict';
import {gameTemplate} from '../game-template.mjs';

const id='11111111-1111-4111-8111-111111111111';
const token='slop_mcp_'+'a'.repeat(64);
let importId=0;
async function adapter(work,{reply,fail}={}){
  const previous={Deno:globalThis.Deno,fetch:globalThis.fetch,timeout:AbortSignal.timeout,warn:console.warn};
  const calls=[],deadlines=[],warnings=[];let handler;
  globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://backend.example',SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_publishable_test"}',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_test"}'})[key]},serve:value=>handler=value};
  AbortSignal.timeout=ms=>{deadlines.push(ms);return new AbortController().signal;};
  console.warn=message=>warnings.push(message);
  globalThis.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    assert.ok(['/rest/v1/rpc/mcp_service','/rest/v1/rpc/mcp_world_submit'].includes(path));
    assert.equal(options.headers.apikey,'sb_secret_test');assert.equal(options.headers.Authorization,undefined);
    const streamed=options.body instanceof ReadableStream;
    const body=JSON.parse(streamed?await new Response(options.body).text():options.body);
    calls.push({body,streamed,path});
    if(body.p_action==='agent_status')return Response.json({status:'active'});
    if(body.p_action==='send_draft'||path==='/rest/v1/rpc/mcp_world_submit'){
      if(fail)throw fail;
      return reply?.()??Response.json({submission_id:id,status:'awaiting_confirmation'});
    }
    return Response.json({ok:true});
  };
  try{
    await import(`../../supabase/functions/slop-mcp/index.ts?world-upload-${++importId}`);
    const send=async(persistent,hints={})=>{
      const files=persistent?(await gameTemplate({persistent:true})).files:{'index.html':'<canvas></canvas>'};
      return handler(new Request('https://backend.example/functions/v1/slop-mcp/agent/drafts',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({project_id:id,request_id:id,revision:1,name:'Private upload fixture',files,...hints})}));
    };
    return await work({send,calls,deadlines,warnings});
  }finally{globalThis.Deno=previous.Deno;globalThis.fetch=previous.fetch;AbortSignal.timeout=previous.timeout;console.warn=previous.warn;}
}
test('only server-validated persistent send uses the World RPC and100s; preflight and Arcade stay30s',async()=>{
  await adapter(async({send,calls,deadlines,warnings})=>{
    assert.equal((await send(true)).status,200);
    assert.equal((await send(false)).status,200);
    assert.deepEqual(deadlines,[30_000,100_000,30_000,30_000]);
    assert.deepEqual(calls.map(call=>call.body.p_action),['agent_status',undefined,'agent_status','send_draft']);
    assert.deepEqual(calls.map(call=>call.path),['/rest/v1/rpc/mcp_service','/rest/v1/rpc/mcp_world_submit','/rest/v1/rpc/mcp_service','/rest/v1/rpc/mcp_service']);
    assert.deepEqual(Object.keys(calls[1].body),['p']);
    assert.deepEqual(calls.map(call=>call.streamed),[false,true,false,true]);
    assert.equal(calls[1].body.p.persistent,true);assert.equal(calls[3].body.p.persistent,false);
    assert.equal(warnings.length,0);
  });
});
test('caller-supplied persistence hints cannot choose a different RPC or timeout',async()=>{
  await adapter(async({send,calls,deadlines})=>{
    assert.equal((await send(false,{persistent:true})).status,200);
    assert.equal((await send(true,{persistent:false})).status,200);
    assert.equal(calls[1].path,'/rest/v1/rpc/mcp_service');
    assert.equal(calls[1].body.p.persistent,false);
    assert.equal(calls[3].path,'/rest/v1/rpc/mcp_world_submit');
    assert.equal(calls[3].body.p.persistent,true);
    assert.deepEqual(deadlines,[30_000,30_000,30_000,100_000]);
  });
});
test('database timeout diagnostics are bounded and cannot leak source or credentials',async()=>{
  await adapter(async({send,warnings,calls})=>{
    const response=await send(true);assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{ok:false,code:'upstream_unavailable'});
    assert.equal(calls.filter(call=>call.path==='/rest/v1/rpc/mcp_world_submit').length,1);
    assert.equal(warnings.length,1);
    const diagnostic=JSON.parse(warnings[0]);assert.deepEqual({...diagnostic,elapsed_ms:0},{event:'mcp_draft_upstream_failure',status:500,sql_code:'57014',timeout_ms:100_000,elapsed_ms:0});
    assert.ok(diagnostic.elapsed_ms>=0);assert.doesNotMatch(warnings[0],/secret|private\.js|Bearer|token_hash|signed/);
  },{reply:()=>Response.json({code:'57014',message:'secret source private.js Bearer token signed URL',details:{token_hash:'secret'}},{status:500})});
});
test('known SQL invalid_bundle is a nonretryable validation rejection, not an outage',async()=>{
  await adapter(async({send,warnings})=>{
    const response=await send(true);assert.equal(response.status,400);
    assert.deepEqual(await response.json(),{ok:false,code:'invalid_bundle'});
    assert.equal(JSON.parse(warnings[0]).sql_code,'22023');
  },{reply:()=>Response.json({code:'22023',message:'invalid_bundle'},{status:400})});
});
test('ambiguous send abort never retries or exposes the thrown message',async()=>{
  await adapter(async({send,warnings,calls})=>{
    const response=await send(true);assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{ok:false,code:'upstream_unavailable'});
    assert.equal(calls.filter(call=>call.path==='/rest/v1/rpc/mcp_world_submit').length,1);
    assert.equal(JSON.parse(warnings[0]).status,null);assert.equal(JSON.parse(warnings[0]).sql_code,null);
    assert.doesNotMatch(warnings.join(''),/secret/);
  },{fail:new Error('secret network credential')});
});
test('unknown upstream diagnostic fields are never passed through',async()=>{
  await adapter(async({send,warnings})=>{
    assert.equal((await send(true)).status,503);
    assert.equal(JSON.parse(warnings[0]).sql_code,null);
    assert.doesNotMatch(warnings.join(''),/private-host/);
  },{reply:()=>Response.json({code:'https://private-host/token',message:'secret'},{status:502})});
});
test('an unreadable success response is an unknown outcome, never a null success receipt',async()=>{
  await adapter(async({send,warnings,calls})=>{
    const response=await send(true);assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{ok:false,code:'upstream_unavailable'});
    assert.equal(calls.filter(call=>call.path==='/rest/v1/rpc/mcp_world_submit').length,1);
    assert.equal(JSON.parse(warnings[0]).status,200);
  },{reply:()=>new Response('private truncated source',{status:200})});
});
