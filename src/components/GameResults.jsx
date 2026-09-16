import React from 'react';
import {Button,Slop,useAsync} from './ui.jsx';
import {loadLeaderboard} from '../lib/leaderboard.js';
export function GameLeaderboard({game,refreshKey=0,compact=false}) {
  const board=useAsync(()=>loadLeaderboard(game.slug),[game.slug,refreshKey]);
  const rows=compact?board.data?.slice(0,3):board.data;
  return <section className={`game-leaderboard ${compact?'compact':''}`} aria-label="Leaderboard">
    <div className="leaderboard-heading"><h3>Leaderboard</h3><span>All time</span></div>
    {board.loading?<div className="leaderboard-state" role="status">Loading the leaderboard…</div>:board.error?<div className="leaderboard-state" role="alert"><p>The leaderboard couldn’t load.</p><Button variant="small secondary" onClick={board.refresh}>Retry</Button></div>:rows?.length?<ol>{rows.map((entry,i)=><li key={entry.user_id||`${entry.username}:${i}`}><span className="leaderboard-rank">{i+1}</span><Slop look={entry.slop_look} avatar={entry.avatar_url} alt=""/><span className="leaderboard-name">@{entry.username}{entry.authority==='verified_receipt'&&<small>Verified</small>}</span><strong>{entry.score.toLocaleString()}</strong></li>)}</ol>:<div className="leaderboard-state">No scores yet.</div>}
    {!!rows?.some(row=>row.authority!=='verified_receipt')&&<p className="leaderboard-note">Community scores · same leaderboard as the app.</p>}
  </section>;
}
export function GameOver({game,score,save,onReplay,onLeaderboard,look,preview=false}) {
 return <div className="game-over-overlay"><section className="game-over-card" role="region" aria-label="Game over">
  <Slop look={look} body="ghost" color="tangerine" className="game-over-slop" alt="Your Slop"/>
  <h2>Game over</h2><div className="game-over-score"><span>Your score</span><strong>{score.toLocaleString()}</strong></div>
  <p className="game-save-status" role="status">{preview?'Private playtest':save?.state==='saved'?'Saved to your community scores':save?.state==='guest'?'Sign in before your next round to save your score':save?.state==='idle'?'Play a round to save your score':save?.state==='failed'?'This score could not be saved': 'Saving your score…'}</p>
  {game?<GameLeaderboard game={game} refreshKey={save?.state==='saved'?1:0} compact/>:<section className="game-leaderboard"><h3>Leaderboard</h3><div className="leaderboard-state">Your leaderboard opens when this game is published.</div></section>}
  <Button icon="refresh" onClick={onReplay}>Play again</Button>{game&&<Button variant="secondary" onClick={onLeaderboard}>See leaderboard</Button>}
 </section></div>;
}
