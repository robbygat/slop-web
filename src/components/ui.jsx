import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './Icon.jsx';
import {trustedMedia} from '../lib/contracts.js';
import {lockBodyScroll} from '../lib/scroll-lock.js';
import RobotPortrait from './RobotPortrait.jsx';
import RobotStage from './RobotStage.jsx';
export function Slop({interactive=false,nativeDynamic=true,body,color,avatar,controls,onActivate,...props}){return interactive?<RobotStage {...props}/>:<RobotPortrait {...props} onActivate={onActivate}/>;}
export function Button({children,icon,variant='',className='',...props}){return <button className={`button ${variant} ${className}`} {...props}>{icon&&<Icon name={icon}/>}<span>{children}</span></button>;}
export function IconButton({name,label,...props}){return <button className="icon-button" aria-label={label} title={label} {...props}><Icon name={name}/></button>;}
export function Loading({label='Loading…'}){return <div className="loading" role="status"><RobotPortrait shell="core" className="loading-robot" alt=""/><p>{label}</p></div>;}
export function Notice({error,onRetry}){if(!error)return null;return <div className="notice" role="alert"><p>{error.message||error}</p>{onRetry&&<Button variant="small secondary" icon="refresh" onClick={onRetry}>Try again</Button>}</div>;}
export function Empty({title,children,body='ghost',action}){return <div className="empty"><Slop body={body} color="mint" alt=""/><h2>{title}</h2><p>{children}</p>{action}</div>;}
export function Modal({title,children,onClose,className=''}){
 const ref=useRef(null);useEffect(()=>{const el=ref.current;el.showModal();const unlock=lockBodyScroll(document.body);return()=>{unlock();el.close();};},[]);
 return <dialog ref={ref} className={`modal ${className}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-label={title}><div className="modal-top"><h2>{title}</h2><IconButton name="close" label="Close" onClick={onClose}/></div>{children}</dialog>;
}
export function CopyButton({value,label='Copy'}){const[state,setState]=useState('idle'),timer=useRef(null),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);};},[]);useEffect(()=>{setState('idle');clearTimeout(timer.current);},[value]);return <span className="copy-control"><Button icon={state==='copied'?'check':'copy'} variant="small secondary" onClick={async()=>{try{await navigator.clipboard.writeText(value);if(!alive.current)return;setState('copied');clearTimeout(timer.current);timer.current=setTimeout(()=>setState('idle'),2500);}catch{if(alive.current)setState('failed');}}}>{state==='copied'?'Copied':label}</Button>{state==='failed'&&<small role="status">Clipboard unavailable. Select and copy the text above.</small>}</span>;}
export function SectionHeading({eyebrow,title,children,action}){return <div className="section-heading"><div><h2>{title}</h2>{children&&<p>{children}</p>}</div>{action}</div>;}
export function useAsync(load,deps=[]){const[data,setData]=useState(null),[error,setError]=useState(null),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);useEffect(()=>{let current=true;setLoading(true);setError(null);load().then(d=>{if(current)setData(d);}).catch(e=>{if(current)setError(e);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[...deps,reload]);return {data,error,loading,refresh:()=>setReload(v=>v+1),setData};}
