import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "../../supabase/functions/slop-mcp/contract.mjs";
import { createHandler } from "../../supabase/functions/slop-mcp/handler.mjs";
import {
  createOidcVerifier,
  gifSize,
  GITHUB_ISSUER,
  jpegSize,
  PUBLISHER_POLICY,
  validateMedia,
} from "../../supabase/functions/slop-mcp/publisher.mjs";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const keys = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"],
);
const other = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1", use: "sig", alg: "RS256" };
const NOW = 1_790_000_000_000;
const goodClaims = () => ({
  iss: GITHUB_ISSUER, aud: PUBLISHER_POLICY.audience, iat: NOW / 1000 - 5, nbf: NOW / 1000 - 5, exp: NOW / 1000 + 300,
  repository: "robbygat/slop-web", repository_id: "1269836680", repository_owner: "robbygat", repository_owner_id: "195066519",
  ref: "refs/heads/main", workflow_ref: "robbygat/slop-web/.github/workflows/mcp-autopublish.yml@refs/heads/main",
  event_name: "schedule", runner_environment: "github-hosted", run_id: "42",
});
async function sign(claims, { key = keys.privateKey, kid = "k1", alg = "RS256" } = {}) {
  const head = b64url(JSON.stringify({ alg, kid, typ: "JWT" })), body = b64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}
let clock = NOW;
function verifier() {
  let fetches = 0;
  clock = NOW;
  const verify = createOidcVerifier({
    now: () => clock,
    fetcher: async (url) => {
      fetches++;
      assert.equal(url, "https://token.actions.githubusercontent.com/.well-known/jwks");
      return Response.json({ keys: [jwk] });
    },
  });
  return { verify, fetches: () => fetches };
}

test("GitHub OIDC: only the pinned main-branch workflow on a hosted runner is accepted", async () => {
  const v = verifier();
  assert.deepEqual(await v.verify(await sign(goodClaims())), { run_id: "42", event_name: "schedule" });
  assert.equal((await v.verify(await sign({ ...goodClaims(), event_name: "workflow_dispatch" }))).event_name, "workflow_dispatch");
  assert.equal(v.fetches(), 1, "JWKS is cached");
  const rejected = [
    { repository: "attacker/slop-web" }, { repository_id: "1" }, { repository_owner_id: "2" },
    { ref: "refs/heads/feature" }, { ref: "refs/pull/1/merge" },
    { workflow_ref: "robbygat/slop-web/.github/workflows/pages.yml@refs/heads/main" },
    { workflow_ref: "robbygat/slop-web/.github/workflows/mcp-autopublish.yml@refs/heads/other" },
    { event_name: "pull_request" }, { event_name: "pull_request_target" }, { event_name: "push" },
    { runner_environment: "self-hosted" }, { iss: "https://evil.example" }, { aud: "https://other" },
    { exp: NOW / 1000 - 120 }, { nbf: NOW / 1000 + 120 }, { iat: NOW / 1000 + 120 }, { exp: NOW / 1000 + 7200 },
  ];
  for (const change of rejected) {
    await assert.rejects(async () => v.verify(await sign({ ...goodClaims(), ...change })), /invalid_publisher/, JSON.stringify(change));
  }
  await assert.rejects(async () => v.verify(await sign(goodClaims(), { key: other.privateKey })), /invalid_publisher/);
  await assert.rejects(async () => v.verify(await sign(goodClaims(), { alg: "HS256" })), /invalid_publisher/);
  const token = await sign(goodClaims());
  const [h, , s] = token.split(".");
  await assert.rejects(() => v.verify(`${h}.${b64url(JSON.stringify({ ...goodClaims(), repository: "x/y" }))}.${s}`), /invalid_publisher/);
  await assert.rejects(async () => v.verify(await sign(goodClaims(), { kid: "unknown" })), /invalid_publisher/);
  assert.equal(v.fetches(), 1, "an unknown kid refreshes the key set at most once a minute");
  clock = NOW + 61_000;
  await assert.rejects(async () => v.verify(await sign(goodClaims(), { kid: "unknown" })), /invalid_publisher/);
  await assert.rejects(async () => v.verify(await sign(goodClaims(), { kid: "unknown" })), /invalid_publisher/);
  assert.equal(v.fetches(), 2);
});

function jpeg(width, height) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}
function gif(width, height, frames, delay = 10) {
  const out = [...Buffer.from("GIF89a"), width & 255, width >> 8, height & 255, height >> 8, 0, 0, 0];
  for (let i = 0; i < frames; i++) {
    out.push(0x21, 0xf9, 4, 0, delay & 255, delay >> 8, 0, 0);
    out.push(0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0, 2, 2, 0x4c, 0x01, 0);
  }
  out.push(0x3b);
  return new Uint8Array(out);
}

test("recorder media must be the canonical cover JPEG and timed animated GIF", () => {
  assert.deepEqual(jpegSize(jpeg(720, 1280)), { width: 720, height: 1280 });
  assert.deepEqual(gifSize(gif(360, 640, 12)), { width: 360, height: 640, frames: 12, timed: true });
  assert.deepEqual(validateMedia("cover", jpeg(1280, 720)), { width: 1280, height: 720, frame_count: null });
  assert.deepEqual(validateMedia("gif", gif(640, 360, 3)), { width: 640, height: 360, frame_count: 3 });
  for (const [kind, bytes] of [["cover", jpeg(360, 640)], ["cover", gif(360, 640, 5)], ["gif", gif(360, 640, 2)],
    ["gif", gif(360, 640, 41)], ["gif", gif(640, 640, 5)], ["gif", gif(360, 640, 5, 0)], ["gif", jpeg(360, 640)]]) {
    assert.throws(() => validateMedia(kind, bytes), /media_invalid/);
  }
});

const JOB = "11111111-1111-4111-8111-111111111111";
function harness() {
  const calls = [];
  const deps = {
    service: async (action, input) => {
      calls.push([action, input]);
      if (action === "publisher_claim") return { job: { job_id: JOB, files: { "index.html": "<canvas></canvas>" } } };
      if (action === "request_publish") return { job_id: JOB, status: "requested" };
      return { ok: true };
    },
    phone: async (token, action, input) => { calls.push(["phone:" + action, input]); return { connection_id: input.connection_id, auto_publish: input.enabled }; },
    verifyUser: async () => "owner",
    verifyPublisher: async (token) => { calls.push(["oidc", token]); if (token !== "oidc.good.token") throw Object.assign(new Error("x"), {}); },
    stageMedia: async (path, bytes, type) => calls.push(["stage", path, bytes.length, type]),
    publishJob: async (input) => { calls.push(["publish", input]); return { status: 200, body: { ok: true, status: "published", slug: "mcp-" + "a".repeat(32) } }; },
  };
  return { handler: createHandler(deps), calls };
}
const req = (path, { token, body, raw, type = "application/json", headers = {} } = {}) =>
  new Request(`https://api.slop.game/functions/v1/slop-mcp${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "content-type": type, ...headers },
    body: raw ?? JSON.stringify(body ?? {}),
  });

test("publisher routes: OIDC claim returns a lease; media is lease-recorded before staging; finish and fail use the lease", async () => {
  const h = harness();
  assert.equal((await h.handler(req("/publisher/claim"))).status, 401);
  assert.equal((await h.handler(req("/publisher/claim", { token: "oidc.bad.token" }))).status, 503);
  const claim = await (await h.handler(req("/publisher/claim", { token: "oidc.good.token" }))).json();
  assert.match(claim.job.lease, /^slop_lease_[0-9a-f]{64}$/);
  const leaseHash = h.calls.find((c) => c[0] === "publisher_claim")[1].lease_hash;
  assert.equal(leaseHash, await sha256(claim.job.lease));

  const lease = claim.job.lease;
  const bad = await h.handler(req(`/publisher/jobs/${JOB}/media?kind=cover`, { token: "oidc.good.token", raw: jpeg(720, 1280), type: "image/jpeg" }));
  assert.equal(bad.status, 401);
  const wrongType = await h.handler(req(`/publisher/jobs/${JOB}/media?kind=gif`, { token: lease, raw: jpeg(720, 1280), type: "image/jpeg" }));
  assert.equal(wrongType.status, 415);
  const cover = await h.handler(req(`/publisher/jobs/${JOB}/media?kind=cover`, { token: lease, raw: jpeg(720, 1280), type: "image/jpeg" }));
  assert.equal(cover.status, 200);
  const clip = await h.handler(req(`/publisher/jobs/${JOB}/media?kind=gif`, { token: lease, raw: gif(360, 640, 12), type: "image/gif" }));
  assert.equal(clip.status, 200);
  const order = h.calls.map((c) => c[0]);
  assert.ok(order.indexOf("publisher_media") < order.indexOf("stage"));
  const media = h.calls.filter((c) => c[0] === "publisher_media").map((c) => c[1]);
  assert.deepEqual(media.map((m) => [m.kind, m.width, m.height, m.frame_count, m.lease_hash]),
    [["cover", 720, 1280, null, leaseHash], ["gif", 360, 640, 12, leaseHash]]);
  assert.deepEqual(h.calls.filter((c) => c[0] === "stage").map((c) => c[1]), [`jobs/${JOB}/cover.jpg`, `jobs/${JOB}/preview.gif`]);
  const tooBig = await h.handler(req(`/publisher/jobs/${JOB}/media?kind=cover`, { token: lease, raw: new Uint8Array(716_801), type: "image/jpeg" }));
  assert.equal(tooBig.status, 413);

  const finish = await h.handler(req(`/publisher/jobs/${JOB}/finish`, { token: lease }));
  assert.equal((await finish.json()).status, "published");
  assert.deepEqual(h.calls.find((c) => c[0] === "publish")[1], { job_id: JOB, lease_hash: leaseHash });
  assert.equal((await h.handler(req(`/publisher/jobs/${JOB}/fail`, { token: lease, body: { failure_code: "drop_table" } }))).status, 400);
  assert.equal((await h.handler(req(`/publisher/jobs/${JOB}/fail`, { token: lease, body: { failure_code: "no_motion", retryable: true } }))).status, 200);
  assert.deepEqual(h.calls.at(-1), ["publisher_fail", { job_id: JOB, lease_hash: leaseHash, failure_code: "no_motion", retryable: true }]);
});

test("agent publish uses the grant; owner toggle uses the owner session; browsers cannot reach recorder or agent routes", async () => {
  const h = harness();
  const token = "slop_mcp_" + "a".repeat(64);
  const asked = await h.handler(req("/agent/publish", { token, body: { submission_id: JOB } }));
  assert.equal(asked.status, 200);
  assert.deepEqual(h.calls.at(-1), ["request_publish", { token_hash: await sha256(token), submission_id: JOB }]);
  assert.equal((await h.handler(req("/agent/publish", { token, body: { submission_id: "x" } }))).status, 400);
  const toggle = await h.handler(req("/connections/auto-publish", { token: "owner.jwt", body: { connection_id: JOB, enabled: true } }));
  assert.equal((await toggle.json()).auto_publish, true);
  assert.equal((await h.handler(req("/connections/auto-publish", { token: "owner.jwt", body: { connection_id: JOB, enabled: "on" } }))).status, 400);
  const web = { origin: "https://slop.game" };
  assert.equal((await h.handler(req("/connections/auto-publish", { token: "owner.jwt", body: { connection_id: JOB, enabled: false }, headers: web }))).status, 200);
  assert.equal((await h.handler(req("/publisher/claim", { token: "oidc.good.token", headers: web }))).status, 403);
  assert.equal((await h.handler(req("/agent/publish", { token, body: { submission_id: JOB }, headers: web }))).status, 403);
});
