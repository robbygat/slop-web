import { readBoundedText } from "./bounded_body.ts";

export function billingKey(kind: "public" | "service"): string {
  const modern = Deno.env.get(
    kind === "public" ? "SUPABASE_PUBLISHABLE_KEYS" : "SUPABASE_SECRET_KEYS",
  );
  if (modern) {
    const named = JSON.parse(modern);
    if (typeof named?.default !== "string" || !named.default) {
      throw new Error("platform key unavailable");
    }
    return named.default;
  }
  const legacy = Deno.env.get(
    kind === "public" ? "SUPABASE_ANON_KEY" : "SUPABASE_SERVICE_ROLE_KEY",
  )?.trim();
  if (!legacy) throw new Error("platform key unavailable");
  return legacy;
}
type User = { id: string; email?: string; is_anonymous?: boolean };
type Result = { data: unknown; error: { message: string } | null };
type Options = {
  auth?: unknown;
  global?: { headers?: { authorization?: string } };
};

// The current project disables legacy JWT API keys. Modern sb_secret_ keys
// belong in apikey only: treating them as a Bearer JWT makes every RPC fail.
// This adapter implements only the two server operations billing needs.
export function createBillingClient(
  base: string,
  key: string,
  options: Options = {},
) {
  const authorization = options.global?.headers?.authorization ??
    (key.startsWith("sb_") ? null : `Bearer ${key}`);
  async function call(path: string, body?: unknown): Promise<Result> {
    try {
      const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          apikey: key,
          ...(authorization ? { Authorization: authorization } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = JSON.parse(await readBoundedText(response, 1024 * 1024));
      if (!response.ok) {
        return {
          data: null,
          error: {
            message: typeof data?.message === "string"
              ? data.message
              : "backend unavailable",
          },
        };
      }
      return { data, error: null };
    } catch {
      return { data: null, error: { message: "backend unavailable" } };
    }
  }
  return {
    auth: {
      async getUser() {
        const { data, error } = await call("/auth/v1/user");
        return { data: { user: error ? null : data as User }, error };
      },
    },
    rpc(name: string, params: Record<string, unknown> = {}) {
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("invalid RPC name");
      return call(`/rest/v1/rpc/${name}`, params);
    },
  };
}
