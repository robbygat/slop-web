import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_FRAMES, clipWindow, createClipRing } from '../src/lib/clip-ring.js';
import { captureBackground } from '../src/lib/capture.js';

const frame = (n) => `data:image/jpeg;base64,/9j/${n}`;

test('the ring keeps only recent real frames and reports when a moving clip exists', () => {
  const ring = createClipRing(20);
  let state;
  for (let i = 0; i < 30; i++) state = ring.push(frame(i % 7), 'rgb(1, 2, 3)');
  ring.push('not a frame');
  assert.equal(ring.frames().length, 20);
  assert.equal(state.moving, true);
  assert.equal(state.poster, frame(29 % 7));
});

test('a clip that ends on a frozen screen still publishes the last lively moment', () => {
  const frames = [];
  for (let i = 0; i < 14; i++) frames.push({ data: frame(i), background: i ? 'rgb(9, 9, 9)' : null });
  for (let i = 0; i < 10; i++) frames.push({ data: frame('still'), background: null });
  const picked = clipWindow(frames);
  assert.equal(picked.frames.length, CLIP_FRAMES);
  assert.ok(new Set(picked.frames).size >= 3);
  assert.equal(picked.background, 'rgb(9, 9, 9)');
  assert.equal(clipWindow(Array.from({ length: 20 }, () => ({ data: frame('x') }))), null);
});

test('only an opaque computed rgb color from the game can paint the letterbox', () => {
  assert.equal(captureBackground('rgb(12, 34, 56)'), 'rgb(12, 34, 56)');
  assert.equal(captureBackground('rgba(12, 34, 56, 1)'), 'rgb(12, 34, 56)');
  for (const bad of ['rgba(0, 0, 0, 0)', 'rgba(1, 2, 3, 0.5)', 'rgb(300, 0, 0)', 'url(x)', 'red;background:url(x)', null, 42]) {
    assert.equal(captureBackground(bad), '#101215', String(bad));
  }
});

test('a paused game cannot push the played clip out of the ring', () => {
  const ring = createClipRing(20);
  for (let i = 0; i < 15; i++) ring.push(frame(i));
  let state;
  for (let i = 0; i < 200; i++) state = ring.push(frame('paused'));
  assert.equal(ring.frames().length, 16);
  assert.ok(clipWindow(ring.frames()));
  assert.equal(state.poster, frame('paused'));
});
