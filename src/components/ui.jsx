import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './Icon.jsx';
import {trustedMedia} from '../lib/contracts.js';
import {slopAvatar} from '../lib/slop-avatar.js';
import {lockBodyScroll} from '../lib/scroll-lock.js';
import {SlopToon} from './SlopToon.jsx';
import {NativeSlop} from './NativeSlop.jsx';
import SlopMotion from './SlopMotion.jsx';
export const art='/assets/mobile';
export function Slop({interactive=false,nativeDynamic=true,...props}){return interactive?(nativeDynamic?<NativeSlop {...props}/>:<SlopToon {...props}/>):<SlopStill {...props}/>;}
function SlopStill({body='ghost',color='tangerine',look,avatar,className='',alt='Slop',...props}){
 const bodies={ghost:'ghost',tall:'pebble',classic:'pebble',star:'star',heart:'heart',triangle:'triangle'};
 const shape=bodies[look?.body]||(['ghost','pebble','star','heart','triangle'].includes(body)?body:'ghost');
 const colors=['tangerine','mint','lavender','bubblegum'];
 const palette=colors.includes(look?.palette)?look.palette:colors.includes(color)?color:'tangerine';
 const fallback=`${art}/characters/${shape}-${palette}.webp`;
 const key=look?JSON.stringify(look):'', [portrait,setPortrait]=useState(null);
 useEffect(()=>{let active=true;if(key)slopAvatar(JSON.parse(key)).then(src=>{if(active)setPortrait({key,src});}).catch(()=>{});return()=>{active=false;};},[key]);
 const source=key?(portrait?.key===key?portrait.src:fallback):trustedMedia(avatar)||fallback;
 return <img className={`slop ${className}`} src={source} alt={alt} onError={e=>{if(!e.currentTarget.src.endsWith(fallback))e.currentTarget.src=fallback;}} {...props}/>;
}
export function Button({children,icon,variant='',className='',...props}){return <button className={`button ${variant} ${className}`} {...props}>{icon&&<Icon name={icon}/>}<span>{children}</span></button>;}
export function IconButton({name,label,...props}){return <button className="icon-button" aria-label={label} title={label} {...props}><Icon name={name}/></button>;}
export function Loading({label='Loading…'}){return <div className="loading" role="status"><SlopMotion variant="slop-morph-showcase" poster="slop-morph-poster" className="loading-morph" alt=""/><p>{label}</p></div>;}
export function Notice({error,onRetry}){if(!error)return null;return <div className="notice" role="alert"><p>{error.message||error}</p>{onRetry&&<Button variant="small secondary" icon="refresh" onClick={onRetry}>Try again</Button>}</div>;}
export function Empty({title,children,body='ghost',action}){return <div className="empty"><Slop body={body} color="mint" alt=""/><h2>{title}</h2><p>{children}</p>{action}</div>;}
export function Modal({title,children,onClose,className=''}){
 const ref=useRef(null);useEffect(()=>{const el=ref.current;el.showModal();const unlock=lockBodyScroll(document.body);return()=>{unlock();el.close();};},[]);
 return <dialog ref={ref} className={`modal ${className}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-label={title}><div className="modal-top"><h2>{title}</h2><IconButton name="close" label="Close" onClick={onClose}/></div>{children}</dialog>;
}
export function CopyButton({value,label='Copy'}){const[copied,setCopied]=useState(false);return <Button icon={copied?'check':'copy'} variant="small secondary" onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{setCopied(false);}}}>{copied?'Copied':label}</Button>;}
export function SectionHeading({eyebrow,title,children,action}){return <div className="section-heading"><div><h2>{title}</h2>{children&&<p>{children}</p>}</div>{action}</div>;}
export function useAsync(load,deps=[]){const[data,setData]=useState(null),[error,setError]=useState(null),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);useEffect(()=>{let current=true;setLoading(true);setError(null);load().then(d=>{if(current)setData(d);}).catch(e=>{if(current)setError(e);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[...deps,reload]);return {data,error,loading,refresh:()=>setReload(v=>v+1),setData};}
