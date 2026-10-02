import React,{useEffect,useRef,useState} from 'react';
import {Button,Slop,useAsync} from './ui.jsx';
import {Icon} from './Icon.jsx';
import {loadLeaderboard,loadPersonalBest,loadPlayerStanding} from '../lib/leaderboard.js';
import {deriveScoreContext} from '../lib/player-standing.js';
import './game-results.css';
function usePlayerData(load,game,viewerId,refreshKey,enabled=true){
 const key=`${game?.slug||''}:${viewerId||''}:${refreshKey}`,active=enabled&&!!game&&!!viewerId;
 const state=useAsync(async()=>({key,value:active?await load(game.slug,viewerId):null}),[key,active]);
 return {...state,data:state.data?.key===key?state.data.value:null,loading:active&&(state.loading||(!state.error&&state.data?.key!==key))};
}
export function GameLeaderboard({game,refreshKey=0,compact=false,viewerId,standingState}) {
  const board=useAsync(()=>loadLeaderboard(game.slug),[game.slug,refreshKey]);
  const ownStanding=usePlayerData(loadPlayerStanding,game,viewerId,refreshKey,!standingState);
  return <LeaderboardResults {...board} compact={compact} viewerId={viewerId} standingState={standingState||ownStanding}/>;
}
export function LeaderboardResults({data:rows,loading,error,refresh,compact=false,viewerId,standingState}) {
  return <section className={`game-leaderboard ${compact?'compact':''}`} aria-label="Leaderboard">
    <div className="leaderboard-heading"><h3>Leaderboard</h3><span>All time</span></div>
    {loading?<div className="leaderboard-state" role="status"><span className="leaderboard-loading" aria-hidden="true"/>Loading the leaderboard…</div>:error?<div className="leaderboard-state" role="alert"><Icon name="refresh" size={32}/><strong>The leaderboard couldn’t load.</strong><p>Your next round is ready when you are.</p><Button variant="small secondary" onClick={refresh}>Retry</Button></div>:rows?.length?<>
      <div className="leaderboard-columns" aria-hidden="true"><span>Rank</span><span>Player</span><span>Score</span></div>
      <ol tabIndex={0} aria-label="Top scores">{rows.map((entry,i)=><li key={entry.user_id||`${entry.username}:${i}`} className={viewerId&&entry.user_id===viewerId?'is-you':undefined}><span className={`leaderboard-rank ${i===0?'is-crown':''}`}>{i===0?<><Icon name="crown" size={17}/><span className="sr-only">1</span></>:i+1}</span><Slop look={entry.slop_look} avatar={entry.avatar_url} alt=""/><span className="leaderboard-name">@{entry.username}{viewerId&&entry.user_id===viewerId&&<span className="leaderboard-you">You</span>}{entry.authority==='verified_receipt'&&<small>Verified</small>}</span><strong>{entry.score.toLocaleString()}</strong></li>)}</ol>
    </>:<div className="leaderboard-state leaderboard-empty"><span className="leaderboard-empty-icon"><Icon name="crown" size={34}/></span><strong>The crown is waiting.</strong><p>No scores yet. Be the first on the board.</p></div>}
    {viewerId&&standingState&&<PlayerStanding {...standingState}/>}
    {!!rows?.some(row=>row.authority!=='verified_receipt')&&<p className="leaderboard-note">Community scores · same leaderboard as the app.</p>}
  </section>;
}
export function PlayerStanding({data,loading,error,refresh}){
 return <div className="leaderboard-personal" aria-label="Your leaderboard position" aria-live="polite">
  {loading?<span>Loading your position…</span>:error?<><span>Your position couldn’t load.</span><button type="button" onClick={refresh}>Retry position</button></>:data?.hasScore?<><span className="leaderboard-personal-rank">#{data.rank.toLocaleString()}</span><span className="leaderboard-personal-label">Your best<small>{data.authority==='verified_receipt'?'Verified score':'Community score'}</small></span><strong>{data.best.toLocaleString()}</strong></>:<><span>Your best</span><small>{data?.authority==='verified_receipt'?'No verified score yet.':'No saved position yet.'}</small></>}
 </div>;
}
export function ScoreContext({score,save,baseline,personal,standing}){
 const comparison=deriveScoreContext(score,baseline,{saved:save?.state==='saved'});
 const known=personal?.data||baseline;
 const best=known?.hasScore?Math.max(known.best,comparison.saved?comparison.personalBest??0:0):comparison.saved?comparison.personalBest:null;
 const newBest=comparison.saved&&(comparison.improved||comparison.firstScore)&&best===score;
 const position=!standing?.loading&&!standing?.error?standing?.data:null;
 return <div className="game-score-context">
  <div className="game-result-stat"><span>Personal best</span><strong>{best!=null?best.toLocaleString():known?.available?'No saved score':personal?.loading?'…':'Unavailable'}</strong>
   {newBest?<small className="is-new-best">{comparison.firstScore?'First score saved':`New personal best · +${comparison.improvement.toLocaleString()}`}</small>:comparison.available&&comparison.improved&&!comparison.saved?<small>{save?.state==='failed'?'Beat your previous best · not saved':'Beat your best · save pending'}</small>:comparison.tied&&best===score?<small>Matched your best</small>:best>score?<small>{(best-score).toLocaleString()} points off your best</small>:null}
   {personal?.error&&<button type="button" onClick={personal.refresh}>Refresh best</button>}
  </div>
  {position?.hasScore&&<div className="game-result-stat game-result-target"><span>{position.rank===1?'Leaderboard':'Next position'}</span><strong>{position.rank===1?'You’re #1':position.pointsToNext!==null?`${position.pointsToNext.toLocaleString()} pts`:'Score limit'}</strong><small>{position.rank===1?'You hold the top spot.':position.pointsToNext!==null?`To pass #${position.nextRank.toLocaleString()} · target ${(position.nextScore+1).toLocaleString()}`:'The player above has the maximum score.'}</small></div>}
 </div>;
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
export function GameOver({game,score,save,baseline,onReplay,onRetrySave,onSignIn,look,preview=false,viewerId}) {
 const replayButton=useRef(null);
 const refreshKey=save?.state==='saved'?1:0;
 const personal=usePlayerData(loadPersonalBest,game,viewerId,refreshKey,!preview);
 const standing=usePlayerData(loadPlayerStanding,game,viewerId,refreshKey,!preview);
 useEffect(()=>{replayButton.current?.focus({preventScroll:true});},[]);
 return <div className="game-over-overlay"><section className="game-over-card" role="region" aria-label="Game over">
  <div className="game-over-summary"><Slop look={look} body="ghost" color="tangerine" className="game-over-slop" alt="Your Slop"/><div><p className="game-over-game">{game?.name||'Private playtest'}</p><h2>Game over.</h2><div className={`game-over-score ${score>=1000000?'is-long-score':''}`}><span>Your score</span><strong>{score.toLocaleString()}</strong></div><p className="game-save-status" data-state={preview?'preview':save?.state||'saving'} role="status">{preview?'Private playtest':save?.state==='saved'?'Score saved':save?.state==='guest'?(viewerId?'You’re signed in. Your next round will save.':'Sign in before your next round to save your score.'):save?.state==='idle'?'Play a round to save your score.':save?.state==='failed'?(save.errorCode==='account_changed'||save.errorCode==='authentication_required'?'Your account changed. Start a new round to save a score.':'Your score couldn’t be saved.'):'Saving your score…'}</p>
   {!preview&&save?.state==='guest'&&!viewerId&&onSignIn&&<Button variant="small secondary" className="game-save-action" onClick={onSignIn}>Sign in for next round</Button>}
   {!preview&&save?.state==='failed'&&save.retryable!==false&&onRetrySave&&<Button variant="small secondary" className="game-save-action" icon="refresh" onClick={onRetrySave}>Retry saving score</Button>}
   {!preview&&game&&viewerId&&<ScoreContext score={score} save={save} baseline={baseline} personal={personal} standing={standing}/>}
  </div></div>
  {save?.crown&&<CrownTakeover crown={save.crown}/>}
  {game?<GameLeaderboard game={game} refreshKey={refreshKey} compact viewerId={viewerId} standingState={standing}/>:<section className="game-leaderboard"><div className="leaderboard-heading"><h3>Leaderboard</h3><span>Private playtest</span></div><div className="leaderboard-state"><Icon name="lock" size={32}/><strong>A little practice first.</strong><p>Your leaderboard opens when this game is published.</p></div></section>}
  <Button ref={replayButton} icon="refresh" onClick={onReplay}>Play again</Button>
 </section></div>;
}
