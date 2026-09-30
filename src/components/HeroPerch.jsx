import React,{useEffect,useRef,useState} from 'react';
// One small, complete mascot replaces a second WebGL context. Its contact point
// stays on the section edge rather than lining up with an interactive head.
export default function HeroPerch({paused=false}){
 const root=useRef(null),[visible,setVisible]=useState(false),[foreground,setForeground]=useState(!document.hidden);
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));observer.observe(root.current);const sync=()=>setForeground(!document.hidden);document.addEventListener('visibilitychange',sync);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);};},[]);
 return <div ref={root} className={`hero-perch ${visible&&foreground&&!paused?'is-active':''}`} aria-hidden="true"><img src="/assets/robots/ledge-slop.webp" width="640" height="960" alt="" decoding="async"/></div>;
}
