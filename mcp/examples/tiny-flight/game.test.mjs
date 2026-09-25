import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./game.js', import.meta.url), 'utf8');
const plan = [[2.2, 0.38], [4.3, 0.62], [6.4, 0.33], [8.5, 0.57], [10.6, 0.42]];

function fly(width, height) {
  const scores = [];
  const finished = [];
  const input = { down: false, pressed: false, keys: new Set() };
  let draw;
  let restart;
  let ready = 0;
  let planeY = height / 2;
  let previousPlaneY = planeY;
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    createLinearGradient: () => gradient,
    translate: (_x, y) => { planeY = y; },
  }, { get: (target, key) => target[key] ?? (() => {}) });
  const Slop = {
    safeArea: { top: 72, right: 16, bottom: 40, left: 16 },
    input,
    create: () => ({ ctx }),
    onRestart: callback => { restart = callback; },
    loop: callback => { draw = callback; },
    ready: () => { ready += 1; },
    score: value => scores.push(value),
    finished: value => finished.push(value),
    haptic() {},
    tone() {},
  };
  vm.runInNewContext(source, { Math, Slop });

  const top = 52;
  const playHeight = height - top - 40;
  for (let frame = 0; frame < 900 && finished.length === 0; frame += 1) {
    const time = frame / 60;
    const next = plan.find(([at]) => at >= time) ?? plan.at(-1);
    const targetY = top + next[1] * playHeight;
    const projectedY = planeY + (planeY - previousPlaneY) * 20;
    if (projectedY > targetY) input.keys.add('Space');
    else input.keys.delete('Space');
    previousPlaneY = planeY;
    draw({ dt: 1 / 60, time, width, height });
  }

  assert.equal(ready, 1);
  assert.equal(scores.at(-1), 500);
  assert.deepEqual(finished, [500]);
  restart();
  assert.equal(scores.at(-1), 0);
}

test('keyboard flight can clear all five gates on phone and desktop layouts', () => {
  fly(390, 844);
  fly(1280, 720);
});
