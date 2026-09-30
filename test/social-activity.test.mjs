import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSocialActivity,activityHasPerson,activitySentence,activityScores,filterSocialActivity,activityConversation} from '../src/lib/social-activity-contracts.js';
const owner='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
const row={id:14,recipient_id:owner,actor_id:actor,actor_name:'rival',kind:'crown_lost',game_id:'great-game',game_name:'Great Game',created_at:'2026-09-30T01:00:00Z',read_at:null,metadata:{winning_score:42,previous_score:30}};
const event=()=>parseSocialActivity([row],owner)[0];
test('activity excludes other recipients, malformed dates and ids and duplicate events',()=>{
  assert.equal(parseSocialActivity([row,row,{...row,id:15,recipient_id:actor},{...row,id:16,created_at:'invalid'},{...row,id:'17'}],owner).length,1);
  assert.throws(()=>parseSocialActivity([row],'unknown'),{code:'invalid_response'});
  assert.equal(parseSocialActivity([{...row,actor_id:'invented',game_id:'javascript:bad'}],owner)[0].actorId,null);
  assert.equal(parseSocialActivity([{...row,actor_id:'invented',game_id:'javascript:bad'}],owner)[0].gameId,null);
  assert.equal(parseSocialActivity([{...row,game_id:123}],owner)[0].gameId,null);
});
test('lost crowns retain the actor and the actual winning and previous scores',()=>{
  assert.equal(activitySentence(event()),'@rival took your crown.');
  assert.deepEqual(activityScores(event()),{winning:42,previous:30});
  assert.equal(activityHasPerson(event()),true);
  assert.equal(activityHasPerson({...event(),kind:'crown_won'}),false);
  assert.equal(activityHasPerson({...event(),actorId:null}),false);
  assert.equal(activityScores({...event(),metadata:{winning_score:20,previous_score:30}}),null);
  assert.equal(activityScores({...event(),metadata:{winning_score:42,previous_score:'not a score'}}),null);
});
test('crown, social and message filters keep genuine event kinds separate',()=>{
  const events=[event(),{...event(),id:15,kind:'message'},{...event(),id:16,kind:'follow'}];
  assert.deepEqual(filterSocialActivity(events,'crowns').map(event=>event.id),[14]);
  assert.deepEqual(filterSocialActivity(events,'messages').map(event=>event.id),[15]);
  assert.deepEqual(filterSocialActivity(events,'social').map(event=>event.id),[16]);
});

test('message notifications preserve only valid conversation IDs and open an exact inbox membership',()=>{
  const conversation='33333333-3333-4333-8333-333333333333';
  const event=parseSocialActivity([{...row,kind:'message',conversation_id:conversation}],owner)[0];
  assert.equal(event.conversationId,conversation);
  for(const invalid of [null,'javascript:alert(1)','../inbox','not-a-conversation'])assert.equal(parseSocialActivity([{...row,kind:'message',conversation_id:invalid}],owner)[0].conversationId,null);
  const unrelated={id:'44444444-4444-4444-8444-444444444444',title:'Another conversation'},target={id:conversation,title:'The notification conversation'};
  assert.equal(activityConversation([unrelated,target],event.conversationId),target);
  assert.equal(activityConversation([unrelated],event.conversationId),null);
  assert.equal(activityConversation([unrelated,target],'invalid'),null);
});
