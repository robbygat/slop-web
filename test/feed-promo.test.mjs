import test from 'node:test';
import assert from 'node:assert/strict';
import {feedPromoAfter} from '../src/lib/feed-promo.js';
test('one inline app card follows each ten real games across paginated batches',()=>{
 const positions=length=>Array.from({length},(_,i)=>i).filter(feedPromoAfter);
 assert.deepEqual(positions(8),[]);assert.deepEqual(positions(16),[9]);assert.deepEqual(positions(24),[9,19]);assert.deepEqual(positions(32),[9,19,29]);
 for(const invalid of [-1,NaN,Infinity,9.1,'9'])assert.equal(feedPromoAfter(invalid),false);
});
