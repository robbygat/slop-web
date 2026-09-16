// Stripe webhook: verify signed raw bytes, re-fetch provider objects, validate
// exact server-owned prices, then invoke one atomic replay-safe billing RPC.
// Deploy with gateway JWT verification disabled; Stripe authenticates with its
// timestamped signature and the database functions accept service_role only.

import {
  billingKey,
  createBillingClient as createClient,
} from "../_shared/billing_client.ts";
import Stripe from "npm:stripe@14.21.0";
import {
  type CheckoutKind,
  checkoutKind,
  type StripeCatalog,
  stripeCatalogFromEnv,
} from "../_shared/billing_catalog.ts";
import {
  BoundedBodyError,
  isJsonContentType,
  readBoundedText,
} from "../_shared/bounded_body.ts";

const MAX_BODY_BYTES = 1024 * 1024;
const EVENT_TOLERANCE_SECONDS = 300;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function response(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function objectId(value: string | { id: string } | null | undefined): string {
  return typeof value === "string" ? value : value?.id ?? "";
}

function expectedLivemode(stripeKey: string): boolean {
  const explicit = Deno.env.get("STRIPE_LIVEMODE")?.trim().toLowerCase();
  const inferred = stripeKey.startsWith("sk_live_")
    ? true
    : stripeKey.startsWith("sk_test_")
    ? false
    : null;
  if (inferred !== null) {
    if (
      (explicit === "true" || explicit === "false") &&
      (explicit === "true") !== inferred
    ) {
      throw new Error("STRIPE_LIVEMODE contradicts the secret key mode");
    }
    return inferred;
  }
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  throw new Error("STRIPE_LIVEMODE must be configured for this key type");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function intentMetadata(
  metadata: Stripe.Metadata | null,
): { intentId: string; userId: string; kind: CheckoutKind } {
  const intentId = metadata?.checkout_intent_id?.trim() ?? "";
  const userId = metadata?.user_id?.trim() ?? "";
  const kind = checkoutKind(metadata?.kind);
  if (!UUID.test(intentId) || !UUID.test(userId) || !kind) {
    throw new Error("checkout authority metadata is missing");
  }
  return { intentId, userId, kind };
}

function exactSessionPrice(
  session: Stripe.Checkout.Session,
  expectedPriceId: string,
): string {
  const items = session.line_items?.data ?? [];
  if (
    session.line_items?.has_more || items.length !== 1 ||
    items[0].quantity !== 1
  ) {
    throw new Error("checkout line item shape is invalid");
  }
  const price = items[0].price;
  const priceId = objectId(price);
  if (price == null || priceId !== expectedPriceId) {
    throw new Error("checkout price mismatch");
  }
  if (typeof price === "string") {
    throw new Error("checkout price was not expanded");
  }
  const expectedSubtotal = price.unit_amount;
  if (expectedSubtotal == null || expectedSubtotal <= 0) {
    throw new Error("checkout price amount is invalid");
  }
  if (session.amount_subtotal !== expectedSubtotal) {
    throw new Error("checkout subtotal mismatch");
  }
  if (session.amount_total !== expectedSubtotal) {
    throw new Error("checkout total mismatch");
  }
  if (session.currency !== price.currency) {
    throw new Error("checkout currency mismatch");
  }
  return priceId;
}

function hasExactSubscriptionPrice(
  subscription: Stripe.Subscription,
  expectedPriceId: string,
): boolean {
  const items = subscription.items?.data ?? [];
  return !subscription.items?.has_more &&
    items.length === 1 &&
    items[0].quantity === 1 &&
    objectId(items[0].price) === expectedPriceId;
}

async function hasHistoricalSubscriptionGrant(
  admin: RpcClient,
  invoiceId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc(
    "has_historical_stripe_subscription_grant",
    { p_source_id: `invoice:${invoiceId}` },
  );
  if (error || typeof data !== "boolean") {
    throw new Error("historical Stripe grant authority is unavailable");
  }
  return data;
}

async function checkoutIntentPriceAuthority(
  admin: RpcClient,
  intentId: string,
  userId: string,
  kind: CheckoutKind,
): Promise<string> {
  const { data, error } = await admin.rpc(
    "stripe_checkout_intent_price_authority",
    { p_intent: intentId, p_user: userId, p_kind: kind },
  );
  const priceId = typeof data === "string" ? data : "";
  if (error || !/^price_[A-Za-z0-9_]{6,200}$/.test(priceId)) {
    throw new Error("Stripe Checkout price authority is unavailable");
  }
  return priceId;
}

async function subscriptionPriceAuthority(
  admin: RpcClient,
  subscriptionId: string,
  customerId: string,
): Promise<string> {
  const { data, error } = await admin.rpc(
    "stripe_subscription_price_authority",
    { p_subscription_id: subscriptionId, p_customer_id: customerId },
  );
  const priceId = typeof data === "string" ? data : "";
  if (error || !/^price_[A-Za-z0-9_]{6,200}$/.test(priceId)) {
    throw new Error("Stripe subscription price authority is unavailable");
  }
  return priceId;
}

async function rpc(
  admin: RpcClient,
  name: string,
  params: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin.rpc(name, params);
  if (error) throw new Error("billing authority RPC failed");
  return String(data ?? "");
}

async function processCheckout(
  stripe: Stripe,
  admin: RpcClient,
  event: Stripe.Event,
  payloadSha256: string,
): Promise<void> {
  const signed = event.data.object as Stripe.Checkout.Session;
  const session = await stripe.checkout.sessions.retrieve(signed.id, {
    expand: ["line_items.data.price", "subscription"],
  });
  if (session.status !== "complete") {
    throw new Error("checkout is not complete");
  }
  const authority = intentMetadata(session.metadata);
  if (session.client_reference_id !== authority.userId) {
    throw new Error("checkout user binding mismatch");
  }
  const expectedPriceId = await checkoutIntentPriceAuthority(
    admin,
    authority.intentId,
    authority.userId,
    authority.kind,
  );
  const priceId = exactSessionPrice(session, expectedPriceId);
  const common = {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_livemode: event.livemode,
    p_payload_sha256: payloadSha256,
    p_intent: authority.intentId,
    p_session_id: session.id,
    p_observed_user: authority.userId,
    p_observed_price_id: priceId,
  };

  if (authority.kind !== "pro") {
    if (session.mode !== "payment" || session.payment_status !== "paid") {
      throw new Error("topup is not paid");
    }
    if (
      (session.amount_total ?? 0) <= 0 || (session.amount_subtotal ?? 0) <= 0
    ) {
      throw new Error("zero-value topups are not allowed");
    }
    const paymentIntent = objectId(session.payment_intent);
    if (!paymentIntent) throw new Error("payment intent is missing");
    await rpc(admin, "apply_stripe_topup", {
      ...common,
      p_payment_intent_id: paymentIntent,
      p_customer_id: objectId(session.customer) || null,
    });
    return;
  }

  if (
    session.mode !== "subscription" ||
    session.payment_status !== "paid"
  ) {
    throw new Error("subscription checkout is not paid");
  }
  const subscriptionId = objectId(session.subscription);
  if (!subscriptionId) throw new Error("subscription is missing");
  const subscription = typeof session.subscription === "string"
    ? await stripe.subscriptions.retrieve(subscriptionId)
    : session.subscription as Stripe.Subscription;
  if (!["active", "trialing"].includes(subscription.status)) {
    throw new Error("subscription is not active");
  }
  if (!hasExactSubscriptionPrice(subscription, expectedPriceId)) {
    throw new Error("subscription item mismatch");
  }
  const customerId = objectId(subscription.customer);
  if (!customerId || customerId !== objectId(session.customer)) {
    throw new Error("subscription customer mismatch");
  }
  await rpc(admin, "apply_stripe_subscription_checkout", {
    ...common,
    p_subscription_id: subscription.id,
    p_customer_id: customerId,
    p_period_end: new Date(subscription.current_period_end * 1000)
      .toISOString(),
  });
}

async function processCheckoutExpired(
  stripe: Stripe,
  admin: RpcClient,
  event: Stripe.Event,
  payloadSha256: string,
): Promise<void> {
  const signed = event.data.object as Stripe.Checkout.Session;
  const session = await stripe.checkout.sessions.retrieve(signed.id);
  if (session.status !== "expired" || session.payment_status === "paid") {
    throw new Error("checkout expiry authority is invalid");
  }
  const authority = intentMetadata(session.metadata);
  if (session.client_reference_id !== authority.userId) {
    throw new Error("checkout expiry user binding mismatch");
  }
  await rpc(admin, "apply_stripe_checkout_expired", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_livemode: event.livemode,
    p_payload_sha256: payloadSha256,
    p_intent: authority.intentId,
    p_user: authority.userId,
    p_session_id: session.id,
  });
}

async function processInvoicePaid(
  stripe: Stripe,
  admin: RpcClient,
  event: Stripe.Event,
  payloadSha256: string,
): Promise<void> {
  const signed = event.data.object as Stripe.Invoice;
  const invoice = await stripe.invoices.retrieve(signed.id);
  if (
    invoice.status !== "paid" ||
    !["subscription_create", "subscription_cycle"].includes(
      invoice.billing_reason ?? "",
    )
  ) {
    return;
  }
  // A trial or 100%-discounted invoice may be marked paid with no collected
  // value. It may preserve provider-side Pro access, but it cannot mint the
  // fixed 600-coin monthly paid grant.
  if ((invoice.amount_paid ?? 0) <= 0 || (invoice.total ?? 0) <= 0) return;
  const subscriptionId = objectId(invoice.subscription);
  const customerId = objectId(invoice.customer);
  if (!subscriptionId || !customerId) {
    throw new Error("invoice subscription is missing");
  }
  const lines = await stripe.invoices.listLineItems(invoice.id, {
    limit: 100,
    expand: ["data.price"],
  });
  const recurring = lines.data.filter((line) => line.type === "subscription");
  if (lines.has_more || recurring.length !== 1 || recurring[0].quantity !== 1) {
    throw new Error("invoice line item shape is invalid");
  }
  const invoicePrice = recurring[0].price;
  const priceId = objectId(invoicePrice);
  const expectedPriceId = await subscriptionPriceAuthority(
    admin,
    subscriptionId,
    customerId,
  );
  if (priceId !== expectedPriceId) throw new Error("invoice price mismatch");
  if (
    invoicePrice == null || typeof invoicePrice === "string" ||
    invoicePrice.unit_amount == null ||
    invoicePrice.unit_amount <= 0 ||
    invoice.currency !== invoicePrice.currency ||
    invoice.amount_paid !== invoicePrice.unit_amount ||
    invoice.total !== invoicePrice.unit_amount
  ) {
    throw new Error("invoice price authority is invalid");
  }
  const invoicePaymentIntentId = objectId(invoice.payment_intent);
  if (!/^pi_[A-Za-z0-9_]{6,240}$/.test(invoicePaymentIntentId)) {
    throw new Error("invoice payment intent is missing");
  }
  const invoicePaymentIntent = await stripe.paymentIntents.retrieve(
    invoicePaymentIntentId,
  );
  const invoiceChargeId = objectId(invoicePaymentIntent.latest_charge);
  if (
    invoicePaymentIntent.status !== "succeeded" ||
    !/^ch_[A-Za-z0-9_]{6,240}$/.test(invoiceChargeId)
  ) {
    throw new Error("invoice payment is not charge-backed");
  }
  const invoiceCharge = await stripe.charges.retrieve(invoiceChargeId);
  if (
    invoiceCharge.paid !== true ||
    invoiceCharge.amount !== invoice.amount_paid ||
    invoiceCharge.currency !== invoice.currency ||
    objectId(invoiceCharge.invoice) !== invoice.id ||
    objectId(invoiceCharge.payment_intent) !== invoicePaymentIntent.id
  ) {
    throw new Error("invoice charge authority is invalid");
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (objectId(subscription.customer) !== customerId) {
    throw new Error("invoice customer mismatch");
  }
  if (!hasExactSubscriptionPrice(subscription, expectedPriceId)) {
    throw new Error("subscription item mismatch");
  }
  await rpc(admin, "apply_stripe_subscription_invoice", {
    p_event_id: event.id,
    p_event_created: event.created,
    p_livemode: event.livemode,
    p_payload_sha256: payloadSha256,
    p_invoice_id: invoice.id,
    p_subscription_id: subscriptionId,
    p_customer_id: customerId,
    p_observed_price_id: priceId,
    p_billing_reason: invoice.billing_reason,
    p_period_end: new Date(subscription.current_period_end * 1000)
      .toISOString(),
  });
}

async function processSubscriptionState(
  stripe: Stripe,
  admin: RpcClient,
  event: Stripe.Event,
  payloadSha256: string,
): Promise<void> {
  let subscription: Stripe.Subscription;
  let providerActive = false;
  if (event.type === "invoice.payment_failed") {
    const invoice = await stripe.invoices.retrieve(
      (event.data.object as Stripe.Invoice).id,
    );
    const subscriptionId = objectId(invoice.subscription);
    if (!subscriptionId) {
      throw new Error("failed invoice subscription is missing");
    }
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
    providerActive = false;
  } else {
    const source = event.data.object as Stripe.Subscription;
    subscription = event.type === "customer.subscription.deleted"
      ? source
      : await stripe.subscriptions.retrieve(source.id);
    providerActive = ["active", "trialing"].includes(subscription.status);
  }
  const customerId = objectId(subscription.customer);
  if (!customerId) throw new Error("subscription customer is missing");
  // A provider-side price switch must revoke, never preserve or mint, Pro.
  // The exact server-owned Price id also pins product/currency/amount; shape
  // and quantity checks prevent multi-item or metered quantity confusion.
  const expectedPriceId = await subscriptionPriceAuthority(
    admin,
    subscription.id,
    customerId,
  );
  const active = providerActive &&
    hasExactSubscriptionPrice(subscription, expectedPriceId);
  await rpc(admin, "apply_stripe_subscription_state", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_livemode: event.livemode,
    p_payload_sha256: payloadSha256,
    p_subscription_id: subscription.id,
    p_customer_id: customerId,
    p_active: active,
    p_period_end: active
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
  });
}

async function processTopupReversal(
  stripe: Stripe,
  admin: RpcClient,
  catalog: StripeCatalog,
  event: Stripe.Event,
  payloadSha256: string,
): Promise<void> {
  let dispute: Stripe.Dispute | null = null;
  let chargeId = "";
  if (event.type === "charge.refunded") {
    chargeId = (event.data.object as Stripe.Charge).id;
  } else {
    const signed = event.data.object as Stripe.Dispute;
    dispute = await stripe.disputes.retrieve(signed.id);
    if (dispute.livemode !== event.livemode) {
      throw new Error("dispute mode mismatch");
    }
    chargeId = objectId(dispute.charge);
  }
  if (!/^ch_[A-Za-z0-9_]{6,240}$/.test(chargeId)) {
    throw new Error("reversal charge is missing");
  }

  const charge = await stripe.charges.retrieve(chargeId);
  if (
    charge.id !== chargeId ||
    charge.livemode !== event.livemode ||
    charge.paid !== true ||
    !Number.isSafeInteger(charge.amount) ||
    charge.amount <= 0 ||
    !Number.isSafeInteger(charge.amount_refunded) ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > charge.amount
  ) {
    throw new Error("reversal charge authority is invalid");
  }
  if (dispute && objectId(dispute.charge) !== charge.id) {
    throw new Error("dispute charge mismatch");
  }

  const paymentIntentId = objectId(charge.payment_intent);
  if (!/^pi_[A-Za-z0-9_]{6,240}$/.test(paymentIntentId)) {
    throw new Error("reversal payment intent is missing");
  }
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (
    paymentIntent.id !== paymentIntentId ||
    paymentIntent.livemode !== event.livemode ||
    paymentIntent.status !== "succeeded" ||
    objectId(paymentIntent.latest_charge) !== charge.id ||
    paymentIntent.currency !== charge.currency ||
    objectId(paymentIntent.customer) !== objectId(charge.customer)
  ) {
    throw new Error("reversal payment intent authority is invalid");
  }

  // Charge.disputed is historical, not a reliable open-state bit, and one
  // charge may have multiple disputes. Aggregate the current provider list;
  // any unresolved/lost dispute keeps the full reversal hold. Bound the list
  // and fail closed rather than silently ignoring another page.
  const currentDisputes = await stripe.disputes.list({
    charge: charge.id,
    limit: 100,
  });
  if (currentDisputes.has_more) {
    throw new Error("reversal dispute authority is too large");
  }
  for (const current of currentDisputes.data) {
    if (
      current.livemode !== event.livemode ||
      objectId(current.charge) !== charge.id
    ) {
      throw new Error("reversal dispute authority is invalid");
    }
  }
  if (
    dispute &&
    !currentDisputes.data.some((current) => current.id === dispute?.id)
  ) {
    throw new Error("event dispute is not current");
  }
  const hasUnresolvedDispute = currentDisputes.data.some((current) =>
    !["won", "warning_closed"].includes(current.status)
  );

  const invoiceId = objectId(charge.invoice);
  if (invoiceId !== objectId(paymentIntent.invoice)) {
    throw new Error("reversal invoice binding mismatch");
  }
  if (invoiceId && !/^in_[A-Za-z0-9_]{6,240}$/.test(invoiceId)) {
    throw new Error("reversal invoice id is invalid");
  }
  let subscriptionId = "";
  let providerSubscriptionActive: boolean | null = null;
  let providerPeriodEnd: string | null = null;
  if (invoiceId) {
    const historicalGrant = await hasHistoricalSubscriptionGrant(
      admin,
      invoiceId,
    );
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (
      invoice.id !== invoiceId ||
      invoice.livemode !== event.livemode ||
      objectId(invoice.payment_intent) !== paymentIntent.id ||
      objectId(invoice.customer) !== objectId(charge.customer) ||
      invoice.currency !== charge.currency
    ) {
      throw new Error("reversal invoice authority is invalid");
    }
    subscriptionId = objectId(invoice.subscription);
    if (!/^sub_[A-Za-z0-9_]{6,200}$/.test(subscriptionId)) {
      // This Stripe account may receive unrelated one-off invoices. They are
      // not a Slop billing source and must not poison webhook delivery.
      return;
    }
    const invoiceLines = await stripe.invoices.listLineItems(invoice.id, {
      limit: 100,
      expand: ["data.price"],
    });
    const recurring = invoiceLines.data.filter((line) =>
      line.type === "subscription"
    );
    const invoicePrice = recurring[0]?.price;
    const invoicePriceId = objectId(invoicePrice);
    if (
      invoiceLines.has_more || recurring.length !== 1 ||
      recurring[0].quantity !== 1 ||
      invoicePrice == null || typeof invoicePrice === "string" ||
      invoicePrice.unit_amount == null ||
      invoicePrice.unit_amount <= 0 ||
      invoice.currency !== invoicePrice.currency ||
      invoice.amount_paid !== invoicePrice.unit_amount ||
      invoice.total !== invoicePrice.unit_amount ||
      invoice.amount_paid !== charge.amount
    ) {
      if (historicalGrant) {
        throw new Error("historical reversal invoice authority is invalid");
      }
      return;
    }
    // New liabilities must still use today's server catalog. A receipt that
    // already minted this exact invoice remains the immutable authority after
    // catalog rotation, so old-price refunds/disputes cannot be silently lost.
    if (!historicalGrant && invoicePriceId !== catalog.pro) {
      return;
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (
      subscription.id !== subscriptionId ||
      objectId(subscription.customer) !== objectId(invoice.customer)
    ) {
      throw new Error("reversal subscription authority is invalid");
    }
    providerSubscriptionActive = ["active", "trialing"].includes(
      subscription.status,
    ) && hasExactSubscriptionPrice(subscription, invoicePriceId);
    if (!Number.isSafeInteger(invoice.period_end) || invoice.period_end <= 0) {
      throw new Error("reversal invoice period is invalid");
    }
    providerPeriodEnd = new Date(invoice.period_end * 1000).toISOString();
  }
  const grantSourceId = invoiceId
    ? `invoice:${invoiceId}`
    : `payment_intent:${paymentIntent.id}`;

  await rpc(admin, "apply_stripe_topup_reversal", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_livemode: event.livemode,
    p_payload_sha256: payloadSha256,
    p_grant_source_id: grantSourceId,
    p_payment_intent_id: paymentIntent.id,
    p_invoice_id: invoiceId || null,
    p_subscription_id: subscriptionId || null,
    p_provider_subscription_active: providerSubscriptionActive,
    p_provider_period_end: providerPeriodEnd,
    p_charge_id: charge.id,
    p_charge_amount: charge.amount,
    p_amount_refunded: charge.amount_refunded,
    p_charge_disputed: hasUnresolvedDispute,
    p_dispute_id: dispute?.id ?? null,
    p_dispute_status: dispute?.status ?? null,
  });
}

export function createWebhookHandler(deps: {
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
    if (request.method !== "POST") return response("POST only", 405);
    const signature = request.headers.get("stripe-signature")?.trim() ?? "";
    if (!signature) return response("missing signature", 400);
    if (!isJsonContentType(request)) {
      return response("unsupported content type", 415);
    }

    try {
      const stripeKey = requiredEnv("STRIPE_SECRET_KEY");
      const webhookSecret = requiredEnv("STRIPE_WEBHOOK_SECRET");
      const stripe = stripeFactory(stripeKey);
      let raw: string;
      try {
        raw = await readBoundedText(request, MAX_BODY_BYTES);
      } catch (error) {
        if (
          error instanceof BoundedBodyError && error.failure === "too_large"
        ) {
          return response("request too large", 413);
        }
        return response("invalid body", 400);
      }
      let event: Stripe.Event;
      try {
        event = await stripe.webhooks.constructEventAsync(
          raw,
          signature,
          webhookSecret,
          EVENT_TOLERANCE_SECONDS,
          Stripe.createSubtleCryptoProvider(),
        );
      } catch {
        return response("bad signature", 400);
      }
      if (event.livemode !== expectedLivemode(stripeKey)) {
        console.error("Stripe event mode mismatch", event.id);
        return response("event mode mismatch", 400);
      }

      const payloadSha256 = await sha256Hex(raw);
      const admin = clientFactory(
        requiredEnv("SUPABASE_URL"),
        billingKey("service"),
        { auth: { persistSession: false, autoRefreshToken: false } },
      ) as unknown as RpcClient;
      const catalog = stripeCatalogFromEnv();
      switch (event.type) {
        case "checkout.session.completed":
          await processCheckout(stripe, admin, event, payloadSha256);
          break;
        case "checkout.session.expired":
          await processCheckoutExpired(stripe, admin, event, payloadSha256);
          break;
        case "invoice.paid":
          await processInvoicePaid(stripe, admin, event, payloadSha256);
          break;
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        case "invoice.payment_failed":
          await processSubscriptionState(
            stripe,
            admin,
            event,
            payloadSha256,
          );
          break;
        case "charge.refunded":
        case "charge.dispute.created":
        case "charge.dispute.updated":
        case "charge.dispute.closed":
        case "charge.dispute.funds_withdrawn":
        case "charge.dispute.funds_reinstated":
          await processTopupReversal(
            stripe,
            admin,
            catalog,
            event,
            payloadSha256,
          );
          break;
        default:
          break;
      }
      return response(JSON.stringify({ received: true }), 200);
    } catch {
      console.error("stripe_webhook_handler_failed");
      // A 500 asks Stripe to retry.  Database processing is one transaction and
      // both event-id and payment-source idempotency make every retry safe.
      return response("handler error", 500);
    }
  };
}

export const handler = createWebhookHandler();
