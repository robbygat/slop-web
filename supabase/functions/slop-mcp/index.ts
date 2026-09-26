import { BridgeError, mime, requireValue, UUID, VERSION } from "./contract.mjs";
import { createHandler } from "./handler.mjs";

const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
function platformKey(mapName: string, legacyName: string): string {
  const raw = Deno.env.get(mapName);
  if (!raw) return Deno.env.get(legacyName) ?? "";
  let named;
  try { named = JSON.parse(raw); } catch {
    throw new Error("Invalid platform key configuration");
  }
  requireValue(typeof named?.default === "string" && named.default.length > 0,
    "platform_key_unavailable", 503);
  return named.default;
}
const anon = platformKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const service = platformKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const knownCodes = new Set([
  "invalid_pairing",
  "pairing_expired",
  "invalid_connection",
  "authentication_required",
  "account_unavailable",
  "connection_limit",
  "connection_not_found",
  "request_conflict",
  "revision_conflict",
  "revision_superseded",
  "rate_limited",
  "project_limit",
  "confirmation_busy",
  "confirmation_expired",
  "version_changed",
]);
async function request(
  path: string,
  token: string | null,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
  apiKey = anon,
  timeoutMs = 30_000,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: "error",
    headers: {
      apikey: apiKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
      ...(body == null ? {} : { "content-type": "application/json" }),
    },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const code = knownCodes.has(result?.message) ? result.message : null;
    if (code) {
      throw new BridgeError(
        code,
        response.status === 401 || response.status === 403
          ? 403
          : code === "rate_limited"
          ? 429
          : 409,
      );
    }
    throw new BridgeError(
      response.status === 401
        ? "authentication_required"
        : "upstream_unavailable",
      response.status === 401 ? 401 : 503,
    );
  }
  return result;
}
const deps = {
  service: (action: string, input: unknown) =>
    request("/rest/v1/rpc/mcp_service", service.startsWith("sb_secret_") ? null : service, "POST", {
      p_action: action,
      p: input,
    }, {}, service),
  phone: (token: string, action: string, input: unknown) =>
    request("/rest/v1/rpc/mcp_phone", token, "POST", {
      p_action: action,
      p: input,
    }),
  verifyUser: async (token: string) => {
    const user = await request("/auth/v1/user", token);
    requireValue(
      user?.id && user.is_anonymous === false && !user.deleted_at &&
        !user.disabled,
      "authentication_required",
      401,
    );
    return user.id;
  },
  ensureDraft: async (
    token: string,
    draft: {
      slug: string;
      owner_id: string;
      name: string;
      description: string;
    },
  ) => {
    const path = `/rest/v1/games?slug=eq.${
      encodeURIComponent(draft.slug)
    }&select=id,slug,owner_id,status`;
    let rows = await request(path, token);
    if (!rows?.length) {
      // Use the same owner-bound RLS insertion as the mobile Studio. The
      // catalog holds only a placeholder; source stays in private Storage.
      await request("/rest/v1/games", token, "POST", {
        slug: draft.slug,
        owner_id: draft.owner_id,
        status: "draft",
        name: draft.name,
        description: draft.description,
        prompt: "Created with Slop MCP",
        html:
          "<!doctype html><html><body>Open this private draft in Slop.</body></html>",
      }, { "Prefer": "return=minimal" });
      rows = await request(path, token);
    }
    const row = rows?.[0];
    requireValue(
      rows?.length === 1 && row.owner_id === draft.owner_id &&
        row.slug === draft.slug && row.status === "draft",
      "draft_unavailable",
      409,
    );
    return row;
  },
  uploadFiles: async (
    token: string,
    slug: string,
    files: Record<string, string>,
    ownerId: string,
  ) => {
    // Bounded four-request fanout. A failed worker never continues launching
    // more uploads. The next confirmation retries the identical immutable set.
    const entries = Object.entries(files);
    // Storage completion requires the same owner-issued, bounded reservation
    // as mobile. Service-role storage writes would bypass this authority.
    const reservation = await request(
      "/rest/v1/rpc/reserve_game_draft_upload", token, "POST", {
        p_slug: slug,
        p_objects: entries.map(([path, body]) => ({
          path: `${slug}/${VERSION}/${path}`,
          bytes: new TextEncoder().encode(body).length,
          content_type: mime(path),
        })),
      },
    );
    requireValue(
      reservation?.owner_id === ownerId && reservation.slug === slug &&
        reservation.object_count === entries.length &&
        UUID.test(reservation.upload_id ?? "") &&
        Date.parse(reservation.expires_at) > Date.now(),
      "upload_not_confirmed", 503,
    );
    const metadata = btoa(JSON.stringify({slop_upload_id: reservation.upload_id}));
    let next = 0;
    let failure: unknown;
    await Promise.all(
      Array.from({ length: Math.min(4, entries.length) }, async () => {
        while (!failure && next < entries.length) {
          const [path, body] = entries[next++];
          try {
            const response = await fetch(
              `${base}/storage/v1/object/game-drafts/${slug}/${VERSION}/${path}`,
              {
                method: "POST",
                redirect: "error",
                headers: {
                  apikey: anon,
                  Authorization: `Bearer ${token}`,
                  "content-type": mime(path),
                  "x-upsert": "true",
                  "x-metadata": metadata,
                  "cache-control": "max-age=0",
                },
                body,
                signal: AbortSignal.timeout(30_000),
              },
            );
            if (!response.ok) {
              throw new BridgeError("upload_not_confirmed", 503);
            }
            await response.body?.cancel();
          } catch (error) {
            failure = error;
          }
        }
      }),
    );
    if (failure) throw failure;
  },
  // Verifying and snapshotting a large bundle can take well over 30 s; a
  // premature abort left the draft leased and the owner saw "busy" retries.
  preview: (token: string, input: unknown) =>
    request("/functions/v1/game-bundle", token, "POST", input, {}, anon, 120_000),
};
Deno.serve(createHandler(deps));
