import {SLUG, SlopError} from './contracts.js';

const categories = new Set(['daily', 'weekly', 'starting']);
const objectives = new Set(['qualified_play_count', 'distinct_qualified_games', 'specific_game_play', 'reviewed_publish_count', 'score_threshold', 'verified_crown_takeover']);
const invalid = () => { throw new SlopError('invalid_response'); };
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : invalid();
const text = (value, max = 1000) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : invalid();
const optionalText = value => value == null ? null : text(value);
const integer = value => {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(n) && n >= 0 ? n : invalid();
};
const bool = value => typeof value === 'boolean' ? value : invalid();
const date = value => {
  const source = text(value, 60), parsed = Date.parse(source);
  return /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(source) && Number.isFinite(parsed) ? parsed : invalid();
};
const stringSet = values => {
  if (!Array.isArray(values) || values.length > 2000) invalid();
  const result = values.map(value => text(value, 200));
  return new Set(result).size === result.length ? result : invalid();
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dayKey = value => new Date(value).toISOString().slice(0, 10);

// Mirror the existing mobile Trainer contract. These numbers validate server
// facts; they never turn client activity into earned XP or currency.
export function parseQuestProgress(raw, owner) {
  const value = object(raw), result = {};
  for (const key of ['version', 'total_xp', 'level', 'xp_into_level', 'xp_for_level', 'play_xp', 'creator_play_xp', 'follower_xp', 'publish_xp', 'quest_xp']) result[key] = integer(value[key]);
  result.user_id = text(value.user_id).toLowerCase();
  result.rank = text(value.rank);
  const curve = {1: 100, 2: 50}[result.version];
  if (!curve || result.user_id !== owner.toLowerCase()) invalid();
  const level = Math.floor(Math.sqrt(result.total_xp / curve)) + 1;
  const rank = level < 5 ? 'rookie' : level < 10 ? 'scout' : level < 20 ? 'builder' : level < 35 ? 'ace' : 'master';
  if (result.level !== level || result.rank !== rank || result.xp_into_level !== result.total_xp - curve * (level - 1) ** 2 || result.xp_for_level !== curve * (2 * level - 1)) invalid();
  if (result.play_xp + result.creator_play_xp + result.follower_xp + result.publish_xp + result.quest_xp !== result.total_xp) invalid();
  return result;
}

function reward(raw, {award = false} = {}) {
  const value = object(raw), result = {
    xp: integer(value.xp), coins: integer(value.coins),
    cosmetic_id: optionalText(value.cosmetic_id), cosmetic_name: optionalText(value.cosmetic_name),
  };
  if ((result.cosmetic_id === null) !== (result.cosmetic_name === null)) invalid();
  if (award) {
    result.new_cosmetic_entitlement = bool(value.new_cosmetic_entitlement);
    if (result.new_cosmetic_entitlement && !result.cosmetic_id) invalid();
  } else if (!result.xp && !result.coins && !result.cosmetic_id) invalid();
  return result;
}

export function parseQuestSnapshot(raw, expectedOwner) {
  const value = object(raw), owner = text(expectedOwner).toLowerCase();
  if (integer(value.version) !== 1 || text(value.user_id).toLowerCase() !== owner) invalid();
  const now = date(value.server_now), day = Math.floor(now / 86400000) * 86400000;
  const week = day - ((new Date(day).getUTCDay() + 6) % 7) * 86400000;
  if (value.daily_period_key !== `daily:${dayKey(day)}` || value.weekly_period_key !== `weekly:${dayKey(week)}` || value.starting_period_key !== 'starting' || value.starting_resets_at !== null) invalid();
  if (date(value.daily_resets_at) !== day + 86400000 || date(value.weekly_resets_at) !== week + 7 * 86400000) invalid();
  const progress = parseQuestProgress(value.trainer_progress, owner), owned = stringSet(value.owned_cosmetic_ids);
  if (!Array.isArray(value.quests) || value.quests.length > 200) invalid();
  const seen = new Set(), present = new Set();
  const quests = value.quests.map(rawQuest => {
    const q = object(rawQuest), result = {
      id: text(q.id, 160), category: text(q.category), title: text(q.title, 300), description: text(q.description),
      objective_kind: text(q.objective_kind), target: integer(q.target), progress: integer(q.progress),
      completed: bool(q.completed), claimed: bool(q.claimed), claimed_at: q.claimed_at == null ? null : text(q.claimed_at),
      game_id: optionalText(q.game_id), game_title: optionalText(q.game_title), reward: reward(q.reward),
    };
    if (seen.has(result.id) || !categories.has(result.category) || !objectives.has(result.objective_kind) || result.target < 1 || result.progress > result.target) invalid();
    seen.add(result.id); present.add(result.category);
    if (result.completed !== (result.progress === result.target) || result.claimed && !result.completed || result.claimed !== (result.claimed_at !== null)) invalid();
    if (result.claimed_at && date(result.claimed_at) > now) invalid();
    const specific = ['specific_game_play', 'score_threshold'].includes(result.objective_kind);
    if ((result.game_id === null) !== (result.game_title === null) || specific !== (result.game_id !== null)) invalid();
    if (result.id === 'daily-golden-game' && (result.category !== 'daily' || result.objective_kind !== 'specific_game_play' || result.game_id !== 'hidden:daily' || !['Hidden Golden Game', 'Hidden Featured Game'].includes(result.game_title))) invalid();
    if (result.claimed && result.reward.cosmetic_id && !owned.includes(result.reward.cosmetic_id)) invalid();
    return result;
  });
  if (present.size !== 3) invalid();
  return {
    version: 1, user_id: owner, server_now: value.server_now,
    daily_period_key: value.daily_period_key, daily_resets_at: value.daily_resets_at,
    weekly_period_key: value.weekly_period_key, weekly_resets_at: value.weekly_resets_at,
    starting_period_key: 'starting', starting_resets_at: null,
    trainer_progress: progress, coin_balance: integer(value.coin_balance), owned_cosmetic_ids: owned, quests,
  };
}

export function parseQuestClaim(raw, expectedOwner, expectedQuest) {
  const value = object(raw), owner = text(expectedOwner).toLowerCase(), questId = text(expectedQuest, 160);
  if (integer(value.version) !== 1 || text(value.user_id).toLowerCase() !== owner || value.quest_id !== questId || !['claimed', 'already_claimed', 'not_complete'].includes(value.code)) invalid();
  const snapshot = parseQuestSnapshot(value.snapshot, owner), progress = parseQuestProgress(value.trainer_progress, owner);
  const awarded = reward(value.awarded, {award: true}), owned = stringSet(value.owned_cosmetic_ids);
  if (date(value.server_now) !== date(snapshot.server_now) || integer(value.coin_balance) !== snapshot.coin_balance || !same(progress, snapshot.trainer_progress) || !same([...owned].sort(), [...snapshot.owned_cosmetic_ids].sort())) invalid();
  const quest = snapshot.quests.find(q => q.id === questId);
  if (!quest) invalid();
  if (value.code === 'not_complete') {
    if (value.claimed_at != null || quest.completed || awarded.xp || awarded.coins || awarded.cosmetic_id || awarded.new_cosmetic_entitlement) invalid();
  } else {
    if (!quest.claimed || date(value.claimed_at) !== date(quest.claimed_at) || date(value.claimed_at) > date(value.server_now)) invalid();
    for (const key of ['xp', 'coins', 'cosmetic_id', 'cosmetic_name']) if (awarded[key] !== quest.reward[key]) invalid();
    if (awarded.cosmetic_id && !owned.includes(awarded.cosmetic_id)) invalid();
  }
  return {code: value.code, quest_id: questId, awarded, snapshot};
}

export function playerQuests(snapshot, category) {
  return snapshot.quests.filter(quest => quest.category === category && quest.objective_kind !== 'reviewed_publish_count');
}
export function questAction(quest) {
  if (quest.objective_kind === 'reviewed_publish_count') return {href: '#/connect', label: 'Set up MCP'};
  if (quest.game_id && quest.game_id !== 'hidden:daily' && SLUG.test(quest.game_id)) return {href: `#/home?game=${encodeURIComponent(quest.game_id)}`, label: 'View game'};
  return {href: '#/feed', label: 'Find a game'};
}
export function questExpired(snapshot, quest, serverNow) {
  if (quest.category === 'starting') return false;
  return serverNow >= date(snapshot[`${quest.category}_resets_at`]);
}

// Production wraps these operations in the existing verified-owner guard.
// No caller-supplied owner, XP, progress or reward reaches either RPC.
export function createQuestService({runAsOwner, readResult}) {
  const query = (client, name, params) => readResult(client.rpc(name, params).abortSignal(AbortSignal.timeout(12000)));
  return {
    load: () => runAsOwner(async (owner, client) => parseQuestSnapshot(await query(client, 'my_quests'), owner)),
    claim: questId => runAsOwner(async (owner, client) => {
      const id = text(questId, 160);
      return parseQuestClaim(await query(client, 'claim_quest', {p_quest_id: id}), owner, id);
    }),
  };
}
