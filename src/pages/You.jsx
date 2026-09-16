import React,{useEffect,useRef,useState} from 'react';
import './profile-slop.css';
import {useAuth} from '../auth.jsx';
import {result,asOwner} from '../lib/supabase.js';
import {updatePassword} from '../lib/password.js';
import {loadGames} from '../lib/catalog.js';
import {loadProfileBanners,equipProfileBanner,loadProfileStats,loadLikedShelf} from '../lib/profile.js';
import {PROFILE_BANNERS,profileBanner,bannerImage} from '../lib/profile-banners.js';
import {Button,Empty,Loading,Modal,Notice,SectionHeading,Slop,useAsync} from '../components/ui.jsx';
import SlopMotion from '../components/SlopMotion.jsx';
import {Icon} from '../components/Icon.jsx';
import {GameCard,GameDetail} from './Play.jsx';

function BackgroundPicker({inventory,onEquipped,onClose}){
 const [busy,setBusy]=useState(null),[error,setError]=useState(null);const pending=useRef(false);
 async function choose(id){if(pending.current||!inventory.data?.owned.has(id)||inventory.data.equippedId===id)return;pending.current=true;setBusy(id);setError(null);try{const receipt=await equipProfileBanner(id);onEquipped(receipt);}catch(e){setError(e);}finally{pending.current=false;setBusy(null);}}
 return <Modal title="Your backgrounds" onClose={onClose} className="profile-background-modal">
  <p className="profile-background-intro">Choose a background for your Slop. It updates in the app, too.</p>
  <Notice error={error||inventory.error} onRetry={inventory.error?inventory.refresh:undefined}/>
  <div className="profile-background-grid">{PROFILE_BANNERS.map(banner=>{const owned=inventory.data?.owned.has(banner.id),equipped=inventory.data?.equippedId===banner.id;return <div className={`profile-background-choice ${equipped?'is-equipped':''}`} key={banner.id}>
   <button className="profile-background-art" disabled={!owned||!!busy||equipped||inventory.loading} onClick={()=>choose(banner.id)} aria-label={`${banner.name}${equipped?', equipped':owned?', use background':', locked'}`} aria-pressed={equipped}><img src={bannerImage(banner)} alt="" loading="lazy"/>{equipped&&<span><Icon name="check" size={16}/>Equipped</span>}</button>
   <div className="profile-background-caption"><strong>{banner.name}</strong>{busy===banner.id?<span role="status">Updating…</span>:inventory.loading?<span>Checking collection…</span>:owned?<span>{equipped?'Current background':'In your collection'}</span>:<a href="#/download">{banner.level?`Maker Path · Level ${banner.level}`:'Open the app'}<Icon name="arrow" size={13}/></a>}</div>
  </div>;})}</div>
 </Modal>;
}
function ProfileShelf({owner,onOpen}){
 const [tab,setTab]=useState('published'),[games,setGames]=useState([]),[next,setNext]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(null);const epoch=useRef(0),pending=useRef(false);
 async function load(offset=0,reset=false){if(pending.current&&!reset)return;const version=reset?++epoch.current:epoch.current;pending.current=true;setLoading(true);setError(null);try{const page=tab==='liked'?await loadLikedShelf(offset):await loadGames({owner,offset}).then(rows=>({games:rows,next:rows.length===24?offset+24:null}));if(version!==epoch.current)return;setGames(old=>reset?page.games:[...old,...page.games.filter(game=>!old.some(item=>item.id===game.id))]);setNext(page.next);}catch(e){if(version===epoch.current)setError(e);}finally{if(version===epoch.current){pending.current=false;setLoading(false);}}}
 useEffect(()=>{setGames([]);setNext(0);load(0,true);return()=>{epoch.current++;};},[owner,tab]);
 return <section className="profile-library"><div className="profile-library-heading"><div className="profile-library-tabs" aria-label="Your games"><button aria-pressed={tab==='published'} className={tab==='published'?'selected':''} onClick={()=>setTab('published')}>Published games</button><button aria-pressed={tab==='liked'} className={tab==='liked'?'selected':''} onClick={()=>setTab('liked')}>Liked games</button></div><a className="button small secondary" href="#/build"><Icon name="plus" size={17}/>Create</a></div>
  {games.length>0&&<div className="game-grid">{games.map(game=><GameCard key={game.id} game={game} onOpen={onOpen}/>)}</div>}
  {loading?<Loading label="Loading your games…"/>:error?<Notice error={error} onRetry={()=>load(next||0,!games.length)}/>:!games.length?<Empty title={tab==='published'?'No published games yet.':'No liked games yet.'} action={<a className="button secondary" href={tab==='published'?'#/build':'#/feed'}>{tab==='published'?'Create a game':'Find a game'}</a>}>{tab==='published'?'Games you publish from the app or website appear here.':'Games you like in the app or website appear here.'}</Empty>:null}
  {!loading&&!error&&next!==null&&<Button className="profile-load-more" variant="secondary" onClick={()=>load(next)}>Load more</Button>}
 </section>;
}
export default function You(){
 const {user,profile,signIn,refreshProfile}=useAuth();const [selected,setSelected]=useState(null),[picker,setPicker]=useState(false),[message,setMessage]=useState('');
 const inventory=useAsync(()=>user?loadProfileBanners():Promise.resolve(null),[user?.id]);
 const stats=useAsync(()=>user?loadProfileStats():Promise.resolve(null),[user?.id]);
 const equippedId=inventory.data?.equippedId||profile?.profile_banner_id||'banner-living-gel';const background=profileBanner(equippedId);
 function equipped(receipt){inventory.setData(receipt);refreshProfile();setMessage('Background updated.');setPicker(false);}
 if(!user)return <section className="you-profile-page you-guest-profile"><div className="you-profile-scene"><img src="/assets/illustrations/desert-horizon.webp" alt=""/><SlopMotion className="you-guest-character"/></div><div className="you-profile-information"><h1>Your Slop.</h1><p>Keep your character, games, and friends together.</p><Button onClick={signIn}>Sign in</Button></div></section>;
 return <div className="you-profile-page">
  <section className="you-profile-card"><div className="you-profile-scene">{background&&<img src={bannerImage(background)} alt=""/>}<button className="you-background-button" onClick={()=>setPicker(true)}><Icon name="spark" size={17}/><span>Backgrounds</span></button><Slop interactive nativeDynamic controls={false} paused={picker||!!selected} look={profile?.slop_look} className="you-profile-character" alt="Your Slop"/></div>
   <div className="you-profile-information"><div className="you-identity"><h1>{profile?.display_name||profile?.username||'Your Slop'}</h1>{profile?.username&&<p className="you-handle">@{profile.username}</p>}{profile?.bio&&<p className="you-bio">{profile.bio}</p>}</div>
    <dl className="you-profile-stats">{[['games','Games'],['followers','Followers'],['following','Following']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{stats.loading||stats.error?'—':stats.data?.[key]?.toLocaleString()??'—'}</dd></div>)}</dl><Notice error={stats.error} onRetry={stats.refresh}/>
    <div className="you-profile-buttons"><a href="#/shop" className="button"><Icon name="spark" size={18}/>Customize Slop</a><a href="#/settings" className="button secondary"><Icon name="settings" size={18}/>Edit profile</a></div>{message&&<p className="you-profile-status" role="status">{message}</p>}
   </div>
  </section>
  <nav className="you-profile-tools" aria-label="Your tools"><a href="#/build"><Icon name="build"/><span>Creator studio</span><Icon name="chevron" size={18}/></a><a href="#/connect"><Icon name="connect"/><span>Connected agents</span><Icon name="chevron" size={18}/></a><button onClick={()=>setPicker(true)}><Icon name="spark"/><span>Your backgrounds</span><Icon name="chevron" size={18}/></button></nav>
  <ProfileShelf owner={user.id} onOpen={setSelected}/>
  {picker&&<BackgroundPicker inventory={inventory} onEquipped={equipped} onClose={()=>setPicker(false)}/>}{selected&&<GameDetail game={selected} onClose={()=>setSelected(null)}/>}
 </div>;
}
export function Settings({params}){
 const{user,profile,signIn,signOut,refreshProfile}=useAuth();const[username,setUsername]=useState(''),[display,setDisplay]=useState(''),[bio,setBio]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState('');
 useEffect(()=>{setUsername(profile?.username||'');setDisplay(profile?.display_name||'');setBio(profile?.bio||'');},[profile]);
 if(!user)return <Empty title="This is your space." action={<Button onClick={signIn}>Sign in</Button>}>Sign in to manage your Slop account.</Empty>;
 async function save(e){e.preventDefault();setBusy(true);setError(null);try{if(!/^[A-Za-z0-9_.]{3,30}$/.test(username))throw new Error('Use 3–30 letters, numbers, dots or underscores for your username.');await asOwner((owner,client)=>result(client.from('profiles').update({username,display_name:display.trim(),bio:bio.trim()}).eq('id',owner).select('id').single()));refreshProfile();setMessage('Your profile is updated on every screen.');}catch(e){setError(e);}finally{setBusy(false);}}
 return <div className="settings-page"><SectionHeading title="Make yourself at home" eyebrow="Your account"/><div className="panel"><form onSubmit={save}><label>Username<input required minLength={3} maxLength={30} value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Display name<input maxLength={60} value={display} onChange={e=>setDisplay(e.target.value)}/></label><label>A little about you<textarea maxLength={280} rows={3} value={bio} onChange={e=>setBio(e.target.value)}/></label><Notice error={error}/>{message&&<p className="success" role="status">{message}</p>}<Button disabled={busy}>Save profile</Button></form></div><div className="panel"><h2>{params.has('reset')?'Choose a new password':'Password'}</h2><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError(null);try{await updatePassword(password);setPassword('');setMessage('Your password has been updated.');}catch(e){setError(e);}finally{setBusy(false);}}}><label>New password<input type="password" required minLength={8} value={password} autoComplete="new-password" onChange={e=>setPassword(e.target.value)}/></label><Button variant="secondary" disabled={busy}>Update password</Button></form></div><div className="panel settings-bottom"><div><strong>{user.email}</strong><p>Signing out only signs you out of this browser.</p></div><Button icon="logout" variant="secondary" onClick={async()=>{try{await signOut();location.hash='/play';}catch(e){setError(e);}}}>Sign out</Button></div></div>;
}
