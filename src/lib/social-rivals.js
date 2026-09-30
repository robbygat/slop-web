import {parseFeedCrown} from './feed-crown.js';
import {canonicalGameUrl} from './game-links.js';
import {SlopError} from './contracts.js';

// Join by the requested game key, never by response order. Missing, duplicate,
// or unsupported rows cannot turn a creator or an outage into a crown holder.
export function crownBoardEntries(games, rows) {
  if (!Array.isArray(rows)) throw new SlopError('invalid_response');
  const seen = new Set();
  return games.filter(game => {
    if (seen.has(game.slug)) return false;
    seen.add(game.slug);
    return true;
  }).map(game => {
    const matches = rows.filter(row => row?.game_key === game.slug);
    const row = matches.length === 1 ? matches[0] : null;
    const holder = row && parseFeedCrown([{...row, user_id: row.holder_user_id,
      username: row.holder_username, avatar_url: row.holder_avatar_url, slop_look: row.holder_slop_look}]);
    const open = row?.is_creator_fallback === true && row.score == null
      && ['verified_receipt', 'community_unverified'].includes(row.score_authority);
    return {game, holder: holder || null, state: holder ? 'crowned' : open ? 'open' : 'unavailable'};
  });
}

export function filterCrownBoard(entries, {scope = 'everyone', following = new Set(), userId} = {}) {
  return entries.filter(entry => scope === 'following' ? !!entry.holder && following.has(entry.holder.user_id)
    : scope === 'mine' ? !!userId && entry.holder?.user_id === userId : true);
}

export function rivalChallenge(entry) {
  if (entry?.state !== 'crowned' || !entry.holder) throw new SlopError('invalid_response');
  const title = String(entry.game.name || 'Slop game').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
  return `The score to chase: ${entry.holder.score.toLocaleString()} by @${entry.holder.username} in ${title}.\nPlay: ${canonicalGameUrl(entry.game)}`;
}
