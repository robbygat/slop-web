import React,{useEffect,useRef,useState} from 'react';
import {GamePlayer} from './GamePlayer.jsx';
import {Button,Modal,Notice} from './ui.jsx';
import {encodeCapture} from '../lib/capture.js';
import {captureStageAspect} from '../lib/capture-contracts.js';
import {CLIP_FRAMES,clipWindow,createClipRing} from '../lib/clip-ring.js';
import {submitMcpPublication} from '../lib/mcp-publication.js';
import {claimGameName,myGameName,previewGameName} from '../lib/game-name-claims.js';
import {validGameName} from '../lib/game-links.js';
import {mcpTargetLabel} from '../lib/mcp-platform.js';
import {previewGameForTarget} from '../lib/game-target-contract.js';
import './mcp-draft-review.css';

// Publishing an agent-made game works like publishing in the app: you play,
// Slop quietly keeps the last few seconds of real gameplay (Cover Studio's
// rolling clip), and one Publish turns that clip into the cover and GIF.
const FRAME_MS=80;
export function McpDraftReview({preview,onClose,onPublished}){
 const player=useRef(null),pending=useRef(null),alive=useRef(true),ring=useRef(createClipRing()),capturing=useRef(false);
 const[busy,setBusy]=useState(false),[error,setError]=useState(null),[stage,setStage]=useState(''),[ready,setReady]=useState(false),[clip,setClip]=useState({frames:0,moving:false,poster:null}),[title,setTitle]=useState(preview.name||''),[description,setDescription]=useState(preview.description||''),[gameName,setGameName]=useState(''),[claimed,setClaimed]=useState(false),[nameEdited,setNameEdited]=useState(false),[nameLoading,setNameLoading]=useState(true),[details,setDetails]=useState(false);
 const clipReady=clip.frames>=CLIP_FRAMES&&clip.moving;
 useEffect(()=>{if(claimed||nameEdited)return;let active=true;setNameLoading(true);const timer=setTimeout(()=>{myGameName(preview.slug).then(name=>name||previewGameName(preview.slug,title)).then(name=>{if(active&&name){setGameName(name.name);setClaimed(name.claimed===true);}}).catch(e=>{if(active)setError(e);}).finally(()=>{if(active)setNameLoading(false);});},200);return()=>{active=false;clearTimeout(timer);};},[preview.slug,title,claimed,nameEdited]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(pending.current){clearTimeout(pending.current.timer);pending.current.reject(new Error('Playtest closed.'));pending.current=null;}};},[]);
 // A game that never announces ready still gets its clip captured.
 useEffect(()=>{const timer=setTimeout(()=>{if(alive.current)setReady(true);},4000);return()=>clearTimeout(timer);},[]);
 function capture(){return new Promise((resolve,reject)=>{const request=crypto.randomUUID(),timer=setTimeout(()=>{pending.current=null;reject(new Error('The game did not return a frame.'));},6000);pending.current={request,timer,resolve,reject};player.current?.capture(request);});}
 // One capture in flight at a time, every FRAME_MS, only while the game runs
 // and nothing is being published. Failures are transient (a game still
 // loading, a paused tab); the ring simply keeps its last good frames.
 useEffect(()=>{
  if(!ready||busy)return;
  let stopped=false,timer;
  const tick=async()=>{
   if(stopped||capturing.current)return;
   // Earlier script errors are the game's business (the player shows fatal
   // ones); they must not block the clip, which is how recording used to fail.
   if(!document.hidden){capturing.current=true;const at=performance.now();try{const frame=await capture();if(!stopped&&alive.current){const state=ring.current.push(frame.data,frame.background,at);setClip(state);}}catch{}finally{capturing.current=false;}}
   if(!stopped)timer=setTimeout(tick,FRAME_MS);
  };
  timer=setTimeout(tick,FRAME_MS);
  return()=>{stopped=true;clearTimeout(timer);};
 },[ready,busy]);
 function event(e){
  if(e.type==='ready'){setReady(true);return;}
  if(!['webCaptureResult','webCaptureError'].includes(e.type)||e.request!==pending.current?.request)return;
  const p=pending.current;clearTimeout(p.timer);pending.current=null;e.type==='webCaptureError'?p.reject(new Error(e.message)):p.resolve(e);
 }
 async function publish(){
  setBusy(true);setError(null);
  try{
   const picked=clipWindow(ring.current.frames());
   if(!picked)throw new Error('Play for a few seconds so Slop can capture a moving clip, then publish.');
   setStage('Making your cover and clip…');
   const recorded=await encodeCapture(picked.frames,preview.target_platform||'mobile',{background:picked.background});
   if(!alive.current)return;
   if(!claimed){setStage('Reserving your game link…');await claimGameName(preview.slug,gameName);if(!alive.current)return;setClaimed(true);}
   const receipt=await submitMcpPublication({preview,title:title.trim(),tagline:description.trim(),...recorded,onStage:value=>{if(alive.current)setStage(value);}});
   if(alive.current)onPublished(receipt);
  }catch(e){if(alive.current){setError(e);setStage('');}}
  finally{if(alive.current)setBusy(false);}
 }
 const status=busy?stage:!ready?'Starting your game…':clipReady?'Clip ready. Publish whenever you like.':clip.frames>=CLIP_FRAMES?'Keep playing. Slop needs a moment where something moves.':'Play for a few seconds. Slop is capturing your clip.';
 return <Modal title={preview.name||'Your game'} onClose={()=>{if(!busy)onClose();}} className="mcp-playtest-modal">
  <div className={`mcp-playtest-layout ${preview.target_platform==='desktop'?'is-desktop':''}`}>
   <GamePlayer ref={player} url={preview.preview_url} game={previewGameForTarget(preview.target_platform||'mobile')} stageAspect={captureStageAspect(preview.target_platform||'mobile')} preview title={preview.name} onEvent={event}/>
   <div className="mcp-publication">
    <div className="mcp-publish-head"><span className="mcp-target-chip">{mcpTargetLabel(preview.target_platform)}</span><span className="fine">Version {preview.revision}</span></div>
    <label>Title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} disabled={busy}/></label>
    <label>Description<textarea rows={2} maxLength={240} value={description} onChange={e=>setDescription(e.target.value)} disabled={busy}/></label>
    <div className={`mcp-clip ${clipReady?'is-ready':''}`} aria-live="polite">
     {clip.poster?<img src={clip.poster} alt="The latest frame of your gameplay clip"/>:<span className="mcp-clip-empty" aria-hidden="true"/>}
     <p>{status}</p>
    </div>
    <Button icon="share" disabled={busy||nameLoading||!clipReady||!title.trim()||!validGameName(gameName)} onClick={publish}>{busy?'Publishing…':'Publish'}</Button>
    <button type="button" className="text-button mcp-details-toggle" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>{details?'Hide link':'Game link'}: slop.game/{gameName||'…'}</button>
    {details&&<label>Your permanent game link<div className="mcp-game-name"><span>slop.game/</span><input aria-label="Unique game name" value={gameName} onChange={e=>{setNameEdited(true);setGameName(e.target.value.toLowerCase());}} minLength={3} maxLength={50} disabled={claimed||nameLoading||busy} placeholder="your-game-name"/></div></label>}
    <p className="fine">Your clip and cover come from the last few seconds you played, in the same shape as games made in the app. Publishing sends it to review like any Slop game.</p>
    <Notice error={error}/>
   </div>
  </div>
 </Modal>;
}
