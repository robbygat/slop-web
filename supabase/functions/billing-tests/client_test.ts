import assert from "node:assert/strict";
import { billingKey, createBillingClient } from "../_shared/billing_client.ts";

Deno.test("modern service key is apikey-only; authenticated user requests retain their exact Bearer JWT", async () => {
  const original = globalThis.fetch;
  const calls: { headers: Headers; redirect: RequestRedirect | undefined }[] =
    [];
  globalThis.fetch = async (_input, init) => {
    calls.push({
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await createBillingClient(
      "https://example.supabase.co",
      "sb_secret_fixture",
    ).rpc("stripe_web_billing_authority", { p_user: "fixture" });
    await createBillingClient(
      "https://example.supabase.co",
      "sb_publishable_fixture",
      { global: { headers: { authorization: "Bearer user-jwt-fixture" } } },
    ).auth.getUser();
    assert.equal(calls[0].headers.get("apikey"), "sb_secret_fixture");
    assert.equal(calls[0].headers.get("authorization"), null);
    assert.equal(calls[1].headers.get("apikey"), "sb_publishable_fixture");
    assert.equal(
      calls[1].headers.get("authorization"),
      "Bearer user-jwt-fixture",
    );
    assert.equal(calls[0].redirect, "error");
    assert.equal(calls[1].redirect, "error");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("modern named keys take precedence and invalid maps cannot fall back to disabled legacy keys", () => {
  const names = ["SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"];
  const prior = new Map(names.map((n) => [n, Deno.env.get(n)]));
  try {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "legacy-fixture");
    Deno.env.set(
      "SUPABASE_SECRET_KEYS",
      JSON.stringify({ default: "sb_secret_fixture" }),
    );
    assert.equal(billingKey("service"), "sb_secret_fixture");
    Deno.env.set("SUPABASE_SECRET_KEYS", "{}");
    assert.throws(() => billingKey("service"), /platform key unavailable/);
    Deno.env.set("SUPABASE_SECRET_KEYS", "invalid-json");
    assert.throws(() => billingKey("service"));
  } finally {
    for (const [name, value] of prior) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
