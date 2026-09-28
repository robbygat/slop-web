import test from 'node:test';
import assert from 'node:assert/strict';
import {publicRead} from '../src/lib/public-read.js';

test('public catalog deadline ends a stalled SDK read and aborts its network signal', async () => {
  let signal;
  const query = {abortSignal(value) { signal = value; return new Promise(() => {}); }};
  await assert.rejects(publicRead(query, {timeoutMs: 20}), {code: 'service_unavailable'});
  assert.equal(signal.aborted, true);
});

test('successful public read preserves data and cancels its deadline', async () => {
  let signal;
  const data = [{slug: 'sample'}];
  const query = {abortSignal(value) { signal = value; return Promise.resolve({data, error: null}); }};
  assert.equal(await publicRead(query, {timeoutMs: 20}), data);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(signal.aborted, false);
});

test('schema and access errors remain errors rather than becoming an empty catalog', async () => {
  const query = {abortSignal() {return Promise.resolve({data: null, error: {code: '42501', message: 'Denied'}});}};
  await assert.rejects(publicRead(query), {code: '42501'});
});
