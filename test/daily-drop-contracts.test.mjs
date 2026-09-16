import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDailyDrop} from '../src/lib/daily-drop-contracts.js';

const owner='18a58158-24c9-497f-ad8b-e4606cd2210d';

test('accepts cosmetic and banner Daily Drop receipts',()=>{
 assert.deepEqual(parseDailyDrop({version:3,user_id:owner,ok:true,code:'claimed',owned:true,reward_id:'body-star',reward_kind:'slop_cosmetic',cosmetic_id:'body-star',banner_id:null,last_daily:'2026-09-17'},owner),{code:'claimed',itemId:'body-star',kind:'slop_cosmetic',claimed:true,lastDaily:'2026-09-17'});
 assert.equal(parseDailyDrop({version:3,user_id:owner,ok:false,code:'already_claimed',owned:true,reward_id:'banner-neon-arcade',reward_kind:'profile_banner',cosmetic_id:null,banner_id:'banner-neon-arcade',last_daily:'2026-09-17'},owner).kind,'profile_banner');
});

test('accepts a completed collection and rejects cross-account or malformed receipts',()=>{
 assert.equal(parseDailyDrop({version:3,user_id:owner,ok:false,code:'collection_complete',owned:false,reward_id:null,reward_kind:null,cosmetic_id:null,banner_id:null,last_daily:null},owner).itemId,null);
 assert.throws(()=>parseDailyDrop({version:3,user_id:'00000000-0000-4000-8000-000000000000',ok:true,code:'claimed',owned:true,reward_id:'body-star',reward_kind:'slop_cosmetic',cosmetic_id:'body-star',last_daily:'2026-09-17'},owner));
 assert.throws(()=>parseDailyDrop({version:3,user_id:owner,ok:true,code:'claimed',owned:true,reward_id:'body-star',reward_kind:'slop_cosmetic',cosmetic_id:'other',last_daily:'2026-09-17'},owner));
});
