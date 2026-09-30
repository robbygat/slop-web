import React,{useEffect,useRef,useState} from 'react';
import {robotSpec} from '../lib/robot-catalog.js';
import RobotPortrait from './RobotPortrait.jsx';
import {Icon} from './Icon.jsx';

/** One articulated character, loaded only as its stage enters the viewport. */
export default function RobotBody({look,paused=false}){
 const canvas=useRef(null),stage=useRef(null),visible=useRef(false),pause=useRef(paused),current=useRef(null),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);
 const spec=robotSpec(look);current.current=spec;pause.current=paused;
 useEffect(()=>{
  let disposed=false,loading=false;const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>stage.current?.setActive(visible.current&&!pause.current,motion.matches);
  const observer=new IntersectionObserver(async([entry])=>{
   visible.current=entry.isIntersecting;
   if(visible.current&&!loading&&!stage.current){loading=true;try{
    const {createBodyStage}=await import('../robots/body-stage.ts');if(disposed)return;
    stage.current=await createBodyStage(canvas.current);if(disposed){stage.current.dispose();stage.current=null;return;}
    stage.current.select(current.current);setReady(true);
   }catch{if(!disposed)setFailed(true);}}
   sync();
  },{rootMargin:'80px'});
  const node=canvas.current;
  const lost=()=>setReady(false),restored=()=>{if(stage.current){setReady(true);sync();}};
  node.addEventListener('webglcontextlost',lost);node.addEventListener('webglcontextrestored',restored);
  observer.observe(node);motion.addEventListener('change',sync);
  return()=>{disposed=true;observer.disconnect();motion.removeEventListener('change',sync);node.removeEventListener('webglcontextlost',lost);node.removeEventListener('webglcontextrestored',restored);stage.current?.dispose();stage.current=null;};
 },[]);
 useEffect(()=>stage.current?.select(spec),[JSON.stringify(spec)]);
 useEffect(()=>stage.current?.setActive(visible.current&&!paused,matchMedia('(prefers-reduced-motion: reduce)').matches),[paused]);
 return <div className={`robot-body ${ready?'is-ready':''}`}>
  {!ready&&<RobotPortrait look={look} animated={false} alt=""/>}
  <canvas ref={canvas} role="button" aria-label="Spin your full Slop character" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();stage.current?.react();}}}/>
  {ready?<div className="body-controls" aria-label="Character actions"><button onClick={()=>stage.current?.wave()} disabled={paused}>Say hi <span aria-hidden="true">✋</span></button><button onClick={()=>stage.current?.react()} disabled={paused}>Spin <Icon name="refresh" size={15}/></button></div>:<span className="body-hint" role="status">{failed?'3D is unavailable in this browser.':'Getting your Slop ready…'}</span>}
 </div>;
}
