import React,{useEffect,useRef,useState} from 'react';
import RobotPortrait from './RobotPortrait.jsx';
import {ROBOTS} from '../lib/robot-catalog.js';
import {HERO_CAST,HERO_SEATS,swapHeroSeat} from '../lib/hero-policy.js';

export default function LiteHeroScene({paused}){
 const root=useRef(null),[order,setOrder]=useState(HERO_CAST),[visible,setVisible]=useState(false),[spin,setSpin]=useState({id:'',turn:0});
 useEffect(()=>{const observer=new IntersectionObserver(([e])=>setVisible(e.isIntersecting));observer.observe(root.current);return()=>observer.disconnect();},[]);
 const moving=visible&&!paused;
 return <div ref={root} className={`lite-orbit ${moving?'is-moving':''}`} role="group" aria-label="Slop characters. Tap one to bring it to the front.">
  <svg className="lite-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{HERO_SEATS.slice(1).map((p,i)=><path key={i} d={`M48 43 Q${(48+p.x)/2+6} ${(43+p.y)/2-6} ${p.x} ${p.y}`}/>)}</svg>
  {HERO_CAST.map(id=>{const index=order.indexOf(id),seat=HERO_SEATS[index],name=ROBOTS.find(r=>r.id===id).name;return <button key={id} className={`lite-character ${index===0?'is-center':''}`} style={{left:`${seat.x}%`,top:`${seat.y}%`,width:`${seat.size}%`,'--lean':`${seat.tilt}deg`,'--float-delay':`${HERO_CAST.indexOf(id)*-.8}s`}} aria-label={index===0?`Spin ${name}`:`Bring ${name} to the front`} onClick={()=>{setOrder(v=>swapHeroSeat(v,id));setSpin(v=>({id,turn:v.turn+1}));}}><span key={spin.id===id?spin.turn:0} className={spin.id===id?'lite-spin':''}><RobotPortrait shell={id} face={id==='core'?'slop':['gatekeeper','chip'].includes(id)?'hearts':'happy'} glow={id==='core'||id==='gatekeeper'?'lime':id==='neko'?'pink':'white'} animated={moving} loading="eager" alt=""/></span></button>;})}
 </div>;
}
