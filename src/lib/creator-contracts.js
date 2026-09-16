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
