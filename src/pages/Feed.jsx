import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {loadDiscoveryPage,likeGame,likedGames,socialCounts} from '../lib/catalog.js';
import {canonicalGameUrl} from '../lib/game-links.js';
import {gameFormat} from '../lib/game-format.js';
import {loadFeedCrown} from '../lib/leaderboard.js';
import {getSession} from '../lib/supabase.js';
import {createFeedCrownSync} from '../lib/feed-crown-sync.js';
import {useAuth} from '../auth.jsx';
import {Button,Loading,Notice} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import GameCrown from '../components/GameCrown.jsx';
import GamePreview from '../components/GamePreview.jsx';
import {GameDetail} from './Play.jsx';
import './feed.css';

export default function Feed(){
 const {user,requireAuth}=useAuth();
 const [order,setOrder]=useState('newest'),[platform,setPlatform]=useState('all'),[games,setGames]=useState([]),[active,setActive]=useState(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(null),[selected,setSelected]=useState(null),[discussion,setDiscussion]=useState(false);
 const [likes,setLikes]=useState(new Set()),[counts,setCounts]=useState({}),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(null),[shared,setShared]=useState(null),[leaders,setLeaders]=useState({});
 const stream=useRef(null),cards=useRef(new Map()),epoch=useRef(0),pending=useRef(false),cursor=useRef(null),hasMore=useRef(true),crownGame=useRef(null),crownSync=useRef(null),likePending=useRef(false);
 crownGame.current=games.find(g=>g.id===active)||null;
 async function more(reset=false){
  if(pending.current&&!reset)return;
  const revision=reset?++epoch.current:epoch.current;pending.current=true;setLoading(true);setError(null);
  try{const page=await loadDiscoveryPage({order,platform,cursor:reset?null:cursor.current,limit:12});if(revision!==epoch.current)return;
   setGames(old=>reset?page.games:[...old,...page.games.filter(g=>!old.some(o=>o.id===g.id))]);cursor.current=page.next;hasMore.current=!!page.next;
   if(reset)setActive(page.games[0]?.id||null);
  }catch(e){if(revision===epoch.current)setError(e);}finally{if(revision===epoch.current){pending.current=false;setLoading(false);}}
 }
 useEffect(()=>{setGames([]);setActive(null);cursor.current=null;hasMore.current=true;stream.current?.scrollTo({top:0});void more(true);return()=>{epoch.current++;};},[order,platform]);
 useEffect(()=>{
  const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting&&e.intersectionRatio>.6).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(visible)setActive(visible.target.dataset.game);},{root:stream.current,threshold:[.6,.85]});
  cards.current.forEach(el=>observer.observe(el));return()=>observer.disconnect();
 },[games]);
 const index=games.findIndex(g=>g.id===active);
 useLayoutEffect(()=>{stream.current?.scrollTo({top:0,behavior:'instant'});},[games[0]?.id,order,platform]);
 useEffect(()=>{if(index>=games.length-4&&hasMore.current&&!pending.current&&!error)void more();},[index,games.length]);
 useEffect(()=>{let current=true;setLikes(new Set());if(user)likedGames().then(rows=>{if(current)setLikes(new Set(rows.map(r=>r.game_id)));}).catch(()=>{});return()=>{current=false;};},[user?.id]);
 useEffect(()=>{let current=true;const game=games.find(g=>g.id===active);if(game)socialCounts([game.slug]).then(rows=>{if(current&&rows[0])setCounts(old=>({...old,[game.slug]:rows[0]}));}).catch(()=>{});return()=>{current=false;};},[active]);
 useEffect(()=>{
  const sync=createFeedCrownSync({load:loadFeedCrown,getContext:()=>{const game=crownGame.current,session=getSession();return game?{gameId:game.id,slug:game.slug,ownerId:session?.user?.id,sessionEpoch:session?.epoch}:null;},onHolder:(slug,holder)=>setLeaders(old=>({...old,[slug]:holder}))});crownSync.current=sync;
  const resume=()=>{if(!document.hidden)sync.refresh();};window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  return()=>{sync.dispose();crownSync.current=null;window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[]);
 useEffect(()=>{if(!selected&&!document.hidden)crownSync.current?.refresh();},[active,user?.id,selected]);
 async function toggleLike(game){if(likePending.current||!requireAuth())return;const owner=user?.id,liked=likes.has(game.slug)||likes.has(game.id);likePending.current=true;setBusy(true);setActionError(null);try{await likeGame(game.slug,!liked,game.id);if(getSession()?.user?.id!==owner)return;setLikes(old=>{const next=new Set(old);next.delete(game.id);if(liked)next.delete(game.slug);else next.add(game.slug);return next;});setCounts(old=>({...old,[game.slug]:{...old[game.slug],likes:Math.max(0,(old[game.slug]?.likes||0)+(liked?-1:1))}}));}catch(e){setActionError(e);}finally{likePending.current=false;setBusy(false);}}
 async function share(game){try{if(navigator.share)await navigator.share({title:game.name,url:canonicalGameUrl(game)});else await navigator.clipboard.writeText(canonicalGameUrl(game));setShared(game.id);}catch(e){if(e.name!=='AbortError')setActionError(new Error('Could not share this game. Try again.'));}}
 function move(delta){const game=games[Math.max(0,Math.min(games.length-1,index+delta))];if(game)cards.current.get(game.id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
 function open(game,comments=false){setDiscussion(comments);setSelected(game);}
 const selectedIndex=games.findIndex(g=>g.id===selected?.id);
 return <div className="reels-page">
  <h1 className="sr-only">Play</h1>
  <header className="reels-toolbar"><div className="reels-order" role="group" aria-label="Game order"><button aria-pressed={order==='newest'} onClick={()=>setOrder('newest')}>Fresh</button><button aria-pressed={order==='popular'} onClick={()=>setOrder('popular')}>Popular</button></div><div className="reels-platforms" role="group" aria-label="Game platform">{[['all','All games'],['mobile','Mobile'],['desktop','Desktop']].map(([id,label])=><button key={id} aria-pressed={platform===id} onClick={()=>setPlatform(id)}>{label}</button>)}</div><a href="#/home">Home <Icon name="arrow" size={15}/></a></header>
  {actionError&&<div className="reels-error"><Notice error={actionError}/></div>}
  <div className="reel-stream" ref={stream} tabIndex={0} aria-label="Swipe games, or use the up and down arrow keys" onKeyDown={e=>{if(e.target.closest('button,a,input,textarea')||selected)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();move(e.key==='ArrowDown'?1:-1);}}}>
   {games.map(game=>{const live=active===game.id,liked=likes.has(game.slug)||likes.has(game.id),holder=leaders[game.slug],wide=gameFormat(game).orientation==='landscape';return <article className={`reel ${wide?'reel-wide':''}`} key={game.id} data-game={game.id} ref={el=>{if(el)cards.current.set(game.id,el);else cards.current.delete(game.id);}} aria-label={game.name}>
    <div className="reel-stage">
     <button className="reel-media" onClick={()=>open(game)} aria-label={`Play ${game.name}`} tabIndex={live?0:-1}><GamePreview game={game} paused={!live||!!selected}/></button>
     <div className="reel-caption"><h2>{game.name}</h2><GameCrown holder={holder} live={live&&!selected} compact/>{game.description&&<p className="reel-description">{game.description}</p>}</div>
     <div className="reel-rail"><button className="reel-start" onClick={()=>open(game)} aria-label={`Start ${game.name}`} tabIndex={live?0:-1}><Icon name="play" fill="currentColor"/><span>Play</span></button><button className={liked?'is-liked':''} onClick={()=>toggleLike(game)} disabled={busy} aria-label={liked?'Unlike this game':'Like this game'} tabIndex={live?0:-1}><Icon name="heart" fill={liked?'currentColor':'none'}/><span>{counts[game.slug]?.likes??'Like'}</span></button><button onClick={()=>open(game,true)} aria-label={`Comments for ${game.name}`} tabIndex={live?0:-1}><Icon name="social"/><span>Chat</span></button><button onClick={()=>share(game)} aria-label={`Share ${game.name}`} tabIndex={live?0:-1}><Icon name="share"/><span>{shared===game.id?'Copied':'Share'}</span></button></div>
    </div>
    <aside className="reel-side"><h2>{game.name}</h2><GameCrown holder={holder} live={live&&!selected}/>{game.description&&<p className="reel-side-description">{game.description}</p>}<Button onClick={()=>open(game)} tabIndex={live?0:-1}>Play this game <Icon name="play" size={16}/></Button></aside>
   </article>;})}
   <div className="reels-end">{loading?<Loading label="Finding your next game…"/>:error?<Notice error={error} onRetry={()=>more(!games.length)}/>:!games.length?<p>No games in this format yet.</p>:<><h2>All caught up.</h2><a className="button" href="#/home">Back to the arcade</a></>}</div>
  </div>
  <div className="reel-navigation"><button aria-label="Previous game" disabled={index<=0} onClick={()=>move(-1)}>↑</button><button aria-label="Next game" disabled={index>=games.length-1} onClick={()=>move(1)}>↓</button></div>
  {selected&&<GameDetail game={selected} onPrevious={selectedIndex>0?()=>setSelected(games[selectedIndex-1]):undefined} onNext={selectedIndex<games.length-1?()=>setSelected(games[selectedIndex+1]):undefined} discussionOnly={discussion} onClose={()=>{setSelected(null);crownSync.current?.refresh({force:true});}}/>}
 </div>;
}
