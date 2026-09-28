import {SlopError} from './contracts.js';

const retryable=new Set(['confirmation_busy','confirmation_expired','service_unavailable','upstream_unavailable','upload_not_confirmed','preview_not_confirmed']);
export function shouldWarmDraft(draft){return !['requested','recording','publishing'].includes(draft.publication?.status);}

export function createDraftPreparer({request,now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),budgetMs=240000}){
 const prepared=new Map();
 async function confirm(draft){
  const started=now();let failure=new SlopError('service_unavailable');
  for(let attempt=0;;attempt++){
   const remaining=budgetMs-(now()-started);
   if(remaining<=0)throw failure;
   try{return await request('slop-mcp','/drafts/confirm',{body:{submission_id:draft.submission_id,expected_digest:draft.digest},timeout:Math.min(150000,remaining)});}
   catch(error){
    failure=error;
    if(!retryable.has(error?.code)&&error?.name!=='AbortError')throw error;
    const left=budgetMs-(now()-started);
    if(left<=0)throw error;
    await pause(Math.min(15000,4000+attempt*3000,left));
   }
  }
 }
 return async draft=>{
  const key=`${draft.submission_id}:${draft.digest}`;
  const hit=prepared.get(key);
  if(hit){
   // A click joins preparation already underway. Its failure belongs to this
   // attempt too; do not silently start a second multi-minute retry cycle.
   const preview=await hit;
   if(Date.parse(preview?.preview_expires_at)>now()+120000)return preview;
   if(prepared.get(key)===hit)prepared.delete(key);
  }
  const run=confirm(draft);prepared.set(key,run);
  run.catch(()=>{if(prepared.get(key)===run)prepared.delete(key);});
  return run;
 };
}
