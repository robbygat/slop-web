import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles.css';
import '../../src/brand.css';

const nativeFetch=globalThis.fetch.bind(globalThis),{files,identity}=await(await nativeFetch('/__worlds-qa/bundle.json')).json();
const slug='local-worlds-acceptance',base=`https://api.slop.game/storage/v1/object/public/games/releases/${identity.digest}/${slug}/1.0.0/`;
let offline=false,requests=0;
globalThis.fetch=async(url,options)=>{
 const value=String(url);
 if(value.startsWith(base)){
  requests++;if(offline)throw Error('LOCAL QA simulated offline asset read.');
  const name=value.slice(base.length);if(!Object.hasOwn(files,name))throw Error('Unknown fixture asset.');
  return new Response(files[name],{status:200,headers:{'Content-Type':name.endsWith('.json')?'application/json':'text/plain'}});
 }
 if(new URL(value,location.href).origin===location.origin)return nativeFetch(url,options);
 globalThis.__worldsQaForbidden=(globalThis.__worldsQaForbidden||0)+1;throw Error('LOCAL QA blocks external requests.');
};
const {GamePlayer}=await import('../../src/components/GamePlayer.jsx');
const {persistentStore}=await import('../../src/lib/persist-runtime.js');
const game={id:'local-worlds-acceptance',slug,root_game_slug:slug,persistent:true,bundle_manifest:identity.manifest,target_platform:'cross-platform'};
function App(){
 const[open,setOpen]=useState(true),[state,setState]=useState({}),[error,setError]=useState(''),[ready,setReady]=useState(false),[offlineView,setOffline]=useState(false),ref=useRef(null);
 useEffect(()=>{
  let alive=true;
  const read=async()=>{const run=await persistentStore.read('device',slug,'run'),profile=await persistentStore.read('device',slug,'profile');if(alive)setState({run:run?.data||null,profile:profile?.data||null,revision:{run:run?.revision||0,profile:profile?.revision||0},forbidden:globalThis.__worldsQaForbidden||0,requests});};
  void read();const timer=setInterval(read,600);return()=>{alive=false;clearInterval(timer);};
 },[]);
 async function close(){try{await ref.current?.flush();setOpen(false);setReady(false);setError('');}catch(e){setError(e.message);}}
 return <main style={{maxWidth:680,margin:'0 auto',padding:16}}>
  <strong style={{display:'block',background:'#c6ff5e',color:'#0c120d',padding:10}}>LOCAL QA · SYNTHETIC WORLD · NO BACKEND</strong>
  <h1 style={{fontSize:24}}>Worlds persistence acceptance</h1>
  <p>Actual GamePlayer, opaque iframe, SDK, host and browser IndexedDB. Tap or Space adds one to run and profile. Close, reopen, then Continue or New run.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
   <button className="button" onClick={open?close:()=>setOpen(true)}>{open?'Close World (flush)':'Reopen World'}</button>
   <button className="button" onClick={()=>{offline=!offline;setOffline(offline);}}>Assets: {offlineView?'offline':'online'}</button>
   <button className="button" onClick={()=>location.reload()}>Reload host</button>
  </div>
  {error&&<p role="alert">{error}</p>}
  <p role="status">{ready?'SDK ready after draw':'Awaiting explicit SDK ready / Continue'} · forbidden calls: {state.forbidden||0}</p>
  {open&&<GamePlayer ref={ref} url={base+'index.html'} game={game} title="Local synthetic World" initialMuted stageAspect={1} onEvent={event=>{if(event.type==='ready'&&event.source!=='document')setReady(true);}}/>}
  <pre style={{whiteSpace:'pre-wrap',fontSize:13,padding:12}}>{JSON.stringify(state,null,2)}</pre>
 </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
