#!/usr/bin/env node
// MCP auto-publish recorder (GitHub Actions). Claims queued jobs from slop-mcp
// with this workflow's OIDC identity, playtests and records each game with the
// website's capture code, uploads the cover/GIF and asks slop-mcp to publish.
//
// THE REPOSITORY IS PUBLIC. Log only counts and fixed status/failure codes:
// never game names, source, owner or submission ids, leases or media.
import { recordGame, RecorderFailure } from "./record.mjs";

const API = process.env.SLOP_MCP_URL ?? "https://api.slop.game/functions/v1/slop-mcp";
const AUDIENCE = "https://api.slop.game/functions/v1/slop-mcp";
const MAX_JOBS = Number(process.env.SLOP_PUBLISHER_MAX_JOBS ?? 8);

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

let published = 0, review = 0, failed = 0;
for (let n = 0; n < MAX_JOBS; n++) {
  const claim = await call("/publisher/claim", await oidcToken());
  if (claim.status !== 200) { console.log(`claim refused: ${claim.status} ${claim.body?.code ?? ""}`); process.exitCode = 1; break; }
  const job = claim.body?.job;
  if (!job) break;
  const path = `/publisher/jobs/${job.job_id}`;
  try {
    var diagnostics = {};
    const media = await recordGame(job.files, { diagnostics });
    for (const [kind, bytes, type] of [["cover", media.cover, "image/jpeg"], ["gif", media.gif, "image/gif"]]) {
      const up = await call(`${path}/media?kind=${kind}`, job.lease, { bytes, type });
      if (up.status !== 200) throw new RecorderFailure("recorder_error", true);
    }
    const done = await call(`${path}/finish`, job.lease);
    if (done.body?.ok === true) {
      done.body.status === "published" ? published++ : review++;
      console.log(`job ${n + 1}: ${done.body.status}${done.body.update ? " (update)" : ""} ${media.width}x${media.height} ${media.frameCount} frames`);
    } else {
      failed++;
      console.log(`job ${n + 1}: publish failed: ${done.body?.code ?? done.status}`);
    }
  } catch (error) {
    const code = error instanceof RecorderFailure ? error.code : "recorder_error";
    const retryable = error instanceof RecorderFailure ? error.retryable : true;
    failed++;
    console.log(`job ${n + 1}: ${code} ${JSON.stringify(diagnostics ?? {})}`);
    await call(`${path}/fail`, job.lease, { json: { failure_code: code, retryable } }).catch(() => {});
  }
}
console.log(`published ${published}, in review ${review}, failed ${failed}`);
