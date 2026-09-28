// Publication and video attachment are separate durable operations. Retain the
// confirmed receipt before attempting video, so retry never republishes a game.
export async function completeMcpPublication({receipt,submit,attach,onReceipt}) {
 const confirmed=receipt||await submit();
 if(!confirmed||!['published','pending_review'].includes(confirmed.status))throw new Error('Publication has not been confirmed. Refresh before retrying.');
 onReceipt(confirmed);
 if(confirmed.status==='published')await attach(confirmed);
 return confirmed;
}

export function isMcpTransientError(error){
 if(['authentication_required','account_changed','invalid_response','revision_superseded'].includes(error?.code))return false;
 return ['service_unavailable','upstream_unavailable'].includes(error?.code)
  ||['AbortError','TimeoutError'].includes(error?.name)
  ||/^(?:TypeError:\s*)?(?:Failed to fetch|fetch failed|NetworkError(?: when attempting to fetch resource\.)?|Load failed)$/i.test(error?.message?.trim()||'');
}
export function mcpRecoveryError(error,{published=false}={}){
 if(!error)return null;
 if(['authentication_required','account_changed'].includes(error.code))return error;
 const detail=isMcpTransientError(error)?'Slop could not be reached. Check your connection and try again.':error.message||String(error);
 return new Error(published?`Your game is published, but its video preview was not saved. Retry video attachment; the game will not be published again. ${detail}`:detail,{cause:error});
}
const failures={boot_error:'the game crashed while starting',not_ready:'the game never finished loading',blank_canvas:'the game showed a blank screen',no_motion:'nothing moved during the playtest',capture_too_large:'the clip was too large',runtime_invalid:'it is missing the Slop runtime',revision_superseded:'a newer version arrived',target_pending_review:'an update is already in review',already_published:'it is already published',auto_publish_disabled:'Auto-publish was switched off',grant_inactive:'the app was disconnected'};
export function mcpPublicationLabel(publication,{state,applied=false,hasVideo}={}){
 if(state==='published'||applied)return hasVideo===false?'Published. Video preview not attached yet.':'Publication confirmed.';
 if(state==='pending_review')return 'Submission confirmed. Waiting for review.';
 if(['private','rejected'].includes(state))return '';
 if(['published','pending_review'].includes(publication?.status))return 'Checking the published version…';
 return ({requested:'Auto-publish: queued…',recording:'Auto-publish: playtesting and recording…',publishing:'Auto-publish: publishing…'})[publication?.status]
  ||(publication?.status==='failed'?`Auto-publish failed: ${failures[publication.failure_code]||'please publish it here'}.`:'');
}

// A staged update is not a published success, even when its source bytes match.
export function mcpDraftPublicationView(draft,states={},live=null){
 const state=states[draft.game_id];
 const applied=!!live&&live.game_id!==draft.game_id&&live.digest===draft.digest&&['published','pending_review'].includes(live.state);
 const update=!applied&&live&&live.game_id!==draft.game_id?live:null;
 const effectiveState=applied?live.state:state;
 const locked=['published','pending_review','rejected','private'].includes(state)||applied||update?.state==='pending_review';
 const published=states.previews?.[applied?live.game_id:draft.game_id]||null;
 return {state:effectiveState,applied,update,locked,published,label:mcpPublicationLabel(draft.publication,{state:effectiveState,hasVideo:published?.hasVideo})};
}
