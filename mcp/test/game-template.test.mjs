import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {gameTemplate} from '../game-template.mjs';import {validateDraft} from '../../supabase/functions/slop-mcp/contract.mjs';
test('bundled template is a valid self-contained draft with real ready/score/finish/restart lifecycle',async()=>{
 const template=await gameTemplate();assert.equal(template.runtime,'creator-v1');assert.match(template.files['index.html'],/name="slop-runtime" content="creator-v1"/);assert.match(template.files['slop.js'],/g\.Slop = Object\.freeze/);
 await validateDraft({project_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',revision:1,name:'Template',files:template.files});
 let tick,restart,painted=false,ready=0,finished=[];const scores=[];const input={pressed:false};const ctx=new Proxy({fillRect(){painted=true;}},{get:(obj,key)=>obj[key]||(()=>{})});
 vm.runInNewContext(template.files['game.js'],{Math,Slop:{create:()=>({ctx}),input,onRestart:fn=>restart=fn,loop:fn=>tick=fn,ready:()=>{assert.ok(painted);ready++;},score:s=>scores.push(s),finished:s=>finished.push(s),haptic:()=>{}}});
 tick({time:0,width:360,height:640});assert.equal(ready,1);assert.deepEqual(finished,[]);
 input.pressed=true;for(let i=0;i<12;i++)tick({time:i,width:360,height:640});assert.equal(ready,1);assert.deepEqual(finished,[10]);assert.equal(scores.at(-1),10);
 restart();input.pressed=false;tick({time:0,width:360,height:640});assert.equal(scores.at(-1),0);
});
