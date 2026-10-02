// Runs only in the isolated recorder parent, never the authored opaque frame.
// These are real device persistence/asset implementations, with no auth/RPC.
import {PersistentStore} from '../../src/lib/persist-store.js';
import {PersistentSession} from '../../src/lib/persist-session.js';
import {PersistentAssetCache,sendPersistentAsset,validAssetRequest} from '../../src/lib/persist-assets.js';
import {acceptPersistEvent} from '../../src/lib/persist-contracts.js';

export async function installWorldRecorder(frame,config,target=window){
 const scope={owner:'device',epoch:0},id=`recorder-${crypto.randomUUID()}`;
 const store=new PersistentStore({indexedDB:target.indexedDB,name:`${id}-saves`});
 const base=config.entry.slice(0,config.entry.lastIndexOf('/')+1);
 const local=new URL('/game/',target.location.href),controller=new AbortController();
 let retired=false,ready=false,active=0,total=0,errors=0,restartAcks=0;
 const paths=new Set(),boot=new Set(config.firstLoad),restarts=new Map();
 const current=()=>!retired;
 const send=message=>{
  if(!current())return;
  if(message.type==='persist-asset-data'&&message.error){errors++;message={...message,error:'This release asset is not available in this capture session.'};}
  frame.contentWindow.postMessage(JSON.stringify(message),'*');
 };
 const cache=new PersistentAssetCache({indexedDB:target.indexedDB,name:`${id}-assets`,fetcher:(url,options)=>{
  if(typeof url!=='string'||!url.startsWith(base))throw Error('Recorder asset outside this release.');
  const path=url.slice(base.length),entry=config.manifest.find(file=>file.path===`1.0.0/${path}`);
  if(!entry||path.includes('..')||/[?#%\\]/.test(path))throw Error('Recorder asset missing from this release.');
  return target.fetch(new URL(path,local).href,{...options,credentials:'omit',redirect:'error'});
 }});
 const session=new PersistentSession({store,game:id,...scope,currentScope:()=>scope,rpc:null,send,onState:state=>{if(state.error)errors++;}});
 await session.load();session.start();
 const onMessage=async event=>{
  if(!current()||event.source!==frame.contentWindow||typeof event.data!=='string'||event.data.length>750000)return;
  let message;try{message=JSON.parse(event.data);}catch{return;}
  if(message?.type==='loadError'||message?.type==='webGameError'){errors++;return;}
  if(message?.type==='ready'&&message.source!=='document'){ready=true;return;}
  if(message?.type==='restart-ack'){const pending=restarts.get(message.request);if(pending){restarts.delete(message.request);if(message.handled){restartAcks++;pending.resolve();}else pending.reject(Error('World restart failed.'));}return;}
  if(validAssetRequest(message)){
   const file=config.manifest.find(row=>row.path===`1.0.0/${message.path}`),added=paths.has(message.path)?0:file?.bytes||0;
   if(!session.initialized||!file||active>=4||(!ready&&!boot.has(message.path))||total+added>50000000||(!paths.has(message.path)&&paths.size>=400)){
    send({type:'persist-asset-data',request:message.request,path:message.path,error:'This release asset is not available in this capture session.'});return;
   }
   active++;paths.add(message.path);total+=added;
   try{await sendPersistentAsset({event:message,entry:config.entry,manifest:config.manifest,cache,current,send,signal:controller.signal});}
   finally{active--;}
  }else if(acceptPersistEvent(message))await session.handle(message);
 };
 target.addEventListener('message',onMessage);
 return {
  async restart(request){
   await session.flush();
   await session.newRun();
   let timer;const result=new Promise((resolve,reject)=>{restarts.set(request,{resolve,reject});timer=setTimeout(()=>{restarts.delete(request);reject(Error('World restart was not acknowledged.'));},8000);});
   send({type:'restart',request,persistent_newrun:true,generation:session.generation,revision:session.revisions()});
   try{await result;}finally{clearTimeout(timer);}
  },
  // Read-only aggregate diagnostics: never source paths, player data or secrets.
  inspect:()=>({ready,errors,assets:paths.size,bytes:total,active,initialized:!!session.initialized,restartAcks}),
  async dispose(){retired=true;controller.abort();target.removeEventListener('message',onMessage);session.dispose();for(const pending of restarts.values())pending.reject(Error('Recorder closed.'));restarts.clear();await Promise.all([store.close(),cache.close()]);},
 };
}
