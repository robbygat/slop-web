import React, {useCallback, useEffect, useRef, useState} from 'react';
import {searchPeople, followPerson, loadGames, loadGame, loadDiscoveryPage} from '../lib/catalog.js';
import {supabase, result} from '../lib/supabase.js';
import {publicRead} from '../lib/public-read.js';
import {crownBoardEntries, filterCrownBoard, rivalChallenge} from '../lib/social-rivals.js';
import {activityConversation} from '../lib/social-activity-contracts.js';
import {UUID} from '../lib/contracts.js';
import {useAuth} from '../auth.jsx';
import {Button, Loading, Notice, useAsync, Modal} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import {PUBLIC_PROFILE_COLUMNS, profileBackdrop} from '../lib/profile-banners.js';
import RobotPortrait from '../components/RobotPortrait.jsx';
import PlayerPass from '../components/PlayerPass.jsx';
import PlayerCardShare from '../components/PlayerCardShare.jsx';
import SlopMark from '../components/SlopMark.jsx';
import GamePreview from '../components/GamePreview.jsx';
import SocialActivity from '../components/SocialActivity.jsx';
import './social-club.css';
import {GameCard, GameDetail} from './Play.jsx';
import {chatInbox,chatMessages,createDirectChat,markChatRead,sendChatMessage} from '../lib/chat.js';
import HeroScene from '../components/HeroScene.jsx';
import LiteHeroScene from '../components/LiteHeroScene.jsx';
import {lightHero} from '../lib/hero-policy.js';
import '../components/home-hero.css';
import './social.css';
import './social-v2.css';

const personName = person => person.display_name || person.username || 'Slop player';
const handle = person => person.username ? `@${person.username}` : 'Slop player';
export default function Social({params}) {
  const {user}=useAuth();
  return <SocialSpace key={user?.id||'guest'} params={params}/>;
}

function SocialSpace({params}) {
  const {user, profile:myProfile, requireAuth} = useAuth();
  const [term, setTerm] = useState('');
  const [view,setView]=useState('all'),[sharing,setSharing]=useState(false);
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [person, setPerson] = useState(null);
  const [rivalGame, setRivalGame] = useState(null);
  const [crownRevision, setCrownRevision] = useState(0);
  const [section,setSection]=useState('rivals'),[hasActivity,setHasActivity]=useState(false),[activityOpening,setActivityOpening]=useState(null);
  const activityRequest=useRef(0);
  const [messageTarget,setMessageTarget]=useState(undefined);
  const [initialConversationId,setInitialConversationId]=useState(null);
  const [visiblePeople,setVisiblePeople]=useState(24);
  const peopleSentinel=useRef(null);
  const pending = useRef(false);
  const people = useAsync(() => searchPeople(query.trim().replace(/^@/, '')), [query]);
  const visibleList=(people.data||[]).filter(p=>view==='all'||following.has(p.id));

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term), 250);
    return () => clearTimeout(timer);
  }, [term]);
  useEffect(()=>setVisiblePeople(24),[people.data,query,view]);
  useEffect(()=>{const node=peopleSentinel.current;if(!node||visiblePeople>=visibleList.length)return;const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting)setVisiblePeople(count=>Math.min(count+24,visibleList.length));},{rootMargin:'500px'});observer.observe(node);return()=>observer.disconnect();},[visibleList.length,visiblePeople,view]);
  useEffect(() => {
    let alive = true;
    setFollowing(new Set());
    setError(null);
    if (user) result(supabase.from('follows').select('following_id').eq('follower_id', user.id).limit(2000))
      .then(rows => {if (alive) setFollowing(new Set(rows.map(row => row.following_id)));})
      .catch(e => {if (alive) setError(e);});
    return () => {alive = false;};
  }, [user?.id]);

  useEffect(()=>{const id=params?.get('player');if(!id)return;if(!UUID.test(id)){setError(new Error('This player link is not valid.'));return;}let live=true;result(supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('id',id).single()).then(value=>{if(live)setPerson(value);}).catch(()=>{if(live)setError(new Error('This profile is unavailable. Try searching for the player.'));});return()=>{live=false;};},[params?.get('player')]);
  function closeProfile(){setPerson(null);if(params?.has('player'))history.replaceState(null,'','/#/social');}

  async function follow(id) {
    if (pending.current || !requireAuth()) return;
    pending.current = true;
    const shouldFollow = !following.has(id);
    setBusy(id);
    setError(null);
    try {
      await followPerson(id, shouldFollow);
      setFollowing(old => {
        const next = new Set(old);
        if (shouldFollow) next.add(id); else next.delete(id);
        return next;
      });
    } catch (e) {setError(e);}
    finally {pending.current = false; setBusy(null);}
  }

  function openProfile(next) {setPerson(next);}
  function openMessages(conversationId=null,target=null) {
    if(!requireAuth())return false;
    setInitialConversationId(UUID.test(conversationId)?conversationId:null);setMessageTarget(target);return true;
  }
  useEffect(()=>()=>{activityRequest.current++;},[]);
  useEffect(()=>{if(params?.get('tab')==='activity')setSection('activity');},[params?.get('tab')]);
  async function openActivityGame(slug) {
    if(activityOpening)return;
    const current=++activityRequest.current;setActivityOpening(slug);setError(null);
    try {const game=await loadGame(slug);if(current===activityRequest.current)setRivalGame(game);}
    catch(failure){if(current===activityRequest.current)setError(new Error('This game could not be opened. It may no longer be available.'));}
    finally{if(current===activityRequest.current)setActivityOpening(null);}
  }

  return <div className="social-club">
    <header className="social-stage">
     <div className="social-stage-copy"><h1>Stay connected<br/>with <em>friends.</em></h1><p>Meet through a game. Stay for the rematch.</p><div className="social-stage-actions"><Button icon="share" onClick={()=>{if(requireAuth())setSharing(true);}}>Share your player card</Button><button onClick={()=>openMessages()}><Icon name="social" size={18}/>Messages</button></div></div>
     <SocialCast paused={!!person||sharing||messageTarget!==undefined||!!rivalGame}/>
    </header>
    <div className="social-section-tabs" role="group" aria-label="Social section"><button aria-pressed={section==='rivals'} onClick={()=>setSection('rivals')}><Icon name="crown" size={18}/>Crown board</button><button aria-pressed={section==='activity'} onClick={()=>setSection('activity')}><Icon name="social" size={18}/>Activity{hasActivity&&<span className="social-unread-dot" aria-label="New activity"/>}</button><button aria-pressed={section==='people'} onClick={()=>setSection('people')}><Icon name="user" size={18}/>People</button></div>
    {section==='rivals'&&<CrownBoard user={user} following={following} requireAuth={requireAuth} revision={crownRevision}
      paused={!!person||sharing||messageTarget!==undefined||!!rivalGame} onPlay={setRivalGame}
      onProfile={holder=>openProfile({id:holder.user_id,username:holder.username,slop_look:holder.slop_look})}/>}
    <SocialActivity key={user?.id||'guest'} user={user} active={section==='activity'} onUnread={setHasActivity} requireAuth={requireAuth} onProfile={openProfile} onPlay={openActivityGame} onMessages={openMessages} opening={activityOpening} paused={!!person||sharing||messageTarget!==undefined||!!rivalGame}/>
    <Notice error={error}/>
    {section!=='activity'&&<>
    <div className="social-club-toolbar"><div role="group" aria-label="Players to show"><button aria-pressed={view==='all'} onClick={()=>setView('all')}>Discover</button><button aria-pressed={view==='following'} onClick={()=>{if(requireAuth())setView('following');}}>Following</button></div><label className="social-club-search"><Icon name="search" size={18}/><input aria-label="Search people" placeholder="Find your people" value={term} onChange={event=>setTerm(event.target.value)} autoComplete="off" spellCheck="false"/>{term&&<button aria-label="Clear people search" onClick={()=>setTerm('')}><Icon name="close" size={18}/></button>}</label></div>
    <div className="social-results-heading"><div><h2>{query.trim()?'Search results':view==='following'?'Your people.':'Find your people.'}</h2>{!query.trim()&&<p>{view==='following'?'Familiar faces, ready for the next round.':'Find a friend, a creator, or your next friendly rival.'}</p>}</div><span role="status">{people.loading?'Finding people…':''}</span></div>
    <Notice error={people.error} onRetry={people.refresh}/>
    {people.loading && !people.data ? <Loading label="Finding people…"/> : !people.error && !visibleList.length ?
      <div className="circle-empty"><Icon name="search" size={30}/><h3>{view==='following'?'Your circle starts here.':'No matching usernames'}</h3><p>{view==='following'?'Follow a player to find them here.':'Try another name.'}</p>{term && <Button variant="secondary small" onClick={() => setTerm('')}>Clear search</Button>}</div> :
      <div className={`player-cards ${people.loading ? 'is-loading' : ''}`} aria-busy={people.loading}>
        {visibleList.slice(0,visiblePeople).map(profile => <PersonRibbon key={profile.id} person={profile}
          following={following.has(profile.id)} busy={busy} own={profile.id === user?.id}
          onFollow={() => follow(profile.id)} onOpen={() => openProfile(profile)}
          animated={!person&&!sharing&&messageTarget===undefined&&!rivalGame}/>) }
      </div>}
    {!people.error&&visiblePeople<visibleList.length&&<div ref={peopleSentinel} className="circle-people-sentinel"><span className="loader"/><span>More people</span></div>}
    </>}
    {person && <PersonProfile person={person} own={person.id === user?.id} following={following.has(person.id)} busy={busy}
      onFollow={() => follow(person.id)} onMessage={()=>{if(openMessages(null,person))setPerson(null);}} onClose={closeProfile}/>}
    {sharing&&user&&<PlayerCardShare profile={{...myProfile,id:user.id}} onClose={()=>setSharing(false)}/>}
    {user&&messageTarget!==undefined&&<ChatModal key={`${user.id}:${initialConversationId||messageTarget?.id||'inbox'}`} startPerson={messageTarget} initialConversationId={initialConversationId} currentUser={user} onClose={()=>{setMessageTarget(undefined);setInitialConversationId(null);}}/>}
    {rivalGame&&<GameDetail game={rivalGame} backLabel="Back to Social" onClose={()=>{setRivalGame(null);setCrownRevision(value=>value+1);}}/>}
  </div>;
}

// The Slop crew wanders the Social cover. The 3D cast falls back to the
// lightweight orbit on constrained connections or reduced motion.
function SocialCast({paused}){
 const policy=()=>lightHero({reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,saveData:navigator.connection?.saveData,effectiveType:navigator.connection?.effectiveType});
 const [light]=useState(policy);
 return <div className="hero-stage social-cast">{light?<LiteHeroScene paused={paused}/>:<HeroScene paused={paused}/>}</div>;
}

function CrownBoard({user, following, requireAuth, revision, paused, onPlay, onProfile}) {
  const [entries,setEntries]=useState(null),[scope,setScope]=useState('everyone');
  const [loading,setLoading]=useState(true),[error,setError]=useState(null),[copied,setCopied]=useState(null),[copyError,setCopyError]=useState(null);
  const live=useRef(false),request=useRef(0),pending=useRef(false),timer=useRef(null);
  const refresh=useCallback(async()=>{
    if(pending.current)return;
    pending.current=true;const current=++request.current;setLoading(true);setError(null);
    try {
      const page=await loadDiscoveryPage({order:'new',platform:'mobile',limit:16});
      const rows=page.games.length?await publicRead(supabase.rpc('game_crowns',{p_games:page.games.map(game=>game.slug)}),{timeoutMs:7000}):[];
      if(live.current&&current===request.current)setEntries(crownBoardEntries(page.games,rows));
    } catch(failure) {if(live.current&&current===request.current)setError(new Error('The crown board could not refresh. Try again in a moment.'));}
    finally {if(live.current&&current===request.current){pending.current=false;setLoading(false);}}
  },[]);
  useEffect(()=>{
    live.current=true;void refresh();
    const resume=()=>{if(!document.hidden)void refresh();};
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{live.current=false;request.current++;pending.current=false;clearTimeout(timer.current);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[refresh]);
  useEffect(()=>{if(revision)void refresh();},[revision,refresh]);
  useEffect(()=>{setScope('everyone');setCopied(null);},[user?.id]);
  async function copyChallenge(entry) {
    setCopyError(null);
    try {await navigator.clipboard.writeText(rivalChallenge(entry));if(!live.current)return;setCopied(entry.game.id);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(null),3000);}
    catch {if(live.current)setCopyError(new Error('Could not copy the challenge. Open the game and use its share option.'));}
  }
  const visible=filterCrownBoard(entries||[],{scope,following,userId:user?.id});
  const ordered=[...visible.filter(entry=>entry.state==='crowned'),...visible.filter(entry=>entry.state!=='crowned')].slice(0,10);
  return <section className="social-arena" aria-labelledby="social-arena-title">
    <div className="social-arena-heading"><div><h2 id="social-arena-title">A name. A score.<br/>Your next rival.</h2><p>The newest games on Slop and whoever holds the crown. Jump in and take it.</p></div><div className="social-arena-path" aria-label="How to start a rivalry"><span><b>01</b>Pick a crown</span><Icon name="arrow" size={18}/><span><b>02</b>Beat the score</span><Icon name="arrow" size={18}/><span><b>03</b>Invite a rematch</span></div></div>
    <div className="social-arena-toolbar"><div role="group" aria-label="Crown board players">{[['everyone','Everyone'],['following','Following'],['mine','Your crowns']].map(([id,label])=><button key={id} aria-pressed={scope===id} onClick={()=>{if(id==='everyone'||requireAuth())setScope(id);}}>{label}</button>)}</div><button className="social-arena-refresh" aria-label="Refresh crown board" disabled={loading} onClick={refresh}><Icon name="refresh" size={16}/><span>{loading?'Refreshing…':'Refresh'}</span></button></div>
    <Notice error={error} onRetry={refresh}/>{error&&entries&&<p className="social-arena-stale">Showing the last crown board we received.</p>}
    {loading&&!entries?<div className="social-arena-skeleton" role="status" aria-label="Finding crown holders">{[0,1,2].map(id=><div key={id}><span/><i/><i/></div>)}</div>:ordered.length?<div className={`social-rival-grid ${loading?'is-loading':''}`} aria-busy={loading}>{ordered.map(entry=><RivalCard key={entry.game.id} entry={entry} own={entry.holder?.user_id===user?.id} paused={paused} copied={copied===entry.game.id} onCopy={()=>copyChallenge(entry)} onPlay={()=>onPlay(entry.game)} onProfile={()=>onProfile(entry.holder)}/>)}</div>:!error&&<div className="social-arena-empty"><Icon name="crown" size={30}/><h3>{scope==='following'?'Your next rivalry starts with a follow.':scope==='mine'?'Put your name on the board.':'The next game is waiting.'}</h3><p>{scope==='following'?'No one you follow holds a crown in these featured games yet. Explore the board or find your people below.':scope==='mine'?'You don’t hold a crown in these featured games yet. Pick a game and make a run at it.':'Find a game, set a score, and bring a friend.'}</p>{scope==='everyone'?<a className="button secondary" href="#/feed">Find a game<Icon name="arrow" size={16}/></a>:<Button variant="secondary small" onClick={()=>setScope('everyone')}>Explore the crown board<Icon name="arrow" size={16}/></Button>}</div>}
    <Notice error={copyError}/>
    {entries?.length>0&&<p className="social-arena-note">Crown holders in the newest mobile games. Scores refresh when you return from a run.</p>}
  </section>;
}

function RivalCard({entry, own, paused, copied, onCopy, onPlay, onProfile}) {
  const {game,holder,state}=entry;
  return <article className={`social-rival-card ${own?'is-yours':''}`}>
    <button className="social-rival-preview" onClick={onPlay} aria-label={`Play ${game.name}`}><GamePreview game={game} paused={paused}/><span className="social-rival-play"><Icon name="play" fill="currentColor" size={18}/></span></button>
    <div className="social-rival-body"><span className="social-rival-game-name">{game.name}</span>{holder?<><button className="social-rival-person" onClick={onProfile} aria-label={`Meet crown holder @${holder.username}`}><RobotPortrait look={holder.slop_look} alt="" animated={!paused}/><span><small>{own?'Your crown':'Crown holder'}</small><strong>@{holder.username}</strong></span></button><div className="social-rival-score"><Icon name="crown" size={16}/><strong>{holder.score.toLocaleString()}</strong><span>{own?'your score':'to beat'}</span></div></>:<div className="social-rival-no-holder"><Icon name="crown" size={16}/><strong>{state==='open'?'No crown yet. Take it.':'Crown unavailable.'}</strong></div>}
      <div className="social-rival-actions"><Button onClick={onPlay}>{own?'Defend':holder?'Take the crown':'Play'}<Icon name="arrow" size={15}/></Button>{holder&&<button type="button" className="social-rival-copy" onClick={onCopy} aria-label={copied?`Challenge for ${game.name} copied`:`Copy challenge for ${game.name}`} title={copied?'Challenge copied':'Copy a challenge to share'}><Icon name={copied?'check':'share'} size={17}/></button>}</div>
      {copied&&<span className="social-rival-copy-status" role="status">Challenge copied.</span>}
    </div>
  </article>;
}

function PersonRibbon({person, following, busy, own, onFollow, onOpen, animated}) {
  return <article className="player-card">
    <button className="player-card-open" onClick={onOpen} aria-label={`Open ${personName(person)}, ${handle(person)}`}>
      <span className="player-card-scene"><img src={profileBackdrop(person.profile_banner_id)} className="player-card-world" alt="" loading="lazy"/><RobotPortrait look={person.slop_look} className="player-card-robot" animated={animated} alt=""/><SlopMark className="player-card-stamp"/></span>
      <span className="player-card-identity"><strong>{personName(person)}</strong><span>{handle(person)}</span></span>
      <span className="player-card-enter" aria-hidden="true"><Icon name="arrow" size={18}/></span>
    </button>
    <div className="player-card-footer"><p>{person.bio||''}</p>{own?<a href="#/you">Your profile <Icon name="arrow" size={14}/></a>:<button type="button" className={following?'is-following':''} disabled={!!busy} onClick={onFollow} aria-label={`${following?'Unfollow':'Follow'} ${handle(person)}`}><Icon name={following?'check':'plus'} size={16}/>{busy===person.id?'Saving…':following?'Following':'Follow'}</button>}</div>
  </article>;
}

async function profileStats(id) {
  const queries = [
    supabase.from('games').select('id', {count: 'exact', head: true}).eq('owner_id', id).eq('status', 'published').eq('media_delete_authorized', false).ilike('html', '%slop.js%'),
    supabase.from('follows').select('follower_id', {count: 'exact', head: true}).eq('following_id', id),
    supabase.from('follows').select('following_id', {count: 'exact', head: true}).eq('follower_id', id),
  ];
  const rows = await Promise.all(queries);
  return rows.map(row => row.error ? null : row.count);
}

function PersonProfile({person, following, busy, own, onFollow, onMessage, onClose}) {
  const details = useAsync(() => result(supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('id', person.id).single()), [person.id]);
  const games = useAsync(() => loadGames({owner: person.id}), [person.id]);
  const stats = useAsync(() => profileStats(person.id), [person.id, following]);
  const [selected, setSelected] = useState(null),[sharing,setSharing]=useState(false);
  const profile = details.data || person;
  return <Modal title={handle(profile)} onClose={onClose} className="player-profile-modal">
    <div className="player-space"><PlayerPass profile={profile} paused={!!selected||sharing} stats={['Games','Followers','Following'].map((label,i)=>[label,stats.data?.[i]])} actions={<>{own?<a className="button" href="#/you" onClick={onClose}>Your profile <Icon name="arrow" size={17}/></a>:<><Button icon={following?'check':'plus'} disabled={!!busy} onClick={onFollow}>{busy===person.id?'Saving…':following?'Following':'Follow player'}</Button><Button variant="secondary" icon="social" onClick={onMessage}>Message</Button></>}<Button variant="secondary" icon="share" onClick={()=>setSharing(true)}>Share card</Button></>}/>
      <section className="player-space-content"><h2>{own?'Your games.':'Their games.'}</h2><Notice error={details.error} onRetry={details.refresh}/><Notice error={games.error} onRetry={games.refresh}/>
        {games.loading?<Loading label="Loading games…"/>:games.data?.length?<div className="game-grid">{games.data.map(game=><GameCard key={game.id} game={game} onOpen={setSelected} paused={!!selected||sharing}/>)}</div>:!games.error&&<div className="circle-empty"><Icon name="play" size={27}/><h3>The next favorite starts here.</h3><p>No published games yet.</p></div>}
      </section>
    </div>{sharing&&<PlayerCardShare profile={profile} onClose={()=>setSharing(false)}/>}{selected&&<GameDetail game={selected} backLabel="Back to profile" onClose={()=>setSelected(null)}/>}
  </Modal>;
}

function conversationName(thread){return thread?.title||thread?.people?.map(personName).join(', ')||'Conversation';}
function conversationHandle(thread){return thread?.people?.map(handle).join(', ')||'';}

function ChatModal({startPerson,initialConversationId=null,currentUser,onClose}){
 const[threads,setThreads]=useState([]),[room,setRoom]=useState(null),[messages,setMessages]=useState([]),[loading,setLoading]=useState(true),[roomLoading,setRoomLoading]=useState(false),[error,setError]=useState(null),[draft,setDraft]=useState(''),[sending,setSending]=useState(false);
 const bottom=useRef(null),live=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[currentUser?.id]);
 async function refreshMessages(id){const rows=await chatMessages(id);if(!live.current)return;setMessages(rows);await markChatRead(id).catch(()=>{});}
 useEffect(()=>{let alive=true;(async()=>{setLoading(true);setError(null);try{let preferred=null;if(!initialConversationId&&startPerson)preferred=await createDirectChat(startPerson.id);const rows=await chatInbox();if(!alive)return;setThreads(rows);if(initialConversationId){const target=activityConversation(rows,initialConversationId);setRoom(target);if(!target)setError(new Error('This conversation is no longer available. Choose another conversation from your inbox.'));}else setRoom(rows.find(row=>row.id===preferred)||rows[0]||(preferred?{id:preferred,title:'',people:[startPerson],unread:0}:null));}catch(e){if(alive)setError(e);}finally{if(alive)setLoading(false);}})();return()=>{alive=false;};},[startPerson?.id,initialConversationId,currentUser?.id]);
 useEffect(()=>{if(!room?.id){setMessages([]);return;}let alive=true;const load=async quiet=>{try{const rows=await chatMessages(room.id);if(alive){setMessages(rows);await markChatRead(room.id).catch(()=>{});}}catch(e){if(alive&&!quiet)setError(e);}finally{if(alive)setRoomLoading(false);}};setRoomLoading(true);load(false);const timer=setInterval(()=>load(true),4000);return()=>{alive=false;clearInterval(timer);};},[room?.id]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:'nearest'});},[messages.length,room?.id]);
 async function send(event){event.preventDefault();const body=draft.trim();if(!body||sending||!room?.id)return;setSending(true);setError(null);try{await sendChatMessage(room.id,body);if(!live.current)return;setDraft('');await refreshMessages(room.id);if(!live.current)return;const inbox=await chatInbox();if(live.current)setThreads(inbox);}catch(e){if(live.current)setError(e);}finally{if(live.current)setSending(false);}}
 return <Modal title="Messages" onClose={onClose} className="circle-chat-modal"><div className="circle-chat-shell">
  <aside className={`circle-chat-inbox ${room?'has-room':''}`}><div className="circle-chat-title"><h2>Messages</h2><span>{threads.reduce((total,item)=>total+Number(item.unread||0),0)||''}</span></div>{loading?<Loading label="Opening messages…"/>:threads.length?<div className="circle-chat-list">{threads.map(thread=><button key={thread.id} className={thread.id===room?.id?'active':''} onClick={()=>setRoom(thread)}><RobotPortrait look={thread.people?.[0]?.slop_look} className="circle-chat-avatar" alt=""/><span><strong>{conversationName(thread)}</strong><small>{thread.last_message||conversationHandle(thread)}</small></span>{Number(thread.unread)>0&&<b>{thread.unread}</b>}</button>)}</div>:<div className="circle-chat-empty"><Icon name="social" size={25}/><p>Your conversations will appear here.</p></div>}</aside>
  <section className={`circle-chat-room ${room?'is-open':''}`}>{room?<><header><button className="circle-chat-back" type="button" aria-label="Back to messages" onClick={()=>setRoom(null)}><Icon name="chevron" size={18}/></button><RobotPortrait look={room.people?.[0]?.slop_look} className="circle-chat-avatar" alt=""/><div><strong>{conversationName(room)}</strong><small>{conversationHandle(room)}</small></div></header><div className="circle-chat-messages">{roomLoading&&!messages.length?<Loading label="Loading conversation…"/>:messages.length?messages.map(message=><article key={message.id} className={message.sender?.id===currentUser?.id?'mine':''}><RobotPortrait look={message.sender?.slop_look} className="circle-chat-message-avatar" alt=""/><div><small>{message.sender?.id===currentUser?.id?'You':personName(message.sender)}</small><p>{message.body}</p></div></article>):<div className="circle-chat-empty"><p>Say hello.</p></div>}<div ref={bottom}/></div><form className="circle-chat-compose" onSubmit={send}><input aria-label={`Message ${conversationName(room)}`} maxLength="2000" value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Write a message…"/><button type="submit" disabled={sending||!draft.trim()} aria-label="Send message"><Icon name="arrow" size={18}/></button></form></>:<div className="circle-chat-empty room"><Icon name="social" size={30}/><h3>Your messages</h3><p>Pick a conversation.</p></div>}</section>
 </div><Notice error={error}/></Modal>;
}
