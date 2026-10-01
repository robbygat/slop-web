import test from 'node:test';
import assert from 'node:assert/strict';
import {FEED_TITLE_ENTRANCES,nextFeedTitleEntrance} from '../src/lib/feed-title-motion.js';

test('every new game entry rotates title motion without adjacent repeats, including return visits',()=>{
 let state=null,previous=null;
 const variants=new Set();
 for(const [entry,gameId] of ['first','second','first','third','second','third','first','second'].entries()){
  state=nextFeedTitleEntrance(state,gameId);
  assert.equal(state.gameId,gameId);assert.equal(state.entry,entry);
  assert.ok(FEED_TITLE_ENTRANCES.includes(state.variant));
  assert.notEqual(state.variant,previous);previous=state.variant;variants.add(state.variant);
 }
 assert.equal(variants.size,4);
});

test('same-game updates and transient loading gaps preserve the existing title entrance',()=>{
 assert.equal(nextFeedTitleEntrance(null,null),null);
 const first=nextFeedTitleEntrance(null,'first');
 for(const gameId of ['first',null,undefined,'',false])assert.equal(nextFeedTitleEntrance(first,gameId),first);
 const second=nextFeedTitleEntrance(first,'second');
 assert.equal(second.entry,1);assert.notEqual(second.variant,first.variant);
 assert.equal(nextFeedTitleEntrance(second,'second'),second);
});

test('advancing the title preserves prior snapshots and changes only the new entrance',()=>{
 const first=Object.freeze(nextFeedTitleEntrance(null,'first'));
 const second=nextFeedTitleEntrance(first,'second');
 assert.notEqual(first,second);assert.equal(first.gameId,'first');assert.equal(first.entry,0);
 assert.equal(second.gameId,'second');assert.equal(second.entry,1);
});
