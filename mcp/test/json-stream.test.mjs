import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JsonReader,readJsonStream} from '../../supabase/functions/slop-mcp/json-reader.mjs';
import {jsonBodyStream} from '../../supabase/functions/slop-mcp/json-body.mjs';
import {createHandler} from '../../supabase/functions/slop-mcp/handler.mjs';
import {BridgeError,validateDraft,sha256} from '../../supabase/functions/slop-mcp/contract.mjs';
import {fileBytes,fileByteLength,inspectBundle,inspectDecodedBundle} from '../bundle-rules.mjs';

const parse=(source,size=1,options)=>{const reader=new JsonReader(options);for(let i=0;i<source.length;i+=size)reader.write(source.slice(i,i+size));return reader.finish();};
const ordinary=value=>JSON.parse(JSON.stringify(value));
const id='11111111-1111-4111-8111-111111111111';
const token='slop_mcp_'+'a'.repeat(64);
const draft={project_id:id,request_id:id,revision:1,name:'世界 🎮',files:{'index.html':'<canvas></canvas>','game.js':'const text="é🙂\\\\\"";'}};
const url='https://example.invalid/functions/v1/slop-mcp/agent/drafts';
function streamedRequest(bytes,{chunk=1}={}){let offset=0;return new Request(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:new ReadableStream({pull(controller){if(offset===bytes.length)controller.close();else{controller.enqueue(bytes.subarray(offset,offset+=Math.min(chunk,bytes.length-offset)));}}}),duplex:'half'});}

test('incremental reader matches JSON.parse across strings, escapes, UTF-16, scalars and split boundaries',()=>{
 const cases=['{}','[]','null','true','false','-0','1.2e-3','1e400','{"a":1,"a":2}',
  '{"__proto__":{"polluted":true},"constructor":2,"prototype":3}',
  JSON.stringify({name:'世界🙂',quote:'"\\/\b\f\n\r\t',single:'\ud800',pair:'\ud83d\ude42',array:[false,null,-2,{'escaped\\key':'a\\\"b'}]}),
  ' \n {"number":-2E+4,"escaped":"\\u0041\\ud83d\\ude42"}\t '];
 for(const source of cases)for(const size of [1,2,3,7,8192]){
  const expected=JSON.parse(source),actual=parse(source,size);
  assert.equal(JSON.stringify(actual),JSON.stringify(expected),`${source} / ${size}`);
 }
 assert.equal({}.polluted,undefined);assert.equal(Object.getPrototypeOf(parse('{"__proto__":1}')),null);
});
test('reader rejects trailing commas/tokens, malformed primitives/numbers/escape/control and incomplete structures',()=>{
 for(const source of ['', ' ', '{','[','{"x":}','{"x",1}','{"x":1,}','[1,]','true false','{}{}','[truefalse]','01','+1','.1','1.','1e','NaN','undefined','{"x":"\\q"}','{"x":"\n"}','{"x":"\\u000g"}','{"x":"dangling\\','{"x":1]','[1}','{"x" 1}','{true:1}','[1:2]','{"x":1}\v'])
  for(const size of [1,3,8192])assert.throws(()=>parse(source,size),SyntaxError,`${JSON.stringify(source)} / ${size}`);
});
test('reader has explicit depth/node/token ceilings and duplicate-key last-value parity',()=>{
 assert.throws(()=>parse('[[[0]]]',1,{maxDepth:2}),/invalid_json/);
 assert.throws(()=>parse('[1,2,3]',1,{maxNodes:3}),/invalid_json/);
 assert.throws(()=>parse('"abcdef"',1,{maxToken:5}),/invalid_json/);
 assert.throws(()=>parse('1e'+'0'.repeat(1024),8192),/invalid_json/);
 assert.deepEqual(ordinary(parse('{"a":{"b":1},"a":[2],"__proto__":1}')),JSON.parse('{"a":[2],"__proto__":1}'));
});
test('decoded scalar bounds reject oversized Unicode/binary values without rejecting valid JSON escape spelling',()=>{
 for(const content of ['a'.repeat(8_000_001),'界'.repeat(2_666_667),'\\u0061'.repeat(8_000_001)])assert.throws(()=>parse('{"files":{"game.js":"'+content+'"}}',65_536),/invalid_json/);
 assert.throws(()=>parse('{"files":{"x.bin":{"data":"'+'A'.repeat(10_666_669)+'"}}}',65_536),/invalid_json/);
 assert.throws(()=>parse('{"name":"'+'\\u0061'.repeat(81)+'"}',7),/invalid_json/);
 const escaped='\\u0061'.repeat(8_000_000);assert.equal(parse('{"files":{"game.js":"'+escaped+'"}}',65_536).files['game.js'].length,8_000_000);
});
test('seeded incremental parser differential corpus matches native JSON parser',()=>{
 let state=41;const next=()=>{state=(state*1664525+1013904223)>>>0;return state;};
 const text=['a','世界','🙂','"','\\','\n','\u0000','\ud800','\udfff'];
 const make=depth=>{const kind=next()%(depth?6:4);if(kind===0)return null;if(kind===1)return Boolean(next()%2);if(kind===2)return (next()-0x80000000)/13;if(kind===3)return Array.from({length:next()%8},()=>text[next()%text.length]).join('');if(kind===4)return Array.from({length:next()%5},()=>make(depth-1));const obj=Object.create(null);for(let i=0,n=next()%5;i<n;i++)obj[text[next()%text.length]+i]=make(depth-1);return obj;};
 for(let i=0;i<500;i++){const source=JSON.stringify(make(4));assert.equal(JSON.stringify(parse(source,1+next()%11)),source);}
});
test('bounded JSON output is byte-for-byte JSON.stringify including pair/lone surrogate boundary',async()=>{
 const values=[draft,{text:'a'.repeat(8191)+'🙂'+'b'.repeat(8191)+'\ud800\n\\"',list:[1,false,null],binary:{encoding:'base64',data:'AQID'.repeat(20_000)}}];
 for(const value of values){const reader=jsonBodyStream(value).getReader(),parts=[];let max=0;while(true){const {done,value}=await reader.read();if(done)break;max=Math.max(max,value.length);parts.push(value);}assert.deepEqual(Buffer.concat(parts),Buffer.from(JSON.stringify(value)));assert.ok(max<=49_152);}
 await assert.rejects(()=>new Response(jsonBodyStream({bad:undefined})).text(),/validated_json_required/);
});
test('bounded large-response helper preserves JSON/UTF-8 and cancels invalid or overlimit streams',async()=>{
 const value={files:{'game.js':'世界🙂\n\\"'},status:'ready'};
 assert.deepEqual(ordinary(await readJsonStream(jsonBodyStream(value))),value);
 for(const bytes of [Buffer.from('{"x":1} {}'),new Uint8Array([0xc3,0x28]),Buffer.from(' '.repeat(101))]){
  let cancelled=false,used=false;const stream=new ReadableStream({pull(controller){if(used)return;used=true;controller.enqueue(bytes);},cancel(){cancelled=true;}},{highWaterMark:0});
  await assert.rejects(()=>readJsonStream(stream,{maxBytes:100}));assert.equal(cancelled,true);
 }
 await assert.rejects(()=>readJsonStream(null),/invalid_json/);
});
test('native and indexed fallback binary decoding keep canonical base64 and buffer reuse semantics',()=>{
 const original=Uint8Array.fromBase64,originalSet=Uint8Array.prototype.setFromBase64,originalFrom=Uint8Array.from;
 try{
  Uint8Array.fromBase64=undefined;Uint8Array.prototype.setFromBase64=undefined;Uint8Array.from=()=>{throw Error('boxed iterable path forbidden');};
  for(let length=0;length<260;length++){const expected=Buffer.from(Array.from({length},(_,i)=>(i*47+length)%256)),value={encoding:'base64',data:expected.toString('base64')},buffer=new Uint8Array(512);assert.deepEqual(Buffer.from(fileBytes('x.bin',value)),expected);const reused=fileBytes('x.bin',value,buffer);assert.equal(reused.buffer,buffer.buffer);assert.deepEqual(Buffer.from(reused),expected);assert.equal(fileByteLength('x.bin',value),length);}
  for(const data of ['=','====','A===','AAAA=AAA','AR==','AAF=','AAA','AQ==\n','AQ-_','a==='])assert.throws(()=>fileBytes('x.bin',{encoding:'base64',data}),/invalid_binary/);
  assert.throws(()=>fileBytes('x.bin',{encoding:'base64',data:'AQID'},new Uint8Array(2)),/invalid_binary/);
 }finally{Uint8Array.fromBase64=original;Uint8Array.prototype.setFromBase64=originalSet;Uint8Array.from=originalFrom;}
 const value={encoding:'base64',data:'AAH+/w=='};assert.deepEqual([...fileBytes('x.bin',value)],[0,1,254,255]);
});
test('trusted decoded storage inspection shares admission without opening client typed-array bypass',()=>{
 const source={'index.html':'<script src="slop.js"></script><script src="game.js"></script>','slop.js':'runtime','game.js':'const save=await Slop.persist({});save.commit();Slop.ready();','slop.spec.json':JSON.stringify({persistent:true,first_load:['index.html','slop.js','game.js']}),'zone.bin':{encoding:'base64',data:'AQID'}};
 const trusted={...source,'zone.bin':new Uint8Array([1,2,3])},normal=inspectBundle(source),decoded=inspectDecodedBundle(trusted);
 assert.equal(decoded.persistent,normal.persistent);assert.equal(decoded.total,normal.total);assert.deepEqual(decoded.firstLoad,normal.firstLoad);assert.deepEqual(decoded.byteLengths,normal.byteLengths);assert.equal(decoded.decoded.size,0);
 assert.throws(()=>inspectBundle(trusted),/invalid_binary/);assert.throws(()=>inspectDecodedBundle(source),/invalid_binary/);
 assert.throws(()=>inspectDecodedBundle({...trusted,'zone.bin':new Uint8Array(8_000_001)}),/bundle_too_large/);
 assert.equal(inspectBundle(source,{retainDecoded:false}).decoded.size,0);
});
test('large-route JSON input preserves split UTF-8 and source text exactly; malformed UTF-8 fails closed',async()=>{
 const calls=[],expected=await validateDraft(draft),handler=createHandler({service:async(action,input)=>{calls.push({action,input});return action==='agent_status'?{status:'active'}:{ok:true};}});
 const response=await handler(streamedRequest(Buffer.from(JSON.stringify(draft))));assert.equal(response.status,200);assert.deepEqual(calls.map(call=>call.action),['agent_status','send_draft']);assert.deepEqual(ordinary(calls[1].input.files),draft.files);assert.deepEqual(calls[1].input.manifest,expected.manifest);assert.equal(calls[1].input.digest,expected.digest);assert.equal(calls[1].input.token_hash,await sha256(token));
 for(const bytes of [new Uint8Array([0xc3,0x28]),new Uint8Array([0xef,0xbf])]){calls.length=0;const failed=await handler(streamedRequest(bytes));assert.equal(failed.status,400);assert.equal((await failed.json()).code,'invalid_json');assert.deepEqual(calls.map(call=>call.action),['agent_status']);}
});
test('inactive/malformed status and upstream failure reject before reading any draft bytes',async()=>{
 for(const receipt of [{},null,{status:'pending'},{status:'revoked'},{active:true},new BridgeError('invalid_connection',403),new Error('private upstream failure')]){
  let reads=0;const actions=[];const body=new ReadableStream({pull(){reads++;}},{highWaterMark:0});
  const handler=createHandler({service:async action=>{actions.push(action);if(receipt instanceof Error)throw receipt;return receipt;}});
  const request=new Request(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body,duplex:'half'});
  const response=await handler(request);assert.notEqual(response.status,200);assert.equal(reads,0);assert.deepEqual(actions,['agent_status']);assert.ok(!JSON.stringify(await response.json()).includes('private upstream'));
 }
});
test('draft transport still counts original bytes and cancels above 70 MB before send_draft',async()=>{
 let chunks=0,cancelled=false;const actions=[];
 const handler=createHandler({service:async action=>{actions.push(action);return{status:'active'};}});
 const body=new ReadableStream({pull(controller){chunks++;controller.enqueue(new TextEncoder().encode(' '.repeat(1_000_000)));},cancel(){cancelled=true;}},{highWaterMark:0});
 const response=await handler(new Request(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body,duplex:'half'}));
 assert.equal(response.status,413);assert.equal((await response.json()).code,'request_too_large');assert.ok(chunks<=71);assert.equal(cancelled,true);assert.deepEqual(actions,['agent_status']);
});
test('real Edge send_draft adapter streams exact envelope and leaves small service JSON unchanged',async()=>{
 const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;let handler;const calls=[];
 globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://backend.example',SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_publishable_test"}',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_test"}'})[key]},serve:value=>handler=value};
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://backend.example/rest/v1/rpc/mcp_service');assert.equal(options.headers.apikey,'sb_secret_test');assert.equal(options.headers.Authorization,undefined);assert.equal(options.redirect,'error');
  const streamed=options.body instanceof ReadableStream,raw=streamed?await new Response(options.body).text():options.body,input=JSON.parse(raw);calls.push({streamed,raw,input});
  return Response.json(input.p_action==='agent_status'?{status:'active'}:{ok:true});
 };
 try{
  await import('../../supabase/functions/slop-mcp/index.ts?bounded-json-adapter-test');
  const response=await handler(streamedRequest(Buffer.from(JSON.stringify(draft)),{chunk:7}));assert.equal(response.status,200);
  const expected=await validateDraft(draft);assert.equal(calls.length,2);assert.equal(calls[0].streamed,false);assert.equal(calls[1].streamed,true);assert.equal(calls[1].raw,JSON.stringify({p_action:'send_draft',p:{...expected,token_hash:await sha256(token)}}));
 }finally{globalThis.Deno=originalDeno;globalThis.fetch=originalFetch;}
});
test('real phone claim adapter reads large source as a bounded stream, never Response.json',async()=>{
 const validated=await validateDraft(draft),slug='mcp-'+'a'.repeat(32),claimed={...validated,submission_id:id,owner_id:id,slug,lease:id,status:'validating',game_id:id,ready_at:'2026-01-01T00:00:00Z'};
 const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;let handler,claims=0,finishes=0;
 globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://backend.example',SUPABASE_ANON_KEY:'test-anon',SUPABASE_SERVICE_ROLE_KEY:'test-service'})[key]},serve:value=>handler=value};
 globalThis.fetch=async(url,options)=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/user')return Response.json({id,is_anonymous:false});
  if(path==='/rest/v1/rpc/mcp_phone'){
   assert.equal(options.headers.Authorization,'Bearer owner.jwt');
   if(JSON.parse(options.body).p_action==='claim_draft'){claims++;const response=new Response(jsonBodyStream(claimed),{headers:{'content-type':'application/json'}});response.json=()=>{throw Error('whole-response JSON forbidden');};return response;}
   return Response.json({ok:true});
  }
  if(path==='/rest/v1/games')return Response.json([{id,owner_id:id,slug,status:'draft'}]);
  if(path==='/functions/v1/game-bundle')return Response.json({ok:true,url:`https://api.slop.game/functions/v1/game-bundle/preview/${'c'.repeat(64)}/${slug}/1.0.0/index.html`,expires_at:new Date(Date.now()+900000).toISOString()});
  if(path==='/rest/v1/rpc/mcp_service'){assert.equal(JSON.parse(options.body).p_action,'finish_draft');finishes++;return Response.json({status:'ready',owner_id:id,game_id:id});}
  throw Error('Unexpected route '+path);
 };
 try{
  await import('../../supabase/functions/slop-mcp/index.ts?bounded-phone-response-test');
  const response=await handler(new Request('https://backend.example/functions/v1/slop-mcp/drafts/confirm',{method:'POST',headers:{authorization:'Bearer owner.jwt','content-type':'application/json'},body:JSON.stringify({submission_id:id,expected_digest:validated.digest})}));
  assert.equal(response.status,200);assert.equal((await response.json()).status,'ready');assert.equal(claims,1);assert.equal(finishes,1);
 }finally{globalThis.Deno=originalDeno;globalThis.fetch=originalFetch;}
});
