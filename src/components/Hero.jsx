import React,{useEffect,useRef,useState} from 'react';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import {HERO_WALL as WALL,HERO_LIFT_MS as LIFT_MS,findWallSlot as slotAt,sampleWallLift,sampleWallRide,wallVideoSource} from '../lib/hero-wall.js';
import './brand-home.css';
import './home-hero.css';
import './hero-v2.css';

// 132 real games baked into one 15s loop: columns already scroll in alternating
// directions inside the clip, so the page decodes one video and animates nothing
// but compositor transforms. Fast connections get the sharp cut on phones too.
// Even columns beside the copy; lifts stay inside the wall for their full ride.
const SPOTS={wide:{cols:[4,2],start:.68},narrow:{cols:[2,4],start:.8}};
const wallSource=()=>wallVideoSource(navigator.connection||{});
function GameWall({paused}){
 const root=useRef(null),film=useRef(null),[visible,setVisible]=useState(true),[shown,setShown]=useState(()=>!document.hidden),[turn,setTurn]=useState(0),[slot,setSlot]=useState(null);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[src,setSrc]=useState(wallSource);
 const narrowQuery='(max-width: 900px)',[spots,setSpots]=useState(()=>matchMedia(narrowQuery).matches?SPOTS.narrow:SPOTS.wide);
 useEffect(()=>{
  const q=matchMedia(narrowQuery),connection=navigator.connection,motion=matchMedia('(prefers-reduced-motion: reduce)');
  const layout=()=>{setSpots(q.matches?SPOTS.narrow:SPOTS.wide);setSlot(null);setTurn(n=>n+1);};
  const network=()=>{const next=wallSource();if(next!==src){setSrc(next);setSlot(null);setTurn(n=>n+1);}};
  const preference=()=>setReduced(motion.matches);
  q.addEventListener('change',layout);connection?.addEventListener?.('change',network);motion.addEventListener('change',preference);
  return()=>{q.removeEventListener('change',layout);connection?.removeEventListener?.('change',network);motion.removeEventListener('change',preference);};
 },[src]);
 useEffect(()=>{const o=new IntersectionObserver(([e])=>setVisible(e.isIntersecting));o.observe(root.current);const v=()=>setShown(!document.hidden);document.addEventListener('visibilitychange',v);return()=>{o.disconnect();document.removeEventListener('visibilitychange',v);};},[]);
 const running=visible&&shown&&!paused&&!reduced;
 useEffect(()=>{root.current?.querySelectorAll('video').forEach(v=>{if(running)v.play().catch(()=>{});else v.pause();});},[running,slot,src]);
 useEffect(()=>{
  if(!running){setSlot(null);return;}
  // Lift the tile already playing in the wall; no unrelated clip or decoder.
  const start=setTimeout(()=>{const v=film.current;const found=v&&v.readyState>=2&&slotAt(spots.cols[turn%spots.cols.length],v.currentTime,spots.start);if(found)setSlot({...found,t:v.currentTime,turn});else setTurn(n=>n+1);},900);
  return()=>clearTimeout(start);
 },[running,turn,spots,src]);
 useEffect(()=>{if(!slot)return;const t=setTimeout(()=>{setSlot(null);setTurn(n=>n+1);},LIFT_MS);return()=>clearTimeout(t);},[slot]);
 // Decode crops at the source cadence; ride at the display cadence. The
 // opening stays on the actual wall while the airborne tile moves smoothly.
 const lift=useRef(null),tile=useRef(null),opening=useRef(null);
 useEffect(()=>{
  const v=film.current,node=lift.current,canvas=tile.current,hole=opening.current;if(!running||!slot||!v||!node||!canvas)return;
  const density=Math.min(2,devicePixelRatio||1);canvas.width=Math.ceil(WALL.tileW*density);canvas.height=Math.ceil(WALL.tileH*density);
  const context=canvas.getContext('2d',{alpha:false}),startedAt=performance.now();
  let frameId=null,rideId=null,dead=false,frame=null,frozenAt=null,lastPlacement='';
  const rvfc=typeof v.requestVideoFrameCallback==='function';
  const stop=()=>{dead=true;if(rideId!==null)cancelAnimationFrame(rideId);if(rvfc&&frameId!==null)v.cancelVideoFrameCallback(frameId);};
  const cancelLift=()=>{stop();setSlot(null);setTurn(n=>n+1);};
  const place=(now)=>{
   if(!frame)return;
   if(v.paused||v.readyState<3){if(frozenAt===null)frozenAt=now;}else frozenAt=null;
   const sample=sampleWallRide(slot,frame,frozenAt??now,(now-startedAt)/LIFT_MS,v.playbackRate);
   const placement=`${sample.offsetPercent}:${sample.frameOffsetPercent}`;if(placement===lastPlacement)return;lastPlacement=placement;
   node.style.transform=`translate3d(0,${sample.offsetPercent}%,0)`;
   if(hole){const counter=sample.frameOffsetPercent-sample.offsetPercent;
    // The opening extends 1px on each edge: convert its own percentage basis
    // back to the parent's height without reading layout every display frame.
    hole.style.transform=`translate3d(0,calc(${counter}% + ${-counter*.02}px),0)`;
   }
  };
  const paint=(mediaTime,expectedDisplayTime,now)=>{
   if(v.readyState<2||!context){cancelLift();return false;}
   const sample=sampleWallLift(slot,mediaTime,v.videoWidth,v.videoHeight),{x,y,width,height}=sample.source;
   try{context.drawImage(v,x,y,width,height,0,0,canvas.width,canvas.height);}catch{cancelLift();return false;}
   frame={mediaTime,expectedDisplayTime};frozenAt=null;place(now);
   canvas.style.visibility='visible';return true;
  };
  const ride=now=>{
   rideId=null;if(dead)return;
   if(!rvfc&&v.readyState>=2){
    // Old browsers have no decoded-frame metadata. Crop once per presented
    // 24fps interval, never round currentTime forward into a future frame.
    const mediaTime=Math.floor(v.currentTime*24+1e-7)/24;
    if(!frame||frame.mediaTime!==mediaTime){
     const expected=now-Math.max(0,v.currentTime-mediaTime)/Math.max(.01,v.playbackRate)*1000;
     if(!paint(mediaTime,expected,now))return;
    }
   }
   place(now);rideId=requestAnimationFrame(ride);
  };
  const decoded=(now,metadata)=>{
   frameId=null;if(dead)return;
   if(!paint(metadata.mediaTime,Number.isFinite(metadata.expectedDisplayTime)?metadata.expectedDisplayTime:now,now))return;
   if(rideId===null)rideId=requestAnimationFrame(ride);
   frameId=v.requestVideoFrameCallback(decoded);
  };
  if(rvfc)frameId=v.requestVideoFrameCallback(decoded);
  else rideId=requestAnimationFrame(ride);
  return stop;
 },[running,slot,src]);
 return <div ref={root} className={`hero-game-wall ${running?'is-running':''}`} aria-hidden="true">
  <div className="game-wall-plane">
   <video ref={film} className="game-wall-film" src={reduced?undefined:src} poster="/assets/brand/game-wall-poster.jpg" muted loop playsInline preload={reduced?'none':'auto'} disablePictureInPicture/>
   {slot&&<div ref={lift} key={slot.turn} className="game-lift" style={{left:`${slot.left}%`,top:`${slot.top}%`,width:`${WALL.tileW/WALL.w*100}%`,'--lift-ms':`${LIFT_MS}ms`}}>
    <span ref={opening} className="game-lift-slot"/>
    <div className="game-lift-tile"><canvas ref={tile} className="game-lift-canvas" width={WALL.tileW} height={WALL.tileH}/></div>
   </div>}
  </div>
  <span className="slop-hero-veil"/>
 </div>;
}

export default function Hero({suspended=false}){
 return <section className="slop-hero" aria-labelledby="hero-title">
  <GameWall paused={suspended}/>
  <div className="slop-hero-copy">
   <h1 id="hero-title"><span>Just one</span><span>more <em>game.</em></span></h1>
   <p className="slop-hero-lede">Find your next obsession. Put your name on the leaderboard.</p>
   <div className="slop-hero-entry"><a className="slop-hero-play" href="#/feed">Let’s play <SlopMark/></a></div>
  </div>
  <HeroPerch paused={suspended}/>
 </section>;
}
