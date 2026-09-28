import {
  boundedText,
  BridgeError,
  HASH,
  MAX_BODY,
  object,
  requireValue,
  secret,
  sha256,
  trustedPreview,
  UUID,
  validateDraft,
  VERSION,
} from "./contract.mjs";
import { FAILURE_CODES, LEASE, validateMedia, validateVideo, validatePoster, jpegSize, VIDEO_MAX, VIDEO_FAILURE } from "./publisher.mjs";

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}
async function readBody(req) {
  requireValue(
    req.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    "json_required",
    415,
  );
  const reader = req.body?.getReader();
  requireValue(reader, "invalid_request");
  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BODY) {
      await reader.cancel();
      throw new BridgeError("request_too_large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return object(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch (e) {
    if (e instanceof BridgeError) throw e;
    throw new BridgeError("invalid_json");
  }
}

async function readBinary(req, type, max) {
  requireValue(
    req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === type,
    "media_type_required",
    415,
  );
  const reader = req.body?.getReader();
  requireValue(reader, "invalid_request");
  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new BridgeError("request_too_large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
const MEDIA = {
  cover: { type: "image/jpeg", max: 716_800, file: "cover.jpg" },
  gif: { type: "image/gif", max: 2_097_152, file: "preview.gif" },
};

// Feed preview video uploads (recorder and owner share one path). The poster
// goes first under the video's own content key; the video upload then proves
// that key, is validated, stored, and recorded against the game's current
// published release by game_preview_video_service.
async function uploadPreviewVideo(req, deps, url, gameId, source, ownerId = null) {
  const kind = url.searchParams.get("kind"), key = url.searchParams.get("key") ?? "";
  requireValue(UUID.test(gameId) && /^[0-9a-f]{32}$/.test(key) && (kind === "poster" || kind === "video"), "invalid_request");
  const folder = `${gameId.toLowerCase()}/v1-${key}`;
  if (kind === "poster") {
    const bytes = await readBinary(req, "image/jpeg", 716_800);
    const size = jpegSize(bytes);
    requireValue(size && validatePoster(bytes, size.width, size.height) &&
      ((size.width === 720 && size.height === 1280) || (size.width === 1280 && size.height === 720)), "media_invalid", 422);
    await deps.storeVideo(`${folder}/poster.jpg`, bytes, "image/jpeg");
    return { ok: true, kind, bytes: bytes.length, width: size.width, height: size.height };
  }
  const posterBytes = Number(url.searchParams.get("poster_bytes"));
  requireValue(Number.isInteger(posterBytes) && posterBytes > 0 && posterBytes <= 716_800, "invalid_request");
  const releaseKey = url.searchParams.get("release_key");
  requireValue(source === "owner" || (typeof releaseKey === "string" && releaseKey.length >= 3 && releaseKey.length <= 300), "invalid_request");
  const bytes = await readBinary(req, "video/mp4", VIDEO_MAX);
  const info = validateVideo(bytes);
  requireValue((await sha256(bytes)).slice(0, 32) === key, "media_invalid", 422);
  await deps.storeVideo(`${folder}/preview.mp4`, bytes, "video/mp4");
  return await deps.videoService("record", {
    game_id: gameId.toLowerCase(), source, owner_id: ownerId, release_key: releaseKey,
    video_path: `${folder}/preview.mp4`, poster_path: `${folder}/poster.jpg`,
    width: info.width, height: info.height, duration_ms: info.duration_ms,
    video_bytes: bytes.length, poster_bytes: posterBytes,
  });
}

/** Dependencies contain only server-owned clients. No caller supplies an owner. */
export function createHandler(deps, config = {}) {
  const origins = config.previewOrigins ??
    ["https://api.slop.game", "https://yqlolbebqfsodqgjlbeh.supabase.co"];
  const handle = async (req) => {
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/^.*\/slop-mcp/, "") || "/";
      if (req.method === "GET" && path === "/health") {
        return json({
          version: 1,
          service: "slop-mcp",
          protocol: "stdio-bridge",
          deployed: true,
        });
      }
      if (req.method === "GET" && path === "/authorize") {
        // A fixed destination prevents open redirects. Omitting a fragment in
        // Location preserves the incoming pairing fragment in browser navigation;
        // the existing web pair page validates it before showing owner approval.
        return new Response(null, {status:303,headers:{
          location:"https://slop.game/mcp/pair",
          "cache-control":"no-store", "referrer-policy":"no-referrer",
          "x-content-type-options":"nosniff",
        }});
      }
      requireValue(
        ["GET", "POST"].includes(req.method),
        "method_not_allowed",
        405,
      );
      const bearer = req.headers.get("authorization")?.match(
        /^Bearer ([^\s]{1,4096})$/i,
      )?.[1];
      // Recorder routes. /publisher/claim takes a GitHub Actions OIDC token
      // for the pinned workflow; every later call takes the per-job lease it
      // was exchanged for. Game source, owner and media never leave the queue
      // except to that one leased recorder.
      if (path.startsWith("/publisher/")) {
        requireValue(req.method === "POST", "method_not_allowed", 405);
        requireValue(deps.verifyPublisher, "route_not_found", 404);
        requireValue(bearer, "authentication_required", 401);
        if (path === "/publisher/claim") {
          await deps.verifyPublisher(bearer);
          const lease = `slop_lease_${secret(32)}`;
          const claimed = await deps.service("publisher_claim", {
            lease_hash: await sha256(lease),
          });
          return json({ job: claimed?.job ? { ...claimed.job, lease } : null });
        }
        if (path.startsWith("/publisher/videos/")) {
          requireValue(deps.videoService && deps.storeVideo, "route_not_found", 404);
          // Every call carries a fresh OIDC token of the pinned workflow.
          await deps.verifyPublisher(bearer);
          if (path === "/publisher/videos/claim") {
            const input = await readBody(req);
            if (input.retry_before !== undefined) {
              requireValue(input.retry_failed === true && typeof input.retry_before === "string" &&
                input.retry_before.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(input.retry_before) &&
                Number.isFinite(Date.parse(input.retry_before)), "invalid_request");
            }
            return json(await deps.videoService("claim", {
              limit: input.limit, shard: input.shard, shards: input.shards, retry_failed: input.retry_failed === true,
              ...(input.retry_before === undefined ? {} : { retry_before: input.retry_before }),
            }));
          }
          const video = path.match(/^\/publisher\/videos\/([0-9a-f-]{36})\/(media|fail)$/);
          requireValue(video && UUID.test(video[1]), "route_not_found", 404);
          if (video[2] === "fail") {
            const input = await readBody(req);
            requireValue(VIDEO_FAILURE.test(input.failure_code ?? ""), "invalid_request");
            return json(await deps.videoService("fail", { game_id: video[1].toLowerCase(), failure_code: input.failure_code }));
          }
          return json(await uploadPreviewVideo(req, deps, url, video[1], "recorder"));
        }
        const route = path.match(
          /^\/publisher\/jobs\/([0-9a-f-]{36})\/(media|finish|fail)$/,
        );
        requireValue(route && UUID.test(route[1]), "route_not_found", 404);
        requireValue(LEASE.test(bearer), "invalid_lease", 401);
        const job_id = route[1], lease_hash = await sha256(bearer);
        if (route[2] === "media") {
          const kind = url.searchParams.get("kind");
          const media = MEDIA[kind];
          requireValue(media, "invalid_request");
          const bytes = await readBinary(req, media.type, media.max);
          const size = validateMedia(kind, bytes);
          // Record (lease-checked) before writing, so no unleased caller can
          // ever place bytes in staging. The publisher re-hashes on load.
          const sha = await sha256(bytes);
          await deps.service("publisher_media", {
            job_id, lease_hash, kind, sha256: sha, bytes: bytes.length,
            width: size.width, height: size.height, frame_count: size.frame_count,
          });
          await deps.stageMedia(`jobs/${job_id}/${media.file}`, bytes, media.type);
          return json({ ok: true, kind, bytes: bytes.length, sha256: sha, ...size });
        }
        const input = await readBody(req);
        if (route[2] === "fail") {
          requireValue(FAILURE_CODES.has(input.failure_code), "invalid_request");
          return json(await deps.service("publisher_fail", {
            job_id, lease_hash, failure_code: input.failure_code,
            retryable: input.retryable === true,
          }));
        }
        const published = await deps.publishJob({ job_id, lease_hash });
        return json(published.body, published.status);
      }
      // Owner upload from the website publish flow, for the owner's own
      // published game (binary body, so before JSON parsing).
      const ownerVideo = path.match(/^\/videos\/([0-9a-f-]{36})\/media$/);
      if (ownerVideo && req.method === "POST") {
        requireValue(deps.videoService && deps.storeVideo, "route_not_found", 404);
        requireValue(bearer, "authentication_required", 401);
        const owner = await deps.verifyUser(bearer);
        return json(await uploadPreviewVideo(req, deps, url, ownerVideo[1], "owner", owner));
      }
      const input = req.method === "POST"
        ? await readBody(req)
        : Object.fromEntries(url.searchParams);
      if (path === "/pair/start" && req.method === "POST") {
        const clientName = boundedText(input.client_name, 60);
        requireValue(HASH.test(input.access_token_hash ?? ""));
        const code = secret(16), poll = secret();
        const pair = await deps.service("pair_start", {
          client_name: clientName,
          token_hash: input.access_token_hash,
          code_hash: await sha256(code),
          poll_hash: await sha256(poll),
        });
        return json({
          ...pair,
          authorization_uri: `https://api.slop.game/functions/v1/slop-mcp/authorize#id=${pair.pairing_id}&code=${code}`,
          confirmation_code: code,
          poll_token: poll,
          confirmation_uri:
            `https://slop.game/mcp/pair#id=${pair.pairing_id}&code=${code}`,
        }, 201);
      }
      requireValue(bearer, "authentication_required", 401);
      if (path === "/pair/status" && req.method === "GET") {
        requireValue(UUID.test(input.pairing_id ?? "") && HASH.test(bearer));
        return json(
          await deps.service("pair_status", {
            pairing_id: input.pairing_id,
            poll_hash: await sha256(bearer),
          }),
        );
      }
      if (path.startsWith("/agent/")) {
        requireValue(
          /^slop_mcp_[0-9a-f]{64}$/.test(bearer),
          "invalid_connection",
          401,
        );
        const token_hash = await sha256(bearer);
        if (path === "/agent/status" && req.method === "GET") {
          return json(await deps.service("agent_status", { token_hash }));
        }
        if (path === "/agent/drafts" && req.method === "POST") {
          const draft = await validateDraft(input);
          return json(
            await deps.service("send_draft", { ...draft, token_hash }),
          );
        }
        if (path === "/agent/drafts" && req.method === "GET") {
          return json(await deps.service("agent_drafts", { token_hash }));
        }
        if (path === "/agent/publish") {
          // Publishing needs the owner's per-connection opt-in (Connect page).
          // Without it the queue refuses with auto_publish_disabled.
          requireValue(UUID.test(input.submission_id ?? ""));
          return json(await deps.service(
            req.method === "POST" ? "request_publish" : "publish_status",
            { token_hash, submission_id: input.submission_id },
          ));
        }
        if (path === "/agent/revoke" && req.method === "POST") {
          return json(await deps.service("agent_revoke", { token_hash }));
        }
        throw new BridgeError("route_not_found", 404);
      }
      // This exact JWT is verified by Auth and then passed to PostgREST and
      // Storage. A connection token never substitutes for a Supabase identity.
      await deps.verifyUser(bearer);
      const phone = (action, body) => deps.phone(bearer, action, body);
      if (
        path === "/pair/review" && req.method === "GET" ||
        path === "/pair/confirm" && req.method === "POST"
      ) {
        requireValue(
          UUID.test(input.pairing_id ?? "") &&
            /^[0-9a-f]{32}$/.test(input.code ?? ""),
        );
        return json(
          await phone(
            path.endsWith("confirm") ? "pair_confirm" : "pair_review",
            {
              pairing_id: input.pairing_id,
              code_hash: await sha256(input.code),
            },
          ),
        );
      }
      if (path === "/connections" && req.method === "GET") {
        return json(await phone("connections", {}));
      }
      if (path === "/connections/revoke" && req.method === "POST") {
        requireValue(UUID.test(input.connection_id ?? ""));
        return json(
          await phone("revoke", { connection_id: input.connection_id }),
        );
      }
      if (path === "/connections/auto-publish" && req.method === "POST") {
        requireValue(UUID.test(input.connection_id ?? "") && typeof input.enabled === "boolean");
        return json(
          await phone("set_auto_publish", {
            connection_id: input.connection_id,
            enabled: input.enabled,
          }),
        );
      }
      if (path === "/drafts" && req.method === "GET") {
        return json(await phone("drafts", {}));
      }
      if (path === "/drafts/confirm" && req.method === "POST") {
        requireValue(
          UUID.test(input.submission_id ?? "") &&
            HASH.test(input.expected_digest ?? ""),
        );
        const draft = await phone("claim_draft", input);
        // A lease prevents concurrent confirmation. Each revision owns a
        // distinct immutable slug, so older work cannot overwrite newer bytes.
        const validated = await validateDraft(draft);
        requireValue(
          validated.digest === input.expected_digest &&
            validated.digest === draft.digest,
          "version_changed",
          409,
        );
        const game = await deps.ensureDraft(bearer, draft);
        await phone("check_lease", {
          submission_id: draft.submission_id,
          lease: draft.lease,
        });
        const mintPreview = () => deps.preview(bearer, {
          action: "preview",
          slug: draft.slug,
          version: VERSION,
          expected_bundle_digest: validated.digest,
          expected_bundle_manifest: validated.manifest,
        });
        // claim_draft preserves the server's prior ready receipt while taking
        // a new lease. Reopening that exact immutable submission need not
        // rewrite its files. The preview service still verifies every byte
        // against this digest before issuing a fresh immutable capability.
        const previouslyReady = UUID.test(draft.game_id ?? "") &&
          draft.game_id === game.id && typeof draft.ready_at === "string" &&
          Number.isFinite(Date.parse(draft.ready_at));
        let preview;
        let uploadRequired = !previouslyReady;
        if (previouslyReady) {
          try {
            preview = await mintPreview();
          } catch (error) {
            // Only an explicit byte mismatch permits restoring the queue's
            // original source. Timeouts, permission errors and service failures
            // must never amplify load with another batch of storage writes.
            if (!(error instanceof BridgeError) ||
              error.code !== "draft_snapshot_changed" || error.status !== 409) {
              throw error;
            }
            await phone("check_lease", {
              submission_id: draft.submission_id,
              lease: draft.lease,
            });
            uploadRequired = true;
          }
        }
        if (uploadRequired) {
          await deps.uploadFiles(bearer, draft.slug, validated.files, draft.owner_id);
          await phone("check_lease", {
            submission_id: draft.submission_id,
            lease: draft.lease,
          });
          preview = await mintPreview();
        }
        requireValue(
          trustedPreview(preview, draft.slug, origins),
          "preview_not_confirmed",
          503,
        );
        // SQL rechecks owner, active grant, latest revision and exact lease.
        // Raw preview bearer capabilities are returned only to the phone and
        // are never saved in the queue or disclosed to the agent.
        const result = await deps.service("finish_draft", {
          submission_id: draft.submission_id,
          owner_id: draft.owner_id,
          lease: draft.lease,
          game_id: game.id,
        });
        return json({
          ...result,
          target_platform: validated.target_platform,
          preview_url: preview.url,
          preview_expires_at: preview.expires_at,
        });
      }
      throw new BridgeError("route_not_found", 404);
    } catch (error) {
      if (error instanceof BridgeError) {
        return json({ ok: false, code: error.code }, error.status);
      }
      // Never echo database responses, upstream bodies, code, credentials or URLs.
      return json({ ok: false, code: "service_unavailable" }, 503);
    }
  };
  const webOrigins = new Set(config.webOrigins ?? ["https://slop.game"]);
  const browserRoutes = new Set([
    "/health", "/authorize", "/pair/review", "/pair/confirm", "/connections",
    "/connections/revoke", "/connections/auto-publish", "/drafts", "/drafts/confirm",
  ]);
  return async (req) => {
    const origin = req.headers.get("origin");
    if (!origin) return handle(req);
    // Web owner actions share the native JWT/RLS authority. Local agent
    // secrets and pairing creation remain unavailable to browser clients.
    if (!webOrigins.has(origin)) {
      return json({ok: false, code: "browser_origin_not_allowed"}, 403);
    }
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, accept, apikey",
      "access-control-max-age": "600",
      "vary": "Origin",
    };
    const path = new URL(req.url).pathname.replace(/^.*\/slop-mcp/, "") || "/";
    if (!browserRoutes.has(path)) {
      return json({ok: false, code: "browser_route_not_allowed"}, 403, headers);
    }
    if (req.method === "OPTIONS") {
      const method = req.headers.get("access-control-request-method");
      const requested = (req.headers.get("access-control-request-headers") ?? "")
        .toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
      if (!["GET", "POST"].includes(method) ||
          requested.some(value => !["authorization", "content-type", "accept", "apikey"].includes(value))) {
        return json({ok: false, code: "invalid_preflight"}, 403, headers);
      }
      return new Response(null, {status: 204, headers});
    }
    const response = await handle(req);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  };
}
