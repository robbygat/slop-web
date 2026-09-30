import React,{lazy,useEffect,useState} from 'react';
import {comments,postComment,likeGame,likedGames,socialCounts} from '../lib/catalog.js';
import {gameEntry,previewVideo} from '../lib/contracts.js';
import {useAuth} from '../auth.jsx';
import {Button,IconButton,Modal,Notice,Slop,useAsync} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import PhoneCode from '../components/PhoneCode.jsx';
import {GamePlayer} from '../components/GamePlayer.jsx';
import {canonicalGameUrl} from '../lib/game-links.js';
import {gameFormat} from '../lib/game-format.js';
import {gamePlatform} from '../lib/game-platforms.js';
import {findGifs} from '../lib/giphy.js';
import {safeGifUrl} from '../lib/giphy-contracts.js';
import {loadFeedCrown} from '../lib/leaderboard.js';
import {isCurrentScoreSavedEvent} from '../lib/score-saved-event.js';
import {getSession} from '../lib/supabase.js';
import GameCrown from '../components/GameCrown.jsx';
import './game-detail.css';
const ManualPreviewRecorder=lazy(()=>import('../components/ManualPreviewRecorder.jsx'));

export default function GameDetail({game,onClose,discussionOnly=false,onPrevious,onNext,backLabel='Back to games'}){
 const{user,requireAuth}=useAuth();
 const[liked,setLiked]=useState(false),[likeBusy,setLikeBusy]=useState(false),[text,setText]=useState(''),[posting,setPosting]=useState(false),[error,setError]=useState(null),[shared,setShared]=useState(false),[phone,setPhone]=useState(false);
 const[gifOpen,setGifOpen]=useState(false),[gifQuery,setGifQuery]=useState(''),[gifs,setGifs]=useState([]),[gifLoading,setGifLoading]=useState(false),[selectedGif,setSelectedGif]=useState(null);
 const [recordPreview,setRecordPreview]=useState(false);
 const [details,setDetails]=useState(discussionOnly);
 const mayRecord=!!user&&!user.is_anonymous&&game.owner_id===user.id&&game.status==='published';
 const socialId=game.slug;
 const crown=useAsync(()=>loadFeedCrown(game.slug),[game.id,game.slug,user?.id]);
 const holder=crown.data??(crown.loading||crown.error?undefined:null);
 const refreshCrown=event=>{if(isCurrentScoreSavedEvent(event,{game,session:getSession()}))crown.refresh();};
 const thread=useAsync(()=>details?comments(socialId):Promise.resolve(null),[game.id,user?.id,details]);const counts=useAsync(()=>details?socialCounts([socialId]):Promise.resolve(null),[game.id,liked,details]);
 useEffect(()=>{let alive=true;setLiked(false);if(user&&details)likedGames().then(rows=>{if(alive)setLiked(rows.some(r=>r.game_id===socialId||r.game_id===game.id));}).catch(()=>{});return()=>{alive=false;};},[user?.id,game.id,details]);
 async function toggle(){if(!requireAuth())return;setLikeBusy(true);setError(null);try{await likeGame(socialId,!liked,game.id);setLiked(v=>!v);}catch(e){setError(e);}finally{setLikeBusy(false);}}
 async function loadGifs(query=''){if(!requireAuth())return;setGifLoading(true);setError(null);try{setGifs(await findGifs(query));}catch(e){setError(e);}finally{setGifLoading(false);}}
 async function comment(e){e.preventDefault();if(!requireAuth()||(!text.trim()&&!selectedGif))return;setPosting(true);setError(null);try{await postComment(socialId,text,selectedGif?.url||null);setText('');setSelectedGif(null);setGifOpen(false);thread.refresh();}catch(e){setError(e);}finally{setPosting(false);}}
 async function share(){const url=canonicalGameUrl(game);try{if(navigator.share)await navigator.share({title:game.name,url});else await navigator.clipboard.writeText(url);setShared(true);}catch(e){if(e.name!=='AbortError')setError(new Error('Could not share this game. Copy its page address instead.'));}}
 if(recordPreview&&mayRecord)return <ManualPreviewRecorder key={`${game.id}:${user.id}`} game={game} onClose={()=>setRecordPreview(false)}/>;
 return <Modal title={game.name} onClose={onClose} backLabel={backLabel} className={`game-detail theater-modal ${discussionOnly?'discussion-only':''} ${details?'show-details':''} ${!discussionOnly&&gameFormat(game).orientation!=='portrait'?'game-detail-wide':'theater-phone'}`}>
  {!discussionOnly&&<div className="theater-toolbar"><div className="theater-first-place"><GameCrown holder={holder} compact error={crown.error} onRetry={crown.refresh}/></div><div className="theater-browse"><button disabled={!onPrevious} onClick={onPrevious} aria-label="Previous game">←</button><button disabled={!onNext} onClick={onNext} aria-label="Next game">→</button></div><div><button onClick={share} aria-label="Share game"><Icon name="share" size={16}/><span>{shared?'Link copied':'Share'}</span></button><button aria-expanded={details} aria-label={details?'Hide comments':'Show comments'} onClick={()=>setDetails(v=>!v)}><Icon name="social" size={17}/><span>{details?'Hide':'Comments'}</span></button></div></div>}
  <div className="theater-layout">
   {!discussionOnly&&<GamePlayer game={game} url={gameEntry(game)} title={game.name} previewVideo={previewVideo(game)} onEvent={refreshCrown} requireInteraction theater/>}
   <div className="game-discussion">
    <div className="game-summary"><h3>{game.name}</h3><GameCrown holder={holder} error={crown.error} onRetry={crown.refresh}/></div>
    {game.description&&<p className="game-description">{game.description}</p>}
    <div className="game-actions"><Button variant={`small ${liked?'pink':'secondary'}`} icon="heart" aria-label={liked?'Unlike this game':'Like this game'} disabled={likeBusy} onClick={toggle}>{counts.data?.[0]?.likes||0}</Button><Button variant="small secondary" icon="share" onClick={share}>{shared?'Shared':'Share'}</Button>{gamePlatform(game)!=='desktop'&&<Button variant="small secondary" icon="connect" onClick={()=>setPhone(true)}>Play on phone</Button>}</div>
    {mayRecord&&<Button variant="small secondary" onClick={()=>setRecordPreview(true)}>Record preview</Button>}
    <Notice error={error}/>
    <h3 className="discussion-title">Comments <span>{thread.data?.total_count||0}</span></h3>
    <div className="comment-list">{thread.loading?<p className="muted">Loading comments…</p>:thread.error?<Notice error={thread.error} onRetry={thread.refresh}/>:thread.data?.comments.length?thread.data.comments.map(c=><article className="comment" key={c.id}><Slop look={c.slop_look} avatar={c.avatar_url} alt=""/><div><strong>@{c.username||'player'}</strong>{c.body&&<p>{c.body}</p>}{safeGifUrl(c.gif_url)&&<img className="comment-gif" src={safeGifUrl(c.gif_url)} alt="GIF reaction" loading="lazy"/>}</div></article>):<p className="muted">Start the conversation.</p>}{thread.data?.has_more&&<Button variant="small secondary" onClick={async()=>{try{const next=await comments(socialId,thread.data.next_cursor);thread.setData(old=>({...next,comments:[...old.comments,...next.comments]}));}catch(e){setError(e);}}}>More comments</Button>}</div>
    {selectedGif&&<div className="selected-comment-gif"><img src={selectedGif.preview} alt="Selected GIF"/><button type="button" onClick={()=>setSelectedGif(null)} aria-label="Remove selected GIF"><Icon name="close" size={14}/></button></div>}
    {gifOpen&&<div className="gif-picker"><form onSubmit={e=>{e.preventDefault();loadGifs(gifQuery);}}><input aria-label="Search GIFs" maxLength="80" value={gifQuery} onChange={e=>setGifQuery(e.target.value)} placeholder="Search GIFs"/><Button type="submit" variant="small secondary" disabled={gifLoading}>{gifLoading?'Finding…':'Search'}</Button></form><div>{gifs.map(gif=><button type="button" key={gif.id+gif.url} onClick={()=>{setSelectedGif(gif);setGifOpen(false);}}><img src={gif.preview} alt="" loading="lazy"/></button>)}</div></div>}
    <form className="comment-form" onSubmit={comment}><button className="gif-button" type="button" onClick={()=>{const open=!gifOpen;setGifOpen(open);if(open&&!gifs.length)loadGifs('');}}>GIF</button><label className="sr-only" htmlFor="comment-body">Add a comment</label><input id="comment-body" maxLength={500} value={text} onChange={e=>setText(e.target.value)} placeholder={user?'Add a comment…':'Sign in to join in…'}/><IconButton name="arrow" label="Post comment" disabled={posting||(!text.trim()&&!selectedGif)}/></form>
   </div>
  </div>
  {phone&&<PhoneCode game={game} onClose={()=>setPhone(false)}/>}
 </Modal>;
}
