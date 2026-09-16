import React,{useEffect,useRef,useState} from 'react';
import {loadDiscoveryPage,likeGame,likedGames,socialCounts} from '../lib/catalog.js';
import {gameEntry,trustedMedia} from '../lib/contracts.js';
import {gameFormat} from '../lib/game-format.js';
import {canonicalGameUrl} from '../lib/game-links.js';
import {visibleFeedGame} from '../lib/feed-focus.js';
import {GAME_PLATFORMS} from '../lib/game-platforms.js';
import {feedPromoAfter} from '../lib/feed-promo.js';
import {loadLeaderboard} from '../lib/leaderboard.js';
import {useAuth} from '../auth.jsx';
import {Button,Empty,Loading,Notice,Slop} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import {GamePlayer} from '../components/GamePlayer.jsx';
import {GameDetail} from './Play.jsx';
import './feed.css';

const tones={tangerine:['#ffd98c','#ffa942','#8f4a1e'],mint:['#d2f8d8','#8fdba9','#346b4e'],bubblegum:['#ffd6e8','#f4a9cd','#915474'],grape:['#dec6ff','#b894e2','#69508c'],blueberry:['#d2e9ff','#9ac6ef','#416d91'],aqua:['#d1f5f0','#8edace','#3e7977'],lime:['#ecf5c2','#c9e47d','#697c39']};
function tone(game){const colors=tones[game.profiles?.slop_look?.palette]||tones.tangerine;return {'--feed-light':colors[0],'--feed-clay':colors[1],'--feed-shade':colors[2],'--game-aspect':gameFormat(game).playerAspect};}
function MobileAppCard({onContinue,cardRef}){return <aside ref={cardRef} className="feed-app-card" aria-label="Slop mobile app"><div className="feed-app-scene"><img src="/assets/illustrations/desert-horizon.webp" alt="" loading="lazy"/><div className="feed-app-phone"><img src="/assets/gameplay/night-drift.jpg" alt="Night Drift in Slop on mobile" loading="lazy"/></div><Slop body="heart" color="bubblegum" className="feed-app-slop" alt=""/></div><div className="feed-app-copy"><h2>Slop on your phone.</h2><p>Your character. Your games. The same account.</p><div className="feed-app-links"><a href="#/download"><Icon name="download" size={20}/><span>App Store</span><Icon name="arrow" size={17}/></a><a href="#/download"><Icon name="download" size={20}/><span>Android APK</span><Icon name="arrow" size={17}/></a></div><button className="feed-app-continue" onClick={onContinue}>Next game<Icon name="chevron" size={17}/></button></div></aside>;}

export default function Feed(){
 const {user,requireAuth}=useAuth();
 const [order,setOrder]=useState('popular'),[platform,setPlatform]=useState('all'),[games,setGames]=useState([]),[active,setActive]=useState(null),[next,setNext]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[selected,setSelected]=useState(null);
 const [likes,setLikes]=useState(new Set()),[counts,setCounts]=useState({}),[likeBusy,setLikeBusy]=useState(false),[actionError,setActionError]=useState(null),[shared,setShared]=useState(null);
 const [leaders,setLeaders]=useState({});
 const sentinel=useRef(null),generation=useRef(0),busy=useRef(false),cursor=useRef(null),hasMore=useRef(true),cards=useRef(new Map()),promos=useRef(new Map()),activeRef=useRef(active),touchStart=useRef(null);
 activeRef.current=active;
 async function more(reset=false){
  if(busy.current&&!reset)return;
  const epoch=reset?++generation.current:generation.current;busy.current=true;setLoading(true);setError(null);
  try{const page=await loadDiscoveryPage({order,platform,cursor:reset?null:cursor.current,limit:8});if(epoch!==generation.current)return;
   setGames(old=>reset?page.games:[...old,...page.games.filter(g=>!old.some(o=>o.id===g.id))]);cursor.current=page.next;hasMore.current=!!page.next;setNext(page.next);
  }catch(e){if(epoch===generation.current)setError(e);}finally{if(epoch===generation.current){busy.current=false;setLoading(false);}}
 }
 useEffect(()=>{setGames([]);setActive(null);cursor.current=null;hasMore.current=true;more(true);return()=>{generation.current++;};},[order,platform]);
 useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting&&hasMore.current&&!busy.current&&!error)more();},{rootMargin:'750px'});if(sentinel.current)observer.observe(sentinel.current);return()=>observer.disconnect();},[next,order,platform,loading,error]);
 useEffect(()=>{
  let scheduled=0;
  function measure(){
   scheduled=0;if(document.querySelector('.game-player.is-expanded'))return;
   const top=Math.max(0,document.querySelector('.topbar')?.getBoundingClientRect().bottom||0)+8;
   const nav=document.querySelector('.mobile-nav'),bottom=nav&&getComputedStyle(nav).display!=='none'?Math.min(innerHeight,nav.getBoundingClientRect().top):innerHeight;
   const items=[...cards.current].map(([id,el])=>{const box=el.querySelector('.feed-game')?.getBoundingClientRect()||el.getBoundingClientRect();return{id,top:box.top,bottom:box.bottom};});
   // A promo can win visibility, but never mounts a game player of its own.
   promos.current.forEach(el=>{const box=el.getBoundingClientRect();items.push({id:null,top:box.top,bottom:box.bottom});});
   const chosen=visibleFeedGame(items,{top,bottom,current:activeRef.current});if(chosen!==activeRef.current){activeRef.current=chosen;setActive(chosen);}
  }
  const schedule=()=>{if(!scheduled)scheduled=requestAnimationFrame(measure);};
  const observer=new IntersectionObserver(schedule,{threshold:[0,.2,.5,.8,1]});cards.current.forEach(el=>observer.observe(el));promos.current.forEach(el=>observer.observe(el));
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);schedule();
  return()=>{observer.disconnect();cancelAnimationFrame(scheduled);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);};
 },[games]);
 useEffect(()=>{let current=true;setLikes(new Set());if(user)likedGames().then(rows=>{if(current)setLikes(new Set(rows.map(r=>r.game_id)));}).catch(()=>{});return()=>{current=false;};},[user?.id]);
 useEffect(()=>{let current=true;const game=games.find(g=>g.id===active);if(game)socialCounts([game.slug]).then(rows=>{if(current&&rows[0])setCounts(old=>({...old,[game.slug]:rows[0]}));}).catch(()=>{});return()=>{current=false;};},[active]);
 useEffect(()=>{let current=true;const game=games.find(item=>item.id===active);if(game&&!Object.hasOwn(leaders,game.slug))loadLeaderboard(game.slug).then(rows=>{if(current)setLeaders(old=>({...old,[game.slug]:rows[0]||null}));}).catch(()=>{if(current)setLeaders(old=>({...old,[game.slug]:null}));});return()=>{current=false;};},[active,games,leaders]);
 async function toggleLike(game){if(likeBusy||!requireAuth())return;const liked=likes.has(game.slug)||likes.has(game.id);setLikeBusy(true);setActionError(null);try{await likeGame(game.slug,!liked,game.id);setLikes(old=>{const value=new Set(old);value.delete(game.id);if(liked)value.delete(game.slug);else value.add(game.slug);return value;});setCounts(old=>({...old,[game.slug]:{...old[game.slug],likes:Math.max(0,(old[game.slug]?.likes||0)+(liked?-1:1))}}));}catch(e){setActionError(e);}finally{setLikeBusy(false);}}
 async function share(game){try{const url=canonicalGameUrl(game);if(navigator.share)await navigator.share({title:game.name,url});else await navigator.clipboard.writeText(url);setShared(game.id);}catch(e){if(e.name!=='AbortError')setActionError(new Error('Could not share this game. Try again.'));}}
 function nextGame(index,skipPromo=false){const nextCard=(!skipPromo&&promos.current.get(index))||cards.current.get(games[index+1]?.id);if(nextCard)nextCard.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});else sentinel.current?.scrollIntoView({behavior:'smooth',block:'center'});}
 function playerEvent(event){if(event.type==='webScroll'&&!selected&&!document.querySelector('.game-player.is-expanded'))window.scrollBy({top:Math.max(-480,Math.min(480,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1))),behavior:'instant'});}
 return <div className="for-you-page live-feed-page">
  <header className="live-feed-intro"><div><h1>For you<span>.</span></h1></div><div className="feed-mode" aria-label="Game order"><button className={order==='popular'?'selected':''} aria-pressed={order==='popular'} onClick={()=>setOrder('popular')}>For you</button><button className={order==='newest'?'selected':''} aria-pressed={order==='newest'} onClick={()=>setOrder('newest')}>Newest</button></div></header>
  <Notice error={actionError}/>
  <div className="feed-platforms" aria-label="Game platform">{GAME_PLATFORMS.map(([id,label])=><button key={id} className={platform===id?'selected':''} aria-pressed={platform===id} onClick={()=>setPlatform(id)}>{label}</button>)}</div>
  <div className="continuous-feed">{games.map((game,index)=>{
   const live=active===game.id,liked=likes.has(game.slug)||likes.has(game.id),holder=leaders[game.slug],person=holder||game.profiles;
   return <React.Fragment key={game.id}><article ref={el=>{if(el)cards.current.set(game.id,el);else cards.current.delete(game.id);}} data-game={game.id} className={`feed-item ${live?'is-playing':''} ${gameFormat(game).orientation==='landscape'?'is-wide':''}`} style={tone(game)}>
    <div className="feed-game">{live?<GamePlayer key={game.id} url={gameEntry(game)} game={game} title={game.name} initialMuted requireInteraction paused={!!selected} onEvent={playerEvent}/>:<div className="feed-poster" aria-label={`${game.name} starts when you scroll here`}>{trustedMedia(game.thumb)?<img src={trustedMedia(game.thumb)} loading="lazy" alt=""/>:<Slop body="star" color="mint" alt=""/>}<span className="feed-next-label"><span/> Up next</span></div>}</div>
    <div className="feed-info">
     <div className={`feed-creator-ribbon ${holder?'has-crown-holder':''}`}><div className="feed-ribbon-person"><Slop look={person?.slop_look} avatar={person?.avatar_url} className="feed-creator-slop" alt={holder?`Crown holder @${holder.username}`:`Slop by ${game.profiles?.username||'a creator'}`}/>{holder&&<Icon className="feed-holder-crown" name="crown" size={34}/>}</div><div className="feed-ribbon-copy"><span className="feed-live-label"><span className={live?'is-live':''}/>{holder?'Crown holder':'Made by'}</span><h2>{game.name}</h2><span className="feed-handle">@{person?.username||'slop'}</span>{game.description&&<p>{game.description}</p>}</div></div>
     <div className="feed-social-actions"><button className={liked?'is-liked':''} aria-label={liked?'Unlike this game':'Like this game'} onClick={()=>toggleLike(game)} disabled={likeBusy}><Icon name="heart"/><span>{counts[game.slug]?.likes??'—'}</span></button><button onClick={()=>setSelected(game)} aria-label={`Comments for ${game.name}`}><Icon name="social"/><span>Comments</span></button><button onClick={()=>share(game)} aria-label={`Share ${game.name}`}><Icon name="share"/><span>{shared===game.id?'Shared':'Share'}</span></button></div>
     <a className="feed-remix" href={`#/build?remix=${game.id}`}><Icon name="build" size={17}/> Remix <Icon name="arrow" size={16}/></a>
     <button className="feed-next-game" onClick={()=>nextGame(index)} onTouchStart={e=>{touchStart.current=e.touches[0]?.clientY;}} onTouchEnd={e=>{if(touchStart.current!=null&&touchStart.current-e.changedTouches[0]?.clientY>45)nextGame(index);touchStart.current=null;}}><span>Next game</span><span className="feed-next-arrow">↓</span></button>
    </div>
   </article>{feedPromoAfter(index)&&<MobileAppCard cardRef={el=>{if(el)promos.current.set(index,el);else promos.current.delete(index);}} onContinue={()=>nextGame(index,true)}/>}</React.Fragment>;
  })}</div>
  <div ref={sentinel} className="feed-sentinel">{loading?<Loading label="Finding your next game…"/>:error?<Notice error={error} onRetry={()=>more()}/>:next?<Button variant="secondary" onClick={()=>more()}>Keep discovering</Button>:games.length?<div className="feed-end"><Slop body="heart" color="bubblegum"/><h2>You’re caught up.</h2><p>Your game could be next.</p><a className="button" href="#/build">Make something new</a></div>:<Empty title="No games in this format yet.">Try another format or check back for new games.</Empty>}</div>
  {selected&&<GameDetail game={selected} discussionOnly onClose={()=>setSelected(null)}/>}
 </div>;
}
