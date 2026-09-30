import React,{useRef,useState} from 'react';
import {Icon} from './Icon.jsx';
import HeroScene from './HeroScene.jsx';
import SlopMark from './SlopMark.jsx';
import DownloadLinks from './DownloadLinks.jsx';
import './brand-home.css';
export default function Hero(){
  const hero=useRef(null),copy=useRef(null),[paused,setPaused]=useState(false);
  const explore=e=>{e.preventDefault();document.getElementById('discover')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  return <section className="slop-hero" ref={hero} aria-labelledby="hero-title">
    <SlopMark className="hero-watermark"/>
    <HeroScene heroRef={hero} copyRef={copy} paused={paused}/>
    <div className="slop-hero-copy" ref={copy}><h1 id="hero-title">Just one <br/>more game.</h1><p>A whole world of games. <br/>A little less ordinary.</p><div className="slop-hero-actions"><a className="button" href="#/feed">Let’s play <Icon name="play" fill="currentColor" size={17}/></a><a href="#discover" onClick={explore}>Explore games <Icon name="arrow" size={17}/></a></div><DownloadLinks/></div>
    <div className="orbit-caption"><span>Tap a character. Change the orbit.</span><button onClick={()=>setPaused(v=>!v)} aria-label={paused?'Resume hero animation':'Pause hero animation'}><Icon name={paused?'play':'pause'} size={15}/></button></div>
    <a className="hero-scroll" href="#discover" aria-label="Explore the game wall" onClick={explore}><Icon name="chevron" size={20}/></a>
  </section>;
}
