import React,{useEffect,useRef,useState} from 'react';
import SlopMotion from './SlopMotion.jsx';
import {nativePortrait} from '../lib/slop-avatar.js';
import {nativeCharacterMessage,nativeCharacterReady,nativeCharacterPerformance,nativeCharacterRendered,nativeCharacterActivated} from '../lib/native-character-contracts.js';
import nativeViewer from '../../public/native-character/version.json';
import './slop-toon.css';
export function NativeSlop({look,body='ghost',color='tangerine',className='',alt='Your Slop',controls=true,autoRotate=false,paused=false,onActivate}){
 const frame=useRef(null),host=useRef(null),state=useRef({ready:false,visible:true,reducedMotion:false,requestId:0,autoRotate,paused}),[ready,setReady]=useState(false);
 const portrait=nativePortrait({body,palette:color,...look});
 const activate=useRef(onActivate);activate.current=onActivate;
 const key=JSON.stringify({body,palette:color,...look}),currentLook=useRef(key);currentLook.current=key;state.current.autoRotate=autoRotate;state.current.paused=paused;
 function send(front=false){if(!state.current.ready)return;frame.current?.contentWindow?.postMessage(nativeCharacterMessage(JSON.parse(currentLook.current),{reducedMotion:state.current.reducedMotion,paused:state.current.paused||!state.current.visible||document.hidden,front,autoRotate:state.current.autoRotate,canActivate:typeof activate.current==='function',requestId:++state.current.requestId}),'*');}
 useEffect(()=>{const reduced=matchMedia('(prefers-reduced-motion: reduce)');state.current.reducedMotion=reduced.matches;
  function receive(event){if(nativeCharacterActivated(event,frame.current?.contentWindow,state.current.requestId)){if(!state.current.paused&&state.current.visible&&!document.hidden)activate.current?.();return;}if(nativeCharacterRendered(event,frame.current?.contentWindow,state.current.requestId)){setReady(true);return;}const performance=nativeCharacterPerformance(event,frame.current?.contentWindow);if(performance){host.current.dataset.paintFps=performance.fps.toFixed(1);host.current.dataset.sampleFrames=String(performance.frames);return;}if(!nativeCharacterReady(event,frame.current?.contentWindow))return;state.current.ready=true;send();}
  function motion(){state.current.reducedMotion=reduced.matches;send();}
  function visibility(){send();}
  const observer=new IntersectionObserver(entries=>{state.current.visible=entries[0].isIntersecting;send();},{threshold:.01});observer.observe(host.current);
  window.addEventListener('message',receive);reduced.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();window.removeEventListener('message',receive);reduced.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);state.current.ready=false;};
 },[]);
 useEffect(()=>{send();},[key,paused,autoRotate,!!onActivate]);
 return <div ref={host} className={`slop slop-toon slop-native-viewer ${className}`} data-renderer={ready?'native-flutter-live':'native-flutter-loading'}>
  {!ready&&<div className="slop-native-placeholder" role="status" aria-label="Loading your Slop">{portrait?<img src={portrait} alt={alt} width="512" height="512"/>:<SlopMotion paused alt="Loading your Slop"/>}</div>}
  <iframe ref={frame} src={nativeViewer.entry} title={alt} sandbox="allow-scripts" referrerPolicy="no-referrer" className={ready?'is-ready':''}/>
  {controls&&<div className="slop-turntable-controls"><button type="button" onClick={()=>send(true)} aria-label="Reset Slop to front view" title="Front view">↻</button></div>}
 </div>;
}
