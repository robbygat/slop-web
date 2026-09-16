import {
  billingKey,
  createBillingClient as createClient,
} from "./billing_client.ts";
import Stripe from "npm:stripe@14.21.0";
import { stripeCatalogFromEnv } from "./billing_catalog.ts";

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";
function required(name: string): string {
  const value = env(name);
  if (!value) throw new Error("billing configuration unavailable");
  return value;
}
function userClient(authorization: string) {
  return createClient(required("SUPABASE_URL"), billingKey("public"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { authorization } },
  });
}
function stripe() {
  return new Stripe(required("STRIPE_SECRET_KEY"), {
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export const webBillingDependencies = {
  configuration() {
    const key = env("STRIPE_SECRET_KEY");
    const explicit = env("STRIPE_LIVEMODE").toLowerCase();
    const inferred = key.startsWith("sk_live_")
      ? true
      : key.startsWith("sk_test_")
      ? false
      : null;
    const livemode = inferred ??
      (explicit === "true" ? true : explicit === "false" ? false : null);
    const modeConflict = inferred !== null &&
      ["true", "false"].includes(explicit) &&
      (explicit === "true") !== inferred;
    let catalogReady = false;
    try {
      stripeCatalogFromEnv();
      catalogReady = true;
    } catch { /* fail closed */ }
    return {
      configured: Boolean(
        key && env("STRIPE_WEBHOOK_SECRET") && catalogReady &&
          livemode !== null && !modeConflict,
      ),
      enabled: env("STRIPE_BILLING_ENABLED").toLowerCase() === "true",
      portalConfigured: /^bpc_[A-Za-z0-9]{6,200}$/.test(
        env("STRIPE_PORTAL_CONFIGURATION"),
      ),
      livemode,
    };
  },
  async authenticate(authorization: string) {
    const { data, error } = await userClient(authorization).auth.getUser();
    if (error) return null;
    return data.user;
  },
  async readBilling(authorization: string) {
    const { data, error } = await userClient(authorization).rpc("my_billing");
    if (error) throw new Error("membership authority unavailable");
    return data;
  },
  async readAuthority(userId: string) {
    const admin = createClient(
      required("SUPABASE_URL"),
      billingKey("service"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await admin.rpc("stripe_web_billing_authority", {
      p_user: userId,
    });
    // A deployment without the new authority is unavailable, never a fallback
    // to the legacy billing.stripe_customer_id column.
    if (error) return { ready: false, customer_id: null };
    return data;
  },
  async readPrice() {
    return await stripe().prices.retrieve(stripeCatalogFromEnv().pro);
  },
  async createPortal(customerId: string) {
    const origin = new URL(env("SITE_URL") || "https://slop.game");
    if (origin.protocol !== "https:" || origin.username || origin.password) {
      throw new Error("invalid site origin");
    }
    const provider = stripe();
    const configuration = await provider.billingPortal.configurations.retrieve(
      required("STRIPE_PORTAL_CONFIGURATION"),
    );
    // The bridge grants one exact server-owned plan. A generic portal that
    // permits arbitrary product switching would charge for unsupported plans.
    if (
      !configuration.active ||
      configuration.features.subscription_update.enabled ||
      !configuration.features.subscription_cancel.enabled
    ) {
      throw new Error("unsupported membership management configuration");
    }
    return await provider.billingPortal.sessions.create({
      customer: customerId,
      configuration: configuration.id,
      return_url: `${origin.origin}/#/shop`,
    });
  },
};
