import bootstrap from './player-bootstrap.js?raw';
import {trustedEntry} from './contracts.js';
import {gamePolicy} from './player-contracts.js';
import {installGameStorage} from './player-storage.js';
import {installLegacyKeyboard,legacyControlSpec,auditedCursorStyle} from './player-input.js';
import {persistentAssetCache} from './persist-assets.js';
import {preparePersistentDocument} from './persist-document.js';
export {gamePolicy,acceptPlayerEvent} from './player-contracts.js';
export async function loadDocument(url,{signal,preview=false,persistent=false,manifest}={}){
 if(!trustedEntry(url,{preview}))throw new Error('This game URL is not trusted.');
 const useCache=persistent&&!preview;
 const cached=useCache?await persistentAssetCache.get({entry:url,path:'index.html',manifest,signal}):null;
 const response=cached?new Response(cached):await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:preview?'no-store':'default',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error(preview?'This preview expired or is not available. Reopen it to get a fresh link.':'This game could not be loaded. Please retry.');
 const reader=response.body.getReader();const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw new Error('This game document exceeds the player limit.');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(size);let offset=0;chunks.forEach(c=>{bytes.set(c,offset);offset+=c.length;});
 const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const doc=new DOMParser().parseFromString(source,'text/html');
 doc.querySelectorAll('base,meta[http-equiv],iframe,object,embed').forEach(node=>node.remove());
 // Persistent boot code is verified and cached by content hash. Lazy assets
 // still use the source-bound host bridge; Arcade retains its existing path.
 if(useCache){
  await preparePersistentDocument(doc,{sourceBytes:bytes.length,read:path=>persistentAssetCache.get({entry:url,path,manifest,signal})});
 }
 const base=url.slice(0,url.lastIndexOf('/')+1);const csp=gamePolicy(base);
 const policy=doc.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content=csp;
 const baseEl=doc.createElement('base');baseEl.href=base;
 const referrer=doc.createElement('meta');referrer.name='referrer';referrer.content='no-referrer';
 const boot=doc.createElement('script');boot.textContent=`${preview?'window.__slopPreviewCapture=true;\n':''}Object.defineProperty(window,'__slopPersistAssets',{value:Object.freeze({base:${JSON.stringify(base)}}),writable:false,configurable:false});\n(${installGameStorage.toString()})();\n(${installLegacyKeyboard.toString()})(${JSON.stringify(legacyControlSpec(url))});\n${bootstrap}`;
 // Worlds' GLB helper requires the host's exact r128 engine. Keep it in an
 // independently cached platform chunk, not an authored network request or
 // a replacement for the unchanged Arcade creator-v1 loader.
 const platform=[];
 if(persistent){const engine=doc.createElement('script');engine.textContent=(await import('./vendor/three-r128.js?raw')).default.replace(/<\/script/gi,'<\\/script');platform.push(engine);}
 const view=doc.createElement('meta');view.name='viewport';view.content='width=device-width,initial-scale=1,viewport-fit=cover';
 const cursorCss=auditedCursorStyle(url);if(cursorCss){const style=doc.createElement('style');style.textContent=cursorCss;doc.head.append(style);}
 doc.head.prepend(policy,baseEl,referrer,view,boot,...platform);
 return {html:'<!doctype html>'+doc.documentElement.outerHTML,csp};
}
