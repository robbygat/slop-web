import React,{useEffect,useImperativeHandle,useRef,useState} from 'react';
import {loadDocument,acceptPlayerEvent} from '../lib/player.js';
import {gameFormat} from '../lib/game-format.js';
import {scoreRun} from '../lib/leaderboard.js';
import {validRunScore} from '../lib/score-contracts.js';
import {createRestartGate} from '../lib/player-restart.js';
import {legacyControlSpec} from '../lib/player-input.js';
import {lockBodyScroll} from '../lib/scroll-lock.js';
import {useAuth} from '../auth.jsx';
import {Loading,Notice,IconButton,Button} from './ui.jsx';
import {GameOver,GameLeaderboard} from './GameResults.jsx';
import './player.css';
export function GamePlayer({url,game,preview=false,paused=false,initialMuted=false,requireInteraction=false,onEvent,ref,title='Slop game'}){
 const {profile}=useAuth();
 const frame=useRef(null),container=useRef(null),initialized=useRef(false),callbacks=useRef(onEvent),run=useRef(null),replayIntent=useRef(false),verifiedDocument=useRef(null);callbacks.current=onEvent;
 const restartGate=useRef(null);if(!restartGate.current)restartGate.current=createRestartGate();
 const[doc,setDoc]=useState(null),[error,setError]=useState(null),[ready,setReady]=useState(false),[restart,setRestart]=useState(0),[muted,setMuted]=useState(initialMuted);
 const[finished,setFinished]=useState(null),[save,setSave]=useState(null),[board,setBoard]=useState(false),[expanded,setExpanded]=useState(false);
 const state=useRef({});state.current={muted,finished,board,paused,expanded};const format=gameFormat(game),controls=legacyControlSpec(url);
 const send=message=>frame.current?.contentWindow?.postMessage(JSON.stringify(message),'*');
 useImperativeHandle(ref,()=>({capture:request=>send({type:'webCapture',request}),send}));
 useEffect(()=>{
  restartGate.current.cancel();
  const controller=new AbortController();const current={score:0,ended:false,interacted:!requireInteraction||replayIntent.current,save:game&&!preview?scoreRun(game.slug):null};run.current=current;replayIntent.current=false;
  setDoc(null);setError(null);setReady(false);setFinished(null);setSave(null);setBoard(false);initialized.current=false;
  // Replays reuse this mounted player's validated bytes. Nothing is shared
  // across games or accounts; an explicit error retry downloads a fresh copy.
  if(verifiedDocument.current?.url===url&&verifiedDocument.current.preview===preview)setDoc(verifiedDocument.current.value);
  else loadDocument(url,{signal:controller.signal,preview}).then(value=>{if(!controller.signal.aborted){verifiedDocument.current={url,preview,value};setDoc(value);}}).catch(e=>{if(!controller.signal.aborted)setError(e);});
  return()=>{restartGate.current.cancel();controller.abort();run.current=null;};
 },[url,restart,preview,game?.slug,requireInteraction]);
 useEffect(()=>{
  const onMessage=e=>{
   const event=acceptPlayerEvent(e.source,frame.current?.contentWindow,e.data);if(!event)return;
   if(event.type==='restart-ack'){restartGate.current.receive(e.source,event);return;}
   if(restartGate.current.pending){if(event.type==='loadError')restartGate.current.fail(e.source);return;}
   const current=run.current;if(!current)return;
   if(event.type==='ready'){setReady(true);send({type:'mute',on:state.current.muted});send({type:document.hidden||state.current.paused||state.current.finished!==null||state.current.board?'pause':'resume'});}
   if(event.type==='webInteraction'&&!current.ended)current.interacted=true;
   if(event.type==='webEscape'&&state.current.expanded)exitExpanded();
   if(event.type==='score'&&!current.ended)current.score=event.value??event.score;
   if(['finished','gameOver','over'].includes(event.type)&&!current.ended){
    const score=event.score??event.value??current.score;if(!validRunScore(score))return;
    current.ended=true;current.score=score;setReady(true);setFinished(score);setBoard(false);send({type:'pause'});
    if(current.save&&current.interacted)current.save.finish(score).then(receipt=>{if(run.current===current)setSave(receipt);}).catch(()=>{if(run.current===current)setSave({state:'failed'});});
    else if(current.save)setSave({state:'idle'});
    else setSave({state:preview?'preview':'guest'});
   }
   if(event.type==='loadError'&&!current.ended)setError(new Error(String(event.message||'The game failed to load.').slice(0,300)));
   callbacks.current?.(event);
  };
  const onVisibility=()=>send({type:document.hidden||state.current.paused||state.current.finished!==null||state.current.board?'pause':'resume'});
  window.addEventListener('message',onMessage);document.addEventListener('visibilitychange',onVisibility);
  return()=>{window.removeEventListener('message',onMessage);document.removeEventListener('visibilitychange',onVisibility);};
 },[preview]);
 useEffect(()=>{if(ready)send({type:paused||document.hidden||finished!==null||board?'pause':'resume'});},[paused,ready,finished,board]);
 useEffect(()=>{if(!doc||ready)return;const timer=setTimeout(()=>setError(new Error('This game is taking too long to start. Try reloading it.')),25000);return()=>clearTimeout(timer);},[doc,ready]);
 useEffect(()=>{const changed=()=>{if(!document.fullscreenElement)setExpanded(false);};document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
 async function exitExpanded(){const el=container.current;if(el?.hidePopover&&el.matches(':popover-open'))el.hidePopover();el?.removeAttribute('popover');setExpanded(false);if(document.fullscreenElement===el)await document.exitFullscreen().catch(()=>{});}
 useEffect(()=>{if(!expanded)return;const unlock=lockBodyScroll(document.body);const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();exitExpanded();}};document.addEventListener('keydown',key,true);return()=>{unlock();document.removeEventListener('keydown',key,true);};},[expanded]);
 async function expand(){
  if(expanded)return exitExpanded();
  setExpanded(true);const el=container.current;
  // Top-layer expansion avoids native fullscreen scaling bugs in embedded
  // browsers and keeps the same live iframe on desktop and phones.
  if(el?.showPopover){try{el.setAttribute('popover','manual');el.showPopover();frame.current?.focus();return;}catch{el.removeAttribute('popover');}}
  try{await el?.requestFullscreen?.();}catch{}
  frame.current?.focus();
 }
 function showBoard(){setBoard(true);send({type:'pause'});}function closeBoard(){setBoard(false);if(finished===null&&!paused)send({type:'resume'});}
 function replay(){
  if(restartGate.current.pending)return;
  const source=frame.current?.contentWindow,current=run.current;
  const reload=()=>{replayIntent.current=true;setRestart(v=>v+1);};
  if(!source||!current||!ready||error){reload();return;}
  // Close the old score run before asking game code to reset. A new score run
  // is created only after this iframe acknowledges this exact user request.
  current.ended=true;send({type:'pause'});
  const request=restartGate.current.begin({frame:source,onFallback:()=>{if(frame.current?.contentWindow===source&&run.current===current)reload();},onHandled:()=>{
   if(frame.current?.contentWindow!==source||run.current!==current)return;
   run.current={score:0,ended:false,interacted:true,save:game&&!preview?scoreRun(game.slug):null};
   state.current={...state.current,finished:null,board:false};
   setFinished(null);setSave(null);setBoard(false);setError(null);setReady(true);
   send({type:'mute',on:state.current.muted});send({type:document.hidden||state.current.paused?'pause':'resume'});
  }});
  if(request)send({type:'restart',request});
 }
 return <div ref={container} className={`game-player ${expanded?'is-expanded':''} ${format.orientation}`} style={{'--game-aspect':format.playerAspect}}>
  <div className="player-surface"><div className="player-frame">
   {doc&&!error&&<iframe key={`${url}:${restart}`} ref={frame} data-frame-generation={restart} title={title} sandbox="allow-scripts allow-pointer-lock" credentialless="" allow="autoplay; gamepad" referrerPolicy="no-referrer" src="/game-frame/index.html" onLoad={()=>{if(initialized.current){setError(new Error('This game tried to leave its player. Restart to return to the game.'));return;}initialized.current=true;frame.current?.contentWindow?.postMessage({type:'slop-player-init-v1',...doc},'*');}}/>}
   <div className={`player-loading ${ready&&!error?'hidden':''}`}>{error?<Notice error={error} onRetry={()=>{verifiedDocument.current=null;setRestart(v=>v+1);}}/>:<Loading label="Loading game…"/>}</div>
   {finished!==null&&!error&&<GameOver game={preview?null:game} preview={preview} score={finished} save={save} look={profile?.slop_look} onReplay={replay} onLeaderboard={showBoard}/>}
   {board&&game&&<div className="player-board-overlay"><div className="player-board-top"><h2>Top players</h2><IconButton name="close" label="Close leaderboard" onClick={closeBoard}/></div><GameLeaderboard game={game} refreshKey={save?.state==='saved'?1:0}/><Button onClick={closeBoard}>{finished!==null?'Back to your result':'Back to game'}</Button></div>}
  </div></div>
  {controls&&<p className="desktop-game-hint">{controls.hint}</p>}
  <div className="player-controls"><span className="fine">{preview?'Private playtest':title}</span><div>
   {game&&!preview&&<IconButton name="crown" label="Leaderboard" onClick={showBoard}/>}
   <IconButton name={muted?'mute':'volume'} label={muted?'Unmute game':'Mute game'} onClick={()=>{send({type:'mute',on:!muted});setMuted(!muted);}}/>
   <IconButton name="refresh" label="Restart game" onClick={replay}/>
   <button className="icon-button" aria-label={expanded?'Exit fullscreen':'Expand game'} title={expanded?'Exit fullscreen':'Expand game'} onClick={expand}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{expanded?<path d="M3 9h6V3m12 6h-6V3M3 15h6v6m12-6h-6v6"/>:<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>}</svg></button>
  </div></div>
 </div>;
}
