import React,{useEffect,useRef,useState} from 'react';
import {appearance} from '../lib/appearance.js';
import {lookChoice,lookOptions,normalizedLook} from '../lib/appearance-contracts.js';
import catalog from '../../public/assets/mobile/cosmetics/catalog.json' with {type:'json'};
import {Button,Loading,Modal,Notice,Slop,useAsync} from './ui.jsx';
import './slop-customizer.css';

const sections={body:'Shape',palette:'Color',eyes:'Eyes',eyeColor:'Eye color',mouth:'Smile',finish:'Material',hat:'Headwear',pattern:'Pattern',accessory:'Face',cape:'Tail',aura:'Aura'};
export default function SlopCustomizer({owner,onSaved,onClose}){
 const state=useAsync(()=>appearance.load(owner),[owner]);const [look,setLook]=useState(null),[slot,setSlot]=useState('body'),[busy,setBusy]=useState(false),[error,setError]=useState(null);const pending=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(state.data)setLook(state.data.look);},[state.data]);
 function choose(value){if(!busy)setLook(current=>normalizedLook({...current,[slot]:value}));}
 async function save(){if(pending.current||!state.data||!look)return;pending.current=true;setBusy(true);setError(null);try{const saved=await appearance.save(owner,state.data.look,look);if(alive.current)onSaved(saved);}catch(e){if(alive.current)setError(e);}finally{pending.current=false;if(alive.current)setBusy(false);}}
 return <Modal title="Customize your Slop" onClose={()=>{if(!pending.current)onClose();}} className="slop-customizer-modal">
  {state.loading?<Loading label="Opening your wardrobe…"/>:state.error?<Notice error={state.error} onRetry={state.refresh}/>:look&&<>
   <div className="slop-customizer-layout"><div className="slop-customizer-preview"><Slop interactive nativeDynamic look={look} controls={false} autoRotate={false} alt="Your Slop preview"/><label className="slop-customizer-name"><span>Name</span><input aria-label="Slop name" maxLength={40} value={look.name} disabled={busy} onChange={e=>setLook(current=>({...current,name:e.target.value}))}/></label></div>
    <div className="slop-customizer-options"><div className="slop-customizer-tabs" role="group" aria-label="Customize Slop features">{Object.entries(sections).map(([key,label])=><button key={key} className={slot===key?'selected':''} aria-pressed={slot===key} onClick={()=>setSlot(key)}>{label}</button>)}</div>
     <div className={`slop-customizer-choices ${slot==='palette'?'palette-choices':''}`} role="group" aria-label={sections[slot]}>{lookOptions[slot].map(value=>{const choice=lookChoice(slot,value.id,{catalog,ownedIds:state.data.ownedIds,current:state.data.look});return <button key={value.id} className={look[slot]===value.id?'selected':''} aria-label={`${value.label}${choice.allowed?'':', locked'}`} aria-pressed={look[slot]===value.id} disabled={busy||!choice.allowed} onClick={()=>choose(value.id)}>{value.light&&<span className="slop-color-swatch" style={{background:`linear-gradient(135deg,${value.light},${value.deep})`}}/>}<span>{value.label}</span>{!choice.allowed&&<small>{choice.unavailable?'In the app':'Locked'}</small>}</button>;})}</div>
     {slot==='mouth'&&<label className="slop-blush-toggle"><input type="checkbox" checked={look.blush} disabled={busy} onChange={e=>setLook(current=>({...current,blush:e.target.checked}))}/>Rosy cheeks</label>}
    </div></div>
   <Notice error={error}/><div className="slop-customizer-footer"><a href="#/shop" onClick={e=>{if(pending.current)e.preventDefault();else onClose();}}>Find more looks</a><Button disabled={busy||!look.name.trim()} onClick={save}>{busy?'Saving…':'Save Slop'}</Button></div>
  </>}
 </Modal>;
}
