import {SLUG, UUID, SlopError} from './contracts.js';
import {validRunScore} from './score-contracts.js';

const invalid = () => { throw new SlopError('invalid_response'); };
const object = value => {
  if (Array.isArray(value)) value = value.length === 1 ? value[0] : null;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : invalid();
};
const integer = value => {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(number) && number >= 0 ? number : invalid();
};
const score = value => { const number = integer(value); return validRunScore(number) ? number : invalid(); };

// This is the existing native account-scoped pre-run contract. A failed read is
// never equivalent to a player having no previous score.
export function parsePersonalBest(raw) {
  const value = object(raw);
  if (value.available !== true || typeof value.has_score !== 'boolean') invalid();
  const best = score(value.best);
  if (!value.has_score && best !== 0) invalid();
  return {available:true, hasScore:value.has_score, best};
}

// A standing comes from the complete server ranking, not the visible top ten.
// Keep community personal bests separate from receipt-verified board bests.
export function parsePlayerStanding(raw, {game, viewerId, authority} = {}) {
  const value = object(raw);
  if (!SLUG.test(game) || !UUID.test(viewerId) || value.available !== true
    || value.game_id !== game || value.user_id !== viewerId
    || !['community_unverified', 'verified_receipt'].includes(value.score_authority)
    || (authority && value.score_authority !== authority)
    || typeof value.has_score !== 'boolean') invalid();
  const result = {
    available:true, game, userId:viewerId, authority:value.score_authority,
    hasScore:value.has_score, best:null, rank:null, nextRank:null, nextScore:null, pointsToNext:null,
  };
  if (!value.has_score) {
    if (['best','rank','next_rank','next_score','points_to_next'].some(key => value[key] !== null)) invalid();
    return result;
  }
  result.best = score(value.best);
  result.rank = integer(value.rank);
  if (result.rank < 1) invalid();
  if (result.rank === 1) {
    if (['next_rank','next_score','points_to_next'].some(key => value[key] !== null)) invalid();
    return result;
  }
  result.nextRank = integer(value.next_rank);
  result.nextScore = score(value.next_score);
  if (result.nextRank !== result.rank - 1 || result.nextScore < result.best) invalid();
  if (result.nextScore === 99999999) {
    if (value.points_to_next !== null) invalid();
  } else {
    result.pointsToNext = integer(value.points_to_next);
    if (result.pointsToNext !== result.nextScore - result.best + 1) invalid();
  }
  return result;
}

export function deriveScoreContext(runScore, baseline, {saved = false} = {}) {
  if (!validRunScore(runScore)) invalid();
  if (baseline?.available !== true) return {available:false};
  if (typeof baseline.hasScore !== 'boolean' || !validRunScore(baseline.best)
    || (!baseline.hasScore && baseline.best !== 0)) invalid();
  const previousBest = baseline.hasScore ? baseline.best : null;
  const improved = previousBest !== null && runScore > previousBest;
  const firstScore = previousBest === null;
  return {
    available:true, previousBest,
    personalBest:saved === true ? Math.max(previousBest ?? 0, runScore) : previousBest,
    improved, tied:previousBest !== null && runScore === previousBest, firstScore,
    improvement:improved ? runScore - previousBest : null,
    saved:saved === true,
  };
}
