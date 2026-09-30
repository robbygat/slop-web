import React from 'react';
import RobotStage from './RobotStage.jsx';
import SlopMark from './SlopMark.jsx';
import {Icon} from './Icon.jsx';
import {profileBackdrop} from '../lib/profile-banners.js';
import './player-space.css';
export default function PlayerPass({profile={},stats=[],paused=false,own=false,guest=false,onWorld,actions,children,transition=false}){
 const Title=own||guest?'h1':'h2';
 return <aside className={`player-pass ${guest?'guest-pass':''}`} style={{viewTransitionName:transition?'slop-person-profile':'none'}}>
  <div className="player-pass-scene"><img className="player-pass-world" src={profileBackdrop(profile.profile_banner_id)} alt=""/><SlopMark className="player-pass-stamp"/><div className="player-pass-head"><RobotStage look={profile.slop_look} paused={paused} alt={guest?'Meet your Slop':`${profile.display_name||profile.username||'Your'} Slop character`}/></div>{onWorld&&<button className="player-world-edit" onClick={onWorld} aria-label="Change your profile world"><Icon name="spark" size={17}/><span>Change world</span></button>}</div>
  <div className="player-pass-details"><Title>{guest?'Your Slop.':profile.display_name||profile.username||'Slop player'}</Title>{profile.username&&<p className="player-pass-handle">@{profile.username}</p>}{profile.bio&&<p className="player-pass-bio">{profile.bio}</p>}{stats.length>0&&<dl className="player-pass-stats">{stats.map(([label,value])=><div key={label}><dd>{value==null?'—':Number(value).toLocaleString()}</dd><dt>{label}</dt></div>)}</dl>}{actions&&<div className="player-pass-actions">{actions}</div>}{children}</div>
 </aside>;
}
