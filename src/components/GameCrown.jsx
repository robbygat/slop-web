import React from 'react';
import {Icon} from './Icon.jsx';
import RobotPortrait from './RobotPortrait.jsx';
import './game-crown.css';

export default function GameCrown({holder,live=true,compact=false,error,onRetry}){
 if(holder===undefined&&!error)return null;
 if(!holder)return <div className={`game-crown-state ${compact?'is-compact':''}`}><Icon name="crown" size={16}/><span>{error?'First place unavailable':'No scores yet. Take first place.'}</span>{error&&onRetry&&<button onClick={onRetry} aria-label="Retry first-place score"><Icon name="refresh" size={14}/></button>}</div>;
 const score=holder.score.toLocaleString();
 return <a className={`game-crown ${compact?'is-compact':''}`} href={`#/social?player=${encodeURIComponent(holder.user_id)}`} tabIndex={live?0:-1} aria-label={`First place: ${holder.username}, ${score} points. Open profile.`}>
  <span className="game-crown-character"><Icon name="crown" size={15}/><RobotPortrait look={holder.slop_look} animated={live} alt=""/></span>
  <span className="game-crown-player"><span>First place</span><strong>@{holder.username}</strong></span>
  <span className="game-crown-score"><strong>{score}</strong><span>points</span></span>
 </a>;
}
