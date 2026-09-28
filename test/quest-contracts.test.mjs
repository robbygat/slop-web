import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuestSnapshot, parseQuestClaim, parseQuestProgress, playerQuests, questAction, questExpired, createQuestService} from '../src/lib/quest-contracts.js';

const owner = '11111111-1111-4111-8111-111111111111';
function progress(xp = 150, version = 2) {
  const curve = version === 1 ? 100 : 50, level = Math.floor(Math.sqrt(xp / curve)) + 1;
  return {version, user_id: owner, total_xp: xp, level, xp_into_level: xp - curve * (level - 1) ** 2, xp_for_level: curve * (2 * level - 1), rank: 'rookie', play_xp: 100, creator_play_xp: 0, follower_xp: 0, publish_xp: 0, quest_xp: xp - 100};
}
const quest = (id, category, changes = {}) => ({id, category, title: `Quest ${id}`, description: 'Complete runs in the app.', objective_kind: 'qualified_play_count', target: 3, progress: 1, completed: false, claimed: false, claimed_at: null, game_id: null, game_title: null, reward: {xp: 50, coins: 20, cosmetic_id: null, cosmetic_name: null}, ...changes});
export function snapshot() {
  return {version: 1, user_id: owner, server_now: '2026-09-28T12:00:00Z', daily_period_key: 'daily:2026-09-28', daily_resets_at: '2026-09-29T00:00:00Z', weekly_period_key: 'weekly:2026-09-28', weekly_resets_at: '2026-10-05T00:00:00Z', starting_period_key: 'starting', starting_resets_at: null, trainer_progress: progress(), coin_balance: 80, owned_cosmetic_ids: [], quests: [quest('daily-play', 'daily', {progress: 3, completed: true}), quest('weekly-play', 'weekly'), quest('starting-play', 'starting'), quest('starting-create', 'starting', {objective_kind: 'reviewed_publish_count'})]};
}
function receipt(code = 'claimed') {
  const value = snapshot(), daily = value.quests[0];
  let awarded;
  if (code === 'not_complete') {
    daily.progress = 1; daily.completed = false;
    awarded = {xp: 0, coins: 0, cosmetic_id: null, cosmetic_name: null, new_cosmetic_entitlement: false};
  } else {
    daily.claimed = true; daily.claimed_at = value.server_now;
    value.trainer_progress = progress(200); value.coin_balance = 100;
    awarded = {...daily.reward, new_cosmetic_entitlement: false};
  }
  return {version: 1, user_id: owner, server_now: value.server_now, quest_id: daily.id, code, claimed_at: daily.claimed_at, awarded, trainer_progress: structuredClone(value.trainer_progress), coin_balance: value.coin_balance, owned_cosmetic_ids: [], snapshot: value};
}

test('owner-bound snapshot renders real player quests and verified Trainer progress', () => {
  const parsed = parseQuestSnapshot(snapshot(), owner);
  assert.equal(parsed.coin_balance, 80);
  assert.equal(parsed.trainer_progress.level, 2);
  assert.deepEqual(playerQuests(parsed, 'starting').map(q => q.id), ['starting-play']);
  assert.deepEqual(playerQuests(parsed, 'daily').map(q => q.id), ['daily-play']);
  assert.equal(parseQuestProgress(progress(150, 1), owner).level, 2);
  assert.equal(parseQuestProgress({...progress(), total_xp: '150'}, owner).total_xp, 150);
});

test('another owner, malformed periods, duplicate ids and contradictory progress are rejected', () => {
  const cases = [
    value => value.user_id = '22222222-2222-4222-8222-222222222222',
    value => value.version = 2,
    value => value.daily_resets_at = '2026-09-30T00:00:00Z',
    value => value.weekly_period_key = 'weekly:2026-09-27',
    value => delete value.starting_resets_at,
    value => value.quests.push(value.quests[0]),
    value => value.quests = value.quests.filter(q => q.category !== 'weekly'),
    value => value.quests[0].progress = 2,
    value => value.quests[0].claimed = true,
    value => value.coin_balance = -1,
    value => value.trainer_progress.user_id = 'other-owner',
    value => value.trainer_progress.total_xp = 200,
    value => delete value.trainer_progress.quest_xp,
    value => value.trainer_progress.version = 3,
    value => value.trainer_progress.rank = 'master',
  ];
  for (const mutate of cases) {const value = snapshot(); mutate(value); assert.throws(() => parseQuestSnapshot(value, owner));}
});

test('hidden daily target never becomes a direct route and malformed target leaks fail', () => {
  const value = snapshot();
  value.quests[0] = quest('daily-golden-game', 'daily', {objective_kind: 'specific_game_play', game_id: 'hidden:daily', game_title: 'Hidden Golden Game'});
  const parsed = parseQuestSnapshot(value, owner);
  assert.deepEqual(questAction(parsed.quests[0]), {href: '#/feed', label: 'Find a game'});
  value.quests[0].game_id = 'leaked-target';
  assert.throws(() => parseQuestSnapshot(value, owner));
  assert.equal(questAction({...parsed.quests[0], game_id: 'javascript:alert(1)'}).href, '#/feed');
  assert.equal(questAction({...parsed.quests[0], game_id: 'app:legacy-game'}).href, '#/feed');
  assert.equal(questAction({...parsed.quests[0], game_id: 'real-game'}).href, '#/home?game=real-game');
});

test('claimed and replayed receipts replace absolute balances without awarding twice', () => {
  const claimed = parseQuestClaim(receipt(), owner, 'daily-play');
  const replayed = parseQuestClaim(receipt('already_claimed'), owner, 'daily-play');
  assert.equal(claimed.snapshot.coin_balance, 100);
  assert.equal(claimed.snapshot.trainer_progress.total_xp, 200);
  assert.deepEqual(replayed.snapshot, claimed.snapshot);
  assert.equal(replayed.code, 'already_claimed');
  assert.equal(parseQuestClaim(receipt('not_complete'), owner, 'daily-play').awarded.coins, 0);
});

test('mismatched owner, quest, reward, inventory, and nested account facts cannot update state', () => {
  const cases = [
    value => value.quest_id = 'weekly-play',
    value => value.user_id = 'other-owner',
    value => value.snapshot.user_id = 'other-owner',
    value => value.coin_balance = 5000,
    value => value.awarded.coins = 999,
    value => value.trainer_progress = progress(),
    value => value.owned_cosmetic_ids = ['phantom-reward'],
    value => value.claimed_at = null,
    value => value.snapshot.quests[0].claimed = false,
    value => value.server_now = '2026-09-28T13:00:00Z',
    value => value.code = 'invented-success',
  ];
  for (const mutate of cases) {const value = receipt(); mutate(value); assert.throws(() => parseQuestClaim(value, owner, 'daily-play'));}
  const incomplete = receipt('not_complete'); incomplete.awarded.coins = 1;
  assert.throws(() => parseQuestClaim(incomplete, owner, 'daily-play'));
});

test('cosmetic claims require matching awarded entitlement and snapshot inventory', () => {
  const value = receipt();
  value.snapshot.quests[0].reward = {...value.snapshot.quests[0].reward, cosmetic_id: 'hat', cosmetic_name: 'A Hat'};
  value.awarded = {...value.awarded, cosmetic_id: 'hat', cosmetic_name: 'A Hat', new_cosmetic_entitlement: true};
  assert.throws(() => parseQuestClaim(value, owner, 'daily-play'));
  value.owned_cosmetic_ids = ['hat']; value.snapshot.owned_cosmetic_ids = ['hat'];
  assert.equal(parseQuestClaim(value, owner, 'daily-play').awarded.cosmetic_id, 'hat');
});

test('period expiration uses server-relative time and starting quests do not expire', () => {
  const value = parseQuestSnapshot(snapshot(), owner);
  const reset = Date.parse(value.daily_resets_at);
  assert.equal(questExpired(value, value.quests[0], reset - 1), false);
  assert.equal(questExpired(value, value.quests[0], reset), true);
  assert.equal(questExpired(value, value.quests[2], reset + 1e10), false);
});

test('quest API queries authority and sends only quest id for claims', async () => {
  const calls = [];
  const client = {rpc(name, params) {
    calls.push({name, params});
    return {abortSignal(signal) {assert.ok(signal instanceof AbortSignal); return Promise.resolve({data: name === 'my_quests' ? snapshot() : receipt()});}};
  }};
  const service = createQuestService({runAsOwner: work => work(owner, client), readResult: query => query.then(r => r.data)});
  assert.equal((await service.load()).user_id, owner);
  assert.equal((await service.claim('daily-play')).snapshot.coin_balance, 100);
  assert.deepEqual(calls, [{name: 'my_quests', params: undefined}, {name: 'claim_quest', params: {p_quest_id: 'daily-play'}}]);
  await assert.rejects(service.claim(''));
  assert.equal(calls.length, 2);
});
