import {discoveryBoundary} from './catalog-cursor.js';

const columns='id,slug,name,description,thumb,play_count,created_at,owner_id,status,media_delete_authorized,published_bundle_path,bundle_version,multiplayer_mode,multiplayer_protocol,multiplayer_contract,preview_width,preview_height,preview_url,preview_status,supported_platforms,preview_video:game_preview_videos(video_path,poster_path,width,height,duration_ms)';

export const availableMultiplayerGame=game=>game?.status==='published'&&game.media_delete_authorized===false&&game.multiplayer_protocol==='turns-v1'&&game.multiplayer_mode==='match';

// Filter before pagination: single-player and retired realtime games cannot
// crowd supported matches out of this catalog. Missing schema fails visibly.
export async function readMultiplayerPage({client,read,names,cursor=null,limit=24}){
 let query=client.from('games').select(columns)
  .eq('status','published').eq('media_delete_authorized',false)
  .eq('multiplayer_protocol','turns-v1').eq('multiplayer_mode','match');
 if(cursor)query=query.or(discoveryBoundary({...cursor,plays:0},'newest'));
 const rows=await read(query.order('created_at',{ascending:false}).order('slug',{ascending:false}).limit(limit+1));
 const page=rows.slice(0,limit),last=page.at(-1);
 return {games:await names(page.filter(availableMultiplayerGame)),next:rows.length>limit&&last?{slug:last.slug,created_at:last.created_at}:null};
}
