import test from 'node:test';
import assert from 'node:assert/strict';
import {gameTemplate} from '../game-template.mjs';
import {checkBundle} from '../bundle-check.mjs';
import {inspectBundle,gameType,assertGameType} from '../bundle-rules.mjs';
import {validateDraft} from '../../supabase/functions/slop-mcp/contract.mjs';
import {createHandler} from '../../supabase/functions/slop-mcp/handler.mjs';

const identity={project_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',revision:1,name:'Type proof'};
test('new templates require an explicit game type independent of screen target',async()=>{
 await assert.rejects(gameTemplate(),/game_type_required/);
 for(const value of [null,false,'solo','realtime','hotseat'])await assert.rejects(gameTemplate({game_type:value}),/invalid_game_type/);
 for(const game_type of ['single-player','multiplayer'])for(const target_platform of ['mobile','desktop','cross-platform']){
  const template=await gameTemplate({game_type,target_platform});
  assert.equal(template.game_type,game_type);assert.equal(JSON.parse(template.files['slop.spec.json']).game_type,game_type);
  assert.equal((await checkBundle(template.files,{game_type,target_platform})).ok,true);
 }
 await assert.rejects(gameTemplate({game_type:'multiplayer',persistent:true}),/separate game modes/);
 await assert.rejects(gameTemplate({game_type:'single-player',multiplayer:true}),/game_type_mismatch/);
});
test('caller expectation, source type and multiplayer capability must agree locally and at admission',async()=>{
 for(const game_type of ['single-player','multiplayer']){
  const other=game_type==='single-player'?'multiplayer':'single-player',template=await gameTemplate({game_type});
  assert.equal((await checkBundle(template.files,{game_type:other})).problems.includes('game_type_mismatch'),true);
  await assert.rejects(validateDraft({...identity,game_type:other,files:template.files}),/game_type_mismatch/);
  const admitted=await validateDraft({...identity,game_type,files:template.files});assert.equal(admitted.game_type,game_type);assert.equal(admitted.declared_game_type,game_type);
  const spec=JSON.parse(template.files['slop.spec.json']);
  assert.throws(()=>inspectBundle({...template.files,'slop.spec.json':JSON.stringify({...spec,game_type:other})}),/game_type_mismatch/);
  assert.throws(()=>inspectBundle({...template.files,'slop.spec.json':JSON.stringify({...spec,game_type:'realtime'})}),/invalid_game_type/);
 }
});
test('explicit multiplayer cannot be a solo-only entrypoint or use a solo runtime',async()=>{
 const multiplayer=await gameTemplate({game_type:'multiplayer'}),solo=await gameTemplate({game_type:'single-player'});
 for(const code of [solo.files['game.js'],solo.files['game.js']+'\n// Slop.match.subscribe(); Slop.match.submit();',solo.files['game.js']+'\nconst label="Slop.match.subscribe(); Slop.match.submit();";']){
  assert.equal((await checkBundle({...multiplayer.files,'game.js':code},{game_type:'multiplayer'})).problems.includes('multiplayer_match_required'),true);
 }
 assert.equal((await checkBundle({...multiplayer.files,'slop.js':solo.files['slop.js']},{game_type:'multiplayer'})).ok,false);
 const legacySpec=JSON.parse(multiplayer.files['slop.spec.json']);delete legacySpec.game_type;
 const stripped={...multiplayer.files,'slop.spec.json':JSON.stringify(legacySpec),'game.js':solo.files['game.js']};
 assert.equal((await checkBundle(stripped,{game_type:'multiplayer'})).problems.includes('multiplayer_match_required'),true);
 await assert.rejects(validateDraft({...identity,revision:2,game_type:'multiplayer',files:stripped}),/multiplayer_match_required/);
 assert.equal((await checkBundle({...solo.files,'game.js':solo.files['game.js']+'\nSlop.match.snapshot();'},{game_type:'single-player'})).problems.includes('multiplayer_contract_required'),true);
});
test('legacy untyped projects infer their existing type without modifying source or retry digest',async()=>{
 for(const game_type of ['single-player','multiplayer']){
  const template=await gameTemplate({game_type}),spec=JSON.parse(template.files['slop.spec.json']);delete spec.game_type;
  const files={...template.files,'slop.spec.json':JSON.stringify(spec)},original=JSON.stringify(files),checked=inspectBundle(files);
  assert.equal(checked.game_type,game_type);assert.equal(checked.declared_game_type,null);assert.equal(assertGameType(checked,game_type),game_type);
  assert.equal((await checkBundle(files,{game_type})).ok,true);assert.equal(JSON.stringify(checked.files),original);
  if(game_type==='multiplayer'){
   const aliased={...files,'game.js':"(function(g){const api=g.Slop.match;"+files['game.js'].replaceAll('Slop.match','api')+"})(globalThis);"};
   assert.equal((await checkBundle(aliased,{game_type})).ok,true,'existing global-wrapper SDK aliases retain multiplayer integration');
  }
  const old=await validateDraft({...identity,files}),explicit=await validateDraft({...identity,game_type,files});
  assert.equal(old.digest,explicit.digest);assert.equal(old.request_digest,explicit.request_digest);
  assert.throws(()=>assertGameType(checked,game_type,{requireDeclaration:true}),/game_type_declaration_required/);
 }
 assert.equal(gameType(undefined,{optional:true}),null);assert.throws(()=>gameType(undefined),/game_type_required/);
});
test('publish forwards the expected type to authority and rejects unknown types before enqueue',async()=>{
 const calls=[],handler=createHandler({service:async(action,input)=>{calls.push({action,input});return {ok:true};}});
 const send=game_type=>handler(new Request('https://api.slop.game/functions/v1/slop-mcp/agent/publish',{method:'POST',headers:{authorization:'Bearer slop_mcp_'+'a'.repeat(64),'content-type':'application/json'},body:JSON.stringify({submission_id:identity.project_id,...(game_type===undefined?{}:{game_type})})}));
 for(const game_type of ['single-player','multiplayer']){
  const response=await send(game_type);assert.equal(response.status,200);assert.equal(calls.at(-1).action,'request_publish');assert.equal(calls.at(-1).input.game_type,game_type);
 }
 const count=calls.length,response=await send('realtime');assert.equal(response.status,400);assert.equal((await response.json()).code,'invalid_game_type');assert.equal(calls.length,count);
 assert.equal((await send(undefined)).status,200);assert.equal(Object.hasOwn(calls.at(-1).input,'game_type'),false,'legacy existing projects remain the database authority’s decision');
});
