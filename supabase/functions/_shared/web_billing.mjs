// Shared HTTP policy for the web membership endpoints. All identity and price
// authority is supplied by server adapters; request bodies never select either.
const ORIGINS = new Set(["https://slop.game", "https://www.slop.game"]);
const UNAVAILABLE =
  "Web membership checkout is being prepared. Your existing Slop membership still works here.";

function headers(request) {
  const origin = request.headers.get("origin");
  const result = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "Origin",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
  };
  if (ORIGINS.has(origin)) result["access-control-allow-origin"] = origin;
  return result;
}
function reply(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(request),
  });
}
function preflight(request, method) {
  const origin = request.headers.get("origin");
  if (origin && !ORIGINS.has(origin)) {
    return reply(request, { error: "origin not allowed" }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headers(request) });
  }
  if (request.method !== method) {
    return reply(request, { error: `${method} only` }, 405);
  }
  if (!/^Bearer\s+[^\s]+$/i.test(request.headers.get("authorization") || "")) {
    return reply(request, { error: "sign in first" }, 401);
  }
  return null;
}
function verified(user) {
  return user && typeof user.id === "string" && user.is_anonymous !== true;
}

export function publicPrice(price, livemode) {
  if (
    !price || price.active !== true || price.type !== "recurring" ||
    price.livemode !== livemode || price.recurring?.interval !== "month" ||
    price.recurring?.interval_count !== 1 ||
    !Number.isSafeInteger(price.unit_amount) ||
    price.unit_amount <= 0 || !/^[a-z]{3}$/.test(price.currency || "")
  ) return null;
  return {
    amount: price.unit_amount,
    currency: price.currency,
    interval: "month",
  };
}

export function createBillingStatusHandler(deps) {
  return async (request) => {
    const early = preflight(request, "GET");
    if (early) return early;
    try {
      const user = await deps.authenticate(
        request.headers.get("authorization"),
      );
      if (!verified(user)) {
        return reply(request, { error: "verified account required" }, 401);
      }
      const billing = await deps.readBilling(
        request.headers.get("authorization"),
      );
      // Absence of a billing row is a normal new-account state. RPC errors must
      // throw; they are never translated into a false claim of no membership.
      const row = Array.isArray(billing) ? billing[0] : billing;
      const base = {
        owner_id: user.id,
        available: false,
        premium: row?.is_pro === true,
        portal_available: false,
        price: null,
        message: UNAVAILABLE,
      };
      const config = deps.configuration();
      if (!config.configured) return reply(request, base);
      const authority = await deps.readAuthority(user.id);
      if (!authority?.ready) return reply(request, base);
      base.portal_available = Boolean(
        config.portalConfigured && authority.customer_id,
      );
      if (config.enabled) {
        base.price = publicPrice(await deps.readPrice(), config.livemode);
        base.available = Boolean(base.price);
      }
      if (base.available || base.portal_available) {
        base.message =
          "Your membership follows your Slop account between web and mobile.";
      }
      return reply(request, base);
    } catch {
      return reply(request, { error: "membership status unavailable" }, 503);
    }
  };
}

export function createBillingPortalHandler(deps) {
  return async (request) => {
    const early = preflight(request, "POST");
    if (early) return early;
    try {
      const user = await deps.authenticate(
        request.headers.get("authorization"),
      );
      if (!verified(user)) {
        return reply(request, { error: "verified account required" }, 401);
      }
      const config = deps.configuration();
      if (!config.configured || !config.portalConfigured) {
        return reply(request, {
          error: "membership management is being prepared",
        }, 503);
      }
      // Ignore all caller-supplied customer ids and return URLs. The exact
      // customer binding was created by an authenticated payment receipt.
      const authority = await deps.readAuthority(user.id);
      if (
        !authority?.ready ||
        !/^cus_[A-Za-z0-9_]{6,200}$/.test(authority.customer_id || "")
      ) {
        return reply(request, { error: "no web membership to manage" }, 409);
      }
      const session = await deps.createPortal(authority.customer_id);
      const url = new URL(session?.url);
      if (
        url.origin !== "https://billing.stripe.com" || url.username ||
        url.password
      ) {
        throw new Error("invalid provider destination");
      }
      return reply(request, { owner_id: user.id, url: url.href });
    } catch {
      return reply(
        request,
        { error: "membership management unavailable" },
        503,
      );
    }
  };
}
