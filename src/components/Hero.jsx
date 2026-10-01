import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './Icon.jsx';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import './brand-home.css';
import './home-hero.css';
import './hero-v2.css';

// 132 real games, rendered once into one tiled clip (public/assets/brand/game-wall.mp4)
// and scrolled endlessly on a tilted plane. Two stacked copies make the loop seamless.
function GameWall({paused}){
 const root=useRef(null),[visible,setVisible]=useState(true);
 const [reduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const o=new IntersectionObserver(([e])=>setVisible(e.isIntersecting));o.observe(root.current);return()=>o.disconnect();},[]);
 const running=visible&&!paused&&!reduced;
 useEffect(()=>{root.current?.querySelectorAll('video').forEach(v=>{if(running)v.play().catch(()=>{});else v.pause();});},[running]);
 const clip=<video src="/assets/brand/game-wall.mp4" poster="/assets/brand/game-wall-poster.jpg" muted loop playsInline preload="auto" autoPlay={!reduced} disablePictureInPicture/>;
 return <div ref={root} className={`game-wall ${running?'is-running':''}`} aria-hidden="true"><div className="game-wall-plane"><div className="game-wall-track">{clip}{clip}</div></div></div>;
}

export default function Hero({suspended=false}){
 const explore=e=>{e.preventDefault();document.getElementById('discover')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
 return <section className="slop-hero" aria-labelledby="hero-title">
  <GameWall paused={suspended}/>
  <span className="slop-hero-veil" aria-hidden="true"/>
  <div className="slop-hero-copy">
   <h1 id="hero-title"><span>Just one</span><span>more <em>game.</em></span></h1>
   <p className="slop-hero-lede">Find your next obsession. Put your name on the leaderboard.</p>
   <div className="slop-hero-entry"><a className="slop-hero-play" href="#/feed">Let’s play <SlopMark/></a><a className="slop-hero-explore" href="#discover" onClick={explore}>Explore games <Icon name="arrow" size={17}/></a></div>
  </div>
  <HeroPerch paused={suspended}/>
 </section>;
}
