import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_FRAMES, MAX_CLIP_FRAMES, clipWindow, createClipRing } from '../src/lib/clip-ring.js';
import { captureBackground, frameDelays } from '../src/lib/capture.js';

const frame = (n) => `data:image/jpeg;base64,/9j/${n}`;

test('the ring keeps only recent real frames and reports when a moving clip exists', () => {
  const ring = createClipRing(20);
  let state;
  for (let i = 0; i < 30; i++) state = ring.push(frame(i % 7), 'rgb(1, 2, 3)', i * 80);
  ring.push('not a frame');
  assert.equal(ring.frames().length, 20);
  assert.equal(state.moving, true);
  assert.equal(state.poster, frame(29 % 7));
});

test('a paused game cannot push the played clip out of the ring', () => {
  const ring = createClipRing(20);
  for (let i = 0; i < 15; i++) ring.push(frame(i), null, i * 80);
  let state;
  for (let i = 0; i < 200; i++) state = ring.push(frame('paused'), null, 2000 + i * 80);
  assert.equal(ring.frames().length, 16);
  assert.ok(clipWindow(ring.frames()));
  assert.equal(state.poster, frame('paused'));
});

test('a clip never ends on a frozen stretch and keeps its capture times', () => {
  const frames = [];
  for (let i = 0; i < 40; i++) frames.push({ data: frame(i), background: i ? 'rgb(9, 9, 9)' : null, at: i * 80 });
  for (let i = 0; i < 10; i++) frames.push({ data: frame('still'), background: null, at: 4000 + i * 80 });
  const picked = clipWindow(frames);
  assert.ok(picked.frames.length >= CLIP_FRAMES && picked.frames.length <= MAX_CLIP_FRAMES);
  assert.equal(new Set(picked.frames.map((f) => f.data)).size, picked.frames.length);
  assert.ok(picked.frames.every((f) => Number.isFinite(f.at)));
  assert.equal(picked.background, 'rgb(9, 9, 9)');
  assert.equal(clipWindow(Array.from({ length: 20 }, () => ({ data: frame('x') }))), null);
});

test('clip timing follows the real capture spacing, within sane bounds', () => {
  assert.deepEqual(frameDelays([{ at: 0 }, { at: 80 }, { at: 170 }, { at: 900 }]), [80, 90, 250, 250]);
  assert.deepEqual(frameDelays(['a', 'b', 'c']), [200, 200, 200]);
  assert.deepEqual(frameDelays([{ at: 0 }, { at: 5 }, { at: 10 }]), [40, 40, 40]);
});

test('only an opaque computed rgb color from the game can paint behind the clip', () => {
  assert.equal(captureBackground('rgb(12, 34, 56)'), 'rgb(12, 34, 56)');
  assert.equal(captureBackground('rgba(12, 34, 56, 1)'), 'rgb(12, 34, 56)');
  for (const bad of ['rgba(0, 0, 0, 0)', 'rgba(1, 2, 3, 0.5)', 'rgb(300, 0, 0)', 'url(x)', 'red;background:url(x)', null, 42]) {
    assert.equal(captureBackground(bad), '#101215', String(bad));
  }
});
