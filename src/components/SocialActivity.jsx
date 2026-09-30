import React,{useCallback,useEffect,useRef,useState} from 'react';
import {loadSocialActivity,markSocialActivityRead,subscribeSocialActivity} from '../lib/social-activity.js';
import {activityHasPerson,activitySentence,activityScores,filterSocialActivity} from '../lib/social-activity-contracts.js';
import {Button,Loading,Notice} from './ui.jsx';
import {Icon} from './Icon.jsx';
import RobotPortrait from './RobotPortrait.jsx';

export default function SocialActivity({user,active,onUnread,requireAuth,onProfile,onPlay,onMessages,opening,paused}) {
  const [snapshot,setSnapshot]=useState(null),[filter,setFilter]=useState('all'),[loading,setLoading]=useState(true),[error,setError]=useState(null),[marking,setMarking]=useState(false);
  const live=useRef(false),epoch=useRef(0),pending=useRef(false),again=useRef(false),current=useRef(null),refreshRef=useRef(()=>{});
  current.current=snapshot;
  const refresh=useCallback(async(more=false)=>{
    if(!user)return;
    if(pending.current){if(!more)again.current=true;return;}
    pending.current=true;const revision=epoch.current;setLoading(true);setError(null);
    try {
      const next=await loadSocialActivity({beforeId:more?current.current?.next:null});
      if(!live.current||revision!==epoch.current)return;
      setSnapshot(old=>more&&old?{...next,events:[...old.events,...next.events.filter(event=>!old.events.some(item=>item.id===event.id))]}:next);
      onUnread(Number(next.unread)>0);
    } catch(failure) {if(live.current&&revision===epoch.current)setError(['authentication_required','account_changed'].includes(failure?.code)?failure:new Error('Your activity could not be loaded. Try again in a moment.'));}
    finally {if(live.current&&revision===epoch.current){pending.current=false;setLoading(false);if(again.current){again.current=false;void refreshRef.current();}}}
  },[user?.id,onUnread]);
  refreshRef.current=refresh;
  useEffect(()=>{
    live.current=true;epoch.current++;pending.current=false;again.current=false;setSnapshot(null);setError(null);setLoading(!!user);setMarking(false);onUnread(false);
    if(!user)return()=>{live.current=false;epoch.current++;};
    void refresh();
    const resume=()=>{if(!document.hidden)void refresh();};
    const unsubscribe=subscribeSocialActivity(user.id,resume);
    const timer=setInterval(resume,60000);
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{live.current=false;epoch.current++;pending.current=false;clearInterval(timer);unsubscribe();window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[user?.id,refresh,onUnread]);
  async function markRead() {
    if(marking||!snapshot?.events.length)return;
    const throughId=Math.max(...snapshot.events.map(event=>event.id)),revision=epoch.current;setMarking(true);setError(null);
    try {await markSocialActivityRead(throughId);if(live.current&&revision===epoch.current)await refresh();}
    catch(failure){if(live.current&&revision===epoch.current)setError(failure);}
    finally{if(live.current&&revision===epoch.current)setMarking(false);}
  }
  if(!active)return null;
  if(!user)return <section className="social-activity-guest"><Icon name="crown" size={36}/><h2>The rematch starts here.</h2><p>See who took your crown, who followed you, and what happened while you were away.</p><Button onClick={requireAuth}>Sign in for your activity<Icon name="arrow" size={16}/></Button></section>;
  const events=filterSocialActivity(snapshot?.events||[],filter);
  return <section className="social-activity" aria-labelledby="social-activity-title">
    <header className="social-activity-heading"><div><span>Your competitive inbox</span><h2 id="social-activity-title">Every crown has a story.</h2><p>Crown takeovers, new followers, messages. Your next move starts here.</p></div><div><Button variant="secondary small" disabled={loading} icon="refresh" onClick={()=>refresh()}>Refresh</Button>{snapshot?.canRead&&Number(snapshot.unread)>0&&<Button variant="small" disabled={marking||loading} onClick={markRead}>{marking?'Saving…':'Mark all read'}</Button>}</div></header>
    <div className="social-activity-filters" role="group" aria-label="Activity kind">{[['all','All activity'],['crowns','Crown battles'],['social','Social'],['messages','Messages']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
    <Notice error={error} onRetry={()=>refresh()}/>{error&&snapshot&&<p className="social-arena-stale">Showing your last received activity.</p>}
    {loading&&!snapshot?<Loading label="Opening your activity…"/>:events.length?<div className="social-activity-list" aria-busy={loading}>{events.map(event=><ActivityCard key={event.id} event={event} canRead={snapshot.canRead} paused={paused} onProfile={onProfile} onPlay={onPlay} onMessages={onMessages} opening={opening}/>)}</div>:!error&&<div className="social-arena-empty"><Icon name={filter==='messages'?'social':'crown'} size={30}/><h3>{filter==='crowns'?'Your next crown story is waiting.':filter==='messages'?'The conversation starts with hello.':'Make your next move.'}</h3><p>{snapshot?.events.length?'No matching events in this part of your inbox. Load earlier activity or try another filter.':filter==='crowns'?'Claim a crown. When it changes hands, you’ll find the rival and the rematch right here.':'Your crown changes and social notifications will appear here as they happen.'}</p><a href="#/feed" className="button secondary">Find a game<Icon name="arrow" size={16}/></a></div>}
    {!!snapshot?.next&&<div className="social-activity-more"><Button variant="secondary" disabled={loading} onClick={()=>refresh(true)}>{loading?'Loading…':'Earlier activity'}<Icon name="plus" size={16}/></Button></div>}
    <p className="social-activity-delivery"><span/>Activity stays up to date while Slop is open. For push alerts when you’re away, <a href="#/download">use the Slop app.</a></p>
  </section>;
}

function ActivityCard({event,canRead,paused,onProfile,onPlay,onMessages,opening}) {
  const crown=['crown_lost','crown_won'].includes(event.kind),scores=activityScores(event);
  const date=new Date(event.createdAt),title=activitySentence(event),person=activityHasPerson(event);
  const actor=event.profile||{id:event.actorId,username:event.actorName};
  const unread=canRead&&!event.readAt;
  const icon=crown?'crown':event.kind==='follow'?'user':event.kind==='like'?'heart':'social';
  return <article className={`social-activity-card ${crown?'is-crown':''} ${event.kind==='crown_lost'?'is-lost':''} ${unread?'is-unread':''}`}>
    {person?<button className="social-activity-actor" aria-label={`Open @${event.actorName}'s profile`} onClick={()=>onProfile(actor)}><RobotPortrait look={event.profile?.slop_look} alt="" animated={!paused}/></button>:<span className="social-activity-glyph"><Icon name={icon} size={24}/></span>}
    <div className="social-activity-copy"><div className="social-activity-meta">{crown&&<span>{event.kind==='crown_lost'?'Crown taken':'Crown claimed'}</span>}<time dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleDateString(undefined,{month:'short',day:'numeric'})} · {date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</time>{unread&&<b>New</b>}</div><h3>{title}</h3>{event.gameName&&<p className="social-activity-game">{event.gameName}</p>}{scores&&<p className="social-activity-score">{event.kind==='crown_lost'?<><strong>@{event.actorName} {scores.winning.toLocaleString()}</strong><span>You {scores.previous.toLocaleString()}</span></>:<strong>Winning score {scores.winning.toLocaleString()}</strong>}</p>}{event.detail&&!crown&&<p className="social-activity-detail">{event.detail}</p>}
      <div className="social-activity-actions">{event.kind==='message'?<button onClick={()=>onMessages(event.conversationId)}>{event.conversationId?'Open conversation':'Open messages'}<Icon name="arrow" size={15}/></button>:event.gameId?<button disabled={!!opening} onClick={()=>onPlay(event.gameId)}>{opening===event.gameId?'Opening…':event.kind==='crown_lost'?'Take it back':event.kind==='crown_won'?'Defend it':'Open game'}<Icon name="play" size={15}/></button>:null}{person&&<button className="social-activity-person-link" onClick={()=>onProfile(actor)}>Meet @{event.actorName}<Icon name="arrow" size={14}/></button>}</div>
    </div>
  </article>;
}
