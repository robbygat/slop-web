import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_TABS, isLegacyCreationRoute, playerRoutePath} from '../src/lib/player-navigation.js';
import {gameNameFromPath, validGameName, canonicalGameUrl} from '../src/lib/game-links.js';

test('five primary destinations keep Play centered and MCP creation directly accessible', () => {
  assert.deepEqual(PLAYER_TABS.map(([id]) => id), ['home', 'social', 'feed', 'quests', 'connect']);
  assert.equal(new Set(PLAYER_TABS.map(([id]) => id)).size, PLAYER_TABS.length);
});

test('bookmarked creation and nested edit/remix routes hand off to MCP connections', () => {
  for (const path of ['build', 'build/creator', 'create', 'studio', 'studio/edit', 'agent/remix', 'agent/edit']) {
    assert.equal(isLegacyCreationRoute(path), true);
    assert.equal(playerRoutePath(path), 'connect');
  }
  for (const path of ['quests', 'feed', 'social', 'shop', 'you', 'connect', 'building-blocks']) {
    assert.equal(isLegacyCreationRoute(path), false);
    assert.equal(playerRoutePath(path), path);
  }
  assert.equal(playerRoutePath('play'), 'home');
  assert.equal(playerRoutePath(''), 'home');
});

test('quest and legacy creator routes cannot be mistaken for claimed game names', () => {
  for (const name of ['quests', 'build', 'studio']) {
    assert.equal(validGameName(name), false);
    assert.equal(gameNameFromPath(`/${name}`), null);
    assert.equal(canonicalGameUrl({slug:name}), `https://slop.game/g/${name}`);
  }
  assert.equal(gameNameFromPath('/quest-runner'), 'quest-runner');
});
