import {supabase,result,asOwner} from './supabase.js';
import {discoveryBoundary} from './catalog-cursor.js';
import {publicGameNames} from './game-name-claims.js';
import {filterPlatform} from './game-platforms.js';
import {PUBLIC_PROFILE_COLUMNS} from './profile-banners.js';
import {prioritizePeople} from './people-order.js';
const columns='id,slug,name,description,thumb,play_count,created_at,owner_id,category,status,published_bundle_path,bundle_version,preview_width,preview_height,supported_platforms,profiles(username,avatar_url,slop_look)';
export async function loadGames({category='all',platform='all',search='',offset=0,owner}={}){
  let query=supabase.from('games').select(columns).eq('status','published').eq('media_delete_authorized',false).ilike('html','%slop.js%');
  if(category!=='all')query=query.eq('category',category);
  if(search.trim())query=query.ilike('name',`%${search.trim().replace(/[%_\\]/g,'').slice(0,80)}%`);
  if(owner)query=query.eq('owner_id',owner);
  query=filterPlatform(query,platform);
  return publicGameNames(await result(query.order('created_at',{ascending:false}).order('slug',{ascending:false}).range(offset,offset+23)));
}
export async function loadGame(name){
 const resolved=await result(supabase.rpc('resolve_public_game_name',{p_name:name}));
 if(!resolved?.slug)throw new Error('This game is not available.');
 const game=await result(supabase.from('games').select(columns).eq('slug',resolved.slug).eq('status','published').eq('media_delete_authorized',false).single());
 return {...game,public_name:resolved.name||null};
}
export const socialCounts=(ids)=>result(supabase.rpc('game_social_counts',{p_ids:ids}));
export const comments=(id,cursor)=>result(supabase.rpc('game_comment_page',{p_game_id:id,p_root_id:null,p_before_time:cursor?.created_at||null,p_before_id:cursor?.id||null,p_limit:20}));
export const postComment=(id,body,gifUrl=null)=>asOwner((owner,client)=>result(client.rpc('post_game_comment',{p_owner:owner,p_game_id:id,p_body:body.trim(),p_gif_url:gifUrl,p_parent_id:null})));
export const likeGame=(id,liked,legacyId)=>asOwner((owner,client)=>result(liked?client.from('game_likes').upsert({user_id:owner,game_id:id},{onConflict:'user_id,game_id'}):client.from('game_likes').delete().eq('user_id',owner).in('game_id',[...new Set([id,legacyId].filter(Boolean))])));
export const likedGames=()=>asOwner((owner,client)=>result(client.from('game_likes').select('game_id').eq('user_id',owner).limit(1000)));
export async function searchPeople(term=''){
 const clean=term.replace(/[%_\\]/g,'').slice(0,40),pageSize=500,rows=[];
 for(let offset=0;;offset+=pageSize){
  let query=supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).order('id').range(offset,offset+pageSize-1);
  if(clean)query=query.ilike('username',`%${clean}%`);
  const page=await result(query);rows.push(...page);if(page.length<pageSize)break;
 }
 return prioritizePeople(rows);
}
export const followPerson=(id,follow)=>asOwner((owner,client)=>result(follow?client.from('follows').upsert({follower_id:owner,following_id:id},{onConflict:'follower_id,following_id'}):client.from('follows').delete().eq('follower_id',owner).eq('following_id',id)));

// Stable continuation through the real, public mobile catalog. Never turn a
// failed ranked cursor into an unrelated chronological cursor.
export async function loadDiscoveryPage({cursor=null,order='popular',platform='all',limit=12}={}){
 const metric=order==='popular'?'qualified_play_count':'created_at';
 let query=supabase.from('games').select(columns+',qualified_play_count,preview_url,preview_status')
  .eq('status','published').eq('media_delete_authorized',false).ilike('html','%slop.js%');
 query=filterPlatform(query,platform);
 if(cursor){
  query=query.or(discoveryBoundary(cursor,order));
 }
 if(order==='popular')query=query.order(metric,{ascending:false});
 const rows=await result(query.order('created_at',{ascending:false}).order('slug',{ascending:false}).limit(limit+1));
 const games=rows.slice(0,limit),last=games.at(-1);
 return {games:await publicGameNames(games),next:rows.length>limit&&last?{slug:last.slug,created_at:last.created_at,plays:Number(last.qualified_play_count)||0}:null};
}
export const popularGames=async(platform='all')=>{
 let query=supabase.from('games').select(columns+',qualified_play_count').eq('status','published').eq('media_delete_authorized',false).ilike('html','%slop.js%').gt('qualified_play_count',0);
 query=filterPlatform(query,platform);
 return publicGameNames(await result(query.order('qualified_play_count',{ascending:false}).order('slug').limit(8)));
};
