import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRestartGate} from '../src/lib/player-restart.js';
import {acceptPlayerEvent} from '../src/lib/player-contracts.js';
const nonce='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
function setup(){
 let serial=0,accepted=0,fallbacks=0;const timers=new Map(),frame={};
 const gate=createRestartGate({requestId:()=>serial++?other:nonce,schedule:fn=>{const id=Symbol();timers.set(id,fn);return id;},cancelTimer:id=>timers.delete(id)});
 const begin=()=>gate.begin({frame,onHandled:()=>accepted++,onFallback:()=>fallbacks++});
 return {gate,frame,timers,begin,counts:()=>({accepted,fallbacks})};
}
test('restart acceptance requires the current iframe, exact nonce and boolean acknowledgment',()=>{
 const s=setup();assert.equal(s.begin(),nonce);assert.equal(s.begin(),null);
 for(const [source,event] of [[{}, {type:'restart-ack',request:nonce,handled:true}],[s.frame,{type:'restart-ack',request:other,handled:true}],[s.frame,{type:'restart-ack',request:nonce,handled:'true'}],[s.frame,{type:'restart-ack',request:nonce}]])assert.equal(s.gate.receive(source,event),false);
 assert.deepEqual(s.counts(),{accepted:0,fallbacks:0});
 assert.equal(s.gate.receive(s.frame,{type:'restart-ack',request:nonce,handled:true}),true);
 assert.deepEqual(s.counts(),{accepted:1,fallbacks:0});assert.equal(s.timers.size,0);
 assert.equal(s.gate.receive(s.frame,{type:'restart-ack',request:nonce,handled:true}),false);
 s.begin();assert.equal(s.gate.receive(s.frame,{type:'restart-ack',request:nonce,handled:true}),false);s.gate.cancel();
});
test('unhandled games and timeouts remount once without accepting a new score run',()=>{
 const s=setup();s.begin();assert.equal(s.gate.receive(s.frame,{type:'restart-ack',request:nonce,handled:false}),true);
 assert.deepEqual(s.counts(),{accepted:0,fallbacks:1});s.begin();const expire=[...s.timers.values()][0];expire();expire();
 assert.deepEqual(s.counts(),{accepted:0,fallbacks:2});assert.equal(s.gate.pending,false);
});
test('a game error falls back, while route cleanup cancels pending timers and late acknowledgments',()=>{
 const s=setup();s.begin();assert.equal(s.gate.fail({}),false);assert.equal(s.gate.fail(s.frame),true);assert.deepEqual(s.counts(),{accepted:0,fallbacks:1});
 s.begin();const late=[...s.timers.values()][0];s.gate.cancel();late();assert.equal(s.gate.receive(s.frame,{type:'restart-ack',request:other,handled:true}),false);assert.deepEqual(s.counts(),{accepted:0,fallbacks:1});
});
test('outer player relay validation rejects forged sources and malformed restart events',()=>{
 const frame={};const data=JSON.stringify({type:'restart-ack',request:nonce,handled:true});
 assert.equal(acceptPlayerEvent({},frame,data),null);assert.equal(acceptPlayerEvent(frame,frame,JSON.stringify({type:'restart-ack',request:'old',handled:true})),null);
 assert.equal(acceptPlayerEvent(frame,frame,JSON.stringify({type:'restart-ack',request:nonce,handled:1})),null);
 assert.equal(acceptPlayerEvent(frame,frame,data).handled,true);
});
test('the shipped canonical Slop.js confirms handled resets and tags reset scores with the request',async()=>{
 const messages=[],window={parent:{postMessage:raw=>messages.push(JSON.parse(raw))},addEventListener(){}};
 runInNewContext(await readFile(new URL('../mcp/runtime/creator-v1.js',import.meta.url),'utf8'),{window,document:{addEventListener(){}}});
 const s=setup();const request=s.begin();window.Slop.onRestart(()=>window.Slop.score(0));window.__slopReceive(JSON.stringify({type:'restart',request}));
 assert.deepEqual(messages,[{type:'score',value:0,request},{type:'restart-ack',request,handled:true}]);
 const ack=acceptPlayerEvent(s.frame,s.frame,JSON.stringify(messages[1]));assert.equal(s.gate.receive(s.frame,ack),true);assert.deepEqual(s.counts(),{accepted:1,fallbacks:0});
});
test('the canonical runtime reports missing and failed restart callbacks as unhandled',async()=>{
 for(const failure of [false,true]){
  const messages=[],window={parent:{postMessage:raw=>messages.push(JSON.parse(raw))},addEventListener(){}};
  runInNewContext(await readFile(new URL('../mcp/runtime/creator-v1.js',import.meta.url),'utf8'),{window,document:{addEventListener(){}}});
  if(failure)window.Slop.onRestart(()=>{throw Error('reset failed');});
  window.__slopReceive({type:'restart',request:nonce});assert.equal(messages.at(-1).handled,false);assert.equal(messages.at(-1).request,nonce);
 }
});
