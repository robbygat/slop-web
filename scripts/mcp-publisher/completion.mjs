import { ApiHealthFailure } from './safety.mjs';
import { mcpPublicationReceipt } from '../../src/lib/mcp-publication-contracts.js';
// A game submission receipt alone does not mean its feed preview is ready.
// Dependencies make the completion boundary testable without network writes.
export async function completePublisherJob({ finish, attachVideo, fail }) {
  const done = await finish();
  if (done.body?.ok !== true) {
    const code = typeof done.body?.code === 'string' && /^[a-z_]{1,40}$/.test(done.body.code)
      ? done.body.code : 'publish_failed';
    // Some backend refusals happen before its fail helper. Release that job's
    // own lease rather than leaving it stuck in publishing until expiry.
    await fail({failure_code: code, retryable: done.body?.retryable === true}).catch(() => {});
    return {status:'failed',code};
  }
  if (done.body.status === 'pending_review') return {status:'pending_review',update:done.body.update===true};
  if (done.body.status !== 'published') return {status:'failed',code:'publish_failed'};
  const attached = await attachVideo(done.body.slug).catch(() => false);
  return attached
    ? {status:'published',update:done.body.update===true}
    : {status:'video_missing',code:'video_attachment_failed'};
}
export function publisherMaxJobs(value = 8) {
  const jobs=Number(value);
  if(!Number.isInteger(jobs)||jobs<1||jobs>8)throw new TypeError('Publisher pass must claim between 1 and 8 jobs');
  return jobs;
}

// Older finish receipts omit release_root. Prove the complete published
// manifest matches the recorded submission, then pin that immutable release.
// A later release is never adopted by a retry, even if its source is identical.
export async function attachPublishedVideo({slug, sourceDigest, readGame, upload, delay}) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{3,120}$/.test(slug) || !/^[a-f0-9]{64}$/.test(sourceDigest || '')) return false;
  let pinned = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await delay(3000 * attempt);
    const row = await readGame(slug).catch(error => {if (error instanceof ApiHealthFailure) throw error; return null;});
    if (!row) continue;
    const receipt = await mcpPublicationReceipt(row, {slug, game_id:row.id, owner_id:row.owner_id, digest:sourceDigest});
    if (!receipt?.release_root) return false;
    if (pinned && (pinned.game_id !== receipt.game_id || pinned.release_root !== receipt.release_root)) return false;
    pinned ??= receipt;
    if (await upload(pinned).catch(error => {if (error instanceof ApiHealthFailure) throw error; return false;})) return true;
  }
  return false;
}
