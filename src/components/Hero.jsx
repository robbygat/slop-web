import React from 'react';
import {Icon} from './Icon.jsx';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import './brand-home.css';
import './home-hero.css';
import './hero-v2.css';

// One idea, one action: the crowned Slop sits on the headline it is selling.
export default function Hero({suspended=false}){
 const explore=e=>{e.preventDefault();document.getElementById('discover')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
 return <section className="slop-hero" aria-labelledby="hero-title">
  <span className="slop-hero-grid" aria-hidden="true"/>
  <span className="slop-hero-glow" aria-hidden="true"/>
  <p className="slop-hero-eyebrow"><Icon name="crown" size={14}/>There’s always a score to beat</p>
  <h1 id="hero-title"><span>Just one</span><span className="slop-hero-last">more <em>game.</em><HeroPerch paused={suspended}/></span></h1>
  <p className="slop-hero-copy">Find your next obsession. Put your name on the leaderboard.</p>
  <div className="slop-hero-entry"><a className="slop-hero-play" href="#/feed">Let’s play <SlopMark/></a><a className="slop-hero-explore" href="#discover" onClick={explore}>Explore games <Icon name="arrow" size={17}/></a></div>
 </section>;
}
