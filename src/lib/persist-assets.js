import {trustedEntry} from './contracts.js';
const MAX_FILE=8_000_000,MAX_CACHE=500_000_000;
const PATH=/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:js|json|glb|bin|jpg|webp|ktx2|ogg)$/;
const RELEASE_PATH=/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:html|js|css|json|svg|txt|glb|bin|jpg|webp|ktx2|ogg)$/;
const HASH=/^[a-f0-9]{64}$/;
export const validAssetRequest=e=>e?.type==='persist-asset-request'&&typeof e.request==='string'&&e.request.length>0&&e.request.length<=120&&typeof e.path==='string'&&e.path.length<=220&&PATH.test(e.path);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export class PersistentAssetCache {
 constructor({indexedDB=globalThis.indexedDB,fetcher=globalThis.fetch,cap=MAX_CACHE,now=Date.now,name='slop-release-assets-v1'}={}){Object.assign(this,{indexedDB,fetcher,cap,now,name});this.inflight=new Map();}
 open(){return this.opening??=new Promise((resolve,reject)=>{if(!this.indexedDB)return reject(Error('Device asset cache unavailable.'));const request=this.indexedDB.open(this.name,1);request.onupgradeneeded=()=>{request.result.createObjectStore('blobs');request.result.createObjectStore('objects',{keyPath:'hash'});request.result.createObjectStore('releases',{keyPath:'key'});};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.opening=null;};resolve(db);};}).catch(error=>{this.opening=null;throw error;});}
 async transaction(work){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['objects','blobs','releases'],'readwrite');let value,error;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(error||tx.error);try{work(tx,answer=>{value=answer;},cause=>{error=cause;tx.abort();});}catch(cause){error=cause;tx.abort();}});}
 async cached(hash){return this.transaction((tx,done)=>{const r=tx.objectStore('blobs').get(hash);r.onsuccess=()=>done(r.result||null);});}
 async remember(release,hash,bytes){
  return this.transaction((tx,done)=>{
   const releases=tx.objectStore('releases'),objects=tx.objectStore('objects'),blobs=tx.objectStore('blobs');
   const r=releases.get(release);r.onsuccess=()=>{
    releases.put({key:release,lastPlayed:this.now(),hashes:[...new Set([...(r.result?.hashes||[]),hash])]});
    objects.put({hash,size:bytes.byteLength});blobs.put(bytes,hash);
    const all=releases.getAll();all.onsuccess=()=>{const meta=objects.getAll();meta.onsuccess=()=>{
     let total=meta.result.reduce((n,x)=>n+x.size,0);const retained=new Map(all.result.map(x=>[x.key,x]));
     for(const old of all.result.sort((a,b)=>a.lastPlayed-b.lastPlayed)){
      if(total<=this.cap)break;if(old.key===release)continue;retained.delete(old.key);releases.delete(old.key);
      const used=new Set([...retained.values()].flatMap(x=>x.hashes));
      for(const object of meta.result)if(!used.has(object.hash)&&!object.removed){object.removed=true;total-=object.size;objects.delete(object.hash);blobs.delete(object.hash);}
     }done();
    };};
   };
  });
 }
 async get({entry,path,manifest,signal,preview=false}){
  if(!trustedEntry(entry,{preview})||(!preview&&!entry.includes('/games/releases/')))throw Error('Assets need a trusted immutable release.');
  if(!RELEASE_PATH.test(path)||path.length>220)throw Error('Invalid release asset path.');
  const version=new URL(entry).pathname.split('/').at(-2);
  const file=manifest?.find(row=>row?.path===`${version}/${path}`||row?.path===path);
  if(!file||!HASH.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>MAX_FILE)throw Error('This asset is not in the verified release manifest.');
  const base=entry.slice(0,entry.lastIndexOf('/')+1),url=new URL(path,base).href,key=`${base}:${file.sha256}`;
  if(this.inflight.has(key))return this.inflight.get(key);
  const work=(async()=>{
   let bytes=await this.cached(file.sha256);
   if(bytes&&(bytes.byteLength!==file.bytes||await digest(bytes)!==file.sha256))bytes=null;
   if(!bytes){
    const response=await this.fetcher(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
    if(!response.ok)throw Error('This release asset could not be loaded.');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>file.bytes||size>MAX_FILE)throw Error('Release asset exceeds its verified size.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
    bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(size!==file.bytes||await digest(bytes)!==file.sha256)throw Error('Release asset integrity check failed.');
   }
   await this.remember(base,file.sha256,bytes);return bytes;
  })();this.inflight.set(key,work);
  try{return await work;}finally{if(this.inflight.get(key)===work)this.inflight.delete(key);}
 }
 async close(){(await this.opening)?.close();this.opening=null;}
}
export const persistentAssetCache=new PersistentAssetCache();
export async function sendPersistentAsset({event,entry,manifest,cache,current,send,signal,preview=false}){
 if(!validAssetRequest(event))return false;
 try{
  const bytes=await cache.get({entry,path:event.path,manifest,signal,preview});if(!current())return true;
  const total=Math.ceil(bytes.length/65536);
  for(let index=0;index<total;index++){
   if(!current())return true;const chunk=bytes.subarray(index*65536,(index+1)*65536);
   let binary='';for(const byte of chunk)binary+=String.fromCharCode(byte);
   send({type:'persist-asset-data',request:event.request,path:event.path,index,total,byte_length:bytes.length,data:btoa(binary)});
  }
 }catch(error){if(current())send({type:'persist-asset-data',request:event.request,path:event.path,error:error.message});}
 return true;
}
