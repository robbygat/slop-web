import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {loadDiscoveryPage,likeGame,likedGames,socialCounts} from '../lib/catalog.js';
import {canonicalGameUrl} from '../lib/game-links.js';
import {gameFormat} from '../lib/game-format.js';
import {loadFeedCrown} from '../lib/leaderboard.js';
import {getSession} from '../lib/supabase.js';
import {createFeedWheel} from '../lib/feed-wheel.js';
import {nextFeedTitleEntrance} from '../lib/feed-title-motion.js';
import {readFeedReturn,writeFeedReturn} from '../lib/feed-return.js';
import {createFeedCrownSync} from '../lib/feed-crown-sync.js';
import {useAuth} from '../auth.jsx';
import {Button,Loading,Notice,Modal} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import ActivityLink from '../components/ActivityLink.jsx';
import GameCrown from '../components/GameCrown.jsx';
import GamePreview from '../components/GamePreview.jsx';
import {useBrowsePreferences} from '../components/useBrowsePreferences.js';
import {GameDetail} from './Play.jsx';
import './feed.css';

export default function Feed(){
 const {user,requireAuth}=useAuth();
 const {platform,setPlatform,order,setOrder}=useBrowsePreferences();
 const [initial]=useState(()=>readFeedReturn({platform,order}));
 const [filters,setFilters]=useState(false);
 const [games,setGames]=useState(initial?.games||[]),[active,setActive]=useState(initial?.active||null);
 const [loading,setLoading]=useState(!initial),[error,setError]=useState(null),[selected,setSelected]=useState(null),[discussion,setDiscussion]=useState(false);
 const [titleEntrance,setTitleEntrance]=useState(()=>nextFeedTitleEntrance(null,initial?.active));
 useLayoutEffect(()=>{setTitleEntrance(previous=>nextFeedTitleEntrance(previous,active));},[active]);
 const [likes,setLikes]=useState(new Set()),[counts,setCounts]=useState({}),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(null),[shared,setShared]=useState(null),[leaders,setLeaders]=useState({});
 const stream=useRef(null),cards=useRef(new Map()),epoch=useRef(0),pending=useRef(false),cursor=useRef(initial?.next||null),hasMore=useRef(initial?!!initial.next:true),crownGame=useRef(null),crownSync=useRef(null),likePending=useRef(false),paging=useRef({index:0,count:0,blocked:false});
 const restoration=useRef(initial),context=useRef(null);
 context.current={order,platform,games,active,next:cursor.current};
 crownGame.current=games.find(g=>g.id===active)||null;
 async function more(reset=false){
  if(pending.current&&!reset)return;
  const revision=reset?++epoch.current:epoch.current;pending.current=true;setLoading(true);setError(null);
  try{const page=await loadDiscoveryPage({order,platform,cursor:reset?null:cursor.current,limit:12});if(revision!==epoch.current)return;
   if(!reset&&page.next&&JSON.stringify(page.next)===JSON.stringify(cursor.current))throw new Error('The catalog stopped advancing. Try finding more games again.');
   setGames(old=>reset?page.games:[...old,...page.games.filter(g=>!old.some(o=>o.id===g.id))]);cursor.current=page.next;hasMore.current=!!page.next;
   if(reset)setActive(page.games[0]?.id||null);
  }catch(e){if(revision===epoch.current)setError(e);}finally{if(revision===epoch.current){pending.current=false;setLoading(false);}}
 }
 useEffect(()=>{if(restoration.current){restoration.current=null;return()=>{epoch.current++;};}setGames([]);setActive(null);cursor.current=null;hasMore.current=true;stream.current?.scrollTo({top:0});void more(true);return()=>{epoch.current++;};},[order,platform]);
 useEffect(()=>()=>{if(context.current?.games.length)writeFeedReturn(context.current);},[]);
 useEffect(()=>{
  const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting&&e.intersectionRatio>.6).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(visible)setActive(visible.target.dataset.game);},{root:stream.current,threshold:[.6,.85]});
  cards.current.forEach(el=>observer.observe(el));return()=>observer.disconnect();
 },[games]);
 const index=games.findIndex(g=>g.id===active);
 paging.current={index:Math.max(0,index),count:games.length,blocked:!!selected||filters};
 useEffect(()=>{
  const node=stream.current,fine=matchMedia('(hover:hover) and (pointer:fine)');
  const turn=delta=>{const p=paging.current,target=Math.max(0,Math.min(p.count-1,Math.round(node.scrollTop/node.clientHeight)+delta));node.scrollTo({top:target*node.clientHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  const wheel=createFeedWheel({move:turn});
  const handle=event=>{if(!fine.matches||paging.current.blocked||event.target.closest('input,textarea,select,[contenteditable]'))return;wheel(event);};
  node.addEventListener('wheel',handle,{passive:false});
  let height=node.clientHeight;const resize=new ResizeObserver(()=>{const next=node.clientHeight;if(next!==height){height=next;node.scrollTo({top:paging.current.index*height,behavior:'instant'});}});resize.observe(node);
  return()=>{node.removeEventListener('wheel',handle);resize.disconnect();};
 },[]);
 useLayoutEffect(()=>{const saved=restoration.current,target=saved?Math.max(0,saved.games.findIndex(g=>g.id===saved.active)):0;stream.current?.scrollTo({top:target*(stream.current?.clientHeight||0),behavior:'instant'});},[games[0]?.id,order,platform]);
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
  <header className="reels-toolbar"><a className="reels-back" href="#/home" aria-label="Back to Home" title="Back to Home"><Icon name="back" size={19}/><span>Back</span></a><div className="reels-order" role="group" aria-label="Game feed"><button aria-pressed={order==='newest'} onClick={()=>setOrder('newest')}>Newest</button><span aria-hidden="true"/><button aria-pressed={order==='popular'} onClick={()=>setOrder('popular')}>Popular</button></div><div className="reels-tools"><ActivityLink ownerId={user?.id}/><button className="reels-filter" aria-label={`Game preferences: ${platform==='all'?'all games':platform+' games'}`} aria-haspopup="dialog" onClick={()=>setFilters(true)}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 7h7m5 0h4M4 17h3m5 0h8"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>{platform!=='all'&&<i/>}</button></div></header>
  {actionError&&<div className="reels-error"><Notice error={actionError}/></div>}
  <div className="reel-stream" ref={stream} tabIndex={0} aria-label="Swipe games, use arrow keys to browse, or Enter to play" onKeyDown={e=>{if(e.target.closest('button,a,input,textarea')||selected)return;if(e.key==='Enter'){e.preventDefault();const game=games.find(g=>g.id===active);if(game)open(game);return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();move(e.key==='ArrowDown'?1:-1);}}}>
   {games.map(game=>{const live=active===game.id,liked=likes.has(game.slug)||likes.has(game.id),holder=leaders[game.slug],wide=gameFormat(game).orientation==='landscape';return <article className={`reel ${wide?'reel-wide':''}`} key={game.id} data-game={game.id} data-title-entrance={live&&titleEntrance?.gameId===game.id?titleEntrance.variant:undefined} ref={el=>{if(el)cards.current.set(game.id,el);else cards.current.delete(game.id);}} aria-label={game.name}>
    <div className="reel-stage">
     <button className="reel-media" onClick={()=>open(game)} aria-label={`Play ${game.name}`} tabIndex={live?0:-1}><GamePreview game={game} paused={!live||!!selected||filters}/></button>
     <div className="reel-caption"><h2 className="reel-title">{game.name}</h2><GameCrown holder={holder} live={live&&!selected&&!filters} compact/>{game.description&&<p className="reel-description">{game.description}</p>}</div>

    </div>
    <aside className="reel-side"><h2 className="reel-title">{game.name}</h2><GameCrown holder={holder} live={live&&!selected&&!filters}/>{game.description&&<p className="reel-side-description">{game.description}</p>}<Button onClick={()=>open(game)} tabIndex={live?0:-1}>{holder?'Play for first place':'Play game'} <Icon name={holder?'crown':'play'} size={16}/></Button></aside>
    <div className="reel-rail"><button className="reel-start" onClick={()=>open(game)} aria-label={`Start ${game.name}`} tabIndex={live?0:-1}><Icon name="play" fill="currentColor"/><span>Play</span></button><button className={liked?'is-liked':''} onClick={()=>toggleLike(game)} disabled={busy} aria-label={liked?'Unlike this game':'Like this game'} tabIndex={live?0:-1}><Icon name="heart" fill={liked?'currentColor':'none'}/><span>{counts[game.slug]?.likes??'Like'}</span></button><button onClick={()=>open(game,true)} aria-label={`Comments for ${game.name}`} tabIndex={live?0:-1}><Icon name="social"/><span>Chat</span></button><button onClick={()=>share(game)} aria-label={`Share ${game.name}`} tabIndex={live?0:-1}><Icon name="share"/><span>{shared===game.id?'Copied':'Share'}</span></button></div>
   </article>;})}
   <div className="reels-end">{loading?<Loading label="Finding your next game…"/>:error?<Notice error={error} onRetry={()=>more(!games.length)}/>:!games.length?<p>No games in this format yet.</p>:hasMore.current?<button className="button" onClick={()=>more()}>Find more games</button>:<><h2>All caught up.</h2><a className="button" href="#/home">Back to the arcade</a></>}</div>
  </div>
  <div className="reel-navigation"><button aria-label="Previous game" disabled={index<=0} onClick={()=>move(-1)}>↑</button><button aria-label="Next game" disabled={index>=games.length-1} onClick={()=>move(1)}>↓</button></div>
  {filters&&<Modal title="Game preferences" onClose={()=>setFilters(false)} className="feed-preferences"><p>What do you want to play?</p><div role="group" aria-label="Game platform">{[['all','All games','A little of everything.','play'],['mobile','Mobile games','Phone games, playable here too.','connect'],['desktop','Desktop games','Games made for your computer.','code']].map(([id,label,description,icon])=><button key={id} aria-pressed={platform===id} onClick={()=>{setPlatform(id);setFilters(false);}}><Icon name={icon}/><span><strong>{label}</strong><small>{description}</small></span>{platform===id&&<Icon name="check" size={18}/>}</button>)}</div></Modal>}
  {selected&&<GameDetail game={selected} backLabel="Back to Play" onPrevious={selectedIndex>0?()=>setSelected(games[selectedIndex-1]):undefined} onNext={selectedIndex<games.length-1?()=>setSelected(games[selectedIndex+1]):undefined} discussionOnly={discussion} onClose={()=>{setSelected(null);crownSync.current?.refresh({force:true});}}/>}
 </div>;
}
