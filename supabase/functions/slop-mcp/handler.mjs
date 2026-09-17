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
      const input = req.method === "POST"
        ? await readBody(req)
        : Object.fromEntries(url.searchParams);
      const bearer = req.headers.get("authorization")?.match(
        /^Bearer ([^\s]{1,4096})$/i,
      )?.[1];
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
        await deps.uploadFiles(bearer, draft.slug, validated.files, draft.owner_id);
        await phone("check_lease", {
          submission_id: draft.submission_id,
          lease: draft.lease,
        });
        const preview = await deps.preview(bearer, {
          action: "preview",
          slug: draft.slug,
          version: VERSION,
          expected_bundle_digest: validated.digest,
          expected_bundle_manifest: validated.manifest,
        });
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
    "/connections/revoke", "/drafts", "/drafts/confirm",
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
