import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFeedCrown} from '../src/lib/feed-crown.js';
const leader={user_id:'11111111-1111-4111-8111-111111111111',username:'champion',score:42,score_authority:'verified_receipt',avatar_url:'https://example.com/holder.webp',slop_look:{palette:'mint'}};
test('the feed shows only the explicit receipt-verified rank-one identity',()=>{
 assert.deepEqual(parseFeedCrown([leader]),{user_id:leader.user_id,username:'champion',score:42,avatar_url:leader.avatar_url,slop_look:leader.slop_look});
 assert.equal(parseFeedCrown([{...leader,score:'42',username:' @champion '}]).username,'champion');
});
test('empty, legacy, community and unknown authority never produce a crown holder',()=>{
 for(const rows of [[],null,{},[{...leader,score_authority:undefined}],[{...leader,score_authority:'community_unverified'}],[{...leader,score_authority:'unknown'}]])assert.equal(parseFeedCrown(rows),null);
});
test('invalid identities, zero or impossible scores cannot claim the feed crown',()=>{
 for(const invalid of [{user_id:null},{user_id:'creator'},{username:''},{username:'   '},{username:'x'.repeat(81)},{username:'bad\nname'},{score:0},{score:-1},{score:1.5},{score:100000000},{score:'bad'},{score:true},{score:[42]},{is_creator_fallback:true}])assert.equal(parseFeedCrown([{...leader,...invalid}]),null);
});
test('a lower verified row never replaces an unqualified first-place row',()=>{
 assert.equal(parseFeedCrown([{...leader,score_authority:'community_unverified'},leader]),null);
 assert.equal(parseFeedCrown([{...leader,user_id:null},leader]),null);
});
