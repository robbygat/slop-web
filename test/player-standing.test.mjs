import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePersonalBest, parsePlayerStanding, deriveScoreContext} from '../src/lib/player-standing.js';

const viewerId = '11111111-1111-4111-8111-111111111111';
const expected = {game:'night-drift', viewerId};
const standing = {
  available:true, game_id:expected.game, user_id:viewerId,
  score_authority:'community_unverified', has_score:true,
  best:800, rank:184, next_rank:183, next_score:900, points_to_next:101,
};

test('personal best distinguishes an exact saved zero from no previous run', () => {
  assert.deepEqual(parsePersonalBest({available:true,has_score:false,best:0}), {available:true,hasScore:false,best:0});
  assert.deepEqual(parsePersonalBest([{available:true,has_score:true,best:'0'}]), {available:true,hasScore:true,best:0});
  for (const value of [null, [], {available:false,has_score:false,best:0}, {available:true,has_score:false,best:10}, {available:true,has_score:true,best:100000000}]) {
    assert.throws(() => parsePersonalBest(value), error => error.code === 'invalid_response');
  }
});

test('server standing retains an actual rank far beyond the visible top ten', () => {
  assert.deepEqual(parsePlayerStanding(standing, expected), {
    available:true, game:'night-drift', userId:viewerId, authority:'community_unverified',
    hasScore:true, best:800, rank:184, nextRank:183, nextScore:900, pointsToNext:101,
  });
});

test('standing cannot cross an owner, game or leaderboard authority', () => {
  for (const value of [
    {...standing,user_id:'22222222-2222-4222-8222-222222222222'},
    {...standing,game_id:'other-game'}, {...standing,score_authority:'unknown'},
    {...standing,rank:0}, {...standing,next_rank:10}, {...standing,next_score:700},
    {...standing,points_to_next:100}, {...standing,best:Infinity},
  ]) assert.throws(() => parsePlayerStanding(value,expected), error => error.code === 'invalid_response');
  assert.throws(() => parsePlayerStanding(standing,{...expected,authority:'verified_receipt'}));
  assert.equal(parsePlayerStanding({...standing,score_authority:'verified_receipt'},{...expected,authority:'verified_receipt'}).authority,'verified_receipt');
});

test('unranked players and rank one have no invented next target', () => {
  const noScore = {...standing,has_score:false,best:null,rank:null,next_rank:null,next_score:null,points_to_next:null};
  assert.equal(parsePlayerStanding(noScore,expected).rank,null);
  assert.throws(() => parsePlayerStanding({...noScore,rank:11},expected));
  const champion = {...standing,rank:1,next_rank:null,next_score:null,points_to_next:null};
  assert.equal(parsePlayerStanding(champion,expected).pointsToNext,null);
  assert.throws(() => parsePlayerStanding({...champion,next_rank:0},expected));
});

test('tied scores need one extra point; a capped score has no reachable next target', () => {
  const tied = parsePlayerStanding({...standing,next_score:800,points_to_next:1},expected);
  assert.equal(tied.pointsToNext,1);
  const capped = {...standing,next_score:99999999,points_to_next:null};
  assert.equal(parsePlayerStanding(capped,expected).pointsToNext,null);
  assert.throws(() => parsePlayerStanding({...capped,points_to_next:99999200},expected));
});

test('new-best context depends on an exact pre-save baseline and successful saving', () => {
  const baseline = {available:true,hasScore:true,best:800};
  assert.deepEqual(deriveScoreContext(900,baseline), {
    available:true,previousBest:800,personalBest:800,improved:true,tied:false,firstScore:false,improvement:100,saved:false,
  });
  assert.equal(deriveScoreContext(900,baseline,{saved:true}).personalBest,900);
  assert.equal(deriveScoreContext(800,baseline,{saved:true}).tied,true);
  assert.equal(deriveScoreContext(700,baseline,{saved:true}).personalBest,800);
  assert.deepEqual(deriveScoreContext(900,null,{saved:true}),{available:false});
});

test('first saved run and a tied zero are distinct; a failed run does not become a saved best', () => {
  const first = {available:true,hasScore:false,best:0};
  assert.equal(deriveScoreContext(0,first).personalBest,null);
  assert.equal(deriveScoreContext(0,first,{saved:true}).firstScore,true);
  assert.equal(deriveScoreContext(0,{available:true,hasScore:true,best:0},{saved:true}).tied,true);
  assert.throws(() => deriveScoreContext(100000000,first));
});
