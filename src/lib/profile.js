import {asOwner,ownRpc,result} from './supabase.js';
import {SlopError,SLUG,UUID} from './contracts.js';
import {parseBannerInventory,parseBannerEquip,profileBanner} from './profile-banners.js';
import {publicGameNames} from './game-name-claims.js';
export const loadProfileBanners=async()=>parseBannerInventory(await ownRpc('my_profile_banners'));
export async function equipProfileBanner(id){if(!profileBanner(id))throw new SlopError('invalid_response');return parseBannerEquip(await ownRpc('equip_profile_banner',{p_banner_id:id}),id);}
export const loadProfileStats=()=>asOwner(async(owner,client)=>{
 const [social,games]=await Promise.all([result(client.rpc('profile_follow_counts',{p_user_id:owner})),client.from('games').select('id',{count:'exact',head:true}).eq('owner_id',owner).eq('status','published').eq('media_delete_authorized',false).ilike('html','%slop.js%')]);
 if(games.error)throw new SlopError(games.error.code,games.error.message);
 if(social?.user_id!==owner||![social.followers,social.following,games.count].every(n=>Number.isSafeInteger(n)&&n>=0))throw new SlopError('invalid_response');
 return {games:games.count,followers:social.followers,following:social.following};
});
export const loadLikedShelf=(offset=0)=>asOwner(async(owner,client)=>{
 const likes=await result(client.from('game_likes').select('game_id,created_at').eq('user_id',owner).order('created_at',{ascending:false}).order('game_id',{ascending:false}).range(offset,offset+23));
 const keys=[...new Set(likes.map(l=>l.game_id))],slugs=keys.filter(id=>SLUG.test(id)),ids=keys.filter(id=>UUID.test(id));
 if(!keys.length)return {games:[],next:null};
 const columns='id,slug,name,description,thumb,play_count,created_at,owner_id,category,status,published_bundle_path,bundle_version,preview_width,preview_height,supported_platforms,profiles(username,avatar_url,slop_look)';
 const query=()=>client.from('games').select(columns).eq('status','published').eq('media_delete_authorized',false).ilike('html','%slop.js%');
 const rows=(await Promise.all([slugs.length?result(query().in('slug',slugs)):[],ids.length?result(query().in('id',ids)):[]])).flat();
 const byId=new Map(rows.map(game=>[game.id,game]));const games=[...byId.values()].sort((a,b)=>Math.min(...[a.id,a.slug].map(key=>keys.indexOf(key)).filter(i=>i>=0))-Math.min(...[b.id,b.slug].map(key=>keys.indexOf(key)).filter(i=>i>=0)));
 return {games:await publicGameNames(games),next:likes.length===24?offset+24:null};
});
