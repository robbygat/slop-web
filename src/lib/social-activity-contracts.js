import {SLUG, UUID, SlopError} from './contracts.js';
import {validRunScore} from './score-contracts.js';

const text = (value, max = 2000) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0,max) : '';
const personKinds = new Set(['crown_lost','follow','like','comment','remix','message']);

export function parseSocialActivity(rows, ownerId) {
  if (!UUID.test(ownerId) || !Array.isArray(rows)) throw new SlopError('invalid_response');
  const ids = new Set();
  return rows.filter(row => row?.recipient_id === ownerId && Number.isSafeInteger(row.id) && row.id > 0
    && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
    && typeof row.kind === 'string' && !ids.has(row.id) && !!ids.add(row.id)).map(row => ({
    id:row.id, kind:text(row.kind,80), actorId:UUID.test(row.actor_id)?row.actor_id:null,
    actorName:text(row.actor_name,80).replace(/^@/, '') || 'Someone',
    gameId:SLUG.test(row.game_id)?row.game_id:null, gameName:text(row.game_name,200),
    conversationId:UUID.test(row.conversation_id)?row.conversation_id:null,
    detail:text(row.detail), metadata:row.metadata&&typeof row.metadata==='object'&&!Array.isArray(row.metadata)?row.metadata:{},
    readAt:typeof row.read_at==='string'&&Number.isFinite(Date.parse(row.read_at))?row.read_at:null,
    createdAt:row.created_at, profile:null,
  }));
}

// A notification is only a target hint. Membership comes from the signed-in
// inbox, and a missing target must not silently open an unrelated conversation.
export function activityConversation(threads, conversationId) {
  if(!UUID.test(conversationId)||!Array.isArray(threads))return null;
  return threads.find(thread=>thread?.id===conversationId)||null;
}

export function activityHasPerson(event) {
  return !!event?.actorId && personKinds.has(event.kind) && event.actorName.toLowerCase() !== 'someone';
}

export function activitySentence(event) {
  const actor = event.actorName.toLowerCase() === 'someone' ? 'Someone' : `@${event.actorName}`;
  return ({crown_lost:`${actor} took your crown.`,crown_won:'You took the crown.',
    follow:`${actor} followed you.`,like:`${actor} liked your game.`,comment:`${actor} left a comment.`,
    remix:`${actor} remixed your game.`,message:`${actor} sent a message.`,
    announcement:text(event.metadata?.title,200)||'From Slop',review_submitted:'A review is ready.',
    reliability_alert:'A game needs attention.',reliability_summary:'Your game update.'})[event.kind] || 'An update for you.';
}

export function activityScores(event) {
  if (!['crown_lost','crown_won'].includes(event.kind)) return null;
  const parse=value=>typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):null;
  const winning=parse(event.metadata?.winning_score),previous=parse(event.metadata?.previous_score);
  if (!validRunScore(winning) || winning <= 0) return null;
  if (event.kind === 'crown_lost' && (!validRunScore(previous) || previous <= 0 || winning <= previous)) return null;
  return {winning, previous:validRunScore(previous)&&previous>0?previous:null};
}

export function filterSocialActivity(events, filter) {
  if (filter === 'crowns') return events.filter(event=>['crown_lost','crown_won'].includes(event.kind));
  if (filter === 'messages') return events.filter(event=>event.kind==='message');
  if (filter === 'social') return events.filter(event=>['follow','like','comment','remix'].includes(event.kind));
  return events;
}
