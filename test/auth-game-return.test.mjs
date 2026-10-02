import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_AUTH_RETURN_KEY,gameAuthReturnRoute,clearGameAuthReturn,saveGameAuthReturn,consumeGameAuthReturn} from '../src/lib/auth-game-return.js';
import {pendingAuthReturn} from '../src/lib/session-contracts.js';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const now=1_000_000,route='/home?game=neon-drone-arena';

test('game return only creates local deep links from a valid game slug',()=>{
 assert.equal(gameAuthReturnRoute('neon-drone-arena'),route);
 assert.equal(gameAuthReturnRoute('Legacy_Game-1'),'/home?game=Legacy_Game-1');
 for(const slug of [null,undefined,{},'', '../settings','//evil.test','https://evil.test','game&redirect=evil','game#token','x'.repeat(161)])assert.equal(gameAuthReturnRoute(slug),null);
});

test('OAuth return stores only a short-lived route and consumes it once',()=>{
 const storage=memory();
 assert.equal(saveGameAuthReturn(route,{storage,now}),true);
 assert.deepEqual(JSON.parse(storage.getItem(GAME_AUTH_RETURN_KEY)),{version:1,route,at:now});
 assert.equal(consumeGameAuthReturn({storage,now:now+500}),route);
 assert.equal(storage.getItem(GAME_AUTH_RETURN_KEY),null);
 assert.equal(consumeGameAuthReturn({storage,now:now+500}),null);
});

test('expired and future-dated game returns are rejected and removed',()=>{
 for(const at of [now-600_001,now+1]){
  const storage=memory();saveGameAuthReturn(route,{storage,now:at});
  assert.equal(consumeGameAuthReturn({storage,now}),null);
  assert.equal(storage.getItem(GAME_AUTH_RETURN_KEY),null);
 }
 const storage=memory();saveGameAuthReturn(route,{storage,now:now-600_000});assert.equal(consumeGameAuthReturn({storage,now}),route);
});

test('malformed and external pending routes can never redirect the browser',()=>{
 for(const raw of ['invalid','null',JSON.stringify({version:2,route,at:now}),JSON.stringify({version:1,route,at:'1000000'}),...['https://evil.test','//evil.test','/settings','/home?game=ok&next=evil','/home?game=ok#token'].map(route=>JSON.stringify({version:1,route,at:now}))]){
  const storage=memory();storage.setItem(GAME_AUTH_RETURN_KEY,raw);
  assert.equal(consumeGameAuthReturn({storage,now}),null);
  assert.equal(storage.getItem(GAME_AUTH_RETURN_KEY),null);
 }
});

test('existing pairing and build callbacks retain priority and consume game intent',()=>{
 const id='11111111-1111-4111-8111-111111111111',ownerId='22222222-2222-4222-8222-222222222222';
 const idea=JSON.stringify({version:1,id,prompt:'A frog jumps between stars',ownerId:null,updatedAt:now,awaitingAuth:true});
 const pairing=JSON.stringify({id,code:'a'.repeat(32),expires:now+60_000});
 for(const [pair,expected] of [[pairing,'/connect'],[null,'/build?idea='+id]]){
  const storage=memory();saveGameAuthReturn(route,{storage,now});
  const preferredRoute=pendingAuthReturn({pairing:pair,idea,ownerId,now});
  assert.equal(consumeGameAuthReturn({preferredRoute,storage,now}),expected);
  assert.equal(consumeGameAuthReturn({storage,now}),null);
 }
});

test('ordinary or cancelled sign-in clears any earlier game intent',()=>{
 const storage=memory();saveGameAuthReturn(route,{storage,now});
 clearGameAuthReturn({storage});assert.equal(consumeGameAuthReturn({storage,now}),null);
 saveGameAuthReturn(route,{storage,now});
 assert.equal(saveGameAuthReturn(null,{storage,now}),false);
 assert.equal(consumeGameAuthReturn({storage,now}),null);
});

test('blocked storage cannot prevent sign-in or a pairing return',()=>{
 const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.equal(saveGameAuthReturn(route,{storage,now}),false);
 assert.doesNotThrow(()=>clearGameAuthReturn({storage}));
 assert.equal(consumeGameAuthReturn({storage,now}),null);
 assert.equal(consumeGameAuthReturn({preferredRoute:'/connect',storage,now}),'/connect');
 const cannotRemove=memory();saveGameAuthReturn(route,{storage:cannotRemove,now});cannotRemove.removeItem=()=>{throw Error('blocked');};
 assert.equal(consumeGameAuthReturn({storage:cannotRemove,now}),null);
});
