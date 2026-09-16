import React,{useEffect,useState} from 'react';
import {Button,Slop,useAsync} from './ui.jsx';
import {Icon} from './Icon.jsx';
import {loadLeaderboard} from '../lib/leaderboard.js';
export function GameLeaderboard({game,refreshKey=0,compact=false}) {
  const board=useAsync(()=>loadLeaderboard(game.slug),[game.slug,refreshKey]);
  const rows=compact?board.data?.slice(0,3):board.data;
  return <section className={`game-leaderboard ${compact?'compact':''}`} aria-label="Leaderboard">
    <div className="leaderboard-heading"><h3>Leaderboard</h3><span>All time</span></div>
    {board.loading?<div className="leaderboard-state" role="status">Loading the leaderboard…</div>:board.error?<div className="leaderboard-state" role="alert"><p>The leaderboard couldn’t load.</p><Button variant="small secondary" onClick={board.refresh}>Retry</Button></div>:rows?.length?<ol>{rows.map((entry,i)=><li key={entry.user_id||`${entry.username}:${i}`}><span className={`leaderboard-rank ${i===0?'is-crown':''}`}>{i===0?<Icon name="crown" size={17}/>:i+1}</span><Slop look={entry.slop_look} avatar={entry.avatar_url} alt=""/><span className="leaderboard-name">@{entry.username}{entry.authority==='verified_receipt'&&<small>Verified</small>}</span><strong>{entry.score.toLocaleString()}</strong></li>)}</ol>:<div className="leaderboard-state">No scores yet.</div>}
    {!!rows?.some(row=>row.authority!=='verified_receipt')&&<p className="leaderboard-note">Community scores · same leaderboard as the app.</p>}
  </section>;
}
function CrownTakeover({crown}){
 const[done,setDone]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{if(done)return;const timer=setTimeout(()=>setDone(true),2950);return()=>clearTimeout(timer);},[done]);
 if(!crown)return null;
 return <><div className={`crown-takeover ${done?'is-done':''}`} aria-live="polite">
  <div className="crown-stage"><Slop look={crown.winner.look} className="crown-winner" alt=""/><Slop look={crown.previous.look} className="crown-previous" alt=""/><Icon name="crown" size={52}/></div>
  <strong>@{crown.winner.name} took the Crown</strong><span>{crown.winningScore.toLocaleString()} points</span>
 </div><p className="game-over-crown-note"><Icon name="crown" size={15}/><span>You took the Crown from @{crown.previous.name}</span></p></>;
}
export function GameOver({game,score,save,onReplay,look,preview=false}) {
 return <div className="game-over-overlay"><section className="game-over-card" role="region" aria-label="Game over">
  <div className="game-over-summary"><Slop look={look} body="ghost" color="tangerine" className="game-over-slop" alt="Your Slop"/><div><h2>Game over</h2><div className="game-over-score"><span>Your score</span><strong>{score.toLocaleString()}</strong></div><p className="game-save-status" role="status">{preview?'Private playtest':save?.state==='saved'?'Score saved':save?.state==='guest'?'Sign in next round to save':save?.state==='idle'?'Play a round to save':save?.state==='failed'?'Score not saved':'Saving…'}</p></div></div>
  <CrownTakeover crown={save?.crown}/>
  {game?<GameLeaderboard game={game} refreshKey={save?.state==='saved'?1:0} compact/>:<section className="game-leaderboard"><h3>Leaderboard</h3><div className="leaderboard-state">Your leaderboard opens when this game is published.</div></section>}
  <Button icon="refresh" onClick={onReplay}>Play again</Button>
 </section></div>;
}
