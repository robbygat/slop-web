// Authenticated Stripe Checkout creation.  Prices and credit quantities are
// server catalog values, and every session is bound to an expiring DB intent
// before its URL is released to the caller.  The webhook refuses sessions that
// do not carry this exact intent/session/user binding.

import {
  billingKey,
  createBillingClient as createClient,
} from "../_shared/billing_client.ts";
import Stripe from "npm:stripe@14.21.0";
import {
  checkoutKind,
  stripeCatalogFromEnv,
  stripeLivemode,
} from "../_shared/billing_catalog.ts";
import { publicPrice } from "../_shared/web_billing.mjs";
import {
  BoundedBodyError,
  isJsonContentType,
  readBoundedText,
} from "../_shared/bounded_body.ts";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info",
};
const MAX_BODY_BYTES = 4096;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function siteOrigin(): string {
  const configured = Deno.env.get("SITE_URL")?.trim() || "https://slop.game";
  const parsed = new URL(configured);
  const local = parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("SITE_URL must be an HTTPS origin");
  }
  return parsed.origin;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function billingEnabled(): boolean {
  return Deno.env.get("STRIPE_BILLING_ENABLED")?.trim().toLowerCase() ===
      "true" && Boolean(Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim());
}

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization")?.trim() ?? "";
  return /^Bearer\s+[^\s]+$/i.test(value) ? value : null;
}

export function createCheckoutHandler(deps: {
  createClient?: typeof createClient;
  createStripe?: (key: string) => Stripe;
} = {}) {
  const clientFactory = deps.createClient ?? createClient;
  const stripeFactory = deps.createStripe ?? ((key: string) =>
    new Stripe(key, {
      apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(),
    }));
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: CORS });
    }
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    const authorization = bearer(request);
    if (!authorization) return json({ error: "sign in first" }, 401);
    if (!isJsonContentType(request)) {
      return json({ error: "Content-Type must be application/json" }, 415);
    }
    if (!billingEnabled()) {
      return json({ error: "billing is not available" }, 503);
    }

    try {
      const supabaseUrl = requiredEnv("SUPABASE_URL");
      const anonKey = billingKey("public");
      const userClient = clientFactory(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { authorization } },
      });
      const { data: authData, error: authError } = await userClient.auth
        .getUser();
      if (authError || !authData.user || authData.user.is_anonymous === true) {
        return json({ error: "verified account required" }, 401);
      }
      const owner = authData.user;
      let raw: string;
      try {
        raw = await readBoundedText(request, MAX_BODY_BYTES);
      } catch (error) {
        if (
          error instanceof BoundedBodyError && error.failure === "too_large"
        ) {
          return json({ error: "request too large" }, 413);
        }
        return json({ error: "invalid JSON" }, 400);
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      const kind = checkoutKind(
        decoded && typeof decoded === "object"
          ? (decoded as Record<string, unknown>).kind
          : null,
      );
      if (!kind) return json({ error: "unknown plan" }, 400);
      // Coin packs are retired from the launch economy. Keep webhook support for
      // previously-created sessions, but never create a new top-up checkout.
      if (kind !== "pro") return json({ error: "unknown plan" }, 400);

      const catalog = stripeCatalogFromEnv();
      const priceId = catalog[kind];
      const serviceKey = billingKey("service");
      const stripeKey = requiredEnv("STRIPE_SECRET_KEY");
      const stripe = stripeFactory(stripeKey);
      const price = await stripe.prices.retrieve(priceId);
      if (
        price.id !== priceId || !publicPrice(price, stripeLivemode(stripeKey))
      ) {
        return json({ error: "checkout unavailable" }, 503);
      }
      const admin = clientFactory(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: intentData, error: intentError } = await admin.rpc(
        "create_stripe_checkout_intent",
        { p_user: owner.id, p_kind: kind, p_price_id: priceId },
      );
      if (intentError) {
        const rateLimited = /rate_limit|already_open/i.test(
          intentError.message,
        );
        return json(
          {
            error: rateLimited
              ? "checkout temporarily unavailable"
              : "checkout unavailable",
          },
          rateLimited ? 429 : 409,
        );
      }
      const intentRow = Array.isArray(intentData) ? intentData[0] : intentData;
      const intentId = String(intentRow?.intent_id ?? "");
      const customerId = String(intentRow?.stripe_customer_id ?? "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(intentId)) {
        throw new Error("checkout intent receipt was invalid");
      }

      const origin = siteOrigin();
      const isPro = kind === "pro";
      const cancelIntent = async (
        sessionId: string | null = null,
      ): Promise<boolean> => {
        const { data, error } = await admin.rpc(
          "cancel_stripe_checkout_intent",
          {
            p_intent: intentId,
            p_user: owner.id,
            p_session_id: sessionId,
          },
        );
        if (error || data !== true) {
          console.error("stripe_checkout_intent_retire_failed");
          return false;
        }
        return true;
      };
      if (isPro && customerId) {
        let subscriptions: Stripe.ApiList<Stripe.Subscription>;
        try {
          subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: "all",
            limit: 100,
          });
        } catch {
          if (!await cancelIntent()) {
            console.error("stripe_checkout_intent_retire_failed");
          }
          return json({ error: "checkout unavailable" }, 502);
        }
        const terminal = new Set(["canceled", "incomplete_expired"]);
        if (
          subscriptions.has_more ||
          subscriptions.data.some((subscription) =>
            !terminal.has(subscription.status)
          )
        ) {
          if (!await cancelIntent()) {
            return json({ error: "checkout unavailable" }, 502);
          }
          return json({ error: "subscription already exists" }, 409);
        }
      }
      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: isPro ? "subscription" : "payment",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          client_reference_id: owner.id,
          ...(customerId ? { customer: customerId } : {
            customer_email: owner.email ?? undefined,
            ...(isPro ? {} : { customer_creation: "always" as const }),
          }),
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
          success_url: `${origin}/?checkout=success#/shop`,
          cancel_url: `${origin}/?checkout=cancelled#/shop`,
          metadata: {
            checkout_intent_id: intentId,
            user_id: owner.id,
            kind,
          },
          ...(isPro
            ? {
              subscription_data: {
                metadata: {
                  checkout_intent_id: intentId,
                  user_id: owner.id,
                },
              },
            }
            : {}),
        }, { idempotencyKey: `slop-checkout-${intentId}` });
      } catch {
        // A transport timeout is ambiguous: Stripe may have committed the
        // idempotent Session even though its id never reached this isolate. Keep
        // the created DB outbox until its longer lease expires; retiring it now
        // would discard the only reconciliation/deletion blocker.
        console.error("stripe_checkout_provider_create_ambiguous");
        return json({ error: "checkout unavailable" }, 502);
      }

      const { data: bound, error: bindError } = await admin.rpc(
        "bind_stripe_checkout_session",
        {
          p_intent: intentId,
          p_user: owner.id,
          p_session_id: session.id,
        },
      );
      if (bindError || bound !== true || !session.url) {
        let providerTerminal = false;
        try {
          let confirmed = session;
          if (confirmed.status === "open") {
            confirmed = await stripe.checkout.sessions.expire(session.id);
          }
          if (confirmed.status !== "expired") {
            confirmed = await stripe.checkout.sessions.retrieve(session.id);
          }
          providerTerminal = confirmed.status === "expired" &&
            confirmed.payment_status !== "paid";
        } catch {
          console.error("stripe_checkout_provider_expire_failed");
        }
        if (providerTerminal) {
          if (!await cancelIntent(session.id)) {
            console.error("stripe_checkout_intent_retire_failed");
          }
        } else {
          // Keep created/bound authority live. A signed terminal webhook or an
          // operator reconciler must resolve it before deletion/new Checkout.
          console.error("stripe_checkout_provider_cleanup_required");
        }
        throw new Error("checkout session could not be bound");
      }
      const destination = new URL(session.url);
      if (
        destination.origin !== "https://checkout.stripe.com" ||
        destination.username || destination.password
      ) {
        throw new Error("invalid checkout destination");
      }
      return json({ url: destination.href }, 200);
    } catch {
      console.error("stripe_checkout_handler_failed");
      return json({ error: "checkout unavailable" }, 500);
    }
  };
}

export const handler = createCheckoutHandler();
