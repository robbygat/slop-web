import {SLUG,UUID} from './contracts.js';
import {validRunScore} from './score-contracts.js';

// These notices stay inside the host. An iframe postMessage (even a copy of
// this shape) cannot manufacture a successful server submission.
const savedNotices=new WeakSet();
export function scoreSavedEvent(receipt,{game,session},currentSession) {
 const owner=session?.user;
 if(receipt?.state!=='saved'||!validRunScore(receipt.score)
   ||!['community_unverified','verified_receipt'].includes(receipt.authority)
   ||!game?.id||!SLUG.test(game.slug)||!UUID.test(owner?.id)||owner.is_anonymous
   ||currentSession?.user?.id!==owner.id||currentSession?.epoch!==session.epoch)return null;
 const notice=Object.freeze({type:'score-saved',gameId:game.id,gameSlug:game.slug,ownerId:owner.id,sessionEpoch:session.epoch});
 savedNotices.add(notice);return notice;
}
export function isCurrentScoreSavedEvent(notice,{game,session}) {
 return savedNotices.has(notice)&&notice.gameId===game?.id&&notice.gameSlug===game?.slug
   &&notice.ownerId===session?.user?.id&&!session?.user?.is_anonymous&&notice.sessionEpoch===session?.epoch;
}
