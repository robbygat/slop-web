import {UUID,gameEntry,SlopError} from './contracts.js';

export const RECORDING_UNSUPPORTED='Video recording is unavailable in this browser. Open Slop in the latest Chrome on a computer to record a preview.';
export const OWNER_VIDEO_FIELDS='id,owner_id,slug,name,status,published_bundle_path,bundle_version,supported_platforms,preview_width,preview_height,thumb,bundle_digest,bundle_manifest';
export function recordingOwner(session){
 if(!UUID.test(session?.user?.id)||session.user.is_anonymous||!session.access_token)throw new SlopError('authentication_required');
 return {owner:session.user.id,epoch:session.epoch};
}
export function assertRecordingOwner(expected,session){
 if(!expected||session?.user?.id!==expected.owner||session?.epoch!==expected.epoch||session.user.is_anonymous||!session.access_token)throw new SlopError('account_changed');
}
export function recordingRelease(game,owner){
 if(!UUID.test(game?.id)||game.owner_id!==owner||game.status!=='published')throw new Error('Only the owner can record a preview for this published game.');
 const entry=gameEntry(game);
 return {gameId:game.id,slug:game.slug,entry,releaseKey:game.published_bundle_path||`legacy/${game.slug}`,platforms:JSON.stringify(game.supported_platforms||[])};
}
export function assertRecordingRelease(expected,game,owner){
 const current=recordingRelease(game,owner);
 if(!expected||Object.keys(current).some(key=>current[key]!==expected[key]))throw new Error('This game changed. Close this recording and record its current version.');
 return current;
}
export function measurePreviewMotion(pixels,previous){
 if(!(pixels instanceof Uint8Array)||!pixels.length)return {lit:false,moving:false};
 let min=255,max=0,diff=0;
 for(let i=0;i<pixels.length;i++){const v=pixels[i];min=Math.min(min,v);max=Math.max(max,v);if(previous?.length===pixels.length)diff+=Math.abs(v-previous[i]);}
 return {lit:max-min>12,moving:previous?.length===pixels.length&&diff/pixels.length>0.35};
}
export function assertPreviewClip(clip){
 if(!(clip?.video instanceof Uint8Array)||!clip.video.length||clip.video.length>4194304
   ||!(clip.poster instanceof Uint8Array)||!clip.poster.length||clip.poster.length>716800
   ||!((clip.width===720&&clip.height===1280)||(clip.width===1280&&clip.height===720))
   ||!Number.isFinite(clip.durationMs)||clip.durationMs<3000||clip.durationMs>15000)throw new Error('Play a little longer, then try again. A valid video preview is required (3–15 seconds, up to 4 MB).');
 const q=clip.quality;
 if(!q||!['frames','moving','lit'].every(k=>Number.isInteger(q[k])&&q[k]>=0)||q.moving>q.frames||q.lit>q.frames
   ||q.frames<20*clip.durationMs/1000)throw new Error('Recording was too slow. Try Chrome on a computer and close other busy tabs, then record again.');
 if(q.lit<q.frames*.5||q.moving<q.frames*.15)throw new Error('Play through a moving moment, then record again. A still or blank clip cannot become a preview.');
 return clip;
}
