import {asOwner,supabase,result} from './supabase.js';
import {SLUG,SlopError} from './contracts.js';
import {validGameName} from './game-links.js';
function receipt(value,owner,slug){if(value===null)return null;if(value?.owner_id!==owner||value.game_slug!==slug||!validGameName(value.name)||value.url!==`https://slop.game/${value.name}`)throw new SlopError('invalid_response');return value;}
export const claimGameName=(slug,name)=>asOwner(async(owner,client)=>{if(!SLUG.test(slug)||!validGameName(name))throw new Error('Use 3–50 lowercase letters, numbers and single hyphens.');return receipt(await result(client.rpc('claim_game_url',{p_owner:owner,p_game_slug:slug,p_name:name})),owner,slug);});
export const myGameName=slug=>asOwner(async(owner,client)=>receipt(await result(client.rpc('my_game_url',{p_owner:owner,p_game_slug:slug})),owner,slug));
export async function publicGameNames(games){
 if(!games?.length)return games;
 try{const rows=await result(supabase.rpc('game_public_names',{p_game_slugs:games.map(g=>g.slug)}));const names=new Map((Array.isArray(rows)?rows:[]).filter(r=>SLUG.test(r.game_slug)&&validGameName(r.name)).map(r=>[r.game_slug,r.name]));return games.map(g=>({...g,public_name:names.get(g.slug)||null}));}
 catch{return games;} // The immutable original slug remains a valid share URL.
}
