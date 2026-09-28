const contextKey=context=>context?.gameId&&context?.slug
 ?JSON.stringify([context.gameId,context.slug,context.ownerId??null,context.sessionEpoch??null]):null;
const accountKey=context=>JSON.stringify([context?.ownerId??null,context?.sessionEpoch??null]);

// Natural navigation/resume triggers share one read. A confirmed score save
// supersedes any pre-save read, while a failed read is retriable, not cached as
// an empty leaderboard. There is no polling or render-driven request loop.
export function createFeedCrownSync({load,getContext,onHolder,now=Date.now,freshMs=30000,retryMs=3000}) {
 const entries=new Map();let alive=true,activeKey=null,account=null,generation=0;
 function refresh({force=false}={}) {
  if(!alive)return Promise.resolve();
  const context=getContext(),key=contextKey(context),owner=accountKey(context);
  if(key!==activeKey){activeKey=key;generation++;}
  if(owner!==account){account=owner;entries.clear();}
  if(!key)return Promise.resolve();
  const gameKey=JSON.stringify([context.gameId,context.slug]);
  let entry=entries.get(gameKey);
  if(!entry){entry={readAt:null,failedAt:null,pending:null};entries.set(gameKey,entry);if(entries.size>64)entries.delete(entries.keys().next().value);}
  if(!force){
   if(entry.pending?.generation===generation)return entry.pending.promise;
   if(entry.readAt!==null&&now()-entry.readAt<freshMs)return Promise.resolve();
   if(entry.failedAt!==null&&now()-entry.failedAt<retryMs)return Promise.resolve();
  }
  if(force)entry.readAt=null;
  const attempt={generation,promise:null};entry.pending=attempt;
  const current=()=>alive&&attempt.generation===generation&&entry.pending===attempt
   &&contextKey(getContext())===key;
  attempt.promise=Promise.resolve().then(()=>load(context.slug)).then(holder=>{
   if(!current())return;
   entry.readAt=now();entry.failedAt=null;onHolder(context.slug,holder);
  },()=>{if(current())entry.failedAt=now();}).finally(()=>{if(entry.pending===attempt)entry.pending=null;});
  return attempt.promise;
 }
 return {refresh,dispose(){alive=false;generation++;entries.clear();}};
}
