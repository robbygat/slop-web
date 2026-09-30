import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth.jsx';
import {ownRpc} from '../lib/supabase.js';
import {API} from '../lib/contracts.js';
import {Button,Modal,Notice,useAsync} from '../components/ui.jsx';
import {CoinMark,CoinPanel} from '../components/CoinPanel.jsx';
import RobotPortrait from '../components/RobotPortrait.jsx';
import RobotStage from '../components/RobotStage.jsx';
import {Icon} from '../components/Icon.jsx';
import {ROBOT_COSMETICS,ROBOT_SLOTS,canWearRobot,withRobotItem} from '../lib/robot-shop.js';
import {robotAppearance} from '../lib/robot-appearance.js';
import './robot-shop.css';

export default function Shop(){const{user}=useAuth();return <OwnerShop key={user?.id||'guest'}/>;}
function OwnerShop(){
 const {user,profile,requireAuth,refreshProfile}=useAuth();
 const [slot,setSlot]=useState('shell'),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState(''),[wallet,setWallet]=useState(false),[ownOnly,setOwnOnly]=useState(false);
 const gate=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const prices=useAsync(async()=>{const r=await fetch(API+'/functions/v1/shop-catalog',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Prices could not be loaded. You can still explore the collection.');const d=await r.json();if(!Array.isArray(d.products))throw new Error('The shop returned an incomplete price list.');return d.products;},[]);
 const inventory=useAsync(async()=>user?await ownRpc('my_slop_cosmetics'):null,[user?.id]);
 const coins=useAsync(async()=>user?await ownRpc('my_coins'):null,[user?.id]);
 const products=new Map((prices.data||[]).map(p=>[p.cosmetic_id,p]));
 const base={...profile?.slop_look,robot:{...inventory.data?.robot_derived,...profile?.slop_look?.robot}};
 const wearable=item=>canWearRobot(item,inventory.data,profile?.slop_look);
 const status=item=>wearable(item)?'In your collection':item.tier==='starter'?'Starter style':products.get(item.id)?.purchasable?`${products.get(item.id).coin_price.toLocaleString()} coins`:prices.loading?'Checking price…':item.tier==='beta'?'Beta keepsake':item.tier==='champion'?'Earn the crown':item.tier==='level'?'Earn in the app':'Collect in the app';
 async function action(){
  if(gate.current||!selected||!requireAuth())return;gate.current=true;setBusy(true);setError(null);
  try{
   if(wearable(selected)){
    const fresh=await robotAppearance.load(user.id);if(!alive.current)return;
    if(!canWearRobot(selected,fresh.inventory,fresh.look))throw new Error('This style is no longer available to equip. Refresh your collection.');
    await robotAppearance.save(user.id,fresh.look,withRobotItem(fresh.look,fresh.inventory,selected));
    if(!alive.current)return;refreshProfile();setMessage(`${selected.name} equipped. Your Slop updates in the app, too.`);setSelected(null);
   }else{
    const product=products.get(selected.id);if(product?.purchasable!==true)throw new Error('This style is not available to buy right now.');
    const receipt=await ownRpc('purchase_slop_cosmetic',{p_cosmetic_id:selected.id});
    if(!alive.current)return;
    if(receipt?.code==='insufficient_coins')throw new Error('You need a few more coins for this look. Check your daily coins or earn more in the app.');
    if((receipt?.ok!==true&&receipt?.code!=='already_owned')||receipt.cosmetic_id!==selected.id||receipt.owned!==true||!receipt.owned_ids?.includes(selected.id))throw new Error('The purchase was not confirmed. Refresh your collection before trying again.');
    inventory.setData(old=>({...old,owned_ids:receipt.owned_ids}));setMessage(`${selected.name} is in your collection. You can equip it now.`);
   }
   inventory.refresh();coins.refresh();
  }catch(e){if(alive.current)setError(e);}finally{gate.current=false;if(alive.current)setBusy(false);}
 }
 const items=ROBOT_COSMETICS.filter(item=>item.slot===slot&&(!ownOnly||wearable(item))),product=selected&&products.get(selected.id),canEquip=selected&&wearable(selected);
 return <div className="atelier-page">
  <header className="atelier-heading"><h1>A little more you.</h1><button className="shop-wallet" onClick={()=>setWallet(true)}><CoinMark/><span>{user?(coins.data?.balance?.toLocaleString()??'Your coins'):'Slop Coins'}</span><Icon name="plus" size={16}/></button></header>
  <div className="atelier-layout"><aside className="atelier-fitting" id="fitting-room" aria-label="Try on your Slop"><div className="atelier-scene"><img src="/assets/robots/worlds/shop-atelier.webp" alt=""/><RobotStage look={selected?withRobotItem(base,inventory.data,selected):profile?.slop_look} shell="neko" paused={wallet}/><span className="atelier-spin"><Icon name="refresh" size={13}/>Drag to turn</span></div><div className="atelier-detail" aria-live="polite"><h2>{selected?.name||'Meet your next look.'}</h2><p>{selected?.blurb||'Tap any style to try it on. Mix a shell, a finish, and a face that feels like you.'}</p><Notice error={error}/>{message&&<p role="status" className="shop-message">{message}</p>}{selected?<Button className="full" disabled={busy||(!!user&&!canEquip&&(inventory.loading||!product?.purchasable))} onClick={action}>{busy?'One moment…':!user?'Sign in to collect':canEquip?'Wear this look':product?.purchasable?`Collect · ${product.coin_price.toLocaleString()} coins`:status(selected)}</Button>:<a className="atelier-profile-link" href="#/you">Your wardrobe <Icon name="arrow" size={17}/></a>}</div></aside>
  <section className="atelier-collection"><div className="atelier-collection-heading"><h2>Make it yours.</h2>{user&&<button className="collection-owned-toggle" aria-pressed={ownOnly} onClick={()=>setOwnOnly(!ownOnly)}>{ownOnly?'✓ Collected':'My collection'}</button>}</div><div className="atelier-tabs" role="group" aria-label="Shop categories">{Object.entries(ROBOT_SLOTS).map(([id,label])=><button key={id} aria-pressed={slot===id} onClick={()=>{setSlot(id);setError(null);}}>{label}</button>)}</div><Notice error={prices.error||inventory.error} onRetry={()=>{prices.refresh();inventory.refresh();}}/>
    <div className="atelier-products">{items.map(item=><button key={item.id} className={`atelier-product ${selected?.id===item.id?'is-selected':''}`} aria-pressed={selected?.id===item.id} onClick={()=>{setSelected(item);setError(null);setMessage('');if(innerWidth<761)document.getElementById('fitting-room')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}}><span className="atelier-product-art"><RobotPortrait look={withRobotItem(base,inventory.data,item)} alt=""/>{wearable(item)&&<span className="atelier-owned" aria-label="Collected"><Icon name="check" size={15}/></span>}</span><span className="atelier-product-copy"><strong>{item.name}</strong><span>{status(item)}</span></span></button>)}</div>
    {!items.length&&<div className="shop-collection-empty"><RobotPortrait shell="drizzle" alt=""/><h3>Room for something new.</h3><p>Your collected styles will appear here.</p><Button variant="secondary" onClick={()=>setOwnOnly(false)}>Explore all styles</Button></div>}
  </section></div>
  {wallet&&<CoinPanel onClose={()=>setWallet(false)} onBalance={coins.setData}/>}
 </div>;
}
