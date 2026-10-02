import React,{useEffect,useRef,useState} from 'react';
import {GamePlayer} from './GamePlayer.jsx';
import {Button,Modal,Notice} from './ui.jsx';
import {encodeCapture} from '../lib/capture.js';
import {captureStageAspect} from '../lib/capture-contracts.js';
import {CLIP_FRAMES,clipWindow,createClipRing} from '../lib/clip-ring.js';
import {submitMcpPublication,submitMcpUpdate} from '../lib/mcp-publication.js';
import {claimGameName,myGameName,previewGameName} from '../lib/game-name-claims.js';
import {validGameName} from '../lib/game-links.js';
import {mcpTargetLabel} from '../lib/mcp-platform.js';
import {previewGameForTarget} from '../lib/game-target-contract.js';
import {usePublishVideo} from '../lib/use-publish-video.js';
import {completeMcpPublication,mcpRecoveryError} from '../lib/mcp-publication-recovery.js';
import './mcp-draft-review.css';

// Publishing an agent-made game works like publishing in the app: you play,
// Slop quietly keeps the last few seconds of real gameplay (Cover Studio's
// rolling clip), and Publish saves the release before attaching its real MP4.
const FRAME_MS=80;
export function McpDraftReview({preview,onClose,onPublished}){
 const player=useRef(null),pending=useRef(null),alive=useRef(true),ring=useRef(createClipRing()),capturing=useRef(false),receiptRef=useRef(null),publishing=useRef(false);
 const[receipt,setReceipt]=useState(null);
 const[busy,setBusy]=useState(false),[error,setError]=useState(null),[stage,setStage]=useState(''),[ready,setReady]=useState(false),[clip,setClip]=useState({frames:0,moving:false,poster:null}),[title,setTitle]=useState(preview.name||''),[description,setDescription]=useState(preview.description||''),[gameName,setGameName]=useState(''),[claimed,setClaimed]=useState(false),[nameEdited,setNameEdited]=useState(false),[nameLoading,setNameLoading]=useState(true),[details,setDetails]=useState(false);
 const clipReady=clip.frames>=CLIP_FRAMES&&clip.moving,update=preview.update_target||null;
 const video=usePublishVideo(player,preview.target_platform||'mobile',ready);
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
 async function close(){
  if(busy||publishing.current)return;
  try{await player.current?.flush();if(!alive.current)return;if(receiptRef.current)onPublished({...receiptRef.current,videoPending:receiptRef.current.status==='published'});else onClose();}
  catch(error){if(alive.current)setError(error);}
 }
 async function publish(){
  if(publishing.current)return;publishing.current=true;setBusy(true);setError(null);
  try{
   const confirmed=await completeMcpPublication({
    receipt:receiptRef.current,
    onReceipt:value=>{receiptRef.current=value;if(alive.current)setReceipt(value);},
    submit:async()=>{
     const picked=clipWindow(ring.current.frames());
     if(!picked)throw new Error('Play for a few seconds so Slop can capture a moving clip, then publish.');
     setStage('Making your cover and video…');
     await video.finish();
     const recorded=await encodeCapture(picked.frames,preview.target_platform||'mobile',{background:picked.background});
     if(!alive.current)throw new Error('Playtest closed.');
     const onStage=value=>{if(alive.current)setStage(value);};
     if(update)return submitMcpUpdate({preview,target:update,title:title.trim(),tagline:description.trim(),...recorded,onStage});
     if(!claimed){setStage('Reserving your game link…');await claimGameName(preview.slug,gameName);if(!alive.current)throw new Error('Playtest closed.');setClaimed(true);}
     return submitMcpPublication({preview,title:title.trim(),tagline:description.trim(),...recorded,onStage});
    },
    attach:async confirmed=>{
     if(alive.current)setStage('Game published. Attaching your video preview…');
     await video.attach(confirmed.slug||preview.slug,{sourceDigest:preview.digest,expectedReleaseKey:confirmed.release_root||null});
    },
   });
   if(alive.current)onPublished(confirmed);
  }catch(e){if(alive.current){setError(mcpRecoveryError(e,{published:receiptRef.current?.status==='published'}));setStage('');}}
  finally{publishing.current=false;if(alive.current)setBusy(false);}
 }
 const status=busy?stage:receipt?.status==='published'?'Your game is live. Retry saving its video preview.':!ready?'Starting your game…':clipReady?'Clip ready. Publish whenever you like.':clip.frames>=CLIP_FRAMES?'Keep playing. Slop needs a moment where something moves.':'Play for a few seconds. Slop is capturing your clip.';
 return <Modal title={update?`Update ${update.name}`:preview.name||'Your game'} onClose={close} className="mcp-playtest-modal">
  <ol className="publish-progress" aria-label="Publication progress"><li className={ready?'complete':'current'}><b>01</b> Play your game</li><li className={clipReady?'complete':ready?'current':''}><b>02</b> Capture a preview</li><li className={receipt?'complete':clipReady?'current':''}><b>03</b> {receipt?.status==='pending_review'?'In review':receipt?'Game saved':'Publish'}</li></ol>
  <div className={`mcp-playtest-layout ${preview.target_platform==='desktop'?'is-desktop':''}`}>
   <GamePlayer ref={player} url={preview.preview_url} game={{...previewGameForTarget(preview.target_platform||'mobile'),id:`preview-${preview.digest}`,root_game_slug:`preview-${preview.digest}`,persistent:preview.persistent===true,bundle_manifest:preview.bundle_manifest}} stageAspect={captureStageAspect(preview.target_platform||'mobile')} preview title={preview.name} onEvent={event}/>
   <div className="mcp-publication">
    <div className="mcp-publish-head"><span className="mcp-target-chip">{mcpTargetLabel(preview.target_platform)}</span><span className="fine">Version {preview.revision}</span></div>
    <label>Title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} disabled={busy||!!receipt}/></label>
    <label>Description<textarea rows={2} maxLength={240} value={description} onChange={e=>setDescription(e.target.value)} disabled={busy||!!receipt}/></label>
    <div className={`mcp-clip ${clipReady?'is-ready':''}`} aria-live="polite">
     {clip.poster?<img src={clip.poster} alt="The latest frame of your gameplay clip"/>:<span className="mcp-clip-empty" aria-hidden="true"/>}
     <p>{status}</p>
    </div>
    <div className="mcp-publish-bar"><Button icon="share" disabled={busy||(!receipt&&(!clipReady||!video.supported||!title.trim()||(!update&&(nameLoading||!validGameName(gameName)))))} onClick={publish}>{busy?(receipt?'Saving video…':'Publishing…'):receipt?'Retry video attachment':update?'Publish update':'Publish'}</Button></div>
    {update?<p className="fine">This replaces {update.name} for everyone. Its link, plays and likes stay.</p>:<button type="button" className="text-button mcp-details-toggle" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>{details?'Hide link':'Game link'}: slop.game/{gameName||'…'}</button>}
    {!update&&details&&<label>Your permanent game link<div className="mcp-game-name"><span>slop.game/</span><input aria-label="Unique game name" value={gameName} onChange={e=>{setNameEdited(true);setGameName(e.target.value.toLowerCase());}} minLength={3} maxLength={50} disabled={claimed||nameLoading||busy} placeholder="your-game-name"/></div></label>}
    <p className="fine">Your real gameplay becomes the cover and video preview. We’ll confirm whether your game is live or waiting for review.</p>
    <Notice error={error||video.error}/>
   </div>
  </div>
 </Modal>;
}
