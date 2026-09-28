import {useEffect,useRef} from 'react';
import {createVideoCapture,uploadPreviewVideo} from './video-capture.js';
import {supabase,getSession} from './supabase.js';
import {finishPublicationVideo} from './publication-video.js';

// Records the playtest in the background while `active`, so publishing can
// attach a real H.264 feed video. A capture is required before publication;
// the server video pass remains a backstop for a later upload failure.
export function usePublishVideo(player,target,active){
 const capture=useRef(null),clip=useRef(null);
 useEffect(()=>{
  if(!active)return;
  clip.current=null;
  let cancelled=false;
  createVideoCapture({target,requestFrame:()=>player.current?.requestFrame?.()??Promise.resolve(null)}).then(c=>{
   if(cancelled){c.close();return;}capture.current=c;c.start();
  }).catch(()=>{});
  return()=>{cancelled=true;capture.current?.close();capture.current=null;};
 },[active,target]);
 return {
  get supported(){return capture.current?.supported===true;},
  // Freezes the newest ~7 s window (call when the owner commits to publish).
  async finish(){
   const c=capture.current;clip.current=null;
   try{clip.current=await finishPublicationVideo(c);return clip.current;}
   finally{c?.start();}
  },
  // After a publish receipt: attach the clip to the now-live game.
  async attach(slug){
   const value=clip.current,token=getSession()?.access_token;
   if(!value||!token||typeof slug!=='string')return false;
   try{
    const {data}=await supabase.from('games').select('id').eq('slug',slug).eq('status','published').maybeSingle();
    if(!data?.id)return false;
    return await uploadPreviewVideo({gameId:data.id,clip:value,accessToken:token});
   }catch{return false;}
  },
 };
}
