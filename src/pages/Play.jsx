import React,{lazy,useEffect,useRef,useState} from 'react';
import {loadGames,popularGames,loadGame} from '../lib/catalog.js';
import {trustedMedia} from '../lib/contracts.js';
import {Button,Empty,Notice,SectionHeading,Slop,useAsync} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import Hero from '../components/Hero.jsx';
import AppDownloadBar from '../components/AppDownloadBar.jsx';
import {GameShelf} from '../components/GameShelf.jsx';
import {GAME_PLATFORMS} from '../lib/game-platforms.js';
import {gameFormat} from '../lib/game-format.js';
export const GameDetail=lazy(()=>import('./GameDetail.jsx'));
export function GameCard({game,onOpen}){const[failed,setFailed]=useState(false);return <button className="game-card" style={{'--game-aspect':gameFormat(game).aspect}} data-game-format={gameFormat(game).orientation} onClick={()=>onOpen(game)}><div className={`game-cover ${failed||!trustedMedia(game.thumb)?'cover-fallback':''}`}>{!failed&&trustedMedia(game.thumb)?<img src={trustedMedia(game.thumb)} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<Slop body="star" color="mint" alt=""/>}<span className="game-play-icon"><Icon name="play" fill="currentColor" size={19}/></span></div><div className="game-card-info"><Slop look={game.profiles?.slop_look} avatar={game.profiles?.avatar_url} alt=""/><div><h3>{game.name}</h3><p>@{game.profiles?.username||'slop'}</p></div><Icon name="arrow" size={19}/></div></button>;}
export default function Play({params,search,term,setSearch}){
 const[platform,setPlatform]=useState('all');const pageEpoch=useRef(0),pagePending=useRef(false);
 const[selected,setSelected]=useState(null),[extra,setExtra]=useState([]),[more,setMore]=useState(false),[moreError,setMoreError]=useState(null),[hasMore,setHasMore]=useState(true);
 const popular=useAsync(()=>popularGames(platform),[platform]);
 const feed=useAsync(()=>loadGames({search,platform}),[search,platform]);
 useEffect(()=>{pageEpoch.current++;pagePending.current=false;setExtra([]);setHasMore(true);setMore(false);setMoreError(null);return()=>{pageEpoch.current++;};},[search,platform]);
 useEffect(()=>{let alive=true;const slug=params.get('game');if(slug)loadGame(slug).then(g=>{if(alive)setSelected(g);}).catch(e=>{if(alive)setMoreError(e);});return()=>{alive=false;};},[params.get('game')]);
 async function loadMore(){if(pagePending.current)return;const epoch=pageEpoch.current;pagePending.current=true;setMore(true);setMoreError(null);try{const rows=await loadGames({search,platform,offset:(feed.data?.length||0)+extra.length});if(epoch!==pageEpoch.current)return;setExtra(old=>[...old,...rows.filter(row=>!old.some(item=>item.id===row.id))]);setHasMore(rows.length===24);}catch(e){if(epoch===pageEpoch.current)setMoreError(e);}finally{if(epoch===pageEpoch.current){pagePending.current=false;setMore(false);}}}
 return <div><Hero/><AppDownloadBar/><div className="home-platforms" aria-label="Game platforms">{GAME_PLATFORMS.map(([id,label])=><button key={id} aria-pressed={platform===id} onClick={()=>setPlatform(id)}>{label}</button>)}</div>
 {!search&&(popular.loading||popular.error||popular.data?.length>0)&&<section className="popular-section"><SectionHeading title="Popular games" action={<a className="inline-link" href="#/feed">Keep playing <Icon name="arrow" size={18}/></a>}></SectionHeading>{popular.loading?<div className="game-grid skeleton-grid" role="status" aria-label="Loading popular games">{[0,1,2,3].map(i=><div className="skeleton-card" key={i}/>)}</div>:popular.error?<Notice error={popular.error} onRetry={popular.refresh}/>:<GameShelf label="Popular games" resetKey={platform}>{popular.data?.map(game=><GameCard key={game.id} game={game} onOpen={setSelected}/>)}</GameShelf>}</section>}

 <div className="discovery-top" id="discover"><SectionHeading title={search?`Games for “${search}”`:'New games'}></SectionHeading><div className="search-field mobile-search"><Icon name="search"/><input aria-label="Search games" value={term} onChange={e=>setSearch(e.target.value)} placeholder="Search games"/></div></div>

 {feed.loading?<div className="game-grid skeleton-grid" aria-label="Loading games" role="status">{Array.from({length:8},(_,i)=><div className="skeleton-card" key={i}/>)}</div>:feed.error?<Notice error={feed.error} onRetry={feed.refresh}/>:feed.data?.length?<><GameShelf label="New games" resetKey={`${platform}:${search}`}>{[...feed.data,...extra].map(game=><GameCard key={game.id} game={game} onOpen={setSelected}/>)}</GameShelf>{feed.data.length===24&&hasMore&&<div className="load-more"><Button variant="secondary" disabled={more} onClick={loadMore}>{more?'Loading games…':'More games'}</Button></div>}</>:<Empty title="No games found." action={<a className="button" href="#/build">Make a game</a>}>No games match this search yet. Try another search.</Empty>}
 <Notice error={moreError}/>
 {selected&&<GameDetail game={selected} onClose={()=>{setSelected(null);if(params.has('game'))history.replaceState(null,'','/#/play');}}/>}
 </div>;
}
