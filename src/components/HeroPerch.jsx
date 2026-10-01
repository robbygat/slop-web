import React,{useEffect,useRef,useState} from 'react';
import './hero-perch.css';

// The crowned Slop sits on the hero's edge and waves (a keyed Higgsfield/Kling loop).
// Without a decodable alpha clip, or with reduced motion, the still pose is used.
export default function HeroPerch({paused=false}){
 const root=useRef(null),[visible,setVisible]=useState(false),[foreground,setForeground]=useState(!document.hidden),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));observer.observe(root.current);
  const sync=()=>setForeground(!document.hidden),preference=()=>setReduced(motion.matches);
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',preference);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',preference);};
 },[]);
 const active=visible&&foreground&&!paused&&!reduced,video=useRef(null);
 // Pick a transparent clip the browser can decode: HEVC alpha (Safari/iOS) or VP9 alpha (Chrome/Android/Firefox).
 const [clip,setClip]=useState(()=>{const v=document.createElement('video');return v.canPlayType('video/mp4; codecs="hvc1"')?'/assets/robots/ledge-slop-wave.mov':v.canPlayType('video/webm; codecs="vp9"')?'/assets/robots/ledge-slop-wave.webm':null;});
 useEffect(()=>{const v=video.current;if(!v)return;if(active)v.play().catch(()=>{});else v.pause();},[active]);
 // A transparent waving loop (HEVC alpha for Safari, VP9 alpha elsewhere). The
 // authored still remains the poster and the reduced-motion / failure fallback.
 if(!reduced&&clip)return <div ref={root} className="hero-perch is-video" aria-hidden="true">
  <video ref={video} src={clip} poster="/assets/robots/ledge-slop.webp" muted loop playsInline preload="auto" disablePictureInPicture onError={()=>setClip(null)}/>
 </div>;
 return <div ref={root} className={`hero-perch ${active?'is-active':''}`} aria-hidden="true">
  <img className="hero-perch-body" src="/assets/robots/ledge-slop.webp" width="640" height="960" alt="" decoding="async" style={{clipPath:'polygon(0% 51%,36% 51%,47% 51%,63% 48%,73% 46%,100% 46%,100% 100%,0% 100%)'}}/>
  <img className="hero-perch-head" src="/assets/robots/ledge-slop.webp" width="640" height="960" alt="" decoding="async" style={{clipPath:'polygon(0% 0%,100% 0%,100% 46%,73% 46%,63% 48%,47% 51%,36% 51%,0% 51%)',transformOrigin:'53% 51%'}}/>
 </div>;
}
