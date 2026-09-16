# Web membership billing

Web and mobile use the same Supabase account, `my_billing` entitlement, coin ledger, and Stripe catalog. There is one current subscription product, `pro`. New coin-pack checkouts are retired; historical purchase/refund processing remains supported. No price or grant quantity is accepted from the browser.

## Deployed in this overhaul

- `billing-status`: verifies the caller with Supabase Auth, reads the caller's shared membership, and returns a bound `owner_id`. Displays a price only when configuration, database authority, and the active Stripe monthly price all agree.
- `stripe-checkout`: creates an authenticated, expiring database intent, uses Stripe idempotency, binds the provider session to that intent, and only then releases a `checkout.stripe.com` URL. Returns to `/?checkout=success#/shop` or `/?checkout=cancelled#/shop`. The success URL never grants membership.
- `stripe-webhook`: verifies bounded raw bytes and timestamped signatures, checks test/live mode, re-fetches provider objects, validates exact amounts/prices/customer/session ownership, and calls atomic database routines. Database errors return a retryable error. Event ids and paid invoice/payment sources are independently replay protected.
- `stripe-portal`: uses only signed-payment customer ownership, a fixed return URL, and an explicitly configured Stripe portal. It never uses a caller-supplied customer or the historical client-writable billing customer field. Product switching must be disabled and cancellation must be enabled in that portal configuration.

The server adapters support the project's current `SUPABASE_PUBLISHABLE_KEYS.default` and `SUPABASE_SECRET_KEYS.default` platform keys. Modern secret keys are sent in `apikey`, never masquerading as Bearer JWTs. User calls always carry the user's actual JWT. Secrets never reach game frames or the web bundle.

The production database was missing all Stripe authority tables/routines even though its migration registry contained the older migration versions. The billing-only recovery in `supabase/billing/restore-authority.sql` was validated against local PostgreSQL, executed against production inside a transaction ending in `ROLLBACK`, then applied. The separately reviewed allowance patch changes only three debit predicates to exclude Stripe refunds from free-allowance consumption. Existing account deletion, game, storage, and identity routines were preserved. No balances, prices, subscriptions, or customer records were changed by recovery.

Receipts retain private, random transaction-subject UUIDs. Their separate live-account links become null when an account is erased, so receipts do not block deletion. Late provider events can settle against those receipts but cannot recreate the account, grant coins, or restore its membership. Production client roles cannot read payment receipt tables or execute payment mutators.

## Activation deferred by the owner

The owner explicitly deferred Stripe activation during this overhaul. The website displays **Coming soon**; configuration below is a future release task.

### Required before future activation

New sales are disabled. The deployment was verified without creating a Checkout session, charging a card, sending a real webhook, or enabling subscriptions. These external configuration and operational steps still need completion before enabling sales:

1. Configure a **test-mode** Stripe webhook at `https://api.slop.game/functions/v1/stripe-webhook`. Add its signing secret as `STRIPE_WEBHOOK_SECRET` in [Supabase Edge Function secrets](https://supabase.com/dashboard/project/yqlolbebqfsodqgjlbeh/functions/secrets). Never paste it into a chat or commit it.
2. Confirm `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, historical top-up price ids, and webhook all use the same Stripe mode/account. Restricted Stripe keys also require an explicit `STRIPE_LIVEMODE`. `SITE_URL` is `https://slop.game`.
3. Create a Stripe Customer Portal configuration allowing cancellation and payment-method/invoice management, with subscription product switching disabled. Set its `bpc_…` identifier as `STRIPE_PORTAL_CONFIGURATION`.
4. Complete a test-mode round trip: authenticated Checkout, paid webhook, shared web/mobile entitlement, replayed delivery, renewal, cancellation, refund/dispute, and another account being unable to access the receipt or portal. Test fixtures passing locally do not substitute for a provider round trip.
5. Finish and verify provider cleanup on account erasure **before enabling recurring sales**. Account deletion now retains the private settlement information without blocking erasure; it does not itself cancel a Stripe subscription or resolve a provider timeout where the session id never reached the application. Those provider operations need a reliable, retryable cleanup path, including pre-webhook and ambiguous Checkout cases. Switching the feature flag alone is insufficient.
6. After those checks, configure the corresponding live-mode keys/webhook/catalog and explicitly set `STRIPE_BILLING_ENABLED=true`. The flag is absent/off at delivery. The current mobile release also keeps new premium enrollment off.

Subscribe the webhook to `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, and `charge.dispute.funds_reinstated`.

## Verification

```sh
node --test test/billing-http.test.mjs supabase/billing/test/authority.test.mjs
deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/billing-tests/
deno check --no-lock --node-modules-dir=none supabase/functions/billing-status/index.ts supabase/functions/stripe-checkout/index.ts supabase/functions/stripe-webhook/index.ts supabase/functions/stripe-portal/index.ts
```

The PostgreSQL tests reuse the existing MCP package's PGlite development dependency (`npm --prefix mcp ci`). They exercise real SQL for replay, duplicate invoice sources, wrong owners/prices, legacy customer spoofing, refund holds, delayed checkout reconciliation, and deletion before/after payment. The Deno tests verify actual Stripe HMAC signatures with outbound networking disabled. HTTP tests exercise origin restrictions, authenticated account selection, missing configuration, price validation, and portal isolation.

Do not run `supabase db push` from this legacy checkout: its old migrations do not represent the current mobile database. `node tools/prepare-billing-recovery.mjs --check > /tmp/slop-billing-check.sql` assembles the reviewed one-time recovery with `ROLLBACK`; omitting `--check` assembles it with `COMMIT`. Recovery has already been applied to `yqlolbebqfsodqgjlbeh`; it is not a routine redeployment step. Read current definitions and review changes before another schema operation.
