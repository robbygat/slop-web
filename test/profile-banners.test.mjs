import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {PROFILE_BANNERS,profileBanner,bannerImage,parseBannerInventory,parseBannerEquip,PUBLIC_PROFILE_COLUMNS,profileBackdrop} from '../src/lib/profile-banners.js';
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
test('discovery carries equipped backdrop before detail refresh and native defaults are stable',()=>{
 const fields=PUBLIC_PROFILE_COLUMNS.split(',');
 const profile={id:'person',username:'rob',profile_banner_id:'banner-neon-arcade'};
 const discovery=Object.fromEntries(fields.map(key=>[key,profile[key]]));
 assert.equal(profileBackdrop(discovery.profile_banner_id),'/assets/mobile/worlds/neon-arcade.webp');
 assert.equal(profileBackdrop(discovery.profile_banner_id),profileBackdrop(profile.profile_banner_id));
 assert.equal(profileBackdrop(null),bannerImage(profileBanner('banner-living-gel')));
 assert.equal(profileBackdrop('https://untrusted.example/image'),'/assets/illustrations/desert-dusk.webp');
 for(const banner of PROFILE_BANNERS)assert.equal(profileBackdrop(banner.id),bannerImage(banner));
});
