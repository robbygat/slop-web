import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gameTemplate} from '../game-template.mjs';
import {checkBundle} from '../bundle-check.mjs';
import {inspectBundle,multiplayerContract} from '../bundle-rules.mjs';
import {validateDraft} from '../../supabase/functions/slop-mcp/contract.mjs';
import {MCP_MULTIPLAYER_RUNTIME_SHA256,MCP_MULTIPLAYER_RUNTIME_BYTES,mcpRuntimeProblem} from '../runtime-policy.mjs';

test('turns template passes local and server admission with the exact pinned runtime',async()=>{
 const template=await gameTemplate({multiplayer:true});
 assert.equal(template.runtime,'multiplayer-v1');
 assert.deepEqual(await checkBundle(template.files,{target_platform:'cross-platform'}),{ok:true,problems:[],warnings:[]});
 const result=await validateDraft({project_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',revision:1,name:'Turns',files:template.files});
 assert.equal(result.multiplayer.protocol,'turns-v1');assert.equal(result.persistent,false);
 assert.equal(mcpRuntimeProblem(result.manifest,template.files['index.html'],false,result.multiplayer),null);
 assert.equal(Buffer.byteLength(template.files['slop.js']),MCP_MULTIPLAYER_RUNTIME_BYTES);
 assert.equal(createHash('sha256').update(template.files['slop.js']).digest('hex'),MCP_MULTIPLAYER_RUNTIME_SHA256);
 const creator=await readFile(new URL('../runtime/creator-v1.js',import.meta.url),'utf8');
 assert.equal(template.files['slop.js'].startsWith(creator+'\n'),true);
});
test('turns cannot launder a changed runtime, a solo marker, async SDK or World capability',async()=>{
 const template=await gameTemplate({multiplayer:true});
 for(const html of [template.files['index.html'].replace('multiplayer-v1','creator-v1'),template.files['index.html'].replace('src="slop.js"','async src="slop.js"')])assert.equal((await checkBundle({...template.files,'index.html':html})).ok,false);
 assert.equal((await checkBundle({...template.files,'slop.js':template.files['slop.js']+'\n'})).ok,false);
 assert.throws(()=>inspectBundle({...template.files,'slop.spec.json':JSON.stringify({persistent:true,multiplayer:template.multiplayer})}),/persistent_multiplayer_conflict/);
 await assert.rejects(gameTemplate({multiplayer:true,persistent:true}),/separate game modes/);
});
test('bounded action contracts support numbers, integer values and enums only',()=>{
 const contract={protocol:'turns-v1',mode:'match',seats:2,max_turns:256,action_schema:{angle:{type:'number',min:10,max:80},cell:{type:'integer',min:0,max:8},weapon:{type:'enum',values:['shell','lob']}}};
 assert.deepEqual(multiplayerContract(contract),contract);
 assert.equal(multiplayerContract(undefined),null);
 assert.equal(multiplayerContract(false),null);
 for(const change of [{seats:4},{max_turns:257},{state:{}},{action_schema:{weapon:{type:'enum',values:['shell','shell']}}},{action_schema:{angle:{type:'number',min:90,max:10}}},{action_schema:{cell:{type:'integer',min:.5,max:8}}},{action_schema:{constructor:{type:'number',min:0,max:1}}}])assert.throws(()=>multiplayerContract({...contract,...change}),/invalid_multiplayer_contract/);
});
test('multiplayer sandbox still forbids authored networking and storage',async()=>{
 const template=await gameTemplate({multiplayer:true});
 const checked=await checkBundle({...template.files,'game.js':template.files['game.js']+'\nfetch("https://example.com"); localStorage.getItem("x");'});
 assert.equal(checked.ok,false);assert.equal(checked.problems.some(p=>p.includes('Network requests')),true);assert.equal(checked.problems.some(p=>p.includes('SecurityError')),true);
});
