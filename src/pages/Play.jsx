import React,{lazy,useEffect,useMemo,useRef,useState} from 'react';
import {loadDiscoveryPage,loadGame} from '../lib/catalog.js';
import {Button,Empty,Notice} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import Hero from '../components/Hero.jsx';
import FeaturedGames from '../components/FeaturedGames.jsx';
import GamePreview from '../components/GamePreview.jsx';
import {CampaignSections} from '../components/BrandSections.jsx';
import {gameMosaic,landscapeGame} from '../lib/game-mosaic.js';
import {GAME_PLATFORMS} from '../lib/game-platforms.js';
import {useGridRipple} from '../components/useGridRipple.js';
export const GameDetail=lazy(()=>import('./GameDetail.jsx'));
export function GameCard({game,onOpen,paused=false,index=0}){return <button className={`game-card mosaic-tile ${landscapeGame(game)?'is-landscape':'is-portrait'}`} onClick={()=>onOpen(game)} aria-label={`Play ${game.name}`} style={{'--tile-accent':['#c5f564','#bcb0ef','#a7caff','#ffb790'][index%4]}}><div className="game-cover"><GamePreview game={game} paused={paused}/></div><div className="game-card-info"><div><h3>{game.name}</h3><p>@{game.profiles?.username||'slop'}</p></div><span className="mosaic-play"><Icon name="play" fill="currentColor" size={16}/></span></div></button>;}
export default function Play({params,search,term,setSearch}){
  const[platform,setPlatform]=useState('all'),[order,setOrder]=useState('newest'),[layout,setLayout]=useState('cards'),[paused,setPaused]=useState(false);
  const[selected,setSelected]=useState(null),[games,setGames]=useState([]),[next,setNext]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[retry,setRetry]=useState(0);
  const epoch=useRef(0),pending=useRef(false),grid=useRef(null);
  const mosaic=useMemo(()=>gameMosaic(games,{preserveOrder:platform!=='all'||!!search,featureKickflip:!search&&platform==='all'}),[games,order,search,platform]);
  useGridRipple(grid,`${games.length}:${layout}:${platform}:${order}:${search}`);
  async function readCatalog(cursor,current){
    const cursors=new Set();
    try{do{
      const page=await loadDiscoveryPage({platform,order,search,cursor,limit:132});if(current!==epoch.current)return;
      setGames(old=>[...old,...page.games.filter(row=>!old.some(g=>g.id===row.id))]);setNext(page.next);cursor=page.next;
      if(cursor){const key=JSON.stringify(cursor);if(cursors.has(key))throw new Error('The catalog stopped advancing. Retry to load the remaining games.');cursors.add(key);}
    }while(cursor);
    }catch(e){if(current===epoch.current)setError(e);}finally{if(current===epoch.current){pending.current=false;setLoading(false);}}
  }
  useEffect(()=>{const current=++epoch.current;pending.current=true;setLoading(true);setError(null);setGames([]);setNext(null);void readCatalog(null,current);return()=>{epoch.current++;};},[platform,order,search,retry]);
  useEffect(()=>{let alive=true;const slug=params.get('game');if(slug)loadGame(slug).then(game=>{if(alive)setSelected(game);}).catch(e=>{if(alive)setError(e);});return()=>{alive=false;};},[params.get('game')]);
  async function loadMore(){if(pending.current||!next)return;pending.current=true;setLoading(true);setError(null);await readCatalog(next,epoch.current);}
  return <div className="brand-home"><Hero/><FeaturedGames games={games} onOpen={setSelected} paused={paused||!!selected}/><section className={`game-universe layout-${layout}`} id="discover" aria-labelledby="catalog-title">
    <div className="universe-heading"><h2 id="catalog-title">Dive in.</h2><span className="catalog-count" role="status">{loading?'Loading the arcade…':`${games.length} ${games.length===1?'game':'games'}`}</span></div>
    <div className="universe-toolbar"><div className="catalog-tabs" role="group" aria-label="Sort games">{[['popular','Popular'],['newest','Fresh drops']].map(([id,label])=><button key={id} aria-pressed={order===id} onClick={()=>setOrder(id)}>{label}</button>)}</div><label className="universe-search"><Icon name="search" size={18}/><input type="search" aria-label="Search games" value={term} onChange={e=>setSearch(e.target.value)} placeholder="Search games"/></label><div className="grid-controls"><button aria-label={paused?'Play video previews':'Pause video previews'} aria-pressed={paused} onClick={()=>setPaused(v=>!v)}><Icon name={paused?'play':'pause'} size={17}/></button><button aria-label="Compact game gallery" aria-pressed={layout==='wall'} onClick={()=>setLayout('wall')}><span className="grid-symbol dense"/></button><button aria-label="Roomier game gallery" aria-pressed={layout==='cards'} onClick={()=>setLayout('cards')}><span className="grid-symbol"/></button></div></div>
    <div className="universe-platforms" role="group" aria-label="Game platforms">{GAME_PLATFORMS.map(([id,label])=><button key={id} aria-pressed={platform===id} onClick={()=>setPlatform(id)}>{label}</button>)}</div>
    {games.length>0&&<div className="game-wall-scroll" role="region" aria-label="All games"><div className="game-wall" ref={grid}>{mosaic.map((game,index)=><GameCard key={game.id} game={game} index={index} onOpen={setSelected} paused={paused||!!selected}/>)}</div></div>}
    {loading&&!games.length&&<div className="game-wall wall-skeleton" role="status" aria-label="Loading games">{Array.from({length:36},(_,i)=><div key={i} className="skeleton-card"/>)}</div>}
    <Notice error={error} onRetry={()=>games.length?loadMore():setRetry(v=>v+1)}/>
    {!loading&&!error&&!games.length&&<Empty title="Nothing here. Yet." action={<Button onClick={()=>{setSearch('');setPlatform('all');}}>Show all games</Button>}>Try a different search or platform.</Empty>}
    {!!games.length&&next&&<div className="load-more"><Button variant="secondary" disabled={loading} onClick={loadMore}>{loading?'More good stuff on the way…':'There’s more where that came from'}<Icon name="plus" size={18}/></Button></div>}
  </section><CampaignSections/>{selected&&<GameDetail game={selected} onClose={()=>{setSelected(null);if(params.has('game'))history.replaceState(null,'','/#/home');}}/>}</div>;
}
