import React,{useEffect,useRef} from 'react';
import {markFrame,restingMark} from '../lib/slop-mark.js';

export default function SlopMark({className=''}){
 const svg=useRef(null),outline=useRef(null);
 useEffect(()=>{
  const node=svg.current,path=outline.current;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let visible=false,running=false,disposed=false,elapsed=0,last=0,painted=-Infinity,raf=0,timer=0;
  function cancel(){cancelAnimationFrame(raf);clearTimeout(timer);raf=0;timer=0;}
  function tick(now){
   if(!running||disposed)return;
   elapsed+=now-last;last=now;
   if(now-painted<1000/30){raf=requestAnimationFrame(tick);return;}
   const frame=markFrame(elapsed);
   path.setAttribute('d',frame.outline);painted=now;
   if(frame.holdFor)timer=setTimeout(()=>{timer=0;if(running)raf=requestAnimationFrame(tick);},frame.holdFor);
   else raf=requestAnimationFrame(tick);
  }
  function sync(){
   const active=visible&&!document.hidden&&!reduced.matches;
   if(running&&!active){elapsed+=performance.now()-last;running=false;cancel();}
   if(reduced.matches){elapsed=0;path.setAttribute('d',restingMark);}
   if(active&&!running){running=true;last=performance.now();raf=requestAnimationFrame(tick);}
  }
  const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);sync();},{threshold:0});
  observer.observe(node);
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  return()=>{disposed=true;running=false;cancel();observer.disconnect();document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);};
 },[]);
 return <svg ref={svg} className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path ref={outline} d={restingMark} fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round"/>
  <ellipse cx="11.7" cy="15.1" rx="1.4" ry="2.15" fill="currentColor"/>
  <ellipse cx="20.3" cy="15.1" rx="1.4" ry="2.15" fill="currentColor"/>
  <path d="M14 20.4Q16 22.1 18 20.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
 </svg>;
}
