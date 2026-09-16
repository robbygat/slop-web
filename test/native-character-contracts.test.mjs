import test from 'node:test';import assert from 'node:assert/strict';
import {nativeCharacterLook,nativeCharacterMessage,nativeCharacterReady,nativeCharacterRendered,nativeCharacterPerformance} from '../src/lib/native-character-contracts.js';
test('native painter receives bounded appearance only, never identity or authority',()=>{
 const look=nativeCharacterLook({body:'star',palette:'mint',finish:'clearGlass',designVersion:3,blush:false,token:'secret',user_id:'person',url:'https://evil.example',name:'Person',hat:'x'.repeat(41)});
 assert.equal(look.designVersion,7);assert.equal(look.finish,'clearGlass');assert.equal(look.hat,'none');assert.equal(look.blush,false);
 for(const key of ['token','user_id','url','name'])assert.equal(Object.hasOwn(look,key),false);
 const message=JSON.parse(nativeCharacterMessage(look,{paused:true,autoRotate:true,requestId:12}));assert.equal(message.requestId,12);assert.equal(message.paused,true);assert.equal(message.autoRotate,true);assert.ok(JSON.stringify(message).length<3000);
});
test('opaque frame handshakes require exact WindowProxy and current appearance paint acknowledgement',()=>{
 const frame={},event={source:frame,origin:'null',data:JSON.stringify({type:'slop.character.ready',version:1})};
 assert.equal(nativeCharacterReady(event,frame),true);assert.equal(nativeCharacterReady({...event,source:{}},frame),false);assert.equal(nativeCharacterReady({...event,origin:'https://slop.game'},frame),false);
 const painted={...event,data:JSON.stringify({type:'slop.character.rendered',version:1,requestId:4})};assert.equal(nativeCharacterRendered(painted,frame,4),true);assert.equal(nativeCharacterRendered(painted,frame,5),false);
 assert.equal(nativeCharacterPerformance({...event,data:JSON.stringify({type:'slop.character.performance',version:1,fps:60,frames:90})},frame).fps,60);
 assert.equal(nativeCharacterPerformance({...event,data:JSON.stringify({type:'slop.character.performance',version:1,fps:600,frames:90})},frame),null);
});
test('API authorization link parser keeps the same bounded challenge and rejects alternate hosts',async()=>{
 const {parsePairing}=await import('../src/lib/contracts.js');const id='11111111-1111-4111-8111-111111111111',code='a'.repeat(32),uri=`https://api.slop.game/functions/v1/slop-mcp/authorize#id=${id}&code=${code}`;
 assert.deepEqual(parsePairing(uri),{id,code});assert.equal(parsePairing(uri.replace('api.slop.game','evil.example')),null);assert.equal(parsePairing(uri+'&next=evil'),null);assert.equal(parsePairing(uri.replace('/authorize#','/authorize?next=evil#')),null);
});
