import React,{useEffect,useRef,useState} from 'react';
export default function HeroPerch({paused,live=true}){
 const canvas=useRef(null),stage=useRef(null),visible=useRef(false),pause=useRef(paused),[ready,setReady]=useState(false);pause.current=paused;
 useEffect(()=>{
  setReady(false);if(!live)return;
  let dead=false,loading=false;const node=canvas.current,motion=matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>stage.current?.setActive(visible.current&&!pause.current,motion.matches);
  const observer=new IntersectionObserver(async([entry])=>{visible.current=entry.isIntersecting;if(visible.current&&!loading&&!stage.current){loading=true;try{const {createPerchStage}=await import('../robots/perch-stage.ts');if(dead)return;const view=await createPerchStage(node);if(dead){view.dispose();return;}stage.current=view;setReady(true);}catch{if(!dead)setReady(false);}}sync();});
  const lost=e=>{e.preventDefault();stage.current?.setActive(false,true);setReady(false);},restored=()=>{if(stage.current){setReady(true);sync();}};
  observer.observe(node);motion.addEventListener('change',sync);node.addEventListener('webglcontextlost',lost);node.addEventListener('webglcontextrestored',restored);
  return()=>{dead=true;observer.disconnect();motion.removeEventListener('change',sync);node.removeEventListener('webglcontextlost',lost);node.removeEventListener('webglcontextrestored',restored);stage.current?.dispose();stage.current=null;};
 },[live]);
 useEffect(()=>stage.current?.setActive(visible.current&&!paused,matchMedia('(prefers-reduced-motion: reduce)').matches),[paused]);
 return <div className={`hero-perch ${ready?'is-ready':''}`} aria-hidden="true"><img src="/assets/robots/seated-body.webp" width="640" height="640" alt="" decoding="async"/><canvas ref={canvas}/></div>;
}
