import React,{useEffect,useRef,useState} from 'react';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import DownloadLinks from './DownloadLinks.jsx';
import {HERO_LIFT_MS as LIFT_MS,HERO_WALL as WALL,WALL_SPEED,hasRunway,liftClipTime,liftPlacement,pickLift,tileY,wallVideoStem} from '../lib/hero-wall.js';
import {createWallRenderer} from './HeroWallGL.js';
import './brand-home.css';
import './home-hero.css';
import './hero-v2.css';

// The hero wall: every game exactly once. The wall video is the grid standing
// still (3s loop); a WebGL shader scrolls each column at display refresh rate,
// so motion is perfectly smooth and the file carries no motion at all. One
// clock drives the shader, the lifted game and the landing shockwave in the
// same frame, so the lift can never drift from its slot.
const BAND={wide:[.58,.8],narrow:[.36,.5]},NARROW='(max-width: 900px)';

// Prefer the codec this device decodes smoothly and power-efficiently.
const CODECS=[['-av1.mp4','video/mp4; codecs="av01.0.08M.08"'],['-hevc.mp4','video/mp4; codecs="hvc1.1.6.L120.90"'],['.mp4','video/mp4; codecs="avc1.640028"']];
async function pickSource(stem,width,height,bitrate){
 const caps=navigator.mediaCapabilities;
 const probe=document.createElement('video');
 const results=await Promise.all(CODECS.map(async([suffix,contentType])=>{
  if(!probe.canPlayType(contentType))return null;
  if(!caps?.decodingInfo)return {suffix,smooth:true,efficient:suffix==='.mp4'};
  try{const info=await caps.decodingInfo({type:'file',video:{contentType,width,height,bitrate,framerate:24}});return info.supported?{suffix,smooth:info.smooth,efficient:info.powerEfficient}:null;}catch{return null;}
 }));
 const ok=results.filter(Boolean);
 const best=ok.find(r=>r.smooth&&r.efficient)||ok.find(r=>r.smooth)||{suffix:'.mp4'};
 return stem+best.suffix;
}
const network=()=>({...(navigator.connection||{}),narrow:matchMedia(NARROW).matches});

function GameWall({paused}){
 const root=useRef(null),canvas=useRef(null),film=useRef(null),lift=useRef(null),clipRef=useRef(null),pauseMotionRef=useRef(null);
 const [visible,setVisible]=useState(true),[shown,setShown]=useState(()=>!document.hidden);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [stem,setStem]=useState(()=>wallVideoStem(network())),[band,setBand]=useState(()=>matchMedia(NARROW).matches?BAND.narrow:BAND.wide);
 const [src,setSrc]=useState(null),[liftCodec,setLiftCodec]=useState('.mp4'),[gl,setGl]=useState(true);
 const [frameReady,setFrameReady]=useState(false),[contextVersion,setContextVersion]=useState(0);
 useEffect(()=>{
  const narrow=matchMedia(NARROW),motion=matchMedia('(prefers-reduced-motion: reduce)'),connection=navigator.connection;
  const layout=()=>{setBand(narrow.matches?BAND.narrow:BAND.wide);setStem(wallVideoStem(network()));};
  const preference=()=>setReduced(motion.matches);
  narrow.addEventListener('change',layout);motion.addEventListener('change',preference);connection?.addEventListener?.('change',layout);
  const o=new IntersectionObserver(([e])=>setVisible(e.isIntersecting));o.observe(root.current);
  const v=()=>setShown(!document.hidden);document.addEventListener('visibilitychange',v);
  return()=>{narrow.removeEventListener('change',layout);motion.removeEventListener('change',preference);connection?.removeEventListener?.('change',layout);o.disconnect();document.removeEventListener('visibilitychange',v);};
 },[]);
 useEffect(()=>{
  let live=true;const hd=stem.endsWith('-hd');
  pickSource(stem,hd?WALL.w:1600,hd?WALL.h:Math.round(1600*WALL.h/WALL.w),hd?16e6:8e6).then(s=>{if(live)setSrc(s);});
  pickSource('/assets/brand/lift/kickflip-coast',512,1000,2e6).then(s=>{if(live)setLiftCodec(s.slice('/assets/brand/lift/kickflip-coast'.length));});
  return()=>{live=false;};
 },[stem]);
 const running=visible&&shown&&!paused&&!reduced&&gl,live=useRef(running);live.current=running;
 useEffect(()=>{const v=film.current;if(!v||!src)return;if(running)v.play().then(()=>{if(!live.current)v.pause();}).catch(()=>{});else{v.pause();clipRef.current?.pause();pauseMotionRef.current?.();}},[running,src]);

 useEffect(()=>{
  const video=film.current,node=lift.current,clip=clipRef.current,surface=canvas.current,tile=node?.querySelector('canvas'),paint=tile?.getContext('2d',{alpha:false});
  if(!src||!video||!node||!clip||!surface||!paint)return;
  setFrameReady(false);
  const renderer=createWallRenderer(surface,video,WALL,{
   onContextLost:()=>{live.current=false;video.pause();pauseMotion();land();setGl(false);setFrameReady(false);},
   onContextRestored:()=>{setGl(true);setContextVersion(n=>n+1);},
  });
  if(!renderer){setGl(false);return;}
  setGl(true);
  // Paint each new lift-clip frame into the tile canvas (24/s, 512x1000).
  let dead=false,clipFrame=0;const clipRvfc=typeof clip.requestVideoFrameCallback==='function';
  const drawClip=()=>{if(dead)return;if(clip.readyState>=2)paint.drawImage(clip,0,0,tile.width,tile.height);clipFrame=clipRvfc?clip.requestVideoFrameCallback(drawClip):0;};
  if(clipRvfc)clipFrame=clip.requestVideoFrameCallback(drawClip);
  let raf=0,last=performance.now(),clock=root.current.__wallClock??0,shownFrame=false;
  let current=null,pending=null,cancelSeek=null,nextAt=clock+1.2,turn=0,recent=[];
  const pauseMotion=()=>{if(current)current.started=false;if(pending?.seeking){cancelSeek?.();pending=null;nextAt=clock+.3;}};
  pauseMotionRef.current=pauseMotion;
  const lead=.35,seekLead=.12;
  const land=()=>{node.classList.remove('is-lifting');node.style.transform='';clip.pause();current=null;};
  const plan=()=>{
   const next=pickLift(clock,band[0],band[1],{turn,recent,lead,videoTime:video.currentTime});
   if(!next){nextAt=clock+.4;return;}
   pending={game:next.lift,at:clock+next.delay-seekLead,seeking:false,turn:next.turn};
   const want=`/assets/brand/lift/${next.lift.id}${liftCodec}`;
   if(!clip.src.endsWith(want)){clip.src=want;node.querySelector('.game-lift-tile').style.backgroundImage=`url(/assets/brand/lift/${next.lift.id}.jpg)`;clip.load();}
  };
  const begin=(game,hold=0)=>{
   const place=liftPlacement(game,clock);
   Object.assign(node.style,{left:`${place.left}%`,top:`${place.top}%`,width:`${place.width}%`,height:`${place.height}%`,transform:'translate3d(0,0,0)'});
   node.classList.remove('is-lifting');void node.offsetWidth;node.classList.add('is-lifting');
   current={game,t0:clock,playAt:clock+hold/1000,started:false,rippled:false};recent=[game.id];
  };
  const tick=nowMs=>{
   if(dead)return;
   const dt=Math.min(.1,(nowMs-last)/1000);last=nowMs;
   const running=live.current;
   if(running){
    clock+=dt;
    // Gently lock the scroll clock to the video clock (both 3s-periodic) so each
    // featured tile always reaches the lift line at its planned loop time.
    if(video.readyState>=2&&!video.paused){const err=((video.currentTime-clock)%3+4.5)%3-1.5;clock+=err*.03;}
   }
   // Offscreen or paused: keep the last frame, spend nothing.
   if(!running){
    pauseMotion();
    if(shownFrame){raf=requestAnimationFrame(tick);return;}
   }
   if(renderer.draw(clock,nowMs/1000)&&!shownFrame){shownFrame=true;setFrameReady(true);}
   if(running){
    if(current){
     if(!current.started&&clock>=current.playAt){current.started=true;clip.play().then(()=>{if(!live.current)clip.pause();}).catch(()=>{});}
     const e=clock-current.t0,ms=e*1000;
     node.style.transform=`translate3d(0,${-e*WALL_SPEED/WALL.tileH*100}%,0)`;
     if(!clipRvfc)drawClip();
     if(!current.rippled&&ms>=LIFT_MS*.86){
      current.rippled=true;
      renderer.ripple((current.game.col*WALL.cellW+WALL.tileW/2),tileY(current.game.col,current.game.row,clock)+WALL.tileH/2,1.25,nowMs/1000);
     }
     if(ms>=LIFT_MS){land();nextAt=clock+.9;}
    }else if(!pending&&clock>=nextAt)plan();
    else if(pending&&!pending.seeking&&clock>=pending.at){
     // Seek the lifted copy to the frame the wall is about to show; rise once it lands there.
     const game=pending.game;pending.seeking=true;
     if(video.readyState<2||clip.readyState<2||!hasRunway(game,video.currentTime+seekLead)){recent=[...recent,game.id].slice(-3);pending=null;nextAt=clock+.3;}
     else{
      let done=false,timer;const cancel=()=>{done=true;clearTimeout(timer);clip.removeEventListener('seeked',go);cancelSeek=null;};
      const go=()=>{if(done||dead)return;cancel();const nextTurn=pending?.turn;pending=null;
       if(!live.current){nextAt=clock+.3;return;}turn=nextTurn??turn;
       if(clip.readyState>=2)paint.drawImage(clip,0,0,tile.width,tile.height);
       // Hold on the shared wall clock, so scrolling away cannot start playback in the background.
       const ahead=(((liftClipTime(game,video.currentTime)-clip.currentTime)%3)+3)%3,hold=ahead>1.5?(3-ahead)*1000:0;
       begin(game,hold);};
      cancelSeek=cancel;clip.addEventListener('seeked',go);
      timer=setTimeout(()=>{if(!done&&!dead){cancel();recent=[...recent,game.id].slice(-3);pending=null;nextAt=clock+.3;}},400);
      clip.currentTime=liftClipTime(game,video.currentTime+seekLead);
     }
    }
   }
   raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return()=>{dead=true;cancelAnimationFrame(raf);if(pauseMotionRef.current===pauseMotion)pauseMotionRef.current=null;cancelSeek?.();if(clipRvfc&&clipFrame)clip.cancelVideoFrameCallback(clipFrame);if(root.current)root.current.__wallClock=clock;land();renderer.dispose();};
 },[src,band,liftCodec,contextVersion]);

 return <div ref={root} className={`hero-game-wall ${running?'is-running':''} ${frameReady?'is-live':''} ${gl?'':'is-static'}`} aria-hidden="true">
  <div className="game-wall-plane">
   <img className="game-wall-poster" src="/assets/brand/game-wall-poster.jpg" alt="" style={{aspectRatio:`${WALL.w}/${WALL.h}`}}/>
   <canvas ref={canvas} className="game-wall-canvas" style={{aspectRatio:`${WALL.w}/${WALL.h}`}}/>
   <div ref={lift} className="game-lift" style={{'--lift-ms':`${LIFT_MS}ms`}}>
    <span className="game-lift-slot"/>
    <span className="game-lift-glow"/>
    <div className="game-lift-tile"><canvas width="512" height="1000"/></div>
   </div>
  </div>
  {/* A visibly playing <video> caps Chrome's animation rate at 30fps, so both
      videos stay hidden and are only used as frame sources. */}
  <video ref={clipRef} className="game-wall-source" muted playsInline preload="auto" disablePictureInPicture/>
  <video ref={film} className="game-wall-source" src={reduced?undefined:src||undefined} muted loop playsInline preload="auto" disablePictureInPicture/>
  <span className="slop-hero-veil"/>
 </div>;
}

export default function Hero({suspended=false}){
 return <section className="slop-hero" aria-labelledby="hero-title">
  <GameWall paused={suspended}/>
  <div className="slop-hero-copy">
   <h1 id="hero-title" aria-label="Just one more game."><span className="slop-hero-line is-outline" aria-hidden="true"><i>Just</i> <i>one</i></span><span className="slop-hero-line" aria-hidden="true"><i>more</i> <em><i>game.</i></em></span></h1>
   <p className="slop-hero-lede">Find your next obsession. Put your name on the leaderboard.</p>
   <div className="slop-hero-entry"><a className="slop-hero-play" href="#/feed">Let’s play<SlopMark/></a></div>
   <div className="slop-hero-downloads"><DownloadLinks compact/></div>
  </div>
  <HeroPerch paused={suspended}/>
 </section>;
}
