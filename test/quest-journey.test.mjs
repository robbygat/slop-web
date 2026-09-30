import test from 'node:test';
import assert from 'node:assert/strict';
import {questJourney, questTimeLeft} from '../src/lib/quest-journey.js';

const reward = {xp: 50, coins: 20, cosmetic_id: null};
const quest = (id, changes = {}) => ({id, category: 'daily', objective_kind: 'qualified_play_count', target: 4, progress: 0, completed: false, claimed: false, reward, ...changes});
const now = Date.parse('2026-09-30T12:00:00Z');
const snapshot = quests => ({daily_resets_at: '2026-10-01T00:00:00Z', weekly_resets_at: '2026-10-05T00:00:00Z', quests});

test('next mission prioritizes a real uncollected reward, then nearest verified progress', () => {
  const data = snapshot([quest('zero'), quest('near', {progress: 3}), quest('ready', {progress: 4, completed: true}), quest('done', {progress: 4, completed: true, claimed: true}), quest('creator', {objective_kind: 'reviewed_publish_count'})]);
  const path = questJourney(data, 'daily', now);
  assert.equal(path.next.id, 'ready');
  assert.deepEqual(path.unfinished.map(q => q.id), ['near', 'zero']);
  assert.deepEqual(path.collected.map(q => q.id), ['done']);
  assert.deepEqual(path.rewards, {xp: 150, coins: 60, looks: 0});
  assert.equal(data.quests[0].progress, 0);
  const afterClaim = structuredClone(data);
  afterClaim.quests[2].claimed = true;
  assert.equal(questJourney(afterClaim, 'daily', now).next.id, 'near');
});

test('expired periods never recommend a reward or imply it remains available', () => {
  const data = snapshot([quest('ready', {progress: 4, completed: true}), quest('playing', {progress: 3}), quest('done', {progress: 4, completed: true, claimed: true}), quest('starter', {category: 'starting'})]);
  const path = questJourney(data, 'daily', Date.parse(data.daily_resets_at));
  assert.equal(path.next, null);
  assert.equal(path.ready.length, 0);
  assert.equal(path.unfinished.length, 0);
  assert.deepEqual(path.refreshing.map(q => q.id), ['ready', 'playing']);
  assert.equal(path.collected.length, 1);
  assert.deepEqual(path.rewards, {xp: 0, coins: 0, looks: 0});
  assert.equal(questJourney(data, 'starting', now + 1e10).next.id, 'starter');
});

test('period rewards are available rewards, never collected balance or predicted XP', () => {
  const path = questJourney(snapshot([quest('look', {reward: {...reward, cosmetic_id: 'hat'}}), quest('weekly', {category: 'weekly'}), quest('done', {completed: true, claimed: true, reward: {xp: 9999, coins: 9999, cosmetic_id: 'owned'}})]), 'daily', now);
  assert.deepEqual(path.rewards, {xp: 50, coins: 20, looks: 1});
  assert.equal(path.next.progress, 0);
  const repeated = questJourney(snapshot([quest('a', {reward: {...reward, cosmetic_id: 'hat'}}), quest('b', {reward: {...reward, cosmetic_id: 'hat'}})]), 'daily', now);
  assert.equal(repeated.rewards.looks, 1);
});

test('countdown follows the supplied server clock and handles permanent and expired goals', () => {
  const reset = '2026-10-01T00:00:00Z';
  assert.equal(questTimeLeft(reset, now), 'Resets in 12h 0m');
  assert.equal(questTimeLeft(reset, Date.parse(reset) - 15 * 60000), 'Resets in 15m');
  assert.equal(questTimeLeft(reset, Date.parse(reset)), 'New quests are on their way');
  assert.equal(questTimeLeft(null, now), 'No time limit');
  assert.equal(questTimeLeft('2026-10-03T00:00:00Z', now), 'Resets in 2d 12h');
});
