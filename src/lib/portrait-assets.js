// Share decoded shells across cards, cap both decoding work and retained images.
export function createPortraitLoader(decode,{concurrency=4,capacity=40}={}){
 const cache=new Map(),queue=[];let running=0;
 function drain(){while(running<concurrency&&queue.length){const job=queue.shift();running++;Promise.resolve().then(()=>decode(job.url)).then(value=>job.resolve(value),error=>{cache.delete(job.url);job.reject(error);}).finally(()=>{running--;trim();drain();});}}
 function trim(){while(cache.size>capacity){const settled=[...cache].find(([,entry])=>entry.done);if(!settled)break;cache.delete(settled[0]);}}
 return url=>{
  if(cache.has(url)){const entry=cache.get(url);cache.delete(url);cache.set(url,entry);return entry.promise;}
  const entry={done:false,promise:null};
  entry.promise=new Promise((resolve,reject)=>queue.push({url,resolve:value=>{entry.done=true;resolve(value);},reject:error=>{entry.done=true;reject(error);}}));
  cache.set(url,entry);drain();return entry.promise;
 };
}
export const loadPortraitShell=createPortraitLoader(url=>new Promise((resolve,reject)=>{
 const img=new Image();img.decoding='async';img.onload=()=>{const ready=img.decode?img.decode():Promise.resolve();ready.then(()=>resolve(img),()=>resolve(img));};img.onerror=()=>reject(new Error('Character artwork could not load.'));img.src=url;
}));
