import React,{useEffect,useState} from 'react';
import {Modal,Notice} from './ui.jsx';
export default function PhoneCode({game,onClose}){
 const[image,setImage]=useState(null),[error,setError]=useState(null);
 const url=`https://slop.game/play/${encodeURIComponent(game.slug)}`;
 useEffect(()=>{let current=true;import('qrcode').then(m=>m.default.toDataURL(url,{width:640,margin:4,errorCorrectionLevel:'M',color:{dark:'#342D43',light:'#FFFFFF'}})).then(value=>{if(current)setImage(value);}).catch(e=>{if(current)setError(e);});return()=>{current=false;};},[url]);
 return <Modal title="Take this little world with you." onClose={onClose} className="phone-code-modal"><p>Scan with your phone’s camera to open <strong>{game.name}</strong> in Slop.</p>{image?<img className="phone-code" src={image} alt={`QR code to play ${game.name} on your phone`}/>:<p role="status">Making your code…</p>}<Notice error={error}/><p className="fine">If Slop is installed and app links are enabled, the game opens in the app. Otherwise it opens here on the web.</p><a className="button full" href={url}>Open game link</a><a className="text-button" href="#/download" onClick={onClose}>Get the Slop app</a></Modal>;
}
