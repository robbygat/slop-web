import React,{useEffect,useRef,useState} from 'react';
import './slop-toon.css';

const tau=Math.PI*2;
const normalize=angle=>((angle%tau)+tau)%tau;
export function SlopToon({look,body='ghost',color='tangerine',className='',alt='Your Slop',controls=true,autoRotate=false,...props}){
 const canvas=useRef(null),stage=useRef(null),pose=useRef({angle:0,drag:null,lastInput:-Infinity});
 const control=useRef(null),[ready,setReady]=useState(false),[turn,setTurn]=useState(0);
 const key=JSON.stringify({...{body,palette:color},...look});
 useEffect(()=>{
  let disposed=false,raf=0,visible=true,renderer,snapshot;const started=performance.now();const node=canvas.current,host=stage.current,ctx=node.getContext('2d');
  if(!ctx)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function draw(now){
   raf=0;if(disposed||!visible||document.hidden||!renderer)return;
   const p=pose.current;
   const sinceTouch=(now-p.lastInput)/1000;
   const cycle=((now-started)/1000)%24,progress=Math.max(0,Math.min(1,(cycle-3)/4.5)),ease=progress*progress*progress*(progress*(progress*6-15)+10);
   const spin=autoRotate&&!reduced.matches&&!p.drag&&sinceTouch>8&&cycle>=3&&cycle<=7.5?tau*ease:0;
   const angle=p.angle+spin;p.drawnAngle=angle;
   renderer.drawSlopToon(ctx,snapshot,{width:node.width,height:node.height,time:0,angle,reducedMotion:true,reaction:0});
   const degrees=Math.round(normalize(angle)*180/Math.PI)%360;
   host.setAttribute('aria-valuenow',String(degrees));
   host.setAttribute('aria-valuetext',`${degrees<45||degrees>315?'Front':degrees<135?'Right side':degrees<225?'Back':'Left side'} view`);
   if(autoRotate&&!reduced.matches&&!p.drag)raf=requestAnimationFrame(draw);
  }
  function start(){if(!raf&&!disposed)raf=requestAnimationFrame(draw);}
  function resize(){const r=host.getBoundingClientRect(),density=Math.min(devicePixelRatio||1,2);node.width=Math.max(1,Math.round(r.width*density));node.height=Math.max(1,Math.round(r.height*density));start();}
  const observer=new ResizeObserver(resize);observer.observe(host);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();else{cancelAnimationFrame(raf);raf=0;}},{threshold:.01});intersection.observe(host);
  function visibility(){if(document.hidden){cancelAnimationFrame(raf);raf=0;}else start();}
  function motion(){cancelAnimationFrame(raf);raf=0;start();}
  control.current={draw:start,reset:()=>{pose.current.angle=0;pose.current.lastInput=performance.now();setTurn(0);start();}};
  document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',motion);
  import('../lib/slop-native-atlas.js').then(async native=>{
   const atlas=await native.loadNativeAtlas(JSON.parse(key));if(disposed)return;
   if(atlas){renderer={drawSlopToon:native.drawNativeAtlas};snapshot=atlas;host.dataset.renderer='native-flutter-frames';}
   else {const defaultAtlas=await native.loadNativeAtlas({});if(disposed||!defaultAtlas)return;renderer={drawSlopToon:native.drawNativeAtlas};snapshot=defaultAtlas;host.dataset.renderer='native-default-loading';}
   setReady(true);resize();
  }).catch(()=>{});
  return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);control.current=null;};
 },[key,autoRotate]);
 function begin(e){if(e.button!==0&&e.pointerType==='mouse')return;const p=pose.current;p.angle=p.drawnAngle??p.angle;p.drag={id:e.pointerId,startX:e.clientX,angle:p.angle};p.lastInput=performance.now();e.currentTarget.setPointerCapture(e.pointerId);control.current?.draw();}
 function move(e){const p=pose.current,d=p.drag;if(!d||d.id!==e.pointerId)return;const width=Math.max(100,stage.current.clientWidth);p.angle=d.angle+(e.clientX-d.startX)/width*tau;p.lastInput=performance.now();control.current?.draw();}
 function end(e){const p=pose.current,d=p.drag;if(!d||d.id!==e.pointerId)return;p.drag=null;p.lastInput=performance.now();setTurn(Math.round(normalize(p.angle)*180/Math.PI));control.current?.draw();}
 function keyboard(e){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();pose.current.angle=e.key==='Home'?0:e.key==='End'?Math.PI:pose.current.angle+(e.key==='ArrowLeft'?-1:1)*Math.PI/12;pose.current.lastInput=performance.now();setTurn(Math.round(normalize(pose.current.angle)*180/Math.PI));control.current?.draw();}
 const palette=['mint','tangerine','lavender','bubblegum'].includes(color)?color:'tangerine';
 return <div className={`slop slop-toon ${className}`} {...props}><div ref={stage} className="slop-turntable" role="slider" tabIndex={0} aria-label={`Rotate ${alt}`} aria-valuemin={0} aria-valuemax={359} aria-valuenow={turn} aria-valuetext="Front view" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={keyboard}>
 {!ready&&<img className="slop-toon-fallback" src={`/assets/mobile/characters/ghost-${palette}.webp`} alt={alt}/>}
 <canvas ref={canvas} className={ready?'is-ready':''} aria-hidden="true"/>
 </div>{controls&&<div className="slop-turntable-controls"><button type="button" onClick={()=>control.current?.reset()} aria-label="Reset Slop to front view" title="Front view">↻</button></div>}</div>;
}
