import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth.jsx';
import {activeRun} from '../lib/persist-contracts.js';
import {claimDeviceSaves,createPersistentSession} from '../lib/persist-runtime.js';
import {persistentAssetCache as assetCache,sendPersistentAsset} from '../lib/persist-assets.js';

export function usePersistentPlayer({game,preview,url,generation,send,onRetire,onReload}){
 const auth=useAuth(),enabled=game?.persistent===true;
 const session=useRef(null),assetWork=useRef(null),callbacks=useRef({send,onRetire,onReload});callbacks.current={send,onRetire,onReload};
 const [view,setView]=useState({loading:enabled}),[choice,setChoice]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let alive=true,owned;
  const assets={controller:new AbortController(),active:0,paths:new Set(),ready:false,boot:new Set(),total:0};assetWork.current=assets;
  session.current=null;setChoice(false);setBusy(false);setView({loading:enabled});
  if(!enabled||!auth.ready)return;
  const prepare=async()=>{
   let transferError=null;
   try{if(!preview)await claimDeviceSaves();}catch(error){transferError=error;}
   if(!alive)return;
   try{
    const specBytes=await assetCache.get({entry:url,path:'slop.spec.json',manifest:game.bundle_manifest,signal:assets.controller.signal,preview});
    const spec=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(specBytes));
    if(spec.persistent!==true||!Array.isArray(spec.first_load))throw Error('This Slop World is missing its verified boot manifest.');
    assets.boot=new Set(spec.first_load);
    if(!alive)return;
    owned=createPersistentSession(game,{preview,send:message=>callbacks.current.send(message),onState:state=>{
     if(!alive)return;setView(previous=>({...previous,...state}));
     if(state.retired)callbacks.current.onRetire(state.error);
     if(state.conflict)callbacks.current.send({type:'pause'});
    }});session.current=owned;
    const rows=await owned.load();if(!alive)return;
    setView(previous=>({...previous,loading:false,error:previous.error||transferError}));
    if(activeRun(rows.run)||Object.values(rows).some(row=>row?.conflict))setChoice(true);
    else owned.start();
   }catch(error){if(alive)setView({loading:false,error,fatal:true});}
  };void prepare();
  return()=>{alive=false;assets.controller.abort();if(session.current===owned)session.current=null;owned?.dispose();};
 },[enabled,preview,url,generation,game?.id,game?.root_game_slug,auth.ready,auth.user?.id]);
 async function choose(newRun=false){if(busy||!session.current)return;const owned=session.current;setBusy(true);
  try{if(newRun)await owned.newRun();if(session.current!==owned||!owned.current())return;owned.start();setChoice(false);}
  catch(error){if(session.current===owned)setView(previous=>({...previous,error}));}finally{if(session.current===owned)setBusy(false);}
 }
 async function resolveConflict(value){if(busy||!session.current||!view.conflict)return;const owned=session.current;setBusy(true);
  try{const running=owned.started;await owned.chooseConflict(view.conflict,value);if(session.current!==owned||!owned.current())return;setChoice(true);if(running)callbacks.current.onReload();}
  catch(error){if(session.current===owned)setView(previous=>({...previous,error}));}finally{if(session.current===owned)setBusy(false);}
 }
 const bound=session.current;
 return {enabled,view,choice,busy,choose,resolveConflict,
  canMount:!enabled||!!view.started&&!view.retired,
  blocked:enabled&&(!view.started||!!view.conflict||view.retired),
  current:()=>!!bound&&session.current===bound&&bound.current(),
  generation:()=>bound?.generation??0,
  revisions:()=>bound?.revisions()??{run:0,profile:0},
  markReady:()=>{if(bound?.current()&&assetWork.current)assetWork.current.ready=true;},
  handle:event=>{
   if(event.type!=='persist-asset-request')return bound?.handle(event);
   const work=assetWork.current,current=()=>bound?.current()&&session.current===bound&&assetWork.current===work;
   const version=new URL(url).pathname.split('/').at(-2);
   const file=game.bundle_manifest?.find(row=>row.path===`${version}/${event.path}`||row.path===event.path);
   const added=work.paths.has(event.path)?0:(file?.bytes||0);
   if(!bound?.initialized||!current()||!file||work.active>=4||(!work.ready&&!work.boot.has(event.path))||work.total+added>50_000_000||(!work.paths.has(event.path)&&work.paths.size>=400)){
    callbacks.current.send({type:'persist-asset-data',request:event.request,path:event.path,error:'This release asset is not available in the current save session.'});return;
   }
   work.active++;work.paths.add(event.path);work.total+=added;
   return sendPersistentAsset({event,entry:url,manifest:game.bundle_manifest,cache:assetCache,current,send:callbacks.current.send,signal:work.controller.signal,preview}).finally(()=>{work.active--;});
  },
  flush:()=>bound?.flush()??Promise.resolve(),
  newRun:()=>bound?.newRun()??Promise.resolve(),
 };
}
