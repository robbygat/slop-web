import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './Icon.jsx';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import './brand-home.css';
import './home-hero.css';
import './hero-v2.css';

// 132 real games baked into one 14s loop: columns already scroll in alternating
// directions inside the clip, so the page decodes one video and animates nothing
// but compositor transforms. Wide screens on fast connections get the sharp cut.
const LIFTS=[
 {id:'kickflip-coast',name:'Kickflip Coast'},{id:'run-infinite',name:'Run Infinite'},
 {id:'aqua-slide',name:'Aqua Slide'},{id:'cube-surfer',name:'Cube Surfer'},
 {id:'stumble-run',name:'Stumble Run'},{id:'draw-climber',name:'Draw Climber'},
];
const LIFT_MS=5200;
// Geometry of game-wall.mp4 (see HERO_HANDOFF.md): 22 columns of 128×250 tiles in
// 134×256 cells, 6 rows per 1536px wall, 14s loop. Column c is cropped at
// y=mod(t*H/14+(c*137)%H, H), so even columns move up at H/14 px per second.
const WALL={w:2948,h:1536,cellW:134,cellH:256,tileW:128,tileH:250,loop:14};
const RISE=WALL.h/WALL.loop*LIFT_MS/1000;
// Even columns that sit beside the copy, and where a lift should start (as a
// fraction of wall height) so the game stays in view while it rides up.
const SPOTS={wide:{cols:[4,6,2,8],start:.68},narrow:{cols:[2,4],start:.9}};
// Find the real tile slot in a column at video time t, nearest the target row.
function slotAt(col,t,start){
 const crop=(t*WALL.h/WALL.loop+(col*137)%WALL.h)%WALL.h;
 let best=null;
 for(let k=0;k<12;k++){const y=((k*WALL.cellH-crop)%WALL.h+WALL.h)%WALL.h;const d=Math.abs(y-start*WALL.h);if(!best||d<best.d)best={y,d};}
 return {left:col*WALL.cellW/WALL.w*100,top:best.y/WALL.h*100};
}
const wallSource=()=>{const c=navigator.connection;return matchMedia('(min-width: 1000px)').matches&&!c?.saveData&&!['slow-2g','2g','3g'].includes(c?.effectiveType)?'/assets/brand/game-wall-hd.mp4':'/assets/brand/game-wall.mp4';};
function GameWall({paused}){
 const root=useRef(null),film=useRef(null),[visible,setVisible]=useState(true),[shown,setShown]=useState(()=>!document.hidden),[turn,setTurn]=useState(0),[slot,setSlot]=useState(null);
 const [reduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[src,setSrc]=useState(wallSource);
 const narrowQuery='(max-width: 900px)',[spots,setSpots]=useState(()=>matchMedia(narrowQuery).matches?SPOTS.narrow:SPOTS.wide);
 useEffect(()=>{const q=matchMedia(narrowQuery),w=matchMedia('(min-width: 1000px)');const sync=()=>{setSpots(q.matches?SPOTS.narrow:SPOTS.wide);setSrc(wallSource());setSlot(null);};q.addEventListener('change',sync);w.addEventListener('change',sync);return()=>{q.removeEventListener('change',sync);w.removeEventListener('change',sync);};},[]);
 useEffect(()=>{const o=new IntersectionObserver(([e])=>setVisible(e.isIntersecting));o.observe(root.current);const v=()=>setShown(!document.hidden);document.addEventListener('visibilitychange',v);return()=>{o.disconnect();document.removeEventListener('visibilitychange',v);};},[]);
 const running=visible&&shown&&!paused&&!reduced;
 useEffect(()=>{root.current?.querySelectorAll('video').forEach(v=>{if(running)v.play().catch(()=>{});else v.pause();});},[running,slot]);
 useEffect(()=>{
  if(!running){setSlot(null);return;}
  // Wait a beat between lifts, then lock onto the slot the wall is showing right now.
  const start=setTimeout(()=>{const v=film.current;if(v&&v.readyState>=2)setSlot({...slotAt(spots.cols[turn%spots.cols.length],v.currentTime,spots.start),turn});else setTurn(n=>n+1);},900);
  return()=>clearTimeout(start);
 },[running,turn,spots]);
 useEffect(()=>{if(!slot)return;const t=setTimeout(()=>{setSlot(null);setTurn(n=>n+1);},LIFT_MS);return()=>clearTimeout(t);},[slot]);
 const game=LIFTS[turn%LIFTS.length],next=LIFTS[(turn+1)%LIFTS.length];
 return <div ref={root} className={`game-wall ${running?'is-running':''}`} aria-hidden="true">
  <div className="game-wall-plane">
   <video ref={film} className="game-wall-film" src={src} poster="/assets/brand/game-wall-poster.jpg" muted loop playsInline preload="auto" autoPlay={!reduced} disablePictureInPicture/>
   {slot&&<div key={slot.turn} className="game-lift" style={{left:`${slot.left}%`,top:`${slot.top}%`,width:`${WALL.tileW/WALL.w*100}%`,'--lift-ms':`${LIFT_MS}ms`,'--rise':`${-RISE/WALL.tileH*100}%`}}>
    <span className="game-lift-slot"/>
    <div className="game-lift-tile"><video src={`/assets/brand/lift/${game.id}.mp4`} poster={`/assets/brand/lift/${game.id}.jpg`} muted loop playsInline autoPlay preload="auto" disablePictureInPicture/></div>
   </div>}
  </div>
  {!reduced&&<link rel="preload" as="video" href={`/assets/brand/lift/${next.id}.mp4`}/>}
  <span className="slop-hero-veil"/>
 </div>;
}

export default function Hero({suspended=false}){
 const explore=e=>{e.preventDefault();document.getElementById('discover')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
 return <section className="slop-hero" aria-labelledby="hero-title">
  <GameWall paused={suspended}/>
  <div className="slop-hero-copy">
   <h1 id="hero-title"><span>Just one</span><span>more <em>game.</em></span></h1>
   <p className="slop-hero-lede">Find your next obsession. Put your name on the leaderboard.</p>
   <div className="slop-hero-entry"><a className="slop-hero-play" href="#/feed">Let’s play <SlopMark/></a><a className="slop-hero-explore" href="#discover" onClick={explore}>Explore games <Icon name="arrow" size={17}/></a></div>
  </div>
  <HeroPerch paused={suspended}/>
 </section>;
}
