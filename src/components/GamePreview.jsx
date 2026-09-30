import React,{useEffect,useRef,useState} from 'react';
import {previewVideo,trustedMedia} from '../lib/contracts.js';
import {previewPool} from '../lib/preview-pool.js';
import RobotPortrait from './RobotPortrait.jsx';

export default function GamePreview({game,paused=false}) {
  const root=useRef(null),video=useRef(null),pause=useRef(paused),sync=useRef(()=>{});
  const resumeTime=useRef(0),frameCallback=useRef(null);
  const [active,setActive]=useState(false),[resident,setResident]=useState(false);
  const [frameSource,setFrameSource]=useState(''),[failed,setFailed]=useState(false),[posterFailed,setPosterFailed]=useState(false);
  const media=previewVideo(game),src=media?.src,poster=media?.poster||trustedMedia(game.thumb);
  pause.current=paused;

  useEffect(()=>{
    resumeTime.current=0;setActive(false);setFailed(false);setResident(false);setFrameSource('');
  },[game.id,src]);
  useEffect(()=>{setPosterFailed(false);},[poster]);

  useEffect(()=>{
    if(!src||failed)return;
    let alive=true,visible=false,near=false,hovered=false,hoverTimer=0,releaseTimer=0;
    const preference=matchMedia('(prefers-reduced-motion: reduce)'),connection=navigator.connection;
    const handle=previewPool.register(Symbol(),value=>{if(alive)setActive(value);});
    const update=()=>handle.set(visible&&!document.hidden&&!pause.current&&!preference.matches&&!connection?.saveData,hovered?10:0);
    sync.current=update;
    const observer=new IntersectionObserver(([entry])=>{
      // Hysteresis prevents a scrolling tile from rapidly giving up and retaking a decoder.
      visible=entry.isIntersecting&&entry.intersectionRatio>(visible ? .15 : .55);update();
    },{threshold:[0,.15,.55]});
    const proximity=new IntersectionObserver(([entry])=>{
      near=entry.isIntersecting;clearTimeout(releaseTimer);
      if(!near)releaseTimer=setTimeout(()=>{
        if(!alive||near)return;
        resumeTime.current=video.current?.currentTime||resumeTime.current;
        video.current?.pause();setResident(false);setFrameSource('');
      },1200);
    },{rootMargin:'400px'});
    const enter=()=>{clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>{hovered=true;update();},180);};
    const leave=()=>{clearTimeout(hoverTimer);hovered=false;update();};
    const node=root.current;
    observer.observe(node);proximity.observe(node);
    node.addEventListener('pointerenter',enter);node.addEventListener('pointerleave',leave);
    node.addEventListener('focusin',enter);node.addEventListener('focusout',leave);
    document.addEventListener('visibilitychange',update);preference.addEventListener('change',update);
    return()=>{
      alive=false;sync.current=()=>{};clearTimeout(hoverTimer);clearTimeout(releaseTimer);
      observer.disconnect();proximity.disconnect();handle.release();video.current?.pause();
      node.removeEventListener('pointerenter',enter);node.removeEventListener('pointerleave',leave);
      node.removeEventListener('focusin',enter);node.removeEventListener('focusout',leave);
      document.removeEventListener('visibilitychange',update);preference.removeEventListener('change',update);
    };
  },[game.id,src,failed]);

  useEffect(()=>{sync.current();},[paused]);
  useEffect(()=>{if(active)setResident(true);},[active]);
  useEffect(()=>{
    const node=video.current;let current=true;
    if(!node)return;
    if(active&&!paused){
      node.muted=true;
      node.play().catch(error=>{if(current&&error.name!=='AbortError')setFailed(true);});
    } else node.pause();
    return()=>{current=false;node.pause();};
  },[active,resident,paused,src]);
  useEffect(()=>()=>{if(frameCallback.current!==null)video.current?.cancelVideoFrameCallback?.(frameCallback.current);},[]);

  function reveal(){
    const node=video.current;if(!node)return;
    const decoded=()=>{frameCallback.current=null;if(video.current===node&&node.readyState>=2)setFrameSource(src);};
    if(node.requestVideoFrameCallback){if(frameCallback.current!==null)node.cancelVideoFrameCallback(frameCallback.current);frameCallback.current=node.requestVideoFrameCallback(decoded);}
    else decoded();
  }
  const ready=frameSource===src&&!failed;
  return <div className={`game-preview ${ready?'is-ready':''} ${active&&ready?'is-moving':''}`} ref={root}>
    {poster&&!posterFailed?<img src={poster} alt="" loading="lazy" decoding="async" onError={()=>setPosterFailed(true)}/>:<RobotPortrait shell="coin-op" alt=""/>}
    {src&&resident&&!failed&&<video key={src} ref={video} src={src} muted loop playsInline preload="metadata" aria-hidden="true" disablePictureInPicture onPlaying={reveal} onLoadedMetadata={()=>{const node=video.current;if(node&&resumeTime.current>0&&Number.isFinite(node.duration))node.currentTime=resumeTime.current%node.duration;}} onTimeUpdate={()=>{resumeTime.current=video.current?.currentTime||0;}} onError={()=>setFailed(true)}/>}
  </div>;
}
