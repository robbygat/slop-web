import test from 'node:test';
import assert from 'node:assert/strict';
import {gameControlKey} from '../src/lib/player-focus.js';

const event=(key,extra={})=>({key,code:key,defaultPrevented:false,target:{closest:()=>false},...extra});
test('the active game owns Space and arrows without stealing text input or shortcuts',()=>{
 assert.equal(gameControlKey(event('Space')),'Space');assert.equal(gameControlKey(event('ArrowLeft')),'ArrowLeft');
 for(const extra of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{isComposing:true},{defaultPrevented:true},{target:{closest:()=>true}}])assert.equal(gameControlKey(event('Space',extra)),null);
 assert.equal(gameControlKey(event('Enter')),null);
});
