import React,{useEffect,useState} from 'react';
import {Icon} from './Icon.jsx';
import HeroScene from './HeroScene.jsx';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import DownloadLinks from './DownloadLinks.jsx';
import LiteHeroScene from './LiteHeroScene.jsx';
import {lightHero} from '../lib/hero-policy.js';
import './brand-home.css';
import './home-hero.css';
export default function Hero({suspended=false}){
 const [paused,setPaused]=useState(false),[light,setLight]=useState(()=>lightHero({compact:matchMedia('(max-width:900px)').matches,coarse:matchMedia('(pointer:coarse)').matches,saveData:navigator.connection?.saveData,effectiveType:navigator.connection?.effectiveType}));
 useEffect(()=>{const compact=matchMedia('(max-width:900px)'),coarse=matchMedia('(pointer:coarse)'),connection=navigator.connection;const update=()=>setLight(lightHero({compact:compact.matches,coarse:coarse.matches,saveData:connection?.saveData,effectiveType:connection?.effectiveType}));compact.addEventListener('change',update);coarse.addEventListener('change',update);connection?.addEventListener('change',update);update();return()=>{compact.removeEventListener('change',update);coarse.removeEventListener('change',update);connection?.removeEventListener('change',update);};},[]);
 const explore=e=>{e.preventDefault();document.getElementById('discover')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
 return <section className="home-hero" aria-labelledby="hero-title">
  <div className="hero-intro"><h1 id="hero-title"><span>Just one</span><span>more game.</span></h1><p>A whole world of games.<br/>A little less ordinary.</p><div className="hero-entry"><a className="button" href="#/feed">Let’s play <SlopMark/></a><a href="#discover" onClick={explore}>All games <Icon name="arrow" size={18}/></a></div><DownloadLinks/></div>
  <div className="hero-stage"><div className="hero-orbit-backdrop" aria-hidden="true"><i/><i/><i/><span/><span/></div>{light?<LiteHeroScene paused={paused||suspended}/>:<HeroScene paused={paused||suspended}/>}<div className="hero-scene-controls"><span>Tap a character to swap.</span><button onClick={()=>setPaused(v=>!v)} aria-label={paused?'Resume hero animation':'Pause hero animation'}><Icon name={paused?'play':'pause'} size={15}/></button></div></div>
  <HeroPerch paused={paused||suspended}/>
 </section>;
}
