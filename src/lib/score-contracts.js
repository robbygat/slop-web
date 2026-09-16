import {SLUG, UUID, SlopError} from './contracts.js';
export const validRunScore = value => Number.isSafeInteger(value) && value >= 0 && value < 100000000;
export function parseScoreReceipt(value, expected) {
  if (value?.accepted !== true || value.user_id !== expected.owner || value.game_id !== expected.game
    || value.submission_request_id !== expected.requestId || value.score !== expected.score
    || !UUID.test(value.submission_id) || value.score_authority !== 'community_unverified') {
    throw new SlopError('invalid_response');
  }
  return {state:'saved', score:value.score, authority:'community_unverified'};
}
export function createScoreRun({game, getSession, submit, requestId=crypto.randomUUID()}) {
  const captured=getSession();
  const owner=captured?.user?.is_anonymous ? null : captured?.user?.id;
  let completion;
  return {
    owner,
    finish(score) {
      if (completion) return completion;
      completion=(async()=>{
        if (!validRunScore(score) || !SLUG.test(game)) throw new SlopError('invalid_response');
        if (!owner) return {state:'guest',score};
        const assertOwner=()=>{const current=getSession();if(current?.user?.id!==owner || current?.epoch!==captured.epoch)throw new SlopError('account_changed');};
        assertOwner();
        const expected={owner,game,score,requestId};
        const receipt=await submit(expected);assertOwner();
        return parseScoreReceipt(receipt,expected);
      })();
      return completion;
    },
  };
}
export function parseLeaderboard(rows, fallback='community_unverified') {
  if (!Array.isArray(rows) || rows.length>50) throw new SlopError('invalid_response');
  return rows.map(row=>{
    const score=Number(row.score);
    if (!Number.isSafeInteger(score)||score<0||typeof row.username!=='string')throw new SlopError('invalid_response');
    return {user_id:UUID.test(row.user_id)?row.user_id:null,username:row.username.slice(0,80),score,
      avatar_url:row.avatar_url,slop_look:row.slop_look,
      authority:row.score_authority==='verified_receipt'?'verified_receipt':fallback};
  });
}
