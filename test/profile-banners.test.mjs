import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {PROFILE_BANNERS,profileBanner,bannerImage,parseBannerInventory,parseBannerEquip} from '../src/lib/profile-banners.js';
test('the six native backgrounds use real art and leave future equipped IDs unchanged',async()=>{
 assert.equal(PROFILE_BANNERS.length,6);assert.equal(PROFILE_BANNERS.filter(b=>b.included).length,3);
 assert.equal(profileBanner('banner-living-gel').art,'forest-habitat');assert.equal(profileBanner('unknown-background'),null);
 for(const b of PROFILE_BANNERS)await access(new URL(`../public${bannerImage(b)}`,import.meta.url));
 const inventory=parseBannerInventory({authenticated:true,owned_ids:['future-background'],equipped_id:'future-background'});
 assert.equal(inventory.equippedId,'future-background');assert.equal(inventory.owned.has('future-background'),true);
 assert.throws(()=>parseBannerInventory({authenticated:false,owned_ids:[],equipped_id:'banner-living-gel'}));
});
test('equipping requires a successful exact background receipt and actual inventory ownership',()=>{
 const id='banner-soft-orbit';const receipt={ok:true,banner_id:id,equipped_id:id,owned_ids:[id]};
 assert.equal(parseBannerEquip(receipt,id).equippedId,id);
 for(const altered of [{ok:false},{banner_id:'banner-living-gel'},{equipped_id:'banner-living-gel'},{owned_ids:[]}])assert.throws(()=>parseBannerEquip({...receipt,...altered},id));
});
