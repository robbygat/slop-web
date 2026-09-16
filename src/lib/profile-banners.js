import {SlopError} from './contracts.js';
// The exact mobile catalog and artwork. Ownership comes from the native RPC.
export const PROFILE_BANNERS=[
 {id:'banner-living-gel',name:'Slopwood Forest',art:'forest-habitat',included:true},
 {id:'banner-soft-orbit',name:'Cloud City',art:'cloud-city',included:true},
 {id:'banner-candy-horizon',name:'Canal City',art:'canal-city',included:true},
 {id:'banner-neon-arcade',name:'Neon Arcade',art:'neon-arcade',level:5},
 {id:'banner-cosmic-bloom',name:'Cosmic Bloom',art:'cosmic-bloom',level:35},
 {id:'banner-lava-flow',name:'Lava Flow',art:'lava-habitat',level:10},
];
export const profileBanner=id=>PROFILE_BANNERS.find(b=>b.id===id)||null;
export const bannerImage=banner=>`/assets/mobile/worlds/${banner.art}.webp`;
// Discovery and the opened profile must start with the same equipped backdrop.
export const PUBLIC_PROFILE_COLUMNS='id,username,display_name,avatar_url,bio,slop_look,profile_banner_id';
export function profileBackdrop(id){
 const banner=profileBanner(id||'banner-living-gel');
 return banner?bannerImage(banner):'/assets/illustrations/desert-dusk.webp';
}
const validIds=ids=>Array.isArray(ids)&&ids.length<=100&&ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=160);
export function parseBannerInventory(value){
 if(value?.authenticated!==true||!validIds(value.owned_ids)||typeof value.equipped_id!=='string'||!value.equipped_id.length||value.equipped_id.length>160)throw new SlopError('invalid_response');
 return {owned:new Set(value.owned_ids),equippedId:value.equipped_id};
}
export function parseBannerEquip(value,id){
 if(value?.ok!==true||value.banner_id!==id||value.equipped_id!==id||!validIds(value.owned_ids)||!value.owned_ids.includes(id))throw new SlopError('invalid_response',value?.code==='not_owned'?'This backdrop is not in your collection.':'Your backdrop could not be updated.');
 return {owned:new Set(value.owned_ids),equippedId:id};
}
