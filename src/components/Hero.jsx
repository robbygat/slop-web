import React,{useEffect,useRef,useState} from 'react';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import {HERO_WALL as WALL,HERO_LIFT_MS as LIFT_MS,findWallSlot as slotAt,sampleWallLift,wallVideoSource} from '../lib/hero-wall.js';
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
 // Ride with the column frame-by-frame from the wall's own media clock, so a
 // stalled, throttled or looping video can never pull the game off its slot.
 const lift=useRef(null),tile=useRef(null);
 useEffect(()=>{
  const v=film.current,node=lift.current,canvas=tile.current;if(!running||!slot||!v||!node||!canvas)return;
  const density=Math.min(2,devicePixelRatio||1);canvas.width=Math.ceil(WALL.tileW*density);canvas.height=Math.ceil(WALL.tileH*density);
  const context=canvas.getContext('2d',{alpha:false});
  let id=0,dead=false;const rvfc=typeof v.requestVideoFrameCallback==='function';
  const cancelLift=()=>{setSlot(null);setTurn(n=>n+1);};
  const paint=t=>{
   if(v.readyState<2||!context){cancelLift();return false;}
   const sample=sampleWallLift(slot,t,v.videoWidth,v.videoHeight),{x,y,width,height}=sample.source;
   try{context.drawImage(v,x,y,width,height,0,0,canvas.width,canvas.height);}catch{cancelLift();return false;}
   node.style.transform=`translate3d(0,${sample.offsetPercent}%,0)`;
   canvas.style.visibility='visible';return true;
  };
  const tick=(_now,meta)=>{if(dead||!paint(meta?.mediaTime??v.currentTime))return;id=rvfc?v.requestVideoFrameCallback(tick):requestAnimationFrame(tick);};
  if(paint(v.currentTime))id=rvfc?v.requestVideoFrameCallback(tick):requestAnimationFrame(tick);
  return()=>{dead=true;rvfc?v.cancelVideoFrameCallback(id):cancelAnimationFrame(id);};
 },[running,slot,src]);
 return <div ref={root} className={`hero-game-wall ${running?'is-running':''}`} aria-hidden="true">
  <div className="game-wall-plane">
   <video ref={film} className="game-wall-film" src={reduced?undefined:src} poster="/assets/brand/game-wall-poster.jpg" muted loop playsInline preload={reduced?'none':'auto'} disablePictureInPicture/>
   {slot&&<div ref={lift} key={slot.turn} className="game-lift" style={{left:`${slot.left}%`,top:`${slot.top}%`,width:`${WALL.tileW/WALL.w*100}%`,'--lift-ms':`${LIFT_MS}ms`}}>
    <span className="game-lift-slot"/>
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
