import {supabase,result,asOwner,getSession} from './supabase.js';
import {SLUG,SlopError} from './contracts.js';
import {createScoreRun,parseLeaderboard} from './score-contracts.js';
import {parseFeedCrown} from './feed-crown.js';
export async function loadLeaderboard(slug) {
  if(!SLUG.test(slug))throw new SlopError('invalid_response');
  try {
    const rows=parseLeaderboard(await result(supabase.rpc('competitive_top_scores',{p_game:slug,p_limit:10})));
    if(rows.length)return rows;
  } catch(error) {if(!['PGRST202','42883'].includes(error.code))throw error;}
  return parseLeaderboard(await result(supabase.rpc('top_scores',{p_game:slug,p_limit:10})));
}
// Use the same authoritative display-crown selection as the mobile feed.
export async function loadFeedCrown(slug) {
  if(!SLUG.test(slug))throw new SlopError('invalid_response');
  const rows=await result(supabase.rpc('game_crowns',{p_games:[slug]}).abortSignal(AbortSignal.timeout(6000)));
  if(!Array.isArray(rows)||rows.length!==1||rows[0]?.game_key!==slug)return null;
  const row=rows[0];
  return parseFeedCrown([{...row,user_id:row.holder_user_id,username:row.holder_username,avatar_url:row.holder_avatar_url,slop_look:row.holder_slop_look}]);
}
export function scoreRun(slug) {
  return createScoreRun({game:slug,getSession,submit:expected=>asOwner((owner,client)=>{
    if(owner!==expected.owner)throw new SlopError('account_changed');
    return result(client.rpc('submit_score_with_community_transition',{
      p_game:expected.game,p_score:expected.score,p_submission_request_id:expected.requestId,p_meta:{source:'slop-web'},
    }));
  })});
}
