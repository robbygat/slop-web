import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpConnectionNotice} from '../src/lib/mcp-connection-notice.js';

const now = Date.parse('2026-09-24T12:00:00Z');
const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const notice = {owner_id: owner, connection_id: id};
const active = {connection_id: id, client_name: 'My coding app', status: 'active', expires_at: '2026-10-24T12:00:00Z'};
const message = connections => mcpConnectionNotice(notice, connections, owner, now);

test('approval feedback disappears when a refreshed connection is remotely revoked', () => {
  assert.match(message([active]), /^My coding app is connected\./);
  assert.equal(message([{...active, status: 'revoked'}]), '');
  assert.equal(message([]), '');
  assert.equal(message(undefined), '');
});

test('another active grant cannot keep a revoked grant connected', () => {
  const another = {...active, connection_id: '33333333-3333-4333-8333-333333333333'};
  assert.equal(message([{...active, status: 'revoked'}, another]), '');
  assert.equal(message([another]), '');
});

test('approval feedback expires and cannot cross accounts', () => {
  for (const expired of [
    {...active, status: 'expired'},
    {...active, expires_at: new Date(now).toISOString()},
    {...active, expires_at: 'invalid'},
  ]) assert.equal(message([expired]), '');
  assert.equal(mcpConnectionNotice(notice, [active], null, now), '');
  assert.equal(mcpConnectionNotice(notice, [active], 'another-owner', now), '');
});
