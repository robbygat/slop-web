import test from 'node:test';
import assert from 'node:assert/strict';
import {SlopBridge} from '../client.mjs';

const receipt = {submission_id: '11111111-1111-4111-8111-111111111111', status: 'awaiting_confirmation'};
const body = {project_id: '22222222-2222-4222-8222-222222222222', request_id: '33333333-3333-4333-8333-333333333333',
  revision: 1, files: {'index.html': '<canvas></canvas>'}};
const world = {...body, files: {...body.files, 'slop.spec.json': '{"persistent":true}'}};

function client(fetcher) {
  return new SlopBridge({base: 'https://api.slop.game/functions/v1/slop-mcp',
    credentials: {read: async () => ({base: 'https://api.slop.game/functions/v1/slop-mcp', token: 'private-test-token'})}, fetcher});
}

function recordTimeouts(t) {
  const durations = [];
  const original = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', ms => {
    durations.push(ms);
    return original(ms);
  });
  return durations;
}

test('persistent draft gets a bounded 120s signal without changing request or authorization', async t => {
  const durations = recordTimeouts(t);
  let calls = 0;
  const before = JSON.stringify(world);
  const bridge = client(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.slop.game/functions/v1/slop-mcp/agent/drafts');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, 'Bearer private-test-token');
    assert.equal(options.body, before);
    assert.equal(options.signal.aborted, false);
    return Response.json(receipt);
  });
  assert.deepEqual(await bridge.authorized('/agent/drafts', world), receipt);
  assert.deepEqual(durations, [120_000]);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(world), before);
});

test('large serialized draft gets 120s based on UTF8 bytes, not character count', async t => {
  const durations = recordTimeouts(t);
  const input = {...body, files: {'game.js': 'é'.repeat(1_000_000)}};
  assert.ok(JSON.stringify(input).length < 2_000_000);
  const bridge = client(async () => Response.json(receipt));
  await bridge.authorized('/agent/drafts', input);
  assert.deepEqual(durations, [120_000]);
});

test('ordinary small drafts, status, pairing and other writes retain 30s', async t => {
  const durations = recordTimeouts(t);
  const bridge = client(async () => Response.json(receipt));
  const cases = [
    ['/agent/drafts', body],
    ['/agent/drafts', {...body, files: {'slop.spec.json': '{"persistent":false}'}}],
    ['/agent/drafts', {...body, files: {'slop.spec.json': 'broken'}}],
    ['/agent/drafts', {...body, persistent: true}],
    ['/agent/drafts', undefined],
    ['/agent/status', undefined],
    ['/pair/start', world],
    ['/agent/publish', world],
    ['/agent/revoke', world],
    ['/agent/drafts/other', world],
  ];
  for (const [path, payload] of cases) await bridge.request(path, 'token', payload);
  assert.deepEqual(durations, cases.map(() => 30_000));
});

test('already-over-limit wire payload does not gain the extended timeout', async t => {
  const durations = recordTimeouts(t);
  const bridge = client(async () => Response.json({code: 'request_too_large'}, {status: 413}));
  await assert.rejects(bridge.request('/agent/drafts', 'token', {...world, description: 'x'.repeat(70_000_000)}),
    error => error.code === 'request_too_large' && !error.outcomeUnknown);
  assert.deepEqual(durations, [30_000]);
});

test('draft timeout or network loss is ambiguous and never automatically retried', async t => {
  for (const name of ['TimeoutError', 'AbortError', 'TypeError']) {
    let calls = 0;
    const bridge = client(async () => {
      calls++;
      const error = new Error('private-test-token https://private.invalid/secret');
      error.name = name;
      throw error;
    });
    await assert.rejects(bridge.authorized('/agent/drafts', world), error => {
      assert.equal(error.code, 'draft_outcome_unknown');
      assert.equal(error.outcomeUnknown, true);
      assert.match(error.message, /Do not resend automatically/);
      assert.match(error.message, /slop_draft_status/);
      assert.match(error.message, /identical files, project_id, revision and request_id/);
      assert.doesNotMatch(error.message, /private-test-token|private.invalid|secret/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('ambiguous HTTP failures preserve the server code but replace unsafe generic retry advice', async () => {
  for (const status of [408, 500, 502, 503, 504]) {
    let calls = 0;
    const bridge = client(async () => {
      calls++;
      return Response.json({code: 'upstream_unavailable'}, {status});
    });
    await assert.rejects(bridge.authorized('/agent/drafts', world), error => {
      assert.equal(error.code, 'upstream_unavailable');
      assert.equal(error.outcomeUnknown, true);
      assert.match(error.message, /slop_draft_status/);
      assert.doesNotMatch(error.message, /Retry shortly/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('explicit auth and validation rejection stay explicit; ordinary failures stay unchanged', async () => {
  for (const [status, code] of [[403, 'invalid_connection'], [400, 'invalid_bundle'], [409, 'request_conflict'], [429, 'rate_limited']]) {
    const bridge = client(async () => Response.json({code}, {status}));
    await assert.rejects(bridge.authorized('/agent/drafts', world), error => {
      assert.equal(error.code, code);
      assert.equal(error.outcomeUnknown, undefined);
      assert.doesNotMatch(error.message, /delivery outcome is unknown/);
      return true;
    });
  }
  const failure = new Error('ordinary fetch failure');
  const bridge = client(async () => { throw failure; });
  await assert.rejects(bridge.request('/agent/status', 'token'), error => error === failure);
});

test('lost or invalid successful receipt is not treated as successful draft delivery', async () => {
  for (const fetcher of [
    async () => new Response('not JSON', {status: 200}),
    async () => new Response(new ReadableStream({start(controller) { controller.error(Error('aborted')); }}), {status: 200}),
  ]) {
    const bridge = client(fetcher);
    await assert.rejects(bridge.authorized('/agent/drafts', world), error =>
      error.code === 'draft_outcome_unknown' && /unreadable receipt/.test(error.message));
  }
});
