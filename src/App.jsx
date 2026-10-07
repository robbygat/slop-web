import React,{Suspense,lazy,useEffect,useState} from 'react';
import {useAuth} from './auth.jsx';
import NavIcon from './components/NavIcon.jsx';
import {BrandHeader,BrandFooter} from './components/BrandChrome.jsx';
import {Loading,Slop,Notice} from './components/ui.jsx';
import {flushPersistentPlayers} from './lib/persist-runtime.js';
import Play from './pages/Play.jsx';

import {inviteCodeFromUrl} from './lib/invite-links.js';
import {gameNameFromPath} from './lib/game-links.js';
import {PLAYER_TABS,playerRoutePath,isLegacyCreationRoute} from './lib/player-navigation.js';
const Feed=lazy(()=>import('./pages/Feed.jsx'));
const Invite=lazy(()=>import('./pages/Invite.jsx'));
const Quests=lazy(()=>import('./pages/Quests.jsx')),Connect=lazy(()=>import('./pages/Connect.jsx')),Social=lazy(()=>import('./pages/Social.jsx')),Shop=lazy(()=>import('./pages/Shop.jsx')),You=lazy(()=>import('./pages/You.jsx')),Download=lazy(()=>import('./pages/Download.jsx')),Settings=lazy(()=>import('./pages/You.jsx').then(m=>({default:m.Settings})));
const tabs=PLAYER_TABS;
function getRoute(){const hash=location.hash.replace(/^#\/?/,'');const[path,query='']=hash.split('?');const params=new URLSearchParams(query),name=gameNameFromPath(location.pathname)||(/^\/(?:g|r|play|games)\/([A-Za-z0-9][A-Za-z0-9_-]{0,159})\/?$/.exec(location.pathname)?.[1]||null);if(!hash&&location.pathname.startsWith('/invite/')){const code=inviteCodeFromUrl(location.href);return {path:'invite',params:new URLSearchParams(code?{code}:{})};}if(!hash&&name)params.set('game',name);if(isLegacyCreationRoute(path))history.replaceState(null,'','#/connect');return {path:playerRoutePath(path),params};}
export default function App(){const[route,setRoute]=useState(getRoute),[search,setSearch]=useState(''),[term,setTerm]=useState(''),[routeError,setRouteError]=useState(null);const{user,profile,signIn}=useAuth();
 useEffect(()=>{let revision=0,alive=true;const update=async()=>{const current=++revision;try{await flushPersistentPlayers();if(!alive||current!==revision)return;setRouteError(null);setRoute(getRoute());window.scrollTo({top:0});}catch(error){if(alive&&current===revision)setRouteError(error);}};window.addEventListener('hashchange',update);window.addEventListener('popstate',update);return()=>{alive=false;revision++;window.removeEventListener('hashchange',update);window.removeEventListener('popstate',update);};},[]);
 useEffect(()=>{const t=setTimeout(()=>setSearch(term),250);return()=>clearTimeout(t);},[term]);
 useEffect(()=>{document.title=({home:'Home',feed:'Play',quests:'Quests',social:'Social',shop:'Shop',you:'You',connect:'Create',download:'Get the app',settings:'Your account',invite:'You’re invited'})[route.path]+' · Slop';},[route.path]);
 const navigation=()=> <nav aria-label="Main navigation">{tabs.map(([id,label,icon])=><a href={`#/${id}`} key={id} className={`nav-item ${route.path===id?'active':''} nav-${id}`} aria-label={label} title={label} aria-current={route.path===id?'page':undefined}><span className="nav-icon"><NavIcon name={icon}/></span><span className="nav-label">{label}</span></a>)}</nav>;
 return <><a className="skip-link" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>Skip to content</a>{routeError&&<Notice error={routeError}/>}
 <div className={`app-shell slop-app ${route.path==='feed'?'is-playing':''}`}>{route.path!=='feed'&&<BrandHeader user={user} profile={profile} signIn={signIn} navigation={navigation()}/>}<main id="main" className={`main page-${route.path}`} tabIndex={-1}><Suspense key={user?.id||'guest'} fallback={<Loading/>}>{route.path==='home'?<Play params={route.params} search={search} term={term} setSearch={setTerm}/>:route.path==='feed'?<Feed/>:route.path==='quests'?<Quests/>:route.path==='connect'?<Connect params={route.params}/>:route.path==='social'?<Social params={route.params}/>:route.path==='shop'?<Shop/>:route.path==='you'?<You/>:route.path==='invite'?<Invite params={route.params}/>:route.path==='download'?<Download/>:route.path==='settings'?<Settings params={route.params}/>:<div className="empty"><Slop/><h1>Page not found.</h1><a className="button" href="#/home">Back to Home</a></div>}</Suspense></main>{route.path!=='feed'&&<BrandFooter/>}</div></>;
}
