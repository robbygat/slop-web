import {playerQuests, questExpired} from './quest-contracts.js';

// A presentation of verified quests, never a second source of earned progress.
export function questJourney(snapshot, category, serverNow) {
  const quests = playerQuests(snapshot, category);
  const expired = quest => questExpired(snapshot, quest, serverNow);
  const ready = quests.filter(quest => !quest.claimed && quest.completed && !expired(quest));
  const unfinished = quests.filter(quest => !quest.claimed && !quest.completed && !expired(quest))
    .sort((a, b) => b.progress / b.target - a.progress / a.target);
  const collected = quests.filter(quest => quest.claimed);
  const refreshing = quests.filter(quest => !quest.claimed && expired(quest));
  const next = ready[0] || unfinished[0] || null;
  const remaining = [...ready, ...unfinished];
  const rewards = remaining.reduce((total, quest) => ({
    xp: total.xp + quest.reward.xp,
    coins: total.coins + quest.reward.coins,
  }), {xp: 0, coins: 0});
  rewards.looks = new Set(remaining.map(quest => quest.reward.cosmetic_id).filter(Boolean)).size;
  return {quests, ready, unfinished, collected, refreshing, next, rewards};
}

export function questTimeLeft(resetAt, serverNow) {
  if (!resetAt) return 'No time limit';
  const minutes = Math.ceil((Date.parse(resetAt) - serverNow) / 60000);
  if (minutes <= 0) return 'New quests are on their way';
  if (minutes < 60) return `Resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Resets in ${hours}h ${minutes % 60}m` : `Resets in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}
