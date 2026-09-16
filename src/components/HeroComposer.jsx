import React,{useEffect,useId,useRef,useState} from 'react';
import {useAuth} from '../auth.jsx';
import {buildIdeaRoute,MAX_GAME_IDEA,saveBuildIdea} from '../lib/build-draft.js';
import {createDictation,speechRecognitionFor} from '../lib/dictation.js';
import './hero-composer.css';

// Exact resting classic U-nav outline from Flutter's slopFormOutlineFor:
// 128 samples, the same breathing term and midpoint quadratic construction.
const points=Array.from({length:128},(_,i)=>{const a=i*Math.PI*2/128,r=1-.14*(1+Math.cos(5*(a+Math.PI/2)+Math.PI))/2,b=1+.009*Math.sin(a*3);return [16+Math.cos(a)*12.5*r*b,16.5+Math.sin(a)*12.5*r*b];});
const pair=p=>p.map(v=>v.toFixed(5)).join(' '),middle=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const outline='M'+pair(middle(points.at(-1),points[0]))+points.map((p,i)=>'Q'+pair(p)+' '+pair(middle(p,points[(i+1)%128]))).join('')+'Z';
export function SlopMark({className=''}){return <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d={outline} fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round"/><ellipse cx="11.7" cy="15.1" rx="1.4" ry="2.15" fill="currentColor"/><ellipse cx="20.3" cy="15.1" rx="1.4" ry="2.15" fill="currentColor"/><path d="M14 20.4Q16 22.1 18 20.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;}

export default function HeroComposer({className='',placeholder='Make your own game…'}){
 const {user}=useAuth();const [prompt,setPrompt]=useState(''),[listening,setListening]=useState(false),[error,setError]=useState('');
 const input=useRef(null),dictation=useRef(null),pendingSubmit=useRef(false),label=useId();const [supported]=useState(()=>!!speechRecognitionFor());
 useEffect(()=>{
  const controller=createDictation({Recognition:speechRecognitionFor(),onText:setPrompt,onListening:setListening,onError:setError,maxLength:MAX_GAME_IDEA,language:document.documentElement.lang||navigator.language||'en-US'});
  dictation.current=controller;
  const hide=()=>{if(document.hidden)controller.stop();};document.addEventListener('visibilitychange',hide);
  return()=>{controller.dispose();dictation.current=null;document.removeEventListener('visibilitychange',hide);};
 },[]);
 function handoff(){
  const idea=saveBuildIdea(prompt.trim(),{ownerId:user?.id||null});
  if(!idea){setError('Your browser couldn’t save this idea. Enable tab storage and try again.');return;}
  location.hash=buildIdeaRoute(idea);
 }
 // stop() delivers the final transcript asynchronously. Keep the recorder alive
 // until onend so the last spoken words reach the draft before navigation.
 useEffect(()=>{if(pendingSubmit.current&&!listening){pendingSubmit.current=false;if(prompt.trim())handoff();}},[listening,prompt]);
 function submit(event){
  event.preventDefault();if(!prompt.trim())return;
  if(listening){pendingSubmit.current=true;dictation.current?.stop();return;}
  handoff();
 }
 return <div className={`hero-composer ${listening?'is-listening':''} ${className}`}>
  <form className="hero-composer-pill" onSubmit={submit} aria-label="Start a game idea">
   <SlopMark className="hero-composer-mark"/>
   <label className="sr-only" htmlFor={label}>Describe your game</label>
   <input ref={input} id={label} name="game-idea" value={prompt} onChange={event=>{setPrompt(event.target.value);setError('');}} maxLength={MAX_GAME_IDEA} placeholder={listening?'Listening…':placeholder} autoComplete="off" readOnly={listening} aria-describedby={error||listening?label+'-status':undefined}/>
   {supported&&<button type="button" className="hero-composer-mic" aria-label={listening?'Stop dictation':'Dictate your game idea'} aria-pressed={listening} title={listening?'Stop dictation':'Dictate with your browser'} onClick={()=>{setError('');if(listening)dictation.current?.stop();else dictation.current?.start(prompt);}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">{listening?<rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" stroke="none"/>:<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-3 0h6"/></>}</svg></button>}
   <button type="submit" className="hero-composer-send" aria-label="Continue to Build" title="Continue to Build" disabled={!prompt.trim()}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button>
  </form>
  {(error||listening)&&<p id={label+'-status'} className="hero-composer-status" role={error?'alert':'status'}>{error||'Listening…'}</p>}
 </div>;
}
