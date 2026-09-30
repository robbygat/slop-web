import React,{useEffect,useState} from 'react';
import {Icon} from './Icon.jsx';
import HeroScene from './HeroScene.jsx';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import LiteHeroScene from './LiteHeroScene.jsx';
import {lightHero} from '../lib/hero-policy.js';
import './brand-home.css';
import './home-hero.css';

const connectionPolicy=()=>lightHero({saveData:navigator.connection?.saveData,effectiveType:navigator.connection?.effectiveType});
export default function Hero({suspended=false}){
 const [light,setLight]=useState(connectionPolicy);
 useEffect(()=>{const connection=navigator.connection;const update=()=>setLight(connectionPolicy());connection?.addEventListener('change',update);return()=>connection?.removeEventListener('change',update);},[]);
 const explore=e=>{e.preventDefault();document.getElementById('discover')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
 return <section className="home-hero" aria-labelledby="hero-title">
  <div className="hero-intro"><h1 id="hero-title"><span>Just one</span><span className="hero-title-finish">more game.<i className="hero-title-spark" aria-hidden="true"/></span></h1><p><span className="hero-copy-long">Find your next obsession. <br/>Put your name on the leaderboard.</span><span className="hero-copy-short">Pick a game. Chase a crown.</span></p><div className="hero-entry"><a className="button" href="#/feed">Let’s play <SlopMark/></a><a href="#discover" onClick={explore}>Explore games <Icon name="arrow" size={18}/></a></div><span className="hero-invitation"><Icon name="crown" size={16}/>There’s always a score to beat.</span></div>
  <div className="hero-stage"><picture className="hero-world" aria-hidden="true"><source media="(max-width:600px)" srcSet="/assets/brand/hero-arcade-world-mobile.webp"/><img src="/assets/brand/hero-arcade-world.webp" width="1440" height="960" alt="" decoding="async" fetchPriority="high"/></picture><span className="hero-world-shade" aria-hidden="true"/>{light?<LiteHeroScene paused={suspended}/>:<HeroScene paused={suspended}/>}</div>
  <HeroPerch paused={suspended}/>
 </section>;
}
