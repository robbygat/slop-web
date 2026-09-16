export const BUILD_IDEA_KEY='slop.build-idea.v1';
export const MAX_GAME_IDEA=10000;
const TTL=24*60*60*1000;
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const browserStorage=()=>{try{return globalThis.sessionStorage;}catch{return null;}};

export function parseBuildIdea(raw,{ownerId=null,id=null,now=Date.now()}={}){
 try{
  const value=JSON.parse(raw);
  if(value?.version!==1||!idPattern.test(value.id)||typeof value.prompt!=='string'||value.prompt.length>MAX_GAME_IDEA)return null;
  if(!Number.isFinite(value.updatedAt)||value.updatedAt>now+60000||now-value.updatedAt>TTL)return null;
  if(value.ownerId!==null&&(typeof value.ownerId!=='string'||value.ownerId!==ownerId))return null;
  if(id&&value.id!==id)return null;
  return {version:1,id:value.id,prompt:value.prompt,ownerId:value.ownerId,updatedAt:value.updatedAt,awaitingAuth:value.awaitingAuth===true,remixId:idPattern.test(value.remixId||'')?value.remixId:null};
 }catch{return null;}
}
export function readBuildIdea({storage=browserStorage(),...options}={}){
 try{return parseBuildIdea(storage?.getItem(BUILD_IDEA_KEY),options);}catch{return null;}
}
export function saveBuildIdea(prompt,{ownerId=null,id=crypto.randomUUID(),remixId=null,awaitingAuth=false,storage=browserStorage(),now=Date.now()}={}){
 if(typeof prompt!=='string'||prompt.length>MAX_GAME_IDEA||!idPattern.test(id))return null;
 const value={version:1,id,prompt,ownerId,updatedAt:now,awaitingAuth,remixId};
 try{if(!storage)return null;storage.setItem(BUILD_IDEA_KEY,JSON.stringify(value));return value;}catch{return null;}
}
export function clearBuildIdea({ownerId=null,id,storage=browserStorage()}={}){
 if(!id||!readBuildIdea({ownerId,id,storage}))return;
 try{storage.removeItem(BUILD_IDEA_KEY);}catch{}
}
export function buildIdeaRoute(idea){return '/build?idea='+encodeURIComponent(idea.id)+(idea.remixId?'&remix='+encodeURIComponent(idea.remixId):'');}
// The auth callback may use this after verifying its real owner. Pairing takes
// priority there. Returning an idea only opens the editor; it never starts a run.
export function pendingBuildRoute(raw,ownerId,now=Date.now()){
 const idea=parseBuildIdea(raw,{ownerId,now});
 return idea?.awaitingAuth&&idea.prompt.trim()?buildIdeaRoute(idea):null;
}
