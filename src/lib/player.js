import bootstrap from './player-bootstrap.js?raw';
import {trustedEntry} from './contracts.js';
import {gamePolicy} from './player-contracts.js';
import {installGameStorage} from './player-storage.js';
import {installLegacyKeyboard,legacyControlSpec,auditedCursorStyle} from './player-input.js';
export {gamePolicy,acceptPlayerEvent} from './player-contracts.js';
export async function loadDocument(url,{signal,preview=false}={}){
 if(!trustedEntry(url,{preview}))throw new Error('This game URL is not trusted.');
 const response=await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:preview?'no-store':'default',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error(preview?'This preview expired or is not available. Reopen it to get a fresh link.':'This game could not be loaded. Please retry.');
 const reader=response.body.getReader();const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw new Error('This game document exceeds the player limit.');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(size);let offset=0;chunks.forEach(c=>{bytes.set(c,offset);offset+=c.length;});
 const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const doc=new DOMParser().parseFromString(source,'text/html');
 doc.querySelectorAll('base,meta[http-equiv],iframe,object,embed').forEach(node=>node.remove());
 const base=url.slice(0,url.lastIndexOf('/')+1);const csp=gamePolicy(base);
 const policy=doc.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content=csp;
 const baseEl=doc.createElement('base');baseEl.href=base;
 const referrer=doc.createElement('meta');referrer.name='referrer';referrer.content='no-referrer';
 const boot=doc.createElement('script');boot.textContent=`${preview?'window.__slopPreviewCapture=true;\n':''}(${installGameStorage.toString()})();\n(${installLegacyKeyboard.toString()})(${JSON.stringify(legacyControlSpec(url))});\n${bootstrap}`;
 const view=doc.createElement('meta');view.name='viewport';view.content='width=device-width,initial-scale=1,viewport-fit=cover';
 const cursorCss=auditedCursorStyle(url);if(cursorCss){const style=doc.createElement('style');style.textContent=cursorCss;doc.head.append(style);}
 doc.head.prepend(policy,baseEl,referrer,view,boot);
 return {html:'<!doctype html>'+doc.documentElement.outerHTML,csp};
}
