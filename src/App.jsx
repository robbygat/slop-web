import React,{Suspense,lazy,useEffect,useState} from 'react';
import {useAuth} from './auth.jsx';
import NavIcon from './components/NavIcon.jsx';
import {BrandHeader,BrandFooter} from './components/BrandChrome.jsx';
import {Loading,Slop} from './components/ui.jsx';
import Play from './pages/Play.jsx';

import {gameNameFromPath} from './lib/game-links.js';
import {PLAYER_TABS,playerRoutePath,isLegacyCreationRoute} from './lib/player-navigation.js';
const Feed=lazy(()=>import('./pages/Feed.jsx'));
const Quests=lazy(()=>import('./pages/Quests.jsx')),Connect=lazy(()=>import('./pages/Connect.jsx')),Social=lazy(()=>import('./pages/Social.jsx')),Shop=lazy(()=>import('./pages/Shop.jsx')),You=lazy(()=>import('./pages/You.jsx')),Download=lazy(()=>import('./pages/Download.jsx')),Settings=lazy(()=>import('./pages/You.jsx').then(m=>({default:m.Settings})));
const tabs=PLAYER_TABS;
function getRoute(){const hash=location.hash.replace(/^#\/?/,'');const[path,query='']=hash.split('?');const params=new URLSearchParams(query),name=gameNameFromPath(location.pathname)||(/^\/(?:g|r|play|games)\/([A-Za-z0-9][A-Za-z0-9_-]{0,159})\/?$/.exec(location.pathname)?.[1]||null);if(!hash&&name)params.set('game',name);if(isLegacyCreationRoute(path))history.replaceState(null,'','#/connect');return {path:playerRoutePath(path),params};}
export default function App(){const[route,setRoute]=useState(getRoute),[search,setSearch]=useState(''),[term,setTerm]=useState('');const{user,profile,signIn}=useAuth();
 useEffect(()=>{const update=()=>{setRoute(getRoute());window.scrollTo({top:0});};window.addEventListener('hashchange',update);window.addEventListener('popstate',update);return()=>{window.removeEventListener('hashchange',update);window.removeEventListener('popstate',update);};},[]);
 useEffect(()=>{const t=setTimeout(()=>setSearch(term),250);return()=>clearTimeout(t);},[term]);
 useEffect(()=>{document.title=({home:'Home',feed:'Play',quests:'Quests',social:'Social',shop:'Shop',you:'You',connect:'Create',download:'Get the app',settings:'Your account'})[route.path]+' · Slop';},[route.path]);
 const navigation=()=> <nav aria-label="Main navigation">{tabs.map(([id,label,icon])=><a href={`#/${id}`} key={id} className={`nav-item ${route.path===id?'active':''} nav-${id}`} aria-label={label} title={label} aria-current={route.path===id?'page':undefined}><span className="nav-icon"><NavIcon name={icon}/></span><span className="nav-label">{label}</span></a>)}</nav>;
 return <><a className="skip-link" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>Skip to content</a>
 <div className={`app-shell slop-app ${route.path==='feed'?'is-playing':''}`}>{route.path!=='feed'&&<BrandHeader user={user} profile={profile} signIn={signIn} navigation={navigation()}/>}<main id="main" className={`main page-${route.path}`} tabIndex={-1}><Suspense key={user?.id||'guest'} fallback={<Loading/>}>{route.path==='home'?<Play params={route.params} search={search} term={term} setSearch={setTerm}/>:route.path==='feed'?<Feed/>:route.path==='quests'?<Quests/>:route.path==='connect'?<Connect params={route.params}/>:route.path==='social'?<Social params={route.params}/>:route.path==='shop'?<Shop/>:route.path==='you'?<You/>:route.path==='download'?<Download/>:route.path==='settings'?<Settings params={route.params}/>:<div className="empty"><Slop/><h1>Page not found.</h1><a className="button" href="#/home">Back to Home</a></div>}</Suspense></main>{route.path!=='feed'&&<BrandFooter/>}</div></>;
}
