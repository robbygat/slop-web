import React,{useEffect,useState} from 'react';
import './persistent-badge.css';
import {useAuth} from '../auth.jsx';
import {hasDeviceRun,watchPersistentSaves} from '../lib/persist-runtime.js';

export default function PersistentContinueBadge({game}){
 const {user}=useAuth();const [saved,setSaved]=useState(false);
 useEffect(()=>{let alive=true;let request=0;setSaved(false);
  if(game?.persistent!==true)return;
  const check=async()=>{const id=++request;try{const next=await hasDeviceRun(game);if(alive&&request===id)setSaved(next);}catch{if(alive&&request===id)setSaved(false);}};
  void check();const remove=watchPersistentSaves(check);return()=>{alive=false;request++;remove();};
 },[game?.id,game?.root_game_slug,game?.persistent,user?.id]);
 return saved?<span className="persistent-continue-badge">Continue</span>:null;
}
