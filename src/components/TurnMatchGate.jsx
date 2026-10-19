import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth.jsx';
import {ownRpc,getSession,getSessionEpoch} from '../lib/supabase.js';
import {createTurnMatch} from '../lib/turn-match.js';
import {Button,Notice} from './ui.jsx';

export default function TurnMatchGate({game,children}){
 const {user,signIn}=useAuth();const[match,setMatch]=useState(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null),[snapshot,setSnapshot]=useState(null);
 const generation=useRef(0),live=useRef(null);
 useEffect(()=>{generation.current++;setMatch(null);setSnapshot(null);setBusy(false);setError(null);return()=>{generation.current++;live.current?.close();live.current=null;};},[game.id,user?.id]);
 async function open(join){
  if(busy)return;setBusy(true);setError(null);const version=generation.current,owner=getSession()?.user?.id,epoch=getSessionEpoch();
  try{
   const room=join?code.trim().toUpperCase():Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');
   if(!/^[A-Z0-9]{6,12}$/.test(room))throw new Error('Enter a valid room code.');
   const initial=await ownRpc(join?'mp_turn_join':'mp_turn_create',join?{p_code:room}:{p_game_id:game.id,p_code:room});
   if(generation.current!==version||getSession()?.user?.id!==owner||getSessionEpoch()!==epoch)return;
   const controller=createTurnMatch({game,initial,rpc:ownRpc,currentScope:()=>`${getSession()?.user?.id}:${getSessionEpoch()}`,onError:setError});
   live.current?.close();live.current=controller;controller.subscribe(setSnapshot);controller.start();setMatch(controller);
  }catch(error){if(generation.current===version)setError(error);}finally{if(generation.current===version)setBusy(false);}
 }
 if(!user||user.is_anonymous)return <div className="empty"><h2>Play together</h2><Button onClick={()=>signIn({gameSlug:game.slug})}>Sign in</Button></div>;
 if(match)return <div className="turn-match"><div className="turn-match-status" role="status"><span>{snapshot?.status==='waiting'?'Waiting for player':snapshot?.status==='complete'?'Round complete':'Two players'} · {snapshot?.room}</span><Button variant="secondary" onClick={()=>{live.current?.close();live.current=null;setMatch(null);setSnapshot(null);setError(null);}}>Leave</Button></div>{error&&<Notice error={error}/>}{children(match)}</div>;
 return <div className="empty turn-match-lobby"><h2>Play together</h2>{error&&<Notice error={error}/>}<Button disabled={busy} onClick={()=>open(false)}>Create room</Button><div><input aria-label="Room code" autoComplete="off" maxLength="12" value={code} onChange={event=>setCode(event.target.value.toUpperCase())} placeholder="Room code"/><Button variant="secondary" disabled={busy||!code.trim()} onClick={()=>open(true)}>Join</Button></div></div>;
}
