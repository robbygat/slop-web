import {useEffect,useRef,useState} from 'react';
import {createVideoCapture,uploadPreviewVideo} from './video-capture.js';
import {asOwner,result,getSession} from './supabase.js';
import {finishPublicationVideo} from './publication-video.js';
import {mcpPublicationReceipt} from './mcp-publication-contracts.js';
import {OWNER_VIDEO_FIELDS,recordingOwner,assertRecordingOwner,recordingRelease,assertRecordingRelease,RECORDING_UNSUPPORTED} from './preview-recording.js';

export const loadOwnerPreviewGame=id=>asOwner((owner,client)=>result(client.from('games').select(OWNER_VIDEO_FIELDS).eq('id',id).eq('owner_id',owner).eq('status','published').single().abortSignal(AbortSignal.timeout(12000))));

export function usePublishVideo(player,target,active){
 const capture=useRef(null),clip=useRef(null),owner=useRef(null);
 const[status,setStatus]=useState('idle'),[error,setError]=useState(null);
 useEffect(()=>{
  if(!active)return;
  clip.current=null;setError(null);setStatus('starting');
  let cancelled=false,created=null;
  try{owner.current=recordingOwner(getSession());}catch(e){setError(e);setStatus('failed');return;}
  createVideoCapture({target,requestFrame:()=>player.current?.requestFrame?.()??Promise.resolve(null)}).then(c=>{
   created=c;if(cancelled){c.close();return;}assertRecordingOwner(owner.current,getSession());capture.current=c;
   if(!c.supported){setError(new Error(RECORDING_UNSUPPORTED));setStatus('unsupported');return;}
   c.start();setStatus('recording');
  }).catch(e=>{created?.close();if(!cancelled){setError(e);setStatus('failed');}});
  return()=>{cancelled=true;created?.close();if(capture.current===created)capture.current=null;};
 },[active,target]);
 return {
  status,error,supported:status==='recording',
  async finish({resume=true}={}){
   assertRecordingOwner(owner.current,getSession());const c=capture.current;clip.current=null;
   try{const value=await finishPublicationVideo(c);assertRecordingOwner(owner.current,getSession());clip.current=value;return value;}
   finally{if(resume)c?.start();}
  },
  async attach(slug,{expectedGame=null,expectedReleaseKey=null,sourceDigest=null}={}){
   const expectedOwner=owner.current,value=clip.current;assertRecordingOwner(expectedOwner,getSession());
   if(!value)throw new Error('Record and review your clip before saving.');
   return asOwner(async(account,client)=>{
    const check=()=>assertRecordingOwner(expectedOwner,getSession());check();
    const game=await result(client.from('games').select(OWNER_VIDEO_FIELDS).eq('slug',slug).eq('owner_id',account).eq('status','published').single().abortSignal(AbortSignal.timeout(12000)));check();
    const release=expectedGame?assertRecordingRelease(expectedGame,game,account):recordingRelease(game,account);
    if(expectedReleaseKey&&release.releaseKey!==expectedReleaseKey)throw new Error('The published version changed. Record its current version.');
    if(!expectedGame){
     const receipt=sourceDigest&&await mcpPublicationReceipt(game,{owner_id:account,game_id:game.id,slug,digest:sourceDigest});check();
     if(!receipt||receipt.release_root!==release.releaseKey)throw new Error('The published version does not match the game you recorded.');
    }
    const token=getSession().access_token;
    return uploadPreviewVideo({gameId:game.id,releaseKey:release.releaseKey,clip:value,accessToken:token,assertCurrent:check});
   });
  },
 };
}
