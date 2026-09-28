import {UUID} from './contracts.js';
import {validRunScore} from './score-contracts.js';

// Accept the server-selected positive first place from either supported score
// authority. Creator fallback and unknown authority never invent a winner.
export function parseFeedCrown(rows) {
  if(!Array.isArray(rows)||rows.length!==1)return null;
  const row=rows[0];
  if(typeof row?.score!=='number'&&(typeof row?.score!=='string'||!/^\d+$/.test(row.score)))return null;
  const score=Number(row.score);
  const username=typeof row?.username==='string'?row.username.trim().replace(/^@/,''):'';
  if(!['verified_receipt','community_unverified'].includes(row?.score_authority)||row.is_creator_fallback===true||!UUID.test(row.user_id)
    ||!validRunScore(score)||score<=0||!username||username.length>80
    ||/[\u0000-\u001f\u007f]/.test(username))return null;
  return {user_id:row.user_id,username,score,avatar_url:row.avatar_url,slop_look:row.slop_look};
}
