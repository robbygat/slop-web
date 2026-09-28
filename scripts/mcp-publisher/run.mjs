#!/usr/bin/env node
// MCP auto-publish recorder (GitHub Actions). Claims queued jobs from slop-mcp
// with this workflow's OIDC identity, playtests and records each game with the
// website's capture code, uploads the cover/GIF and asks slop-mcp to publish.
//
// THE REPOSITORY IS PUBLIC. Log only counts and fixed status/failure codes:
// never game names, source, owner or submission ids, leases or media.
import { attachPublishedVideo, completePublisherJob, publisherMaxJobs } from "./completion.mjs";
import { recordGame, RecorderFailure } from "./record.mjs";
import { recordVideo, VideoFailure } from "./video.mjs";
import { checkApiHealth, ApiHealthFailure, PUBLISHABLE_KEY, createVideoRetryPass } from "./safety.mjs";

const API = process.env.SLOP_MCP_URL ?? "https://api.slop.game/functions/v1/slop-mcp";
const AUDIENCE = "https://api.slop.game/functions/v1/slop-mcp";
const MAX_JOBS = publisherMaxJobs(process.env.SLOP_PUBLISHER_MAX_JOBS ?? 8);
// "publish" claims MCP publish jobs; "videos" records feed videos for
// published games that have none for their current release.
const MODE = process.env.SLOP_PUBLISHER_MODE ?? "publish";
const RELEASES = "https://api.slop.game/storage/v1/object/public/games/";

async function oidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, token = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !token) throw new Error("OIDC unavailable (needs permissions: id-token: write)");
  const response = await fetch(`${url}&audience=${encodeURIComponent(AUDIENCE)}`, { headers: { Authorization: `bearer ${token}` } });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.value !== "string") throw new Error("OIDC token request failed");
  return body.value;
}
async function call(path, bearer, { json, bytes, type } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: "POST", redirect: "error",
    headers: { Authorization: `Bearer ${bearer}`, "content-type": type ?? "application/json" },
    body: bytes ?? JSON.stringify(json ?? {}),
    signal: AbortSignal.timeout(170_000),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

if (MODE === "publish") {
let published = 0, review = 0, failed = 0;
// Each job now records a GIF and a video (minutes under software GL); stop
// claiming while a whole job still fits in the workflow's time limit.
const publishDeadline = Date.now() + 14 * 60_000;
for (let n = 0; n < MAX_JOBS && Date.now() < publishDeadline; n++) {
  const claim = await call("/publisher/claim", await oidcToken());
  if (claim.status !== 200) { console.log(`claim refused: ${claim.status} ${claim.body?.code ?? ""}`); process.exitCode = 1; break; }
  const job = claim.body?.job;
  if (!job) break;
  const path = `/publisher/jobs/${job.job_id}`;
  try {
    var diagnostics = {};
    const media = await recordGame(job.files, { diagnostics });
    // Owner rule: a game only goes live with a video preview. Record it from
    // the exact bundle first; a game whose video cannot be recorded is not
    // published (the job fails retryably and is tried again).
    const { mcpTargetFromFiles } = await import("../../src/lib/mcp-platform.js");
    const clip = await recordVideo({ files: job.files }, {
      target: mcpTargetFromFiles(job.files), diagnostics: (diagnostics.video = {}),
      seed: parseInt(String(job.job_id).replace(/-/g, "").slice(0, 8), 16) || 1,
    }).catch((error) => { throw new RecorderFailure(error instanceof VideoFailure && ["no_motion", "blank_canvas", "boot_error"].includes(error.code) ? error.code : "recorder_error", true); });
    for (const [kind, bytes, type] of [["cover", media.cover, "image/jpeg"], ["gif", media.gif, "image/gif"]]) {
      const up = await call(`${path}/media?kind=${kind}`, job.lease, { bytes, type });
      if (up.status !== 200) throw new RecorderFailure("recorder_error", true);
    }
    const completion = await completePublisherJob({
      finish: () => call(`${path}/finish`, job.lease),
      attachVideo: slug => attachVideo(slug, clip, job.digest),
      fail: json => call(`${path}/fail`, job.lease, {json}),
    });
    if (completion.status === 'published') {
      published++;
      console.log(`job ${n + 1}: published with video${completion.update ? " (update)" : ""} ${media.width}x${media.height} ${media.frameCount} frames`);
    } else if (completion.status === 'pending_review') {
      review++;
      console.log(`job ${n + 1}: pending_review`);
    } else {
      failed++;
      process.exitCode = 1;
      console.log(`job ${n + 1}: ${completion.code}`);
      // Never immediately reclaim a fresh failure or consume all attempts in
      // one pass. An already-public game with missing video is not republished.
      break;
    }
  } catch (error) {
    const code = error instanceof RecorderFailure ? error.code : "recorder_error";
    const retryable = error instanceof RecorderFailure ? error.retryable : true;
    failed++;
    console.log(`job ${n + 1}: ${code} ${JSON.stringify(diagnostics ?? {})}`);
    await call(`${path}/fail`, job.lease, { json: { failure_code: code, retryable } }).catch(() => {});
    process.exitCode = 1;
    break;
  }
}
console.log(`published ${published}, in review ${review}, failed ${failed}`);
}
if (MODE === "videos") {
  try { await videos(); } catch (error) {
    if (!(error instanceof ApiHealthFailure)) throw error;
    console.log("video pass stopped: api_unhealthy (feed probe failed or reached 1000ms)");
    process.exitCode = 1;
  }
}

async function attachVideo(slug, clip, sourceDigest) {
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256").update(clip.video).digest("hex").slice(0, 32);
  return attachPublishedVideo({
    slug, sourceDigest,
    delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
    readGame: async slug => {
      await checkApiHealth();
      const rows = await fetch(`https://api.slop.game/rest/v1/games?slug=eq.${slug}&status=eq.published&select=id,owner_id,slug,status,published_bundle_path,bundle_digest,bundle_manifest`, {
        headers: { apikey: PUBLISHABLE_KEY }, signal: AbortSignal.timeout(20_000), redirect: "error",
      }).then(r => r.ok ? r.json() : []);
      return rows?.[0] ?? null;
    },
    upload: async receipt => {
      await checkApiHealth();
      const token = await oidcToken(), path = `/publisher/videos/${receipt.game_id}/media`;
      const posterQuery = new URLSearchParams({kind:"poster",key,release_key:receipt.release_root});
      const poster = await call(`${path}?${posterQuery}`, token, {bytes:clip.poster,type:"image/jpeg"});
      if (poster.status !== 200) return false;
      await checkApiHealth();
      const query = new URLSearchParams({kind:"video",key,poster_bytes:String(clip.poster.length),release_key:receipt.release_root});
      const video = await call(`${path}?${query}`, token, {bytes:clip.video,type:"video/mp4"});
      return video.status === 200 && video.body?.ok === true;
    },
  });
}

async function videos() {
  const shard = Number(process.env.SLOP_VIDEO_SHARD ?? 0), shards = Number(process.env.SLOP_VIDEO_SHARDS ?? 1);
  if (!Number.isInteger(shards) || shards < 1 || shards > 2 || !Number.isInteger(shard) || shard < 0 || shard >= shards) {
    throw new Error("Video backfills require one or two valid shards");
  }
  const budget = Date.now() + Number(process.env.SLOP_VIDEO_BUDGET_MIN ?? 15) * 60_000;
  const retryFailed = process.env.SLOP_VIDEO_RETRY_FAILED === "1";
  const retryPass = createVideoRetryPass(retryFailed);
  let recorded = 0, failed = 0, n = 0;
  while (Date.now() < budget - 6 * 60_000) {
    if (n) await new Promise((resolve) => setTimeout(resolve, 3000));
    await checkApiHealth();
    const claim = await call("/publisher/videos/claim", await oidcToken(), { json: { limit: 1, shard, shards, ...retryPass.claimInput() } });
    if (claim.status !== 200) { console.log(`video claim refused: ${claim.status} ${claim.body?.code ?? ""}`); process.exitCode = 1; break; }
    retryPass.acceptClaim(claim.body);
    const game = claim.body?.games?.[0];
    if (!game) break;
    n++;
    const diagnostics = {}, started = Date.now();
    try {
      if (!/^[0-9a-f-]{36}$/.test(game.game_id) || typeof game.entry_base !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._\/-]*\/$/.test(game.entry_base) || game.entry_base.includes("..")) {
        throw new VideoFailure("runtime_invalid");
      }
      const seed = parseInt(game.game_id.replace(/-/g, "").slice(0, 8), 16);
      const media = await recordVideo({ baseUrl: RELEASES + game.entry_base }, { target: game.target, diagnostics, seed });
      const { createHash } = await import("node:crypto");
      const key = createHash("sha256").update(media.video).digest("hex").slice(0, 32);
      await checkApiHealth();
      const token = await oidcToken(), path = `/publisher/videos/${game.game_id}/media`;
      const poster = await call(`${path}?kind=poster&key=${key}`, token, { bytes: media.poster, type: "image/jpeg" });
      if (poster.status !== 200) throw new VideoFailure(`upload_${poster.status}`, true);
      await checkApiHealth();
      const query = new URLSearchParams({ kind: "video", key, poster_bytes: String(media.poster.length), release_key: game.release_key });
      const video = await call(`${path}?${query}`, token, { bytes: media.video, type: "video/mp4" });
      if (video.status !== 200 || video.body?.ok !== true) throw new VideoFailure(video.body?.code ?? `upload_${video.status}`, true);
      recorded++;
      console.log(`video ${n}: recorded ${media.width}x${media.height} ${media.durationMs}ms ${media.video.length}B poster ${media.poster.length}B in ${Math.round((Date.now() - started) / 1000)}s step ${diagnostics.stepMs}ms crf ${diagnostics.crf}`);
    } catch (error) {
      // Leave the lease to expire; do not mark a healthy game failed or send
      // another write when production is struggling.
      if (error instanceof ApiHealthFailure) throw error;
      failed++;
      const code = typeof error?.code === "string" && /^[a-z_0-9]{1,40}$/.test(error.code) ? error.code : "recorder_error";
      console.log(`video ${n}: ${code} ${JSON.stringify({ frames: diagnostics.frames, moving: diagnostics.moving, lit: diagnostics.lit, ready: diagnostics.ready, errors: diagnostics.errors })}`);
      if ((["service_unavailable", "upstream_unavailable"].includes(code) || /^upload_(5\d\d|429)$/.test(code))) throw new ApiHealthFailure();
      await checkApiHealth();
      await call(`/publisher/videos/${game.game_id}/fail`, await oidcToken(), { json: { failure_code: code.replace(/[0-9]/g, "") || "recorder_error" } }).catch(() => {});
    }
  }
  console.log(`videos recorded ${recorded}, failed ${failed}`);
}
// Never let a stray handle from a failed recording keep the workflow alive.
process.exit(process.exitCode ?? 0);
