import React,{useEffect,useRef,useState} from 'react';
import HeroPerch from './HeroPerch.jsx';
import SlopMark from './SlopMark.jsx';
import {HERO_LIFT_MS as LIFT_MS,HERO_WALL,elapsedMs,liftClipTime,liftPlacement,liftWindow,nextLiftInBand,wallVideoSource} from '../lib/hero-wall.js';
import './brand-home.css';
import './home-hero.css';
import './hero-v2.css';

// The hero wall: every game exactly once, baked into one 15s video whose
// columns scroll in alternating directions. Six featured games lift out of
// their own slot exactly when they reach the lift line:
//  - the ride runs on the compositor (Web Animations, display refresh rate) and
//    is only nudged back to the wall's media clock if it ever drifts;
//  - one game at a time, alternating sides, and only after its clip is buffered
//    and seeked to the matching frame, so a lift never flashes black;
//  - the lifted copy is a high-res loop of the same tile, phase-locked to the
//    frame the wall is showing, so nothing pops when it leaves or lands;
//  - no React renders, canvas copies or layout work happen during a lift.
// Visible band (fractions of wall height) a lift may start in, so games rise from
// wherever they happen to be, not one fixed spot.
const LINE={wide:[.58,.8],narrow:[.4,.56]},NARROW='(max-width: 900px)';
const network=()=>({...(navigator.connection||{}),narrow:matchMedia(NARROW).matches});
function GameWall({paused}){
 const root=useRef(null),film=useRef(null),lift=useRef(null);
 const [visible,setVisible]=useState(true),[shown,setShown]=useState(()=>!document.hidden);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [src,setSrc]=useState(()=>wallVideoSource(network())),[line,setLine]=useState(()=>matchMedia(NARROW).matches?LINE.narrow:LINE.wide);
 useEffect(()=>{
  const narrow=matchMedia(NARROW),motion=matchMedia('(prefers-reduced-motion: reduce)'),connection=navigator.connection;
  const layout=()=>{setLine(narrow.matches?LINE.narrow:LINE.wide);setSrc(wallVideoSource(network()));};
  const preference=()=>setReduced(motion.matches);
  narrow.addEventListener('change',layout);motion.addEventListener('change',preference);connection?.addEventListener?.('change',layout);
  const o=new IntersectionObserver(([e])=>setVisible(e.isIntersecting));o.observe(root.current);
  const v=()=>setShown(!document.hidden);document.addEventListener('visibilitychange',v);
  return()=>{narrow.removeEventListener('change',layout);motion.removeEventListener('change',preference);connection?.removeEventListener?.('change',layout);o.disconnect();document.removeEventListener('visibilitychange',v);};
 },[]);
 const running=visible&&shown&&!paused&&!reduced;
 useEffect(()=>{const v=film.current;if(!v)return;if(running)v.play().catch(()=>{});else v.pause();},[running,src]);

 useEffect(()=>{
  const wall=film.current;
  if(!running||!wall)return;
  const node=lift.current,video=node?.querySelector('video');if(!node||!video)return;
  const rvfc=typeof wall.requestVideoFrameCallback==='function';
  // One game at a time, preferring the other column and a game not seen
  // recently, with a breather between lifts.
  let dead=false,timer=0,frame=0,ride=null,current=null,lastCol=null,recent=[];
  const stopFrames=()=>{if(frame)rvfc?wall.cancelVideoFrameCallback(frame):cancelAnimationFrame(frame);frame=0;};
  const land=()=>{stopFrames();ride?.cancel();ride=null;node.classList.remove('is-lifting');video.pause();current=null;};
  const pick=()=>nextLiftInBand(wall.currentTime,line[0],line[1],{recent,avoidCol:lastCol});
  const schedule=()=>{
   if(dead)return;
   if(wall.readyState<2){timer=setTimeout(schedule,250);return;}
   const next=pick();if(!next){timer=setTimeout(schedule,500);return;}
   // Buffer this game's clip while it travels to the line.
   if(!video.src.endsWith(`/${next.lift.id}.mp4`)){video.src=`/assets/brand/lift/${next.lift.id}.mp4`;node.querySelector('.game-lift-tile').style.backgroundImage=`url(/assets/brand/lift/${next.lift.id}.jpg)`;video.load();}
   timer=setTimeout(()=>start(next.lift),Math.max(0,next.delay*1000/(wall.playbackRate||1)-160));
  };
  const start=game=>{
   if(dead)return;
   const t=wall.currentTime,{min,max}=liftWindow(0);
   const remember=()=>{lastCol=game.col;recent=[...recent,game.id].slice(-3);};
   const skip=()=>{remember();schedule();};
   // A stalled wall or an unbuffered clip skips this pass rather than flash black.
   if(wall.paused||wall.readyState<2||video.readyState<2)return skip();
   // Seek the lifted copy to the frame the wall will show, and rise only once it is there.
   const lead=.16;video.currentTime=liftClipTime(game,t+lead);
   let done=false;const go=()=>{
    if(done||dead)return;done=true;video.removeEventListener('seeked',go);
    const now=wall.currentTime,place=liftPlacement(game,now);
    if(place.y<min-12||place.y>max+12)return skip();
    Object.assign(node.style,{left:`${place.left}%`,top:`${place.top}%`,width:`${place.width}%`});
    // Already on the right frame (seeked ahead by `lead`); the sync below trims any residue.
    video.play().catch(()=>{});
    node.classList.remove('is-lifting');void node.offsetWidth;node.classList.add('is-lifting');
    ride=node.animate([{transform:'translate3d(0,0,0)'},{transform:`translate3d(0,${place.ridePercent}%,0)`}],{duration:LIFT_MS,easing:'linear',fill:'both'});
    current={game,t:now};remember();
    // Keep the compositor ride and the lifted clip on the wall's media clock.
    const sync=(_now,meta)=>{
     if(dead||!current)return;
     const media=meta?.mediaTime??wall.currentTime,expected=elapsedMs(current.t,media);
     if(ride&&expected<LIFT_MS&&Math.abs(ride.currentTime-expected)>34)ride.currentTime=expected;
     const want=liftClipTime(game,media),off=Math.abs(video.currentTime-want);if(off>.15&&off<2.85)video.currentTime=want;
     frame=rvfc?wall.requestVideoFrameCallback(sync):requestAnimationFrame(sync);
    };
    frame=rvfc?wall.requestVideoFrameCallback(sync):requestAnimationFrame(sync);
    ride.onfinish=()=>{land();timer=setTimeout(schedule,900);};
   };
   video.addEventListener('seeked',go);setTimeout(go,220);
  };
  const stall=()=>{ride?.pause();video.pause();},resume=()=>{if(ride&&current){ride.currentTime=Math.min(LIFT_MS,elapsedMs(current.t,wall.currentTime));ride.play();video.play().catch(()=>{});}};
  wall.addEventListener('waiting',stall);wall.addEventListener('playing',resume);
  schedule();
  return()=>{dead=true;clearTimeout(timer);land();wall.removeEventListener('waiting',stall);wall.removeEventListener('playing',resume);};
 },[running,line,src]);

 return <div ref={root} className={`hero-game-wall ${running?'is-running':''}`} aria-hidden="true">
  <div className="game-wall-plane">
   <video ref={film} className="game-wall-film" style={{aspectRatio:`${HERO_WALL.w}/${HERO_WALL.h}`}} src={reduced?undefined:src} poster="/assets/brand/game-wall-poster.jpg" muted loop playsInline preload={reduced?'none':'auto'} disablePictureInPicture/>
   <div ref={lift} className="game-lift" style={{'--lift-ms':`${LIFT_MS}ms`}}>
    <span className="game-lift-slot"/>
    <span className="game-lift-glow"/>
    <div className="game-lift-tile"><video muted loop playsInline preload="auto" disablePictureInPicture/></div>
   </div>
  </div>
  <span className="slop-hero-veil"/>
 </div>;
}

export default function Hero({suspended=false}){
 return <section className="slop-hero" aria-labelledby="hero-title">
  <GameWall paused={suspended}/>
  <div className="slop-hero-copy">
   <h1 id="hero-title" aria-label="Just one more game."><span className="slop-hero-line is-outline" aria-hidden="true"><i>Just</i> <i>one</i></span><span className="slop-hero-line" aria-hidden="true"><i>more</i> <em><i>game.</i></em></span></h1>
   <p className="slop-hero-lede">Find your next obsession. Put your name on the leaderboard.</p>
   <div className="slop-hero-entry"><a className="slop-hero-play" href="#/feed"><span className="slop-hero-play-disc" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>Let’s play<SlopMark/></a></div>
  </div>
  <HeroPerch paused={suspended}/>
 </section>;
}
