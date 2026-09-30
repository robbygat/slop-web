import React,{useEffect,useImperativeHandle,useRef,useState} from 'react';
import {loadDocument,acceptPlayerEvent} from '../lib/player.js';
import {gameFormat} from '../lib/game-format.js';
import {gamePlatform} from '../lib/game-platforms.js';
import {canonicalGameUrl} from '../lib/game-links.js';
import {scoreRun} from '../lib/leaderboard.js';
import {validRunScore} from '../lib/score-contracts.js';
import {scoreSavedEvent} from '../lib/score-saved-event.js';
import {getSession} from '../lib/supabase.js';
import {createRestartGate} from '../lib/player-restart.js';
import {legacyControlSpec,createHostKeyboardBridge} from '../lib/player-input.js';
import {lockBodyScroll} from '../lib/scroll-lock.js';
import {useAuth} from '../auth.jsx';
import {Notice,IconButton,Button} from './ui.jsx';
import {GameOver,GameLeaderboard} from './GameResults.jsx';
import './player.css';
export function GamePlayer({url,game,previewVideo=null,preview=false,paused=false,initialMuted=false,requireInteraction=false,theater=false,onEvent,ref,title='Slop game',stageAspect=null}){
 const {profile}=useAuth();
 const frame=useRef(null),container=useRef(null),initialized=useRef(false),callbacks=useRef(onEvent),run=useRef(null),replayIntent=useRef(false),verifiedDocument=useRef(null),keyboard=useRef(null),focusAtStart=useRef(theater);callbacks.current=onEvent;
 const restartGate=useRef(null);if(!restartGate.current)restartGate.current=createRestartGate();
 const[doc,setDoc]=useState(null),[error,setError]=useState(null),[ready,setReady]=useState(false),[restart,setRestart]=useState(0),[muted,setMuted]=useState(initialMuted);
 const[finished,setFinished]=useState(null),[save,setSave]=useState(null),[board,setBoard]=useState(false),[expanded,setExpanded]=useState(false),[waitingStart,setWaitingStart]=useState(false);
 const[smallScreen,setSmallScreen]=useState(()=>matchMedia('(max-width:1024px) and (hover:none) and (pointer:coarse)').matches),[copied,setCopied]=useState(false);
 const[pointerMode,setPointerMode]=useState(false),[pointerLocked,setPointerLocked]=useState(false),[pointerError,setPointerError]=useState('');
 const desktopRequired=smallScreen&&gamePlatform(game)==='desktop';
 const state=useRef({});state.current={muted,finished,board,paused,expanded,waitingStart,ready,error,desktopRequired};const format=gameFormat(game),controls=legacyControlSpec(url);
 const send=message=>{if(['pause','restart','hostReleaseKeys'].includes(message.type))keyboard.current?.release();frame.current?.contentWindow?.postMessage(JSON.stringify(message),'*');};
 const focusFrame=target=>{frame.current?.focus({preventScroll:true});target?.postMessage(JSON.stringify({type:'hostFocus'}),'*');target?.focus();};
 const focusGame=()=>{if(!state.current.paused&&!state.current.board&&state.current.finished===null&&!state.current.waitingStart&&!document.hidden)focusFrame(frame.current?.contentWindow);};
 function newRun(interacted){const session=getSession();return {score:0,ended:false,interacted,scoreContext:{game:{id:game?.id,slug:game?.slug},session},save:game&&!preview?scoreRun(game.slug):null};}
 useEffect(()=>{
  const bridge=createHostKeyboardBridge({getContext:()=>{const current=state.current;return {frame:frame.current?.contentWindow,
    enabled:current.ready&&!current.error&&!current.desktopRequired&&!current.paused&&current.finished===null&&!current.board&&!current.waitingStart&&!document.hidden&&!restartGate.current.pending,
    ownsKeyboard:!!container.current?.contains(document.activeElement)};},
    send:(target,message)=>target?.postMessage(JSON.stringify(message),'*'),focus:focusFrame,
    onInteraction:()=>{const current=run.current;if(current&&!current.ended)current.interacted=true;}});
  keyboard.current=bridge;
  const release=()=>send({type:'hostReleaseKeys'});
  const down=event=>{focusAtStart.current=false;bridge.down(event);};
  const up=event=>bridge.up(event);
  const blurred=()=>{if(!document.hasFocus())release();};
  const hidden=()=>{if(document.hidden)release();};
  const pointer=event=>{focusAtStart.current=false;if(!container.current?.contains(event.target))release();};
  const focused=event=>{if(event.target!==frame.current&&!container.current?.querySelector('.player-frame')?.contains(event.target))release();};
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',blurred);document.addEventListener('visibilitychange',hidden);document.addEventListener('pointerdown',pointer,true);document.addEventListener('focusin',focused,true);
  return()=>{bridge.release();keyboard.current=null;window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',blurred);document.removeEventListener('visibilitychange',hidden);document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('focusin',focused,true);};
 },[]);
 useImperativeHandle(ref,()=>({capture:request=>send({type:'webCapture',request}),send,
  // One canvas frame as an ImageBitmap (publish-time video capture), or null.
  requestFrame:()=>new Promise(resolve=>{const win=frame.current?.contentWindow;if(!win)return resolve(null);const request='f'+Math.random().toString(36).slice(2,14);
   const done=value=>{clearTimeout(timer);window.removeEventListener('message',on);resolve(value);};
   const on=e=>{if(e.source!==win||!e.data||typeof e.data!=='object'||e.data.type!=='webFrameResult'||e.data.request!==request)return;done(e.data.bitmap?{bitmap:e.data.bitmap,background:e.data.background||null}:null);};
   const timer=setTimeout(()=>done(null),1500);window.addEventListener('message',on);send({type:'webFrame',request});})}));
 useEffect(()=>{const query=matchMedia('(max-width:1024px) and (hover:none) and (pointer:coarse)');const changed=()=>setSmallScreen(query.matches);query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[]);
 useEffect(()=>{if(desktopRequired&&expanded)exitExpanded();},[desktopRequired,expanded]);
 useEffect(()=>{
  restartGate.current.cancel();
  keyboard.current?.release();
  if(desktopRequired){run.current=null;setDoc(null);setReady(false);setError(null);return;}
  const controller=new AbortController();const current=newRun(!requireInteraction||replayIntent.current);run.current=current;replayIntent.current=false;
  setDoc(null);setError(null);setReady(false);setPointerLocked(false);setPointerError('');setFinished(null);setSave(null);setBoard(false);setWaitingStart(false);initialized.current=false;
  // Replays reuse this mounted player's validated bytes. Nothing is shared
  // across games or accounts; an explicit error retry downloads a fresh copy.
  if(verifiedDocument.current?.url===url&&verifiedDocument.current.preview===preview)setDoc(verifiedDocument.current.value);
  else loadDocument(url,{signal:controller.signal,preview}).then(value=>{if(!controller.signal.aborted){verifiedDocument.current={url,preview,value};setDoc(value);}}).catch(e=>{if(!controller.signal.aborted)setError(e);});
  return()=>{keyboard.current?.release();restartGate.current.cancel();controller.abort();run.current=null;};
 },[url,restart,preview,game?.id,game?.slug,requireInteraction,desktopRequired]);
 useEffect(()=>{
  const onMessage=e=>{
   const event=acceptPlayerEvent(e.source,frame.current?.contentWindow,e.data);if(!event)return;
   if(event.type==='restart-ack'){restartGate.current.receive(e.source,event);return;}
   if(restartGate.current.pending){if(event.type==='loadError')restartGate.current.fail(e.source);return;}
   const current=run.current;if(!current)return;
   // The relay's completed document is playable even when a legacy game never
   // emits SDK ready. Only the trusted outer frame can send the loaded signal.
   if(event.type==='ready'){setReady(true);send({type:'mute',on:state.current.muted});send({type:document.hidden||state.current.paused||state.current.finished!==null||state.current.board||state.current.waitingStart?'pause':'resume'});if(focusAtStart.current){focusAtStart.current=false;focusGame();}}
   if(event.type==='webInteraction'&&!current.ended)current.interacted=true;
   if(event.type==='webPointerLock'){setPointerLocked(event.locked);if(event.locked)setPointerError('');}
   if(event.type==='webPointerError'){setPointerError('Click the game again to capture your mouse.');}
   if(event.type==='webEscape'&&state.current.expanded)exitExpanded();
   if(event.type==='score'&&!current.ended)current.score=event.value??event.score;
   if(['finished','gameOver','over'].includes(event.type)&&!current.ended){
    const score=event.score??event.value??current.score;if(!validRunScore(score))return;
    // Some older games emit gameOver while their feed card is merely
    // scrolling into view. Wait for an intentional start before treating that
    // as the player's result.
    if(requireInteraction&&!current.interacted){current.ended=true;setReady(true);setWaitingStart(true);send({type:'pause'});return;}
    current.ended=true;current.score=score;setReady(true);setFinished(score);setBoard(false);send({type:'pause'});
    if(current.save&&current.interacted)current.save.finish(score).then(receipt=>{
     if(run.current!==current)return;
     const savedEvent=scoreSavedEvent(receipt,current.scoreContext,getSession());
     if(receipt.state==='saved'&&!savedEvent)return;
     setSave(receipt);
     // Emitted only after the server receipt passed owner/game/request checks.
     if(savedEvent)callbacks.current?.(savedEvent);
    },()=>{if(run.current===current)setSave({state:'failed'});});
    else if(current.save)setSave({state:'idle'});
    else setSave({state:preview?'preview':'guest'});
   }
   if(event.type==='loadError'&&!current.ended)setError(new Error(String(event.message||'The game failed to load.').slice(0,300)));
   callbacks.current?.(event);
  };
  const onVisibility=()=>send({type:document.hidden||state.current.paused||state.current.finished!==null||state.current.board||state.current.waitingStart||restartGate.current.pending?'pause':'resume'});
  window.addEventListener('message',onMessage);document.addEventListener('visibilitychange',onVisibility);
  return()=>{window.removeEventListener('message',onMessage);document.removeEventListener('visibilitychange',onVisibility);};
 },[preview]);
 useEffect(()=>{if(ready)send({type:'hostPointerMode',enabled:pointerMode});},[ready,pointerMode,restart]);
 useEffect(()=>{if(ready)send({type:paused||document.hidden||finished!==null||board||waitingStart?'pause':'resume'});},[paused,ready,finished,board,waitingStart]);
 useEffect(()=>{if(!doc||ready)return;const timer=setTimeout(()=>setError(new Error('This game is taking too long to start. Try reloading it.')),25000);return()=>clearTimeout(timer);},[doc,ready]);
 useEffect(()=>{const changed=()=>{if(!document.fullscreenElement)setExpanded(false);};document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
 async function exitExpanded(){const el=container.current;if(el?.hidePopover&&el.matches(':popover-open'))el.hidePopover();el?.removeAttribute('popover');setExpanded(false);if(document.fullscreenElement===el)await document.exitFullscreen().catch(()=>{});}
 useEffect(()=>{if(!expanded)return;const unlock=lockBodyScroll(document.body);const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();exitExpanded();}};document.addEventListener('keydown',key,true);return()=>{unlock();document.removeEventListener('keydown',key,true);};},[expanded]);
 async function expand(){
  if(expanded)return exitExpanded();
  setExpanded(true);const el=container.current;
  // Request real fullscreen directly from the user gesture. The top layer is
  // the fallback for browsers that cannot grant it, preserving the live frame.
  if(el?.requestFullscreen){try{await el.requestFullscreen();frame.current?.focus();return;}catch{}}
  if(el?.showPopover){try{el.setAttribute('popover','manual');el.showPopover();}catch{el.removeAttribute('popover');}}
  focusGame();
 }
 function showBoard(){setBoard(true);send({type:'pause'});}function closeBoard(){state.current={...state.current,board:false};setBoard(false);if(finished===null&&!paused){send({type:'resume'});focusGame();}}
 function replay(){
  if(restartGate.current.pending)return;
  const source=frame.current?.contentWindow,current=run.current;
  const reload=()=>{focusAtStart.current=true;replayIntent.current=true;setRestart(v=>v+1);};
  if(!source||!current||!ready||error){reload();return;}
  // Close the old score run before asking game code to reset. A new score run
  // is created only after this iframe acknowledges this exact user request.
  current.ended=true;send({type:'pause'});
  const request=restartGate.current.begin({frame:source,onFallback:()=>{if(frame.current?.contentWindow===source&&run.current===current)reload();},onHandled:()=>{
   if(frame.current?.contentWindow!==source||run.current!==current)return;
   run.current=newRun(true);
   state.current={...state.current,finished:null,board:false};
   setFinished(null);setSave(null);setBoard(false);setError(null);setReady(true);
   send({type:'mute',on:state.current.muted});send({type:document.hidden||state.current.paused?'pause':'resume'});focusGame();
  }});
  if(request)send({type:'restart',request});
 }
 function startFromRest(){focusAtStart.current=true;replayIntent.current=true;setWaitingStart(false);setRestart(v=>v+1);}
 if(desktopRequired)return <div ref={container} className="game-player desktop-required">
  <svg width="44" height="44" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="26" height="18" rx="3"/><path d="M16 22v6m-6 0h12"/></svg>
  <h2>This is a desktop game.</h2><p>Open {title} on your computer to play.</p>
  {!preview&&game?.slug&&<><input aria-label="Game link" readOnly value={canonicalGameUrl(game)} onFocus={event=>event.target.select()}/>
  <Button variant="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(canonicalGameUrl(game));setCopied(true);}catch{setCopied(false);container.current?.querySelector('input')?.focus();}}}>{copied?'Link copied':'Copy game link'}</Button></>}
 </div>;
 return <div ref={container} className={`game-player ${theater?'theater-player':''} ${expanded?'is-expanded':''} ${pointerLocked?'has-pointer-lock':''} ${stageAspect?(stageAspect>=1?'landscape':'portrait'):format.orientation}`} style={{'--game-aspect':stageAspect||format.playerAspect}}>
  <div className="player-surface"><div className="player-frame" onPointerDownCapture={event=>{if(!event.target.closest?.('button,input,textarea,select,a'))focusGame();}}>
   {doc&&!error&&<iframe key={`${url}:${restart}`} ref={frame} tabIndex="0" data-frame-generation={restart} title={title} sandbox="allow-scripts allow-pointer-lock" credentialless="" allow="autoplay; gamepad; fullscreen" allowFullScreen referrerPolicy="no-referrer" src="/game-frame/index.html" onLoad={()=>{if(initialized.current){setError(new Error('This game tried to leave its player. Restart to return to the game.'));return;}initialized.current=true;frame.current?.contentWindow?.postMessage({type:'slop-player-init-v1',...doc},'*');}}/>}
   {previewVideo&&!error&&!ready&&<PlayerPoster key={previewVideo.poster} poster={previewVideo.poster}/>}
   {!ready&&!error&&<div className="player-boot-status" role="status"><i aria-hidden="true"/><span>Opening game…</span></div>}
   {error&&<div className="player-error"><Notice error={error} onRetry={()=>{focusAtStart.current=true;verifiedDocument.current=null;setRestart(v=>v+1);}}/></div>}
   {finished!==null&&!error&&<GameOver game={preview?null:game} preview={preview} score={finished} save={save} look={profile?.slop_look} onReplay={replay}/>}
   {board&&game&&<div className="player-board-overlay"><div className="player-board-top"><h2>Top players</h2><IconButton name="close" label="Close leaderboard" onClick={closeBoard}/></div><GameLeaderboard game={game} refreshKey={save?.state==='saved'?1:0}/><Button onClick={closeBoard}>{finished!==null?'Back to your result':'Back to game'}</Button></div>}
  </div></div>
  {controls&&<p className="desktop-game-hint">{controls.hint}</p>}
  <div className="player-controls">{waitingStart&&!error?<button className="player-start-round" onClick={startFromRest}>Start round →</button>:<span className="fine" role="status">{pointerLocked?'Mouse captured · Esc to release':pointerError||pointerMode?'Click inside the game to capture the mouse':preview?'Private playtest':title}</span>}<div>
   {!smallScreen&&<IconButton name="cursor" label={pointerMode?'Turn off mouse capture':'Capture mouse for this game'} aria-pressed={pointerMode} onClick={()=>{const enabled=!pointerMode;setPointerMode(enabled);setPointerError('');send({type:'hostPointerMode',enabled});focusGame();}}/>}
   {game&&!preview&&<IconButton name="crown" label="Leaderboard" onClick={showBoard}/>}
   <IconButton name={muted?'mute':'volume'} label={muted?'Unmute game':'Mute game'} onClick={()=>{send({type:'mute',on:!muted});setMuted(!muted);focusGame();}}/>
   <IconButton name="refresh" label="Restart game" onClick={replay}/>
   <button className="icon-button" aria-label={expanded?'Exit fullscreen':'Expand game'} title={expanded?'Exit fullscreen':'Expand game'} onClick={expand}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{expanded?<path d="M3 9h6V3m12 6h-6V3M3 15h6v6m12-6h-6v6"/>:<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>}</svg></button>
  </div></div>
 </div>;
}

// The existing cover holds the stage while game assets take network priority.
function PlayerPoster({poster}){
 const [failed,setFailed]=useState(false);
 return poster&&!failed?<img className="player-poster" src={poster} alt="" onError={()=>setFailed(true)}/>:null;
}
