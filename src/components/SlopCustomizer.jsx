import React,{useEffect,useRef,useState} from 'react';
import {Button,Loading,Modal,Notice,useAsync} from './ui.jsx';
import RobotPortrait from './RobotPortrait.jsx';
import RobotStage from './RobotStage.jsx';
import {ROBOT_COSMETICS,ROBOT_SLOTS,canWearRobot,withRobotItem} from '../lib/robot-shop.js';
import {robotAppearance} from '../lib/robot-appearance.js';
import '../pages/robot-shop.css';

export default function SlopCustomizer({owner,onClose,onSaved}){
 const wardrobe=useAsync(()=>robotAppearance.load(owner),[owner]);
 const [look,setLook]=useState(null),[slot,setSlot]=useState('shell'),[busy,setBusy]=useState(false),[error,setError]=useState(null);
 const gate=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(wardrobe.data)setLook({...wardrobe.data.look,robot:{...wardrobe.data.inventory.robot_derived,...wardrobe.data.look.robot}});},[wardrobe.data]);
 async function save(){if(gate.current||!look||!wardrobe.data)return;gate.current=true;setBusy(true);setError(null);try{const saved=await robotAppearance.save(owner,wardrobe.data.look,look);if(alive.current)onSaved(saved);}catch(e){if(alive.current)setError(e);}finally{gate.current=false;if(alive.current)setBusy(false);}}
 const items=ROBOT_COSMETICS.filter(item=>item.slot===slot),inventory=wardrobe.data?.inventory;
 return <Modal title="Make it your Slop." className="robot-wardrobe" onClose={onClose}>
  {wardrobe.loading?<Loading label="Opening your wardrobe…"/>:wardrobe.error?<Notice error={wardrobe.error} onRetry={wardrobe.refresh}/>:<>
   <div className="wardrobe-layout"><div className="wardrobe-preview"><RobotStage look={look}/><p>Drag to turn. Tap for a little joy.</p><span>Same Slop. Every screen.</span></div><div className="wardrobe-options">
    <div className="robot-category-tabs" aria-label="Customize your character">{Object.entries(ROBOT_SLOTS).map(([id,label])=><button key={id} aria-pressed={slot===id} onClick={()=>setSlot(id)}>{label}</button>)}</div>
    <div className="wardrobe-choices">{items.map(item=>{const allowed=canWearRobot(item,inventory,wardrobe.data.look),selected=look?.robot?.[slot]===item.value;return <button key={item.id} disabled={!allowed||busy} aria-pressed={selected} aria-label={`${item.name}${allowed?'':', locked'}`} onClick={()=>setLook(withRobotItem(look,inventory,item))}><RobotPortrait look={withRobotItem(look,inventory,item)} alt=""/><strong>{item.name}</strong><small>{selected?'Wearing':allowed?'In your collection':'Find in the Shop'}</small></button>;})}</div>
   </div></div><Notice error={error}/><div className="wardrobe-footer"><a href="#/shop" onClick={onClose}>Find your next look ↗</a><Button disabled={busy||!look} onClick={save}>{busy?'Saving your Slop…':'Save my Slop'}</Button></div>
  </>}
 </Modal>;
}
