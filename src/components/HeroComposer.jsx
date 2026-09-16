import React,{useEffect,useId,useRef,useState} from 'react';
import {useAuth} from '../auth.jsx';
import {buildIdeaRoute,MAX_GAME_IDEA,saveBuildIdea} from '../lib/build-draft.js';
import {createDictation,speechRecognitionFor} from '../lib/dictation.js';
import SlopMark from './SlopMark.jsx';
import './hero-composer.css';
export {SlopMark};

export default function HeroComposer({className='',placeholder='Make your own game'}){
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
