import React, {useEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {searchPeople, followPerson, loadGames} from '../lib/catalog.js';
import {supabase, result} from '../lib/supabase.js';
import {UUID} from '../lib/contracts.js';
import {useAuth} from '../auth.jsx';
import {Button, Loading, Notice, useAsync, Modal} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import {PUBLIC_PROFILE_COLUMNS, profileBackdrop} from '../lib/profile-banners.js';
import RobotPortrait from '../components/RobotPortrait.jsx';
import PlayerPass from '../components/PlayerPass.jsx';
import PlayerCardShare from '../components/PlayerCardShare.jsx';
import SlopMark from '../components/SlopMark.jsx';
import './social-club.css';
import {GameCard, GameDetail} from './Play.jsx';
import {chatInbox,chatMessages,createDirectChat,markChatRead,sendChatMessage} from '../lib/chat.js';
import './social.css';

const personName = person => person.display_name || person.username || 'Slop player';
const handle = person => person.username ? `@${person.username}` : 'Slop player';
export default function Social({params}) {
  const {user, profile:myProfile, requireAuth} = useAuth();
  const [term, setTerm] = useState('');
  const [view,setView]=useState('all'),[sharing,setSharing]=useState(false);
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [person, setPerson] = useState(null);
  const [transitionId, setTransitionId] = useState(null);
  const [messageTarget,setMessageTarget]=useState(undefined);
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

  function openProfile(next) {
    // The same silhouette grows into the profile. Unsupported browsers and
    // Reduced Motion use the ordinary accessible dialog without a delay.
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPerson(next);
      return;
    }
    flushSync(() => setTransitionId(next.id));
    const transition = document.startViewTransition(() => flushSync(() => setPerson(next)));
    transition.finished.catch(() => {}).finally(() => setTransitionId(null));
  }

  return <div className="social-club">
    <header className="social-club-cover"><div><h1>Your kind<br/>of players.</h1><p>Find a familiar face. Meet your next rival.</p><div className="social-club-actions"><Button icon="share" onClick={()=>{if(requireAuth())setSharing(true);}}>Your player card</Button><button onClick={()=>{if(requireAuth())setMessageTarget(null);}}><Icon name="social" size={18}/>Messages</button></div></div><div className="social-card-fan"><SlopMark/>{people.data?.slice(0,3).map((player,i)=><button key={player.id} className={`fan-card fan-card-${i}`} onClick={()=>openProfile(player)} aria-label={`Meet ${personName(player)}`}><img src={profileBackdrop(player.profile_banner_id)} alt=""/><RobotPortrait look={player.slop_look} loading="eager" alt=""/><span><strong>{personName(player)}</strong><small>{handle(player)}</small></span></button>)}</div></header>
    <div className="social-club-toolbar"><div role="group" aria-label="Players to show"><button aria-pressed={view==='all'} onClick={()=>setView('all')}>Discover</button><button aria-pressed={view==='following'} onClick={()=>{if(requireAuth())setView('following');}}>Following</button></div><label className="social-club-search"><Icon name="search" size={18}/><input aria-label="Search people" placeholder="Find your people" value={term} onChange={event=>setTerm(event.target.value)} autoComplete="off" spellCheck="false"/>{term&&<button aria-label="Clear people search" onClick={()=>setTerm('')}><Icon name="close" size={18}/></button>}</label></div>
    <div className="social-results-heading"><h2>{query.trim()?'Search results':view==='following'?'Your circle.':'The Slop club.'}</h2><span role="status">{people.loading?'Finding people…':!people.error?`${visibleList.length} players`:''}</span></div>
    <Notice error={error}/>
    <Notice error={people.error} onRetry={people.refresh}/>
    {people.loading && !people.data ? <Loading label="Finding people…"/> : !people.error && !visibleList.length ?
      <div className="circle-empty"><Icon name="search" size={30}/><h3>{view==='following'?'Your circle starts here.':'No matching usernames'}</h3><p>{view==='following'?'Follow a player to find them here.':'Try another name.'}</p>{term && <Button variant="secondary small" onClick={() => setTerm('')}>Clear search</Button>}</div> :
      <div className={`player-cards ${people.loading ? 'is-loading' : ''}`} aria-busy={people.loading}>
        {visibleList.slice(0,visiblePeople).map((profile, index) => <PersonRibbon key={profile.id} person={profile} index={index}
          following={following.has(profile.id)} busy={busy} own={profile.id === user?.id}
          onFollow={() => follow(profile.id)} onOpen={() => openProfile(profile)}
          transition={transitionId === profile.id && !person}/>) }
      </div>}
    {!people.error&&visiblePeople<visibleList.length&&<div ref={peopleSentinel} className="circle-people-sentinel"><span className="loader"/><span>More people</span></div>}
    {person && <PersonProfile person={person} own={person.id === user?.id} following={following.has(person.id)} busy={busy}
      onFollow={() => follow(person.id)} onMessage={()=>{setPerson(null);setMessageTarget(person);}} onClose={closeProfile} transition={transitionId === person.id}/>}
    {sharing&&user&&<PlayerCardShare profile={{...myProfile,id:user.id}} onClose={()=>setSharing(false)}/>}
    {messageTarget!==undefined&&<ChatModal key={messageTarget?.id||'inbox'} startPerson={messageTarget} currentUser={user} onClose={()=>setMessageTarget(undefined)}/>}
  </div>;
}

function PersonRibbon({person, index, following, busy, own, onFollow, onOpen, transition}) {
  return <article className="player-card" style={{viewTransitionName:transition?'slop-person-profile':'none'}}>
    <button className="player-card-open" onClick={onOpen} aria-label={`Open ${personName(person)}, ${handle(person)}`}>
      <span className="player-card-brand"><SlopMark/>Slop.game</span><img src={profileBackdrop(person.profile_banner_id)} className="player-card-world" alt="" loading="lazy"/>
      <RobotPortrait look={person.slop_look} avatar={person.avatar_url} className="player-card-robot" alt=""/>
      <span className="player-card-identity"><strong>{personName(person)}</strong><span>{handle(person)}</span></span>
      <span className="player-card-enter" aria-hidden="true"><Icon name="arrow" size={20}/></span>
    </button>
    <div className="player-card-footer"><p>{person.bio||''}</p>{own?<a href="#/you">Your profile</a>:<button type="button" className={following?'is-following':''} disabled={!!busy} onClick={onFollow} aria-label={`${following?'Unfollow':'Follow'} ${handle(person)}`}><Icon name={following?'check':'plus'} size={16}/>{busy===person.id?'Saving…':following?'Following':'Follow'}</button>}</div>
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

function PersonProfile({person, following, busy, own, onFollow, onMessage, onClose, transition}) {
  const details = useAsync(() => result(supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('id', person.id).single()), [person.id]);
  const games = useAsync(() => loadGames({owner: person.id}), [person.id]);
  const stats = useAsync(() => profileStats(person.id), [person.id, following]);
  const [selected, setSelected] = useState(null),[sharing,setSharing]=useState(false);
  const profile = details.data || person;
  return <Modal title={handle(profile)} onClose={onClose} className="player-profile-modal">
    <div className="player-space"><PlayerPass profile={profile} transition={transition} paused={!!selected||sharing} stats={['Games','Followers','Following'].map((label,i)=>[label,stats.data?.[i]])} actions={<>{own?<a className="button" href="#/you" onClick={onClose}>Your profile <Icon name="arrow" size={17}/></a>:<><Button icon={following?'check':'plus'} disabled={!!busy} onClick={onFollow}>{busy===person.id?'Saving…':following?'Following':'Follow player'}</Button><Button variant="secondary" icon="social" onClick={onMessage}>Message</Button></>}<Button variant="secondary" icon="share" onClick={()=>setSharing(true)}>Share card</Button></>}/>
      <section className="player-space-content"><h2>{own?'Your games.':'Their games.'}</h2><Notice error={details.error} onRetry={details.refresh}/><Notice error={games.error} onRetry={games.refresh}/>
        {games.loading?<Loading label="Loading games…"/>:games.data?.length?<div className="game-grid">{games.data.map(game=><GameCard key={game.id} game={game} onOpen={setSelected} paused={!!selected||sharing}/>)}</div>:!games.error&&<div className="circle-empty"><Icon name="play" size={27}/><h3>The next favorite starts here.</h3><p>No published games yet.</p></div>}
      </section>
    </div>{sharing&&<PlayerCardShare profile={profile} onClose={()=>setSharing(false)}/>}{selected&&<GameDetail game={selected} onClose={()=>setSelected(null)}/>}
  </Modal>;
}

function conversationName(thread){return thread?.title||thread?.people?.map(personName).join(', ')||'Conversation';}
function conversationHandle(thread){return thread?.people?.map(handle).join(', ')||'';}

function ChatModal({startPerson,currentUser,onClose}){
 const[threads,setThreads]=useState([]),[room,setRoom]=useState(null),[messages,setMessages]=useState([]),[loading,setLoading]=useState(true),[roomLoading,setRoomLoading]=useState(false),[error,setError]=useState(null),[draft,setDraft]=useState(''),[sending,setSending]=useState(false);
 const bottom=useRef(null);
 async function refreshMessages(id){const rows=await chatMessages(id);setMessages(rows);await markChatRead(id).catch(()=>{});}
 useEffect(()=>{let alive=true;(async()=>{setLoading(true);setError(null);try{let preferred=null;if(startPerson)preferred=await createDirectChat(startPerson.id);const rows=await chatInbox();if(!alive)return;setThreads(rows);setRoom(rows.find(row=>row.id===preferred)||rows[0]||(preferred?{id:preferred,title:'',people:[startPerson],unread:0}:null));}catch(e){if(alive)setError(e);}finally{if(alive)setLoading(false);}})();return()=>{alive=false;};},[startPerson?.id]);
 useEffect(()=>{if(!room?.id){setMessages([]);return;}let alive=true;const load=async quiet=>{try{const rows=await chatMessages(room.id);if(alive){setMessages(rows);await markChatRead(room.id).catch(()=>{});}}catch(e){if(alive&&!quiet)setError(e);}finally{if(alive)setRoomLoading(false);}};setRoomLoading(true);load(false);const timer=setInterval(()=>load(true),4000);return()=>{alive=false;clearInterval(timer);};},[room?.id]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:'nearest'});},[messages.length,room?.id]);
 async function send(event){event.preventDefault();const body=draft.trim();if(!body||sending||!room?.id)return;setSending(true);setError(null);try{await sendChatMessage(room.id,body);setDraft('');await refreshMessages(room.id);setThreads(await chatInbox());}catch(e){setError(e);}finally{setSending(false);}}
 return <Modal title="Messages" onClose={onClose} className="circle-chat-modal"><div className="circle-chat-shell">
  <aside className={`circle-chat-inbox ${room?'has-room':''}`}><div className="circle-chat-title"><h2>Messages</h2><span>{threads.reduce((total,item)=>total+Number(item.unread||0),0)||''}</span></div>{loading?<Loading label="Opening messages…"/>:threads.length?<div className="circle-chat-list">{threads.map(thread=><button key={thread.id} className={thread.id===room?.id?'active':''} onClick={()=>setRoom(thread)}><RobotPortrait look={thread.people?.[0]?.slop_look} className="circle-chat-avatar" alt=""/><span><strong>{conversationName(thread)}</strong><small>{thread.last_message||conversationHandle(thread)}</small></span>{Number(thread.unread)>0&&<b>{thread.unread}</b>}</button>)}</div>:<div className="circle-chat-empty"><Icon name="social" size={25}/><p>Your conversations will appear here.</p></div>}</aside>
  <section className={`circle-chat-room ${room?'is-open':''}`}>{room?<><header><button className="circle-chat-back" type="button" aria-label="Back to messages" onClick={()=>setRoom(null)}><Icon name="chevron" size={18}/></button><RobotPortrait look={room.people?.[0]?.slop_look} className="circle-chat-avatar" alt=""/><div><strong>{conversationName(room)}</strong><small>{conversationHandle(room)}</small></div></header><div className="circle-chat-messages">{roomLoading&&!messages.length?<Loading label="Loading conversation…"/>:messages.length?messages.map(message=><article key={message.id} className={message.sender?.id===currentUser?.id?'mine':''}><RobotPortrait look={message.sender?.slop_look} className="circle-chat-message-avatar" alt=""/><div><small>{message.sender?.id===currentUser?.id?'You':personName(message.sender)}</small><p>{message.body}</p></div></article>):<div className="circle-chat-empty"><p>Say hello.</p></div>}<div ref={bottom}/></div><form className="circle-chat-compose" onSubmit={send}><input aria-label={`Message ${conversationName(room)}`} maxLength="2000" value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Write a message…"/><button type="submit" disabled={sending||!draft.trim()} aria-label="Send message"><Icon name="arrow" size={18}/></button></form></>:<div className="circle-chat-empty room"><Icon name="social" size={30}/><h3>Your messages</h3><p>Pick a conversation.</p></div>}</section>
 </div><Notice error={error}/></Modal>;
}
