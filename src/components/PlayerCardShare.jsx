import React,{useEffect,useRef,useState} from 'react';
import {Button,CopyButton,Modal,Notice} from './ui.jsx';
import {Icon} from './Icon.jsx';
import {profileShareUrl,profileShareText,profileXIntent} from '../lib/profile-sharing.js';
import './player-card-share.css';
export default function PlayerCardShare({profile,onClose}){
 const canvas=useRef(null),[file,setFile]=useState(null),[error,setError]=useState(null),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
 const url=profileShareUrl(profile);
 useEffect(()=>{
  let live=true;const surface=document.createElement('canvas');setFile(null);setError(null);setMessage('');
  import('../lib/profile-card-art.js').then(m=>m.drawProfileCard(surface,profile)).then(f=>{
   if(!live||!canvas.current)return;
   const target=canvas.current;target.width=surface.width;target.height=surface.height;target.getContext('2d').drawImage(surface,0,0);setFile(f);
  }).catch(e=>{if(live)setError(e);});
  return()=>{live=false;};
 },[profile.id,profile.username,profile.display_name,JSON.stringify(profile.slop_look),profile.profile_banner_id,retry]);
 async function share(){try{await navigator.share({files:[file],title:'Add me on Slop',text:profileShareText(profile)});setMessage('Card shared.');}catch(e){if(e.name!=='AbortError')setError(new Error('Sharing is unavailable here. Save the story card instead.'));}}
 function save(){const objectUrl=URL.createObjectURL(file),a=document.createElement('a');a.href=objectUrl;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);setMessage('Story card saved. Add it to Instagram and include your profile link.');}
 let canShare=false;try{canShare=!!file&&!!navigator.canShare?.({files:[file]});}catch{}
 return <Modal title="Player card" onClose={onClose} className="player-card-share"><div className="share-card-layout"><div className={`share-card-preview ${file?'is-ready':''}`}><canvas ref={canvas} aria-label={`Player card for ${profile.username||'this Slop player'}`}/>{!file&&!error&&<span role="status">Making your card…</span>}</div><div className="share-card-copy"><h2>Good company.<br/>Great games.</h2><p>Your Slop, your world, your own player card.</p><Notice error={error} onRetry={()=>setRetry(v=>v+1)}/><div className="share-card-actions">{canShare&&<Button onClick={share}>Share card <Icon name="share" size={17}/></Button>}<Button variant="secondary" disabled={!file} onClick={save}>Save story card <Icon name="download" size={17}/></Button><a className="button secondary" href={profileXIntent(profile)} target="_blank" rel="noopener noreferrer">Share on X <Icon name="arrow" size={17}/></a>{url&&<CopyButton value={url} label="Copy profile link"/>}</div><p className="share-story-help">For Instagram Stories, save your card or use your phone’s share menu. Add the profile link with Instagram’s link sticker.</p>{message&&<p role="status" className="success">{message}</p>}</div></div></Modal>;
}
