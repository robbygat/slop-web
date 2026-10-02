import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth.jsx';
import {getSession} from '../lib/supabase.js';
import {gamePlatform} from '../lib/game-platforms.js';
import {captureStageAspect} from '../lib/capture-contracts.js';
import {recordingOwner,assertRecordingOwner,recordingRelease,RECORDING_UNSUPPORTED} from '../lib/preview-recording.js';
import {loadOwnerPreviewGame,usePublishVideo} from '../lib/use-publish-video.js';
import {mcpRecoveryError} from '../lib/mcp-publication-recovery.js';
import {GamePlayer} from './GamePlayer.jsx';
import {Button,Loading,Modal,Notice} from './ui.jsx';
import './manual-preview-recorder.css';

export default function ManualPreviewRecorder({game,onClose}){
 const {user}=useAuth(),player=useRef(null),alive=useRef(true),pending=useRef(false);
 const [owner]=useState(()=>{try{return recordingOwner(getSession());}catch{return null;}});
 const[current,setCurrent]=useState(null),[release,setRelease]=useState(null),[phase,setPhase]=useState('loading'),[ready,setReady]=useState(false),[error,setError]=useState(null),[seconds,setSeconds]=useState(0),[clipUrl,setClipUrl]=useState(null);
 const target=gamePlatform(current)==='desktop'?'desktop':'mobile';
 const video=usePublishVideo(player,target,phase==='recording'&&ready);
 const supported=typeof VideoEncoder==='function'&&typeof OffscreenCanvas==='function'&&typeof VideoFrame==='function';
 useEffect(()=>{alive.current=true;let cancelled=false;
  if(!owner){setError(new Error('Sign in again before recording your preview.'));setPhase('failed');return()=>{alive.current=false;};}
  loadOwnerPreviewGame(game.id).then(value=>{assertRecordingOwner(owner,getSession());if(cancelled)return;setRelease(recordingRelease(value,owner.owner));setCurrent(value);setPhase('ready');}).catch(e=>{if(!cancelled){setError(mcpRecoveryError(e));setPhase('failed');}});
  return()=>{cancelled=true;alive.current=false;};
 },[game.id]);
 useEffect(()=>{if(owner&&user?.id!==owner.owner)onClose();},[user?.id]);
 useEffect(()=>()=>{if(clipUrl)URL.revokeObjectURL(clipUrl);},[clipUrl]);
 useEffect(()=>{if(phase!=='recording'||video.status!=='recording')return;const started=performance.now();setSeconds(0);const timer=setInterval(()=>setSeconds(Math.floor((performance.now()-started)/1000)),250);return()=>clearInterval(timer);},[phase,video.status]);
 function record(){try{assertRecordingOwner(owner,getSession());setError(null);setClipUrl(null);setSeconds(0);setPhase('recording');}catch(e){setError(mcpRecoveryError(e));}}
 async function review(){if(pending.current)return;pending.current=true;setError(null);
  try{const clip=await video.finish({resume:false});if(!alive.current)return;setClipUrl(URL.createObjectURL(new Blob([clip.video],{type:'video/mp4'})));setPhase('review');}
  catch(e){if(alive.current){setError(mcpRecoveryError(e));setPhase('ready');}}finally{pending.current=false;}
 }
 async function save(){if(pending.current)return;pending.current=true;setError(null);setPhase('saving');
  try{assertRecordingOwner(owner,getSession());await video.attach(current.slug,{expectedGame:release});if(alive.current)setPhase('saved');}
  catch(e){if(alive.current){setError(mcpRecoveryError(e));setPhase('review');}}finally{pending.current=false;}
 }
 async function close(){if(phase==='saving')return;try{await player.current?.flush();if(alive.current)onClose();}catch(error){if(alive.current)setError(error);}}
 const active=phase==='recording',reviewing=['review','saving','saved'].includes(phase);
 return <Modal title={`Record preview · ${game.name}`} onClose={close} className="manual-preview-modal">
  {phase==='loading'?<Loading label="Checking your published game…"/>:<>
   <div className="manual-preview-layout">
    {current&&<div className={`manual-preview-stage ${reviewing?'is-reviewing':''}`}>
     <GamePlayer ref={player} game={current} url={release.entry} title={current.name} stageAspect={captureStageAspect(target)} requireInteraction paused={!active} onEvent={event=>{if(event.type==='ready')setReady(true);}}/>
     {clipUrl&&<video className="manual-preview-review" src={clipUrl} controls playsInline loop aria-label="Your recorded preview"/>}
    </div>}
    <div className="manual-preview-tools">
     <p>Record a moment you play, review it, then save it as this game’s video preview.</p>
     <p className="fine">Your current preview stays in place until the new one is saved.</p>
     {!supported&&<Notice error={new Error(RECORDING_UNSUPPORTED)}/>}
     <Notice error={error||video.error}/>
     <p className="manual-preview-status" role="status">{phase==='saved'?'Preview saved.':phase==='saving'?'Saving your preview…':active?(video.status==='recording'?`Recording · ${seconds}s. Play through a moving moment.`:'Starting the recorder…'):reviewing?'Review your clip before saving.':ready?'Ready when you are.':'Loading your game…'}</p>
     {phase==='saved'?<Button onClick={close}>Done</Button>:reviewing?<div className="manual-preview-actions"><Button disabled={phase==='saving'} onClick={save}>{phase==='saving'?'Saving…':'Save preview'}</Button><Button variant="secondary" disabled={phase==='saving'} onClick={()=>{setClipUrl(null);setPhase('ready');setError(null);}}>Retake</Button></div>:<Button disabled={!current||!ready||!supported||(active&&(seconds<4||video.status!=='recording'))} onClick={active?review:record}>{active?'Review clip':'Record preview'}</Button>}
     <p className="fine">Slop keeps your latest 7 seconds. Clips need visible movement and smooth playback.</p>
    </div>
   </div>
  </>}
 </Modal>;
}
