import React,{useEffect,useState} from 'react';
import {privatePreview} from '../lib/creator.js';
import {GamePlayer} from './GamePlayer.jsx';
import {Notice} from './ui.jsx';
export default function CreatorLivePreview({project,revision,paused=false,working=false}){
 const [prepared,setPrepared]=useState(null),[error,setError]=useState(null),[retry,setRetry]=useState(0);
 const identity=[project.id,revision.id,revision.digest].join(':');
 useEffect(()=>{let active=true;setError(null);privatePreview(project,revision).then(value=>{if(active)setPrepared({...value,previewKey:identity});}).catch(e=>{if(active)setError(e);});return()=>{active=false;};},[identity,retry]);
 return <div className="creator-live-preview"><div className="creator-preview-label"><span>{working?'Saved version · your update is being built':'Your playable game'}</span><span>Private</span></div>{prepared?.previewKey===identity?<GamePlayer key={identity} url={prepared.url} preview paused={paused} initialMuted title={revision.title||project.title}/>:error?<Notice error={error} onRetry={()=>setRetry(v=>v+1)}/>:<div className="creator-preview-loading" role="status"><span className="loader"/>Opening this version…</div>}{prepared?.previewKey===identity&&error&&<Notice error={error}/>}</div>;
}
