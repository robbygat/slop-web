import React,{useEffect,useRef,useState} from 'react';
import {loadMultiplayerPage} from '../lib/catalog.js';
import {Button,Loading,Notice} from '../components/ui.jsx';
import GamePreview from '../components/GamePreview.jsx';
import {Icon} from '../components/Icon.jsx';
import {GameDetail} from './Play.jsx';
import './multiplayer.css';

export default function Multiplayer(){
 const [games,setGames]=useState([]),[next,setNext]=useState(null),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null);
 const generation=useRef(0),pending=useRef(false);
 async function load(cursor,current=generation.current){
  if(pending.current)return;
  pending.current=true;setLoading(true);setError(null);
  try{
   const page=await loadMultiplayerPage({cursor});
   if(current!==generation.current)return;
   if(page.next&&JSON.stringify(page.next)===JSON.stringify(cursor))throw new Error('Could not load more multiplayer games. Try again.');
   setGames(old=>cursor?[...old,...page.games.filter(game=>!old.some(item=>item.id===game.id))]:page.games);setNext(page.next);
  }catch(cause){if(current===generation.current)setError(cause);}
  finally{if(current===generation.current){pending.current=false;setLoading(false);}}
 }
 useEffect(()=>{const current=++generation.current;pending.current=false;void load(null,current);return()=>{generation.current++;};},[]);
 return <section className="multiplayer-page" aria-labelledby="multiplayer-title">
  <header className="multiplayer-heading"><h1 id="multiplayer-title">Multiplayer</h1><p>Choose a game and invite a friend.</p></header>
  {!!games.length&&<div className="multiplayer-grid">{games.map(game=><button className="multiplayer-card" key={game.id} onClick={()=>setSelected(game)} aria-label={`Play ${game.name}`}><div className="multiplayer-cover"><GamePreview game={game} paused={!!selected}/></div><span className="multiplayer-card-info"><strong>{game.name}</strong><Icon name="play" fill="currentColor" size={18}/></span></button>)}</div>}
  {loading&&!games.length&&<Loading label="Finding multiplayer games…"/>}
  <Notice error={error} onRetry={()=>load(next)}/>
  {!loading&&!error&&!games.length&&<div className="empty"><h2>No multiplayer games yet.</h2></div>}
  {!!next&&!error&&<div className="load-more"><Button variant="secondary" disabled={loading} onClick={()=>load(next)}>{loading?'Loading…':'More games'}</Button></div>}
  {selected&&<GameDetail game={selected} backLabel="Back to Multiplayer" onClose={()=>setSelected(null)}/>}
 </section>;
}
