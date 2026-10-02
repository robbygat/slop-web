import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gameTemplate} from '../game-template.mjs';
import {checkBundle} from '../bundle-check.mjs';
import {bundleIdentity} from '../../src/lib/bundle-contracts.js';
import {mcpRuntimeProblem, MCP_RUNTIME_ERROR} from '../../src/lib/mcp-runtime.js';
import {validateDraft} from '../../supabase/functions/slop-mcp/contract.mjs';

const draft=files=>({project_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',revision:1,name:'World',files});
const script='<script src="slop.js"></script>';
test('packaged checker and server use the exact same runtime policy bytes',async()=>{
 assert.equal(await readFile(new URL('../runtime-policy.mjs',import.meta.url),'utf8'),
  await readFile(new URL('../../supabase/functions/slop-mcp/runtime-policy.mjs',import.meta.url),'utf8'));
});
const changes=[
 ['async SDK',html=>html.replace(script,'<script async src="slop.js"></script>')],
 ['deferred SDK',html=>html.replace(script,'<script src="slop.js" defer></script>')],
 ['module SDK',html=>html.replace(script,'<script type="module" src="slop.js"></script>')],
 ['nomodule SDK',html=>html.replace(script,'<script nomodule src="slop.js"></script>')],
 ['game before SDK',html=>html.replace(script,'').replace('<script src="game.js"></script>','<script src="game.js"></script>'+script)],
 ['inline game before SDK',html=>html.replace(script,'<script>window.gameStarted=true;</script>'+script)],
 ['duplicate SDK',html=>html.replace(script,script+script)],
];
for(const [name,change] of changes){
 test(`persistent runtime rejects ${name} at all three admission surfaces`,async()=>{
  const {files}=await gameTemplate({persistent:true});
  files['index.html']=change(files['index.html']);
  const {manifest}=await bundleIdentity(files);
  assert.equal(mcpRuntimeProblem(manifest,files['index.html'],{persistent:true}),MCP_RUNTIME_ERROR,'web publication');
  assert.equal((await checkBundle(files)).ok,false,'packaged checker');
  await assert.rejects(validateDraft(draft(files)),error=>error.code==='runtime_invalid','server draft');
 });
}
test('persistent synchronous SDK accepts inert examples without treating them as boot code',async()=>{
 const {files}=await gameTemplate({persistent:true});
 files['index.html']=files['index.html'].replace(script,
  '<template><template></template><script src="missing.js"></script></template><script type="application/json">{"example":"<script>"}</script><script src=slop.js></script>');
 const {manifest}=await bundleIdentity(files);
 assert.equal(mcpRuntimeProblem(manifest,files['index.html'],{persistent:true}),null);
 assert.equal((await checkBundle(files)).ok,true);
 assert.equal((await validateDraft(draft(files))).persistent,true);
});
test('Arcade deferred SDK validation remains unchanged at all three surfaces',async()=>{
 const {files}=await gameTemplate();
 files['index.html']=files['index.html'].replace(script,'<script defer src="slop.js"></script>');
 const {manifest}=await bundleIdentity(files);
 assert.equal(mcpRuntimeProblem(manifest,files['index.html']),null);
 assert.equal((await checkBundle(files)).ok,true);
 assert.equal((await validateDraft(draft(files))).persistent,false);
});
