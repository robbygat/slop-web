// Visual quality checks only: these do not infer game state or manufacture play.
import {inspectBundle} from '../../mcp/bundle-rules.mjs';
import {mcpRuntimeProblem} from '../../src/lib/mcp-runtime.js';
import {recorderManifest} from './world-recorder.mjs';

export const LOCAL_MOTION_POLICY = 'turns-local-v1';
export const LOCAL_MOTION_MAX_FRAMES = 1800;
export const localMotionSize = desktop => desktop ? [256, 144] : [144, 256];

// Only new explicitly typed, fully admitted source bundles can use the local
// metric. A catalog flag, URL, title or runtime meta tag is not an attestation.
// Untyped historical sources retain the existing whole-frame quality policy.
export function recorderTurnsConfig(files) {
  let spec;
  try { spec = JSON.parse(files?.['slop.spec.json'] || '{}'); } catch { return null; }
  if (spec?.game_type !== 'multiplayer') return null;
  const checked = inspectBundle(files);
  if (checked.multiplayer?.protocol !== 'turns-v1' || checked.persistent ||
      mcpRuntimeProblem(recorderManifest(checked.files), files['index.html'], {multiplayer: checked.multiplayer})) {
    throw Error('runtime_invalid');
  }
  return Object.freeze({protocol: 'turns-v1'});
}

// The original 24x40 whole-frame metric, including its strict > comparisons.
export function globalMotionStats(data, count) {
  const size = 24 * 40;
  if (!Number.isInteger(count) || count < 1 || data.length !== count * size) throw Error('motion_frames_invalid');
  let moving = 0, lit = 0;
  for (let i = 0; i < count; i++) {
    const frame = data.subarray(i * size, (i + 1) * size);
    let min = 255, max = 0;
    for (const v of frame) { if (v < min) min = v; if (v > max) max = v; }
    if (max - min > 12) lit++;
    if (i) {
      const prev = data.subarray((i - 1) * size, i * size);
      let diff = 0;
      for (let p = 0; p < size; p++) diff += Math.abs(frame[p] - prev[p]);
      if (diff / size > 0.35) moving++;
    }
  }
  return {moving, lit};
}

// Small balls/pieces can disappear in a whole-frame average. Count visible
// changes inside overlapping 8x8 tiles at a bounded 144x256 resolution instead.
// Ignore outer framing; a tile needs both six materially changed pixels and
// enough average contrast. Compression noise or a single blinking pixel does
// not qualify. The original 15%-of-all-captured-frames rule still applies.
export function localMotionStats(data, count, width, height) {
  if (!Number.isInteger(count) || count < 1 || count > LOCAL_MOTION_MAX_FRAMES ||
      !((width === 144 && height === 256) || (width === 256 && height === 144)) ||
      data.length !== count * width * height) throw Error('motion_frames_invalid');
  const size = width * height, tile = 8, stride = 4;
  const left = Math.ceil(width * .1), right = Math.floor(width * .9);
  const top = Math.ceil(height * .1), bottom = Math.floor(height * .9);
  let moving = 0;
  for (let f = 1; f < count; f++) {
    const current = f * size, previous = current - size;
    let visible = false;
    for (let y = top; y + tile <= bottom && !visible; y += stride) {
      for (let x = left; x + tile <= right && !visible; x += stride) {
        let difference = 0, changed = 0;
        for (let dy = 0; dy < tile; dy++) {
          for (let dx = 0; dx < tile; dx++) {
            const p = (y + dy) * width + x + dx;
            const delta = Math.abs(data[current + p] - data[previous + p]);
            difference += delta;
            if (delta >= 12) changed++;
          }
        }
        visible = changed >= 6 && difference / (tile * tile) >= 3;
      }
    }
    if (visible) moving++;
  }
  return {moving};
}

export function motionProblem(stats, count, local = null) {
  if (stats.lit < count * .5) return 'blank_canvas';
  if (stats.moving < count * .15 && (!local || local.moving < count * .15)) return 'no_motion';
  return null;
}
