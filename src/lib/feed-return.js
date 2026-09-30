// Keep public discovery context in this tab; account data and auth never enter it.
export function createFeedReturnStore({now=Date.now,maxAgeMs=300000,maxGames=96}={}){
 let saved=null;
 return {
  read(){if(!saved||now()-saved.at>maxAgeMs){saved=null;return null;}return {...saved,games:[...saved.games]};},
  write({order,platform,games,active,next}){
   if(!['newest','popular'].includes(order)||!['all','mobile','desktop'].includes(platform)||!Array.isArray(games)||!games.length)return false;
   const index=games.findIndex(game=>game.id===active);if(index<0)return false;
   const start=games.length>maxGames?Math.max(0,Math.min(index-24,games.length-maxGames)):0;
   const window=games.slice(start,start+maxGames),last=window.at(-1),truncated=start+window.length<games.length;
   if(truncated&&(!last.slug||!last.created_at))return false;
   saved={order,platform,games:window,active,next:truncated?{slug:last.slug,created_at:last.created_at,plays:Number(last.qualified_play_count)||0}:next,at:now()};return true;
  },
 };
}
const feedReturn=createFeedReturnStore();
export const readFeedReturn=()=>feedReturn.read();
export const writeFeedReturn=context=>feedReturn.write(context);
