import React,{useEffect,useRef,useState} from 'react';
import {loadDiscoveryPage} from '../lib/catalog.js';
import {previewVideo} from '../lib/contracts.js';
import GamePreview from './GamePreview.jsx';
import {Icon} from './Icon.jsx';
import {landscapeGame} from '../lib/game-mosaic.js';
import {webGamePlatform} from '../lib/game-platforms.js';

export default function FeaturedGames({games,onOpen,paused}){
 const [popular,setPopular]=useState([]);const rail=useRef(null);
 useEffect(()=>{let live=true;loadDiscoveryPage({order:'popular',platform:'all',limit:12}).then(page=>{if(live)setPopular(page.games);}).catch(()=>{});return()=>{live=false;};},[]);
 const kick=games.find(g=>/kickflip[\s-]*coast/i.test(`${g.name} ${g.slug}`));
 const recent=games.filter(g=>previewVideo(g)),wide=recent.find(landscapeGame);
 const candidates=[kick,...recent.filter(g=>!landscapeGame(g)).slice(0,2),wide,...popular.filter(g=>previewVideo(g))].filter(Boolean);
 const featured=candidates.filter((g,i)=>candidates.findIndex(v=>v.id===g.id)===i).slice(0,6);
 if(!featured.length)return null;
 const scroll=delta=>rail.current?.scrollBy({left:delta*rail.current.clientWidth*.8,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 return <section className="featured-arcade" aria-label="Featured game previews"><div className="featured-heading"><h2>Hard to put down.</h2><div><button aria-label="Previous featured games" onClick={()=>scroll(-1)}>←</button><button aria-label="Next featured games" onClick={()=>scroll(1)}>→</button></div></div><div className="featured-reel" ref={rail}>{featured.map((game,index)=><button key={game.id} className={`featured-game featured-${index} ${landscapeGame(game)?'featured-wide':'featured-phone'}`} onClick={()=>onOpen(game)} aria-label={`Play featured ${game.name}`}><GamePreview game={game} paused={paused}/><span className="featured-number">{String(index+1).padStart(2,'0')}</span><span className="featured-format">{webGamePlatform(game)==='desktop'?'Desktop':'Mobile'}</span><span className="featured-title"><strong>{game.name}</strong><span><Icon name="play" fill="currentColor" size={17}/></span></span></button>)}</div></section>;
}
