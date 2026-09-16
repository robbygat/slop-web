import {supabase,result,asOwner,getSession} from './supabase.js';
import {SLUG,SlopError} from './contracts.js';
import {createScoreRun,parseLeaderboard} from './score-contracts.js';
export async function loadLeaderboard(slug) {
  if(!SLUG.test(slug))throw new SlopError('invalid_response');
  try {
    const rows=parseLeaderboard(await result(supabase.rpc('competitive_top_scores',{p_game:slug,p_limit:10})));
    if(rows.length)return rows;
  } catch(error) {if(!['PGRST202','42883'].includes(error.code))throw error;}
  return parseLeaderboard(await result(supabase.rpc('top_scores',{p_game:slug,p_limit:10})));
}
export function scoreRun(slug) {
  return createScoreRun({game:slug,getSession,submit:expected=>asOwner((owner,client)=>{
    if(owner!==expected.owner)throw new SlopError('account_changed');
    return result(client.rpc('submit_score_with_community_transition',{
      p_game:expected.game,p_score:expected.score,p_submission_request_id:expected.requestId,p_meta:{source:'slop-web'},
    }));
  })});
}
