import test from "node:test";
import assert from "node:assert/strict";
import { sha256, BridgeError } from "../../supabase/functions/slop-mcp/contract.mjs";
import { createHandler } from "../../supabase/functions/slop-mcp/handler.mjs";
import { mp4Info, validateVideo } from "../../supabase/functions/slop-mcp/publisher.mjs";

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type, ...parts) => {
  const body = parts.flatMap((p) => [...p]);
  return Uint8Array.from([...u32(body.length + 8), ...[...type].map((c) => c.charCodeAt(0)), ...body]);
};
function mp4({ width = 720, height = 1280, ms = 7000, codec = "avc1", moovFirst = true } = {}) {
  const mvhd = box("mvhd", new Uint8Array(12), u32(1000), u32(ms), new Uint8Array(80));
  const tkhd = box("tkhd", new Uint8Array(76), u32(width << 16), u32(height << 16));
  const stsd = box("stsd", new Uint8Array(8), u32(16), [...codec].map((c) => c.charCodeAt(0)), new Uint8Array(8));
  const trak = box("trak", tkhd, box("mdia", box("minf", box("stbl", stsd))));
  const moov = box("moov", mvhd, trak), mdat = box("mdat", new Uint8Array(32));
  const ftyp = box("ftyp", [..."isom"].map((c) => c.charCodeAt(0)), new Uint8Array(4));
  return Uint8Array.from([...ftyp, ...(moovFirst ? [...moov, ...mdat] : [...mdat, ...moov])]);
}
function jpeg(width, height) {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, ...new Array(9).fill(0), 0xff, 0xd9]);
}

test("mp4Info reads faststart H.264 facts and rejects the rest", () => {
  assert.deepEqual(mp4Info(mp4()), { codec: "avc1", width: 720, height: 1280, duration_ms: 7000 });
  assert.equal(validateVideo(mp4({ width: 1280, height: 720 })).width, 1280);
  for (const bad of [mp4({ moovFirst: false }), mp4({ codec: "hvc1" }), mp4({ width: 360, height: 640 }), mp4({ ms: 40000 }), new Uint8Array(100)]) {
    assert.throws(() => validateVideo(bad), /media_invalid/);
  }
});

test("recorder and owner uploads store content-addressed media and record the release", async () => {
  const stored = [], calls = [];
  const deps = {
    verifyPublisher: async (t) => { if (t !== "oidc") throw Object.assign(new Error("invalid_publisher"), { code: "invalid_publisher", status: 401 }); return {}; },
    verifyUser: async (t) => { if (t !== "user") throw new Error("auth"); return "owner-1"; },
    storeVideo: async (path, bytes, type) => stored.push({ path, bytes: bytes.length, type }),
    videoService: async (action, input) => { calls.push({ action, input }); return action === "claim" ? { games: [] } : { ok: true }; },
    service: async () => ({}),
  };
  const handle = createHandler(deps);
  const id = "11111111-2222-4333-8444-555555555555";
  const video = mp4(), key = (await sha256(video)).slice(0, 32), poster = jpeg(720, 1280);
  const post = (path, body, type, token = "oidc") => handle(new Request(`https://x/functions/v1/slop-mcp${path}`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": type }, body }));
  let r = await post("/publisher/videos/claim", JSON.stringify({ limit: 3 }), "application/json");
  assert.equal(r.status, 200);
  assert.deepEqual(calls.at(-1), { action: "claim", input: { limit: 3, shard: undefined, shards: undefined, retry_failed: false } });
  r = await post(`/publisher/videos/${id}/media?kind=poster&key=${key}`, poster, "image/jpeg");
  assert.equal(r.status, 200);
  r = await post(`/publisher/videos/${id}/media?kind=video&key=${key}&poster_bytes=${poster.length}&release_key=releases/abc/slug`, video, "video/mp4");
  assert.equal(r.status, 200);
  assert.deepEqual(stored.map((s) => s.path), [`${id}/v1-${key}/poster.jpg`, `${id}/v1-${key}/preview.mp4`]);
  assert.equal(calls.at(-1).input.source, "recorder");
  assert.equal(calls.at(-1).input.release_key, "releases/abc/slug");
  assert.equal(calls.at(-1).input.duration_ms, 7000);
  // A key that is not the video's own hash is refused before storage.
  r = await post(`/publisher/videos/${id}/media?kind=video&key=${"0".repeat(32)}&poster_bytes=10&release_key=releases/abc/slug`, video, "video/mp4");
  assert.equal(r.status, 422);
  // Owner route: user identity, never OIDC.
  r = await post(`/videos/${id}/media?kind=video&key=${key}&poster_bytes=${poster.length}`, video, "video/mp4", "user");
  assert.equal(r.status, 200);
  assert.equal(calls.at(-1).input.source, "owner");
  assert.equal(calls.at(-1).input.owner_id, "owner-1");
  r = await post(`/publisher/videos/${id}/fail`, JSON.stringify({ failure_code: "no_motion" }), "application/json");
  assert.equal(r.status, 200);
  assert.deepEqual(calls.at(-1), { action: "fail", input: { game_id: id, failure_code: "no_motion" } });
  r = await post("/publisher/videos/claim", "{}", "application/json", "nope");
  assert.notEqual(r.status, 200);
});


test("retry cutoff is validated after recorder authentication and forwarded unchanged", async () => {
  const calls = [];
  const handler = createHandler({
    verifyPublisher: async token => { if (token !== "oidc") throw new BridgeError("invalid_publisher",401); },
    storeVideo: async () => {},
    videoService: async (action, input) => { calls.push({action,input}); return {games:[],retry_before:input.retry_before}; },
  });
  const post = (input, token="oidc") => handler(new Request("https://x/functions/v1/slop-mcp/publisher/videos/claim", {
    method:"POST", headers:{authorization:`Bearer ${token}`,"content-type":"application/json"}, body:JSON.stringify(input),
  }));
  const cutoff = "2026-09-28T05:00:00.123456+00:00";
  const response = await post({retry_failed:true,retry_before:cutoff,limit:1});
  assert.equal(response.status,200);
  assert.equal((await response.json()).retry_before,cutoff);
  assert.equal(calls[0].input.retry_before,cutoff);
  for (const invalid of [null,42,[],{},"tomorrow","2026-99-99T00:00:00Z","x".repeat(41)]) {
    assert.equal((await post({retry_failed:true,retry_before:invalid})).status,400);
  }
  assert.equal((await post({retry_failed:false,retry_before:cutoff})).status,400);
  assert.equal((await post({retry_failed:true,retry_before:cutoff},"wrong")).status,401);
  assert.equal(calls.length,1,'invalid or unauthenticated claims cannot reach the private service');
});
