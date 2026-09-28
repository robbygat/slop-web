import test from 'node:test';
import assert from 'node:assert/strict';
import {readPublicRouteRows} from '../tools/public-route-read.mjs';

function query(result, {stall = false} = {}) {
  return {
    signal: null, retries: null,
    abortSignal(signal) {this.signal = signal; return this;},
    retry(value) {this.retries = value; return this;},
    then(resolve) {if (!stall) return Promise.resolve(result).then(resolve);},
  };
}

test('successful public route reads return only complete row lists', async () => {
  const rows = [{slug: 'pocket-race'}], read = query({data: rows, error: null});
  assert.equal(await readPublicRouteRows(read, 'published games'), rows);
  assert.equal(read.retries, false);
  assert.equal(read.signal.aborted, false);
});

test('a stalled catalog read is aborted and fails the build with an actionable error', async () => {
  const read = query(null, {stall: true});
  await assert.rejects(readPublicRouteRows(read, 'published games', {timeoutMs: 15}), /Public game route generation failed: published games did not finish.*do not deploy an incomplete route set/);
  assert.equal(read.signal.aborted, true);
  assert.equal(read.retries, false);
});

test('public catalog errors and malformed responses cannot silently drop routes', async () => {
  await assert.rejects(readPublicRouteRows(query({data: null, error: {message: 'unavailable'}}), 'public names'), /public names: unavailable/);
  await assert.rejects(readPublicRouteRows(query({data: null, error: null}), 'public names'), /invalid row list/);
});
