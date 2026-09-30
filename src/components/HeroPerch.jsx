import React,{useEffect,useRef,useState} from 'react';
import './hero-perch.css';

// The authored sitting pose is stable. Only its head and attached crown move;
// reusing one decoded image adds no WebGL context or JavaScript render loop.
export default function HeroPerch({paused=false}){
 const root=useRef(null),[visible,setVisible]=useState(false),[foreground,setForeground]=useState(!document.hidden),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));observer.observe(root.current);
  const sync=()=>setForeground(!document.hidden),preference=()=>setReduced(motion.matches);
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',preference);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',preference);};
 },[]);
 return <div ref={root} className={`hero-perch ${visible&&foreground&&!paused&&!reduced?'is-active':''}`} aria-hidden="true">
  <img className="hero-perch-body" src="/assets/robots/ledge-slop.webp" width="640" height="960" alt="" decoding="async" style={{clipPath:'polygon(0% 51%,36% 51%,47% 51%,63% 48%,73% 46%,100% 46%,100% 100%,0% 100%)'}}/>
  <img className="hero-perch-head" src="/assets/robots/ledge-slop.webp" width="640" height="960" alt="" decoding="async" style={{clipPath:'polygon(0% 0%,100% 0%,100% 46%,73% 46%,63% 48%,47% 51%,36% 51%,0% 51%)',transformOrigin:'53% 51%'}}/>
 </div>;
}
