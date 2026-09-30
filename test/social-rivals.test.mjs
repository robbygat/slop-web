import test from 'node:test';
import assert from 'node:assert/strict';
import {crownBoardEntries, filterCrownBoard, rivalChallenge} from '../src/lib/social-rivals.js';

const holder = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const games = [{slug:'first-game', name:'First Game'}, {slug:'second-game', name:'Second Game'}];
const row = (game_key, holder_user_id = holder) => ({game_key, holder_user_id, holder_username:'rival', score:42, score_authority:'community_unverified', is_creator_fallback:false});

test('crown boards join authoritative holders to games even when response order differs', () => {
  const entries = crownBoardEntries(games, [row('second-game', second), row('first-game')]);
  assert.deepEqual(entries.map(entry => [entry.game.slug, entry.holder.user_id, entry.state]), [['first-game',holder,'crowned'],['second-game',second,'crowned']]);
  assert.equal(crownBoardEntries([games[0],games[0]], [row('first-game')]).length, 1);
});

test('missing, duplicate and unknown crown rows stay unavailable; creator fallback stays open', () => {
  for (const rows of [[], [row('other-game')], [row('first-game'), row('first-game')], [{...row('first-game'), score_authority:'unknown'}], [{...row('first-game'), score:0}]]) {
    assert.equal(crownBoardEntries([games[0]], rows)[0].state, 'unavailable');
    assert.equal(crownBoardEntries([games[0]], rows)[0].holder, null);
  }
  const fallback = {...row('first-game'), is_creator_fallback:true, score:null};
  assert.deepEqual(crownBoardEntries([games[0]], [fallback])[0], {game:games[0],holder:null,state:'open'});
  assert.equal(crownBoardEntries([games[0]], [{...fallback,score:99}])[0].state, 'unavailable');
  assert.throws(() => crownBoardEntries(games, {}), {code:'invalid_response'});
});

test('following and your crowns use holder identity, preserving the catalog order', () => {
  const entries = crownBoardEntries(games, [row('first-game'),row('second-game',second)]);
  assert.deepEqual(filterCrownBoard(entries, {scope:'following',following:new Set([second])}).map(entry=>entry.game.slug), ['second-game']);
  assert.deepEqual(filterCrownBoard(entries, {scope:'mine',userId:holder}).map(entry=>entry.game.slug), ['first-game']);
  assert.deepEqual(filterCrownBoard(entries, {scope:'mine'}), []);
});

test('challenge copy names the actual target and uses the canonical playable game link', () => {
  const entry = crownBoardEntries([games[0]], [row('first-game')])[0];
  assert.equal(rivalChallenge(entry), 'The score to chase: 42 by @rival in First Game.\nPlay: https://slop.game/first-game');
  assert.throws(() => rivalChallenge({...entry,state:'open',holder:null}), {code:'invalid_response'});
});
