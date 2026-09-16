import test from 'node:test';
import assert from 'node:assert/strict';
import {coinSnapshot,dailyCoinReceipt} from '../src/lib/coin-contracts.js';

test('daily claim uses absolute server balance and supports a replay without adding coins twice',()=>{
 const receipt={claimed:true,already_claimed:false,reward:300,balance:430,next_claim_at:'2026-09-18T00:00:00Z'};
 const initial=dailyCoinReceipt(receipt);
 assert.equal(initial.balance,430);
 assert.equal(initial.daily_claim_available,false);
 assert.deepEqual(dailyCoinReceipt({...receipt,claimed:false,already_claimed:true}),initial);
});
test('malformed or contradictory coin receipts cannot update a displayed balance',()=>{
 for(const data of [null,{balance:-1,daily_claim_available:true},{balance:'300',daily_claim_available:true},{balance:300}])assert.throws(()=>coinSnapshot(data));
 const receipt={claimed:true,already_claimed:false,reward:300,balance:430,next_claim_at:'2026-09-18T00:00:00Z'};
 for(const patch of [{claimed:false},{already_claimed:true},{reward:0},{balance:-1},{balance:1.2},{next_claim_at:'bad'}])assert.throws(()=>dailyCoinReceipt({...receipt,...patch}));
});
