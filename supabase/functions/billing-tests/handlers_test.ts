import assert from "node:assert/strict";
import Stripe from "npm:stripe@14.21.0";
import { createCheckoutHandler } from "../stripe-checkout/handler.ts";
import { createWebhookHandler } from "../stripe-webhook/handler.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const intent = "33333333-3333-4333-8333-333333333333";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-public",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_WEBHOOK_SECRET: "whsec_fake",
  STRIPE_PRICE_PRO: "price_monthlyPro",
  STRIPE_PRICE_TOPUP_SMALL: "price_historicSmall",
  STRIPE_PRICE_TOPUP_LARGE: "price_historicLarge",
  STRIPE_BILLING_ENABLED: "true",
  SITE_URL: "https://slop.game",
};
async function configured(
  work: () => Promise<void>,
  overrides: Record<string, string> = {},
) {
  const values = { ...env, ...overrides };
  const prior = new Map(Object.keys(values).map((k) => [k, Deno.env.get(k)]));
  for (const [k, v] of Object.entries(values)) Deno.env.set(k, v);
  try {
    await work();
  } finally {
    for (const [k, v] of prior) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}
function checkoutFixture(
  {
    bind = true,
    user = { id: owner, is_anonymous: false, email: "qa@example.invalid" },
  } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let checkoutArgs: Record<string, unknown> | null = null;
  const fakeClient = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        error: null,
        data: name === "create_stripe_checkout_intent"
          ? { intent_id: intent, stripe_customer_id: null }
          : name === "bind_stripe_checkout_session"
          ? bind
          : true,
      };
    },
  };
  const stripe = {
    prices: {
      retrieve: async () => ({
        id: env.STRIPE_PRICE_PRO,
        active: true,
        type: "recurring",
        livemode: false,
        unit_amount: 1500,
        currency: "usd",
        recurring: { interval: "month", interval_count: 1 },
      }),
    },
    checkout: {
      sessions: {
        create: async (args: Record<string, unknown>) => {
          checkoutArgs = args;
          return {
            id: "cs_test_boundSession",
            url: "https://checkout.stripe.com/c/pay/cs_test_boundSession",
            status: "open",
          };
        },
        expire: async () => ({ status: "expired", payment_status: "unpaid" }),
      },
    },
  };
  const handler = createCheckoutHandler({
    createClient: (() => fakeClient) as never,
    createStripe: (() => stripe) as never,
  });
  const request = (body: unknown) =>
    new Request("https://api.slop.game/functions/v1/stripe-checkout", {
      method: "POST",
      headers: {
        authorization: "Bearer fixture",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  return {
    handler,
    request,
    calls,
    get checkoutArgs() {
      return checkoutArgs;
    },
  };
}
Deno.test("checkout ignores caller price/owner, binds the authenticated intent and uses fixed web return routes", () =>
  configured(async () => {
    const f = checkoutFixture();
    const response = await f.handler(
      f.request({
        kind: "pro",
        user_id: "victim",
        price_id: "price_fake",
        credits: 999999,
        return_url: "https://attacker.invalid",
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(f.calls[0], {
      name: "create_stripe_checkout_intent",
      args: { p_user: owner, p_kind: "pro", p_price_id: env.STRIPE_PRICE_PRO },
    });
    assert.equal(f.calls[1].name, "bind_stripe_checkout_session");
    assert.deepEqual(f.checkoutArgs?.line_items, [{
      price: env.STRIPE_PRICE_PRO,
      quantity: 1,
    }]);
    assert.equal(
      f.checkoutArgs?.success_url,
      "https://slop.game/?checkout=success#/shop",
    );
    assert.equal(
      f.checkoutArgs?.cancel_url,
      "https://slop.game/?checkout=cancelled#/shop",
    );
  }));
Deno.test("unbound checkout never releases a payment URL and retires the confirmed expired provider session", () =>
  configured(async () => {
    const f = checkoutFixture({ bind: false });
    const response = await f.handler(f.request({ kind: "pro" }));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).url, undefined);
    assert.ok(
      f.calls.some((c) =>
        c.name === "cancel_stripe_checkout_intent" &&
        c.args.p_session_id === "cs_test_boundSession"
      ),
    );
  }));
Deno.test("checkout rejects retired top-ups and missing webhook configuration before any provider call", () =>
  configured(async () => {
    const f = checkoutFixture();
    assert.equal(
      (await f.handler(f.request({ kind: "topup_small" }))).status,
      400,
    );
    assert.equal(f.calls.length, 0);
    Deno.env.set("STRIPE_WEBHOOK_SECRET", "");
    assert.equal((await f.handler(f.request({ kind: "pro" }))).status, 503);
    assert.equal(f.calls.length, 0);
  }));

function webhookFixture(
  change: Record<string, unknown> = {},
  rpcFails = false,
) {
  const stripe = new Stripe("sk_test_fake", {
    httpClient: Stripe.createFetchHttpClient(),
  });
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const session = {
    id: "cs_test_paidSession",
    status: "complete",
    mode: "subscription",
    payment_status: "paid",
    metadata: { checkout_intent_id: intent, user_id: owner, kind: "pro" },
    client_reference_id: owner,
    amount_subtotal: 1500,
    amount_total: 1500,
    currency: "usd",
    line_items: {
      has_more: false,
      data: [{
        quantity: 1,
        price: { id: env.STRIPE_PRICE_PRO, unit_amount: 1500, currency: "usd" },
      }],
    },
    customer: "cus_fixtureOwner",
    subscription: {
      id: "sub_fixtureOwner",
      status: "active",
      customer: "cus_fixtureOwner",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: {
        has_more: false,
        data: [{ quantity: 1, price: env.STRIPE_PRICE_PRO }],
      },
    },
    ...change,
  };
  stripe.checkout.sessions.retrieve = (async () => session) as never;
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data: name === "stripe_checkout_intent_price_authority"
          ? env.STRIPE_PRICE_PRO
          : "applied",
        error: rpcFails ? { message: "database offline" } : null,
      };
    },
  };
  const handler = createWebhookHandler({
    createClient: (() => client) as never,
    createStripe: () => stripe,
  });
  async function request(
    {
      livemode = false,
      timestamp = Math.floor(Date.now() / 1000),
      corrupt = false,
    } = {},
  ) {
    const raw = JSON.stringify({
      id: "evt_fixtureEvent",
      type: "checkout.session.completed",
      livemode,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: session.id } },
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${raw}`),
    );
    const signature = `t=${timestamp},v1=${
      [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0"))
        .join("")
    }`;
    return new Request("https://api.slop.game/functions/v1/stripe-webhook", {
      method: "POST",
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      body: raw + (corrupt ? " " : ""),
    });
  }
  return { handler, request, calls };
}
Deno.test("real Stripe signature verification gates provider retrieval and one atomic billing RPC", () =>
  configured(async () => {
    const f = webhookFixture();
    const response = await f.handler(await f.request());
    assert.equal(response.status, 200);
    assert.deepEqual(f.calls.map((c) => c.name), [
      "stripe_checkout_intent_price_authority",
      "apply_stripe_subscription_checkout",
    ]);
    assert.equal(f.calls[1].args.p_observed_user, owner);
    assert.equal(f.calls[1].args.p_observed_price_id, env.STRIPE_PRICE_PRO);
    assert.match(String(f.calls[1].args.p_payload_sha256), /^[a-f0-9]{64}$/);
  }));
Deno.test("altered raw bytes, expired signatures and test/live mode mismatch cannot mutate billing", () =>
  configured(async () => {
    for (
      const options of [{ corrupt: true }, { timestamp: 1 }, { livemode: true }]
    ) {
      const f = webhookFixture();
      assert.equal((await f.handler(await f.request(options))).status, 400);
      assert.equal(f.calls.length, 0);
    }
  }));
Deno.test("authenticated payment events still require exact price, amount, currency and owner binding", () =>
  configured(async () => {
    for (
      const change of [{ amount_total: 1499 }, { currency: "eur" }, {
        client_reference_id: "22222222-2222-4222-8222-222222222222",
      }, {
        line_items: {
          has_more: false,
          data: [{
            quantity: 1,
            price: { id: "price_foreign", unit_amount: 1500, currency: "usd" },
          }],
        },
      }]
    ) {
      const f = webhookFixture(change);
      assert.equal((await f.handler(await f.request())).status, 500);
      assert.equal(f.calls.some((c) => c.name.startsWith("apply_")), false);
    }
  }));
Deno.test("failed authority RPCs request provider retry instead of acknowledging a lost purchase", () =>
  configured(async () => {
    const f = webhookFixture({}, true);
    assert.equal((await f.handler(await f.request())).status, 500);
  }));
