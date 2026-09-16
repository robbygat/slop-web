import {SlopError, UUID} from './contracts.js';

export function futureExpiry(value, maxMilliseconds, now=Date.now()) {
  const expiry=typeof value==='string'?Date.parse(value):NaN;
  return Number.isFinite(expiry)&&expiry>now&&expiry<=now+maxMilliseconds;
}

// These fields match prepare_creator_game_publication and the native app.
// A generic games row or a guessed candidate URL is never a publication receipt.
export function publicationReceipt(value,{project,revision,buildId}) {
  if(!value||value.owner_id!==project.owner_id||value.project_id!==project.id||
    value.revision_id!==revision.id||value.target_slug!==project.game_slug||
    value.candidate_slug!==`creator-release-${revision.id}`||value.build_id!==buildId||
    !['draft','pending_review','published'].includes(value.status))throw new SlopError('invalid_response');
  if(value.status!=='draft'&&!UUID.test(value.review_submission_id))throw new SlopError('invalid_response');
  return value.status!=='draft';
}

export function creatorRevisionId(project,run) {
 // Ready is a publication boundary. The server's accepted head is authoritative;
 // a pending candidate can share its ID but receive final metadata at acceptance.
 const id=run?.state==='ready'?project?.head_revision_id:(run?.revision_id||project?.head_revision_id);
 return UUID.test(id||'')?id:null;
}

const progressStages=[['accepted','Request accepted'],['provider_accepted','Designing'],['files_authored','Building'],['validated','Ready to playtest'],['playtested','Finishing touches'],['ready','Ready to play']];
export function creatorProgress(run){
 const progress=run?.progress;
 const completed=run?.state==='ready'?6:Number.isSafeInteger(progress?.completed)&&progress.completed>=0&&progress.completed<=6?progress.completed:0;
 const stage=progressStages.find(([key])=>key===progress?.stage);
 const events=(Array.isArray(run?.events)?run.events:[]).filter(e=>Number.isSafeInteger(e?.sequence)&&e.sequence>=0&&typeof(e.text??e.message??e.label)==='string').slice(-80).map(e=>({sequence:e.sequence,text:(e.text??e.message??e.label).slice(0,500)}));
 return {completed,total:6,percent:Math.round(completed/6*100),label:run?.state==='ready'?'Ready to play':stage?.[1]||'Getting started',steps:progressStages.map(([id,label],i)=>({id,label,complete:i<completed,current:i===completed})),events};
}

// These admission errors prove the server did not accept this request. An
// expired session or ambiguous gateway reply must keep the same request ID.
export const buildAdmissionRejected=error=>new Set(['insufficient_coins','astra_daily_limit','daily_ai_limit','rate_limited','model_unavailable','project_not_found','source_not_available','revision_conflict','run_in_progress','invalid_request','invalid_model','invalid_dimension']).has(error?.code)&&error?.status>=400&&error?.status<500;

export async function advanceCreatorRun(request,run){
 try{return await request(`/runs/${run.id}/advance`,{expected_version:run.version});}
 catch(error){
  if(error?.code!=='version_conflict')throw error;
  const current=await request(`/runs/${run.id}`);
  if(current?.run?.id!==run.id||current.run.project_id!==run.project_id||!Number.isSafeInteger(current.run.version)||current.run.version<=run.version)throw error;
  return current;
 }
}
