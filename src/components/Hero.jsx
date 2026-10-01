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
const wallSource=()=>{const c=navigator.connection;return matchMedia('(min-width: 1000px)').matches&&!c?.saveData&&!['slow-2g','2g','3g'].includes(c?.effectiveType)?'/assets/brand/game-wall-hd.mp4':'/assets/brand/game-wall.mp4';};
function GameWall({paused}){
 const root=useRef(null),[visible,setVisible]=useState(true),[shown,setShown]=useState(()=>!document.hidden),[turn,setTurn]=useState(0);
 const [reduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[src]=useState(wallSource);
 useEffect(()=>{const o=new IntersectionObserver(([e])=>setVisible(e.isIntersecting));o.observe(root.current);const v=()=>setShown(!document.hidden);document.addEventListener('visibilitychange',v);return()=>{o.disconnect();document.removeEventListener('visibilitychange',v);};},[]);
 const running=visible&&shown&&!paused&&!reduced;
 useEffect(()=>{root.current?.querySelectorAll('video').forEach(v=>{if(running)v.play().catch(()=>{});else v.pause();});},[running,turn]);
 useEffect(()=>{if(!running)return;const t=setTimeout(()=>setTurn(n=>n+1),LIFT_MS+700);return()=>clearTimeout(t);},[running,turn]);
 const game=LIFTS[turn%LIFTS.length],next=LIFTS[(turn+1)%LIFTS.length];
 return <div ref={root} className={`game-wall ${running?'is-running':''}`} aria-hidden="true">
  <div className="game-wall-plane"><video className="game-wall-film" src={src} poster="/assets/brand/game-wall-poster.jpg" muted loop playsInline preload="auto" autoPlay={!reduced} disablePictureInPicture/></div>
  <span className="slop-hero-veil"/>
  {!reduced&&<div className="game-lift-stage">
   <div key={turn} className={`game-lift spot-${turn%3} ${running?'':'is-held'}`} style={{'--lift-ms':`${LIFT_MS}ms`}}>
    <span className="game-lift-shadow"/>
    <div className="game-lift-phone"><video src={`/assets/brand/lift/${game.id}.mp4`} poster={`/assets/brand/lift/${game.id}.jpg`} muted loop playsInline autoPlay preload="auto" disablePictureInPicture/><i/></div>
    <span className="game-lift-name">{game.name}</span>
   </div>
   <link rel="preload" as="video" href={`/assets/brand/lift/${next.id}.mp4`}/>
  </div>}
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
