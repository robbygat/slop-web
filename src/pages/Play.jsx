import React,{Suspense,lazy,useEffect,useRef,useState} from 'react';
import {loadDiscoveryPage,loadGame} from '../lib/catalog.js';
import {Button,Empty,Notice,Modal} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import Hero from '../components/Hero.jsx';
import FeaturedGames from '../components/FeaturedGames.jsx';
import GamePreview from '../components/GamePreview.jsx';
import PersistentContinueBadge from '../components/PersistentContinueBadge.jsx';
import {CrownInvitation,CharacterInvitation,CreateInvitation} from '../components/BrandSections.jsx';
import {landscapeGame} from '../lib/game-mosaic.js';
import {appendCatalogPage} from '../lib/catalog-window.js';
import {GAME_PLATFORMS} from '../lib/game-platforms.js';
import {useGridRipple} from '../components/useGridRipple.js';
import {useBrowsePreferences} from '../components/useBrowsePreferences.js';
let detailImport;
const loadDetail=()=>detailImport??=import('./GameDetail.jsx').catch(error=>{detailImport=null;throw error;});
const LazyGameDetail=lazy(loadDetail);
// Loading a game must never replace the entire Home or feed beneath it.
export function GameDetail(props){return <Suspense fallback={<Modal title={props.game.name} onClose={props.onClose} backLabel={props.backLabel||'Back to games'} className="launch-loading"><div className={`launch-loading-preview ${landscapeGame(props.game)?'is-wide':''}`}><GamePreview game={props.game} paused/></div><p role="status">Opening your game…</p></Modal>}><LazyGameDetail key={props.game.id} {...props}/></Suspense>;}
export function GameCard({game,onOpen,paused=false,index=0}){return <button className={`game-card mosaic-tile ${landscapeGame(game)?'is-landscape':'is-portrait'}`} onPointerEnter={()=>{void loadDetail().catch(()=>{});}} onFocus={()=>{void loadDetail().catch(()=>{});}} onClick={()=>onOpen(game)} aria-label={`Play ${game.name}`} style={{'--tile-accent':['#c5f564','#bcb0ef','#a7caff','#ffb790'][index%4]}}><div className="game-cover"><GamePreview game={game} paused={paused}/><PersistentContinueBadge game={game}/></div><div className="game-card-info"><div><h3>{game.name}</h3></div><span className="mosaic-play"><Icon name="play" fill="currentColor" size={16}/></span></div></button>;}
export default function Play({params,search,term,setSearch}){
  const{platform,setPlatform,order,setOrder}=useBrowsePreferences();
  const[layout,setLayout]=useState('cards'),[paused,setPaused]=useState(false);
  const[selected,setSelected]=useState(null),[games,setGames]=useState([]),[next,setNext]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[retry,setRetry]=useState(0);
  const epoch=useRef(0),pending=useRef(false),grid=useRef(null),continuation=useRef(null);
  useGridRipple(grid,`${games.length}:${layout}:${platform}:${order}:${search}`);
  async function readCatalog(cursor,current){
    try{
      const featureKickflip=!cursor&&!search&&platform==='all';
      const [page,featured]=await Promise.all([loadDiscoveryPage({platform,order,search,cursor,limit:matchMedia('(max-width:900px)').matches?24:48}),featureKickflip?loadDiscoveryPage({search:'Kickflip Coast',order:'newest',limit:1}).catch(()=>null):null]);if(current!==epoch.current)return;
      if(page.next&&JSON.stringify(page.next)===JSON.stringify(cursor))throw new Error('The catalog stopped advancing. Try loading it again.');
      setGames(old=>appendCatalogPage(old,[...page.games,...(featured?.games||[])],{mixed:platform==='all'&&!search,featureKickflip}));setNext(page.next);
    }catch(e){if(current===epoch.current)setError(e);}finally{if(current===epoch.current){pending.current=false;setLoading(false);}}
  }
  useEffect(()=>{const current=++epoch.current;pending.current=true;setLoading(true);setError(null);setGames([]);setNext(null);void readCatalog(null,current);return()=>{epoch.current++;};},[platform,order,search,retry]);
  useEffect(()=>{let alive=true;const slug=params.get('game');if(slug)loadGame(slug).then(game=>{if(alive)setSelected(game);}).catch(e=>{if(alive)setError(e);});return()=>{alive=false;};},[params.get('game')]);
  async function loadMore(){if(pending.current||!next)return;pending.current=true;setLoading(true);setError(null);await readCatalog(next,epoch.current);}
  useEffect(()=>{if(!next||loading||error||selected||!continuation.current)return;const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting)void loadMore();},{rootMargin:'650px'});observer.observe(continuation.current);return()=>observer.disconnect();},[next,loading,error,selected]);
  const selectedIndex=games.findIndex(g=>g.id===selected?.id);
  return <div className="brand-home"><Hero suspended={!!selected}/><FeaturedGames games={games} onOpen={setSelected} paused={paused||!!selected}/><CrownInvitation/><section className={`game-universe layout-${layout}`} id="discover" aria-labelledby="catalog-title">
    <div className="universe-heading"><h2 id="catalog-title">All games.</h2></div>
    <div className="universe-toolbar"><div className="catalog-tabs" role="group" aria-label="Sort games">{[['popular','Popular'],['newest','Newest']].map(([id,label])=><button key={id} aria-pressed={order===id} onClick={()=>setOrder(id)}>{label}</button>)}</div><label className="universe-search"><Icon name="search" size={18}/><input type="search" aria-label="Search games" value={term} onChange={e=>setSearch(e.target.value)} placeholder="Search games"/></label><div className="grid-controls"><button aria-label={paused?'Play video previews':'Pause video previews'} aria-pressed={paused} onClick={()=>setPaused(v=>!v)}><Icon name={paused?'play':'pause'} size={17}/></button><button aria-label="Compact game gallery" aria-pressed={layout==='wall'} onClick={()=>setLayout('wall')}><span className="grid-symbol dense"/></button><button aria-label="Roomier game gallery" aria-pressed={layout==='cards'} onClick={()=>setLayout('cards')}><span className="grid-symbol"/></button></div></div>
    <div className="universe-platforms" role="group" aria-label="Game platforms">{GAME_PLATFORMS.map(([id,label])=><button key={id} aria-pressed={platform===id} onClick={()=>setPlatform(id)}>{label}</button>)}</div>
    {games.length>0&&<div className="game-wall-scroll" role="region" aria-label="All games"><div className="game-wall" ref={grid}>{games.map((game,index)=><GameCard key={game.id} game={game} index={index} onOpen={setSelected} paused={paused||!!selected}/>)}</div></div>}
    {loading&&!games.length&&<div className="game-wall wall-skeleton" role="status" aria-label="Loading games">{Array.from({length:36},(_,i)=><div key={i} className="skeleton-card"/>)}</div>}
    <Notice error={error} onRetry={()=>games.length?loadMore():setRetry(v=>v+1)}/>
    {!loading&&!error&&!games.length&&<Empty title="Nothing here. Yet." action={<Button onClick={()=>{setSearch('');setPlatform('all');}}>Show all games</Button>}>Try a different search or platform.</Empty>}
    {!!games.length&&next&&<div className="load-more" ref={continuation}><Button variant="secondary" disabled={loading} onClick={loadMore}>{loading?'Loading more games…':'More games'}<Icon name="plus" size={18}/></Button></div>}
  </section><CharacterInvitation/><CreateInvitation/>{selected&&<GameDetail game={selected} backLabel="Back to Home" onPrevious={selectedIndex>0?()=>setSelected(games[selectedIndex-1]):undefined} onNext={selectedIndex>=0&&selectedIndex<games.length-1?()=>setSelected(games[selectedIndex+1]):undefined} onClose={()=>{setSelected(null);if(params.has('game'))history.replaceState(null,'','/#/home');}}/>}</div>;
}
