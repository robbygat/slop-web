-- STAGED BILLING RECOVERY ONLY. Do not run db push on this legacy checkout.
-- Ported from mobile e2538ff, with all unrelated account/game/storage patches
-- excluded. Run docs/billing.md preflight and test-mode verification first.
-- No sales become available until STRIPE_BILLING_ENABLED is explicitly enabled.
begin;

-- The current allowance routine must already exclude provider corrections
-- from free-coin consumption. Do not replace it with an older mobile function.
do $recovery_preflight$
begin
  if to_regclass('public.account_delete_intents') is null
     or to_regprocedure('public.is_nonanonymous_user(uuid)') is null
     or to_regprocedure('public.has_account_delete_intent(uuid)') is null
     or to_regprocedure('public._sweep_credits(uuid)') is null
     or coalesce(strpos(pg_get_functiondef(
       to_regprocedure('public._net_coin_spend_since(uuid,timestamp with time zone)')
     ), 'stripe_topup_reversal'), 0) = 0 then
    raise exception 'review live account and coin allowance authorities before billing recovery';
  end if;
end;
$recovery_preflight$;

-- Stripe billing authority, replay protection, and ordered subscription state.
--
-- The Stripe signature is verified by the stripe-webhook Edge Function.  This
-- migration makes the resulting database mutations atomic and independently
-- replay safe:
--   * every checkout is first bound to an authenticated, expiring DB intent;
--   * every Stripe event id is accepted once, with a payload digest check;
--   * every payment intent / invoice grants credits once even if Stripe emits
--     more than one event for the same purchase;
--   * subscription state is ordered by Stripe's signed event.created value, so
--     a delayed invoice cannot reactivate a subscription deleted later; and
--   * a deletion/failure clears pro_until instead of leaving an unlimited
--     entitlement behind through the legacy set_pro_status COALESCE behavior.

do $stripe_billing_preflight$
begin
  if to_regclass('public.billing') is null
     or to_regclass('public.credit_ledger') is null
     or to_regclass('public.coin_ledger') is null
     or to_regprocedure(
       'public.ensure_billing(uuid)'
     ) is null
     or to_regprocedure(
       'public.grant_credits(uuid,integer,text)'
     ) is null then
    raise exception 'stripe billing authority requires the existing billing ledger';
  end if;
  if has_function_privilege(
       'anon', 'public.grant_credits(uuid,integer,text)', 'execute'
     )
     or has_function_privilege(
       'authenticated', 'public.grant_credits(uuid,integer,text)', 'execute'
     )
     or has_function_privilege(
       'anon', 'public.ensure_billing(uuid)', 'execute'
     )
     or has_function_privilege(
       'authenticated', 'public.ensure_billing(uuid)', 'execute'
     )
     or not has_function_privilege(
       'service_role', 'public.grant_credits(uuid,integer,text)', 'execute'
     )
     or not has_function_privilege(
       'service_role', 'public.ensure_billing(uuid)', 'execute'
     ) then
    raise exception 'billing RPC lockdown must run before Stripe authority'
      using errcode = '42501';
  end if;
end;
$stripe_billing_preflight$;

create table if not exists public.stripe_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (
    kind in ('pro', 'topup_small', 'topup_large')
  ),
  price_id text not null check (
    price_id ~ '^price_[A-Za-z0-9_]{6,200}$'
  ),
  credits integer not null check (credits in (600, 3000)),
  expected_customer_id text check (
    expected_customer_id is null
    or expected_customer_id ~ '^cus_[A-Za-z0-9_]{6,200}$'
  ),
  stripe_session_id text unique check (
    stripe_session_id is null
    or stripe_session_id ~ '^cs_(test_|live_)?[A-Za-z0-9_]{6,240}$'
  ),
  state text not null default 'created' check (
    state in ('created', 'bound', 'fulfilled', 'expired')
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '35 minutes'),
  bound_at timestamptz,
  fulfilled_at timestamptz,
  check (expires_at > created_at),
  check ((state in ('created', 'expired')) or stripe_session_id is not null)
);

create index if not exists stripe_checkout_intents_user_created_idx
  on public.stripe_checkout_intents (user_id, created_at desc);

-- One open membership checkout per account.  The creation RPC expires stale
-- rows before inserting, and its per-user advisory lock closes the race.
create unique index if not exists stripe_checkout_one_open_pro_idx
  on public.stripe_checkout_intents (user_id)
  where kind = 'pro' and state in ('created', 'bound');

create table if not exists public.stripe_customer_owners (
  customer_id text primary key check (
    customer_id ~ '^cus_[A-Za-z0-9_]{6,200}$'
  ),
  user_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_subscriptions (
  subscription_id text primary key check (
    subscription_id ~ '^sub_[A-Za-z0-9_]{6,200}$'
  ),
  user_id uuid not null,
  customer_id text not null references public.stripe_customer_owners(customer_id)
    on delete cascade,
  checkout_intent_id uuid not null unique
    references public.stripe_checkout_intents(id) on delete cascade,
  price_id text not null check (
    price_id ~ '^price_[A-Za-z0-9_]{6,200}$'
  ),
  active boolean not null,
  current_period_end timestamptz,
  state_event_created bigint not null check (state_event_created >= 0),
  state_event_id text not null,
  state_event_type text not null check (length(state_event_type) between 3 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_subscriptions_user_idx
  on public.stripe_subscriptions (user_id, updated_at desc);
create unique index if not exists stripe_subscriptions_one_active_user_idx
  on public.stripe_subscriptions (user_id) where active;

create table if not exists public.stripe_webhook_events (
  event_id text primary key check (
    event_id ~ '^evt_[A-Za-z0-9_]{6,240}$'
  ),
  event_type text not null check (length(event_type) between 3 and 120),
  event_created bigint not null check (event_created >= 0),
  livemode boolean not null,
  payload_sha256 text not null check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  user_id uuid,
  checkout_intent_id uuid
    references public.stripe_checkout_intents(id) on delete set null,
  source_id text check (source_id is null or length(source_id) between 3 and 255),
  outcome text not null default 'processing'
    check (length(outcome) between 3 and 80),
  processed_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_processed_idx
  on public.stripe_webhook_events (processed_at desc);

create table if not exists public.stripe_billing_grants (
  source_id text primary key check (length(source_id) between 3 and 255),
  -- The purchase source remains as non-PII replay evidence after an account
  -- deletion, while the user UUID is removed so deletion is never blocked.
  user_id uuid,
  grant_kind text not null check (grant_kind in ('topup', 'pro_monthly')),
  credits integer not null check (credits in (600, 3000)),
  first_event_id text not null
    references public.stripe_webhook_events(event_id) on delete restrict,
  created_at timestamptz not null default now()
);

-- All four tables are server audit/authority state.  Edge Functions can use
-- only the narrow SECURITY DEFINER RPCs below; no direct service-role DML is
-- needed, and clients cannot read billing provider identifiers.
alter table public.stripe_checkout_intents enable row level security;
alter table public.stripe_customer_owners enable row level security;
alter table public.stripe_subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_billing_grants enable row level security;

revoke all on table public.stripe_checkout_intents
  from public, anon, authenticated, service_role;
revoke all on table public.stripe_customer_owners
  from public, anon, authenticated, service_role;
revoke all on table public.stripe_subscriptions
  from public, anon, authenticated, service_role;
revoke all on table public.stripe_webhook_events
  from public, anon, authenticated, service_role;
revoke all on table public.stripe_billing_grants
  from public, anon, authenticated, service_role;

-- Begin an event inside the caller's transaction.  ON CONFLICT handles two
-- concurrent Stripe deliveries; a reused id with different signed bytes fails
-- closed instead of being treated as an innocent retry.
create or replace function public._stripe_begin_event(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_existing public.stripe_webhook_events%rowtype;
begin
  if p_event_id is null
     or p_event_id !~ '^evt_[A-Za-z0-9_]{6,240}$'
     or p_event_type is null
     or length(p_event_type) not between 3 and 120
     or p_event_created is null
     or p_event_created < 0
     or p_event_created > extract(epoch from now() + interval '1 day')::bigint
     or p_livemode is null
     or p_payload_sha256 is null
     or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_stripe_event' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_events (
    event_id, event_type, event_created, livemode, payload_sha256
  ) values (
    p_event_id, p_event_type, p_event_created, p_livemode, p_payload_sha256
  ) on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then return true; end if;

  select * into v_existing
    from public.stripe_webhook_events event_row
   where event_row.event_id = p_event_id;
  if v_existing.payload_sha256 <> p_payload_sha256
     or v_existing.event_type <> p_event_type
     or v_existing.event_created <> p_event_created
     or v_existing.livemode <> p_livemode then
    raise exception 'stripe_event_reuse_mismatch' using errcode = '22023';
  end if;
  return false;
end;
$$;

revoke all on function public._stripe_begin_event(text,text,bigint,boolean,text)
  from public, anon, authenticated, service_role;

-- Financial receipts retain only the random owner UUID, not an identity row.
-- A nullable live-account link is added below. Provider replay after erasure
-- records settlement without recreating an account, membership or coin balance.
create or replace function public._stripe_ensure_live_billing(p_user uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from auth.users where id = p_user for key share;
  if not found or not coalesce(public.is_nonanonymous_user(p_user), false)
     or public.has_account_delete_intent(p_user) then return false; end if;
  perform public.ensure_billing(p_user);
  return true;
end;
$$;
revoke all on function public._stripe_ensure_live_billing(uuid)
  from public, anon, authenticated, service_role;

-- Insert a provider purchase source before invoking the legacy credit grant.
-- The row and grant_credits run in the same transaction, so neither can commit
-- without the other.  A second event for the same invoice/payment intent sees
-- the same authority row and never mints again.
create or replace function public._stripe_grant_once(
  p_source_id text,
  p_user uuid,
  p_grant_kind text,
  p_credits integer,
  p_event_id text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_existing public.stripe_billing_grants%rowtype;
begin
  insert into public.stripe_billing_grants (
    source_id, user_id, grant_kind, credits, first_event_id
  ) values (
    p_source_id, p_user, p_grant_kind, p_credits, p_event_id
  ) on conflict (source_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing
      from public.stripe_billing_grants grant_row
     where grant_row.source_id = p_source_id;
    if v_existing.user_id is distinct from p_user
       or v_existing.grant_kind <> p_grant_kind
       or v_existing.credits <> p_credits then
      raise exception 'stripe_purchase_source_mismatch' using errcode = '22023';
    end if;
    return false;
  end if;

  if public._stripe_ensure_live_billing(p_user) then
    perform public.grant_credits(p_user, p_credits, p_reason);
  end if;
  return true;
end;
$$;

revoke all on function public._stripe_grant_once(text,uuid,text,integer,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.create_stripe_checkout_intent(
  p_user uuid,
  p_kind text,
  p_price_id text
) returns table (
  intent_id uuid,
  credits integer,
  stripe_customer_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_credits integer;
  v_customer text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_user is null or not exists (
    select 1 from auth.users auth_user where auth_user.id = p_user
  ) then
    raise exception 'unknown_checkout_user' using errcode = '22023';
  end if;
  if p_price_id is null
     or p_price_id !~ '^price_[A-Za-z0-9_]{6,200}$' then
    raise exception 'invalid_stripe_price' using errcode = '22023';
  end if;
  v_credits := case p_kind
    when 'pro' then 600
    when 'topup_small' then 600
    when 'topup_large' then 3000
    else null
  end;
  if v_credits is null then
    raise exception 'invalid_checkout_kind' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe_checkout:' || p_user::text, 0)
  );
  update public.stripe_checkout_intents intent_row
     set state = 'expired'
   where intent_row.user_id = p_user
     and intent_row.state = 'created'
     and intent_row.expires_at <= now();

  if p_kind = 'pro' and (
    exists (
      select 1 from public.billing billing_row
       where billing_row.user_id = p_user
         and (
           billing_row.is_pro
           or billing_row.pro_until > now()
         )
    )
    or exists (
    select 1 from public.stripe_subscriptions subscription_row
     where subscription_row.user_id = p_user and subscription_row.active
    )
  ) then
    raise exception 'subscription_already_active' using errcode = '23505';
  end if;
  if p_kind = 'pro' and exists (
    select 1 from public.stripe_checkout_intents intent_row
     where intent_row.user_id = p_user
       and intent_row.kind = 'pro'
       and intent_row.state in ('created', 'bound')
  ) then
    raise exception 'subscription_checkout_already_open' using errcode = '23505';
  end if;
  if (
    select count(*) from public.stripe_checkout_intents intent_row
     where intent_row.user_id = p_user
       and intent_row.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'checkout_rate_limit' using errcode = '54000';
  end if;

  perform public.ensure_billing(p_user);
  select billing_row.stripe_customer_id into v_customer
    from public.billing billing_row where billing_row.user_id = p_user;
  if v_customer is not null
     and v_customer !~ '^cus_[A-Za-z0-9_]{6,200}$' then
    raise exception 'invalid_existing_stripe_customer' using errcode = '22023';
  end if;

  insert into public.stripe_checkout_intents (
    user_id, kind, price_id, credits, expected_customer_id
  ) values (
    p_user, p_kind, p_price_id, v_credits, v_customer
  ) returning id into v_id;

  intent_id := v_id;
  credits := v_credits;
  stripe_customer_id := v_customer;
  return next;
end;
$$;

revoke all on function public.create_stripe_checkout_intent(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.create_stripe_checkout_intent(uuid,text,text)
  to service_role;

create or replace function public.bind_stripe_checkout_session(
  p_intent uuid,
  p_user uuid,
  p_session_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.stripe_checkout_intents%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if not coalesce(public.is_nonanonymous_user(p_user), false)
     or public.has_account_delete_intent(p_user) then
    raise exception 'verified_account_required' using errcode = '42501';
  end if;
  if p_session_id is null
     or p_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9_]{6,240}$' then
    raise exception 'invalid_checkout_session' using errcode = '22023';
  end if;

  select * into v_intent
    from public.stripe_checkout_intents intent_row
   where intent_row.id = p_intent and intent_row.user_id = p_user
   for update;
  if not found then
    raise exception 'checkout_intent_not_found' using errcode = '22023';
  end if;
  if v_intent.state = 'bound'
     and v_intent.stripe_session_id = p_session_id then
    return true;
  end if;
  if v_intent.state <> 'created' or v_intent.expires_at <= now() then
    raise exception 'checkout_intent_not_bindable' using errcode = '55000';
  end if;

  update public.stripe_checkout_intents intent_row
     set state = 'bound', stripe_session_id = p_session_id, bound_at = now()
   where intent_row.id = p_intent;
  return true;
end;
$$;

revoke all on function public.bind_stripe_checkout_session(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.bind_stripe_checkout_session(uuid,uuid,text)
  to service_role;

-- Best-effort cleanup when Stripe session creation or DB binding fails.  It
-- cannot cancel a fulfilled purchase, and a bound intent can be retired only
-- by naming its exact provider session.
create or replace function public.cancel_stripe_checkout_intent(
  p_intent uuid,
  p_user uuid,
  p_session_id text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  update public.stripe_checkout_intents intent_row
     set state = 'expired'
   where intent_row.id = p_intent
     and intent_row.user_id = p_user
     and (
       intent_row.state = 'created'
       or (
         intent_row.state = 'bound'
         and p_session_id is not null
         and intent_row.stripe_session_id = p_session_id
       )
     );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.cancel_stripe_checkout_intent(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.cancel_stripe_checkout_intent(uuid,uuid,text)
  to service_role;

create or replace function public.apply_stripe_topup(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_intent uuid,
  p_session_id text,
  p_observed_user uuid,
  p_observed_price_id text,
  p_payment_intent_id text,
  p_customer_id text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.stripe_checkout_intents%rowtype;
  v_new_event boolean;
  v_granted boolean;
  v_owner uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_event_type not in (
       'checkout.session.completed',
       'checkout.session.async_payment_succeeded'
     )
     or p_payment_intent_id is null
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{6,240}$'
     or (p_customer_id is not null
         and p_customer_id !~ '^cus_[A-Za-z0-9_]{6,200}$') then
    raise exception 'invalid_topup_event' using errcode = '22023';
  end if;

  v_new_event := public._stripe_begin_event(
    p_event_id, p_event_type, p_event_created, p_livemode, p_payload_sha256
  );
  if not v_new_event then return 'duplicate_event'; end if;

  select * into v_intent
    from public.stripe_checkout_intents intent_row
   where intent_row.id = p_intent
   for update;
  if not found
     or v_intent.state not in ('bound', 'fulfilled')
     or v_intent.kind not in ('topup_small', 'topup_large')
     or v_intent.stripe_session_id <> p_session_id
     or v_intent.user_id <> p_observed_user
     or v_intent.price_id <> p_observed_price_id
     or p_event_created > extract(
       epoch from v_intent.expires_at + interval '5 minutes'
     )::bigint then
    raise exception 'topup_intent_mismatch' using errcode = '22023';
  end if;
  if v_intent.expected_customer_id is not null
     and v_intent.expected_customer_id is distinct from p_customer_id then
    raise exception 'topup_customer_mismatch' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe_billing:' || v_intent.user_id::text, 0)
  );
  if p_customer_id is not null then
    insert into public.stripe_customer_owners (customer_id, user_id)
      values (p_customer_id, v_intent.user_id)
      on conflict (customer_id) do nothing;
    select owner_row.user_id into v_owner
      from public.stripe_customer_owners owner_row
     where owner_row.customer_id = p_customer_id;
    if v_owner is distinct from v_intent.user_id then
      raise exception 'stripe_customer_owner_mismatch' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.stripe_customer_owners owner_row
       where owner_row.user_id = v_intent.user_id
         and owner_row.customer_id <> p_customer_id
    ) then
      raise exception 'stripe_user_customer_mismatch' using errcode = '22023';
    end if;
  end if;

  v_granted := public._stripe_grant_once(
    'payment_intent:' || p_payment_intent_id,
    v_intent.user_id,
    'topup',
    v_intent.credits,
    p_event_id,
    'topup'
  );
  update public.stripe_checkout_intents intent_row
     set state = 'fulfilled', fulfilled_at = coalesce(fulfilled_at, now())
   where intent_row.id = v_intent.id;
  if p_customer_id is not null then
    update public.billing billing_row
       set stripe_customer_id = p_customer_id
     where billing_row.user_id = v_intent.user_id
       and (billing_row.stripe_customer_id is null
            or billing_row.stripe_customer_id = p_customer_id);
  end if;
  update public.stripe_webhook_events event_row
     set user_id = v_intent.user_id,
         checkout_intent_id = v_intent.id,
         source_id = 'payment_intent:' || p_payment_intent_id,
         outcome = case when v_granted then 'applied' else 'duplicate_source' end,
         processed_at = now()
   where event_row.event_id = p_event_id;
  return case when v_granted then 'applied' else 'duplicate_source' end;
end;
$$;

revoke all on function public.apply_stripe_topup(
  text,text,bigint,boolean,text,uuid,text,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.apply_stripe_topup(
  text,text,bigint,boolean,text,uuid,text,uuid,text,text,text
) to service_role;

create or replace function public.apply_stripe_subscription_checkout(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_intent uuid,
  p_session_id text,
  p_observed_user uuid,
  p_observed_price_id text,
  p_subscription_id text,
  p_customer_id text,
  p_period_end timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.stripe_checkout_intents%rowtype;
  v_subscription public.stripe_subscriptions%rowtype;
  v_new_event boolean;
  v_owner uuid;
  v_mapping_found boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_event_type not in (
       'checkout.session.completed',
       'checkout.session.async_payment_succeeded'
     )
     or p_subscription_id is null
     or p_subscription_id !~ '^sub_[A-Za-z0-9_]{6,200}$'
     or p_customer_id is null
     or p_customer_id !~ '^cus_[A-Za-z0-9_]{6,200}$'
     or p_period_end is null
     or p_period_end < to_timestamp(p_event_created) - interval '1 day'
     or p_period_end > to_timestamp(p_event_created) + interval '370 days' then
    raise exception 'invalid_subscription_checkout' using errcode = '22023';
  end if;

  v_new_event := public._stripe_begin_event(
    p_event_id, p_event_type, p_event_created, p_livemode, p_payload_sha256
  );
  if not v_new_event then return 'duplicate_event'; end if;

  select * into v_intent
    from public.stripe_checkout_intents intent_row
   where intent_row.id = p_intent
   for update;
  if not found
     or v_intent.state not in ('bound', 'fulfilled')
     or v_intent.kind <> 'pro'
     or v_intent.stripe_session_id <> p_session_id
     or v_intent.user_id <> p_observed_user
     or v_intent.price_id <> p_observed_price_id
     or p_event_created > extract(
       epoch from v_intent.expires_at + interval '5 minutes'
     )::bigint
     or (v_intent.expected_customer_id is not null
         and v_intent.expected_customer_id <> p_customer_id) then
    raise exception 'subscription_intent_mismatch' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe_billing:' || v_intent.user_id::text, 0)
  );
  insert into public.stripe_customer_owners (customer_id, user_id)
    values (p_customer_id, v_intent.user_id)
    on conflict (customer_id) do nothing;
  select owner_row.user_id into v_owner
    from public.stripe_customer_owners owner_row
   where owner_row.customer_id = p_customer_id;
  if v_owner is distinct from v_intent.user_id
     or exists (
       select 1 from public.stripe_customer_owners owner_row
        where owner_row.user_id = v_intent.user_id
          and owner_row.customer_id <> p_customer_id
     ) then
    raise exception 'stripe_customer_owner_mismatch' using errcode = '22023';
  end if;

  select * into v_subscription
    from public.stripe_subscriptions subscription_row
   where subscription_row.subscription_id = p_subscription_id
   for update;
  if found then
    v_mapping_found := true;
    if v_subscription.user_id <> v_intent.user_id
       or v_subscription.customer_id <> p_customer_id
       or v_subscription.checkout_intent_id <> v_intent.id
       or v_subscription.price_id <> p_observed_price_id then
      raise exception 'stripe_subscription_mapping_mismatch' using errcode = '22023';
    end if;
    -- An inactive event wins ties at Stripe's one-second timestamp precision.
    -- Therefore an equally-timestamped delayed checkout cannot undo deletion.
    if v_subscription.state_event_type <>
         'customer.subscription.deleted'
       and (
         p_event_created > v_subscription.state_event_created
         or (
           p_event_created = v_subscription.state_event_created
           and v_subscription.active
         )
       ) then
      update public.stripe_subscriptions subscription_row
         set active = true,
             current_period_end = p_period_end,
             state_event_created = p_event_created,
             state_event_id = p_event_id,
             state_event_type = p_event_type,
             updated_at = now()
       where subscription_row.subscription_id = p_subscription_id;
    end if;
  else
    if exists (
      select 1 from public.stripe_subscriptions subscription_row
       where subscription_row.user_id = v_intent.user_id
         and subscription_row.active
    ) then
      raise exception 'different_subscription_already_active'
        using errcode = '23505';
    end if;
    insert into public.stripe_subscriptions (
      subscription_id, user_id, customer_id, checkout_intent_id, price_id,
      active, current_period_end, state_event_created, state_event_id,
      state_event_type
    ) values (
      p_subscription_id, v_intent.user_id, p_customer_id, v_intent.id,
      p_observed_price_id, true, p_period_end, p_event_created, p_event_id,
      p_event_type
    );
  end if;

  if public._stripe_ensure_live_billing(v_intent.user_id) then
  if not v_mapping_found
     or (
       v_subscription.state_event_type <>
         'customer.subscription.deleted'
       and p_event_created > v_subscription.state_event_created
     )
     or (
       p_event_created = v_subscription.state_event_created
       and v_subscription.active
     ) then
    update public.billing billing_row
       set is_pro = true,
           pro_until = p_period_end,
           stripe_customer_id = p_customer_id
     where billing_row.user_id = v_intent.user_id;
  end if;
  end if;
  update public.stripe_checkout_intents intent_row
     set state = 'fulfilled', fulfilled_at = coalesce(fulfilled_at, now())
   where intent_row.id = v_intent.id;
  update public.stripe_webhook_events event_row
     set user_id = v_intent.user_id,
         checkout_intent_id = v_intent.id,
         source_id = 'subscription:' || p_subscription_id,
         outcome = 'subscription_registered',
         processed_at = now()
   where event_row.event_id = p_event_id;
  return 'subscription_registered';
end;
$$;

revoke all on function public.apply_stripe_subscription_checkout(
  text,text,bigint,boolean,text,uuid,text,uuid,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_checkout(
  text,text,bigint,boolean,text,uuid,text,uuid,text,text,text,timestamptz
) to service_role;

create or replace function public.apply_stripe_subscription_invoice(
  p_event_id text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_invoice_id text,
  p_subscription_id text,
  p_customer_id text,
  p_observed_price_id text,
  p_billing_reason text,
  p_period_end timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.stripe_subscriptions%rowtype;
  v_new_event boolean;
  v_granted boolean;
  v_reason text;
  v_outcome text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_invoice_id is null
     or p_invoice_id !~ '^in_[A-Za-z0-9_]{6,240}$'
     or p_subscription_id is null
     or p_subscription_id !~ '^sub_[A-Za-z0-9_]{6,200}$'
     or p_customer_id is null
     or p_customer_id !~ '^cus_[A-Za-z0-9_]{6,200}$'
     or p_billing_reason not in ('subscription_create', 'subscription_cycle')
     or p_period_end is null
     or p_period_end < to_timestamp(p_event_created) - interval '1 day'
     or p_period_end > to_timestamp(p_event_created) + interval '370 days' then
    raise exception 'invalid_subscription_invoice' using errcode = '22023';
  end if;

  v_new_event := public._stripe_begin_event(
    p_event_id, 'invoice.paid', p_event_created, p_livemode, p_payload_sha256
  );
  if not v_new_event then return 'duplicate_event'; end if;

  select * into v_subscription
    from public.stripe_subscriptions subscription_row
   where subscription_row.subscription_id = p_subscription_id
   for update;
  if not found then
    -- Stripe may deliver invoice.paid before checkout.session.completed.  The
    -- raised transaction leaves no journal row, producing a 500 so Stripe will
    -- retry after the checkout event registers the authoritative mapping.
    raise exception 'subscription_mapping_not_ready' using errcode = '55000';
  end if;
  if v_subscription.customer_id <> p_customer_id
     or v_subscription.price_id <> p_observed_price_id then
    raise exception 'subscription_invoice_mapping_mismatch' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe_billing:' || v_subscription.user_id::text, 0
    )
  );
  -- A paid invoice created before a later deletion still receives its one
  -- purchased monthly grant when delivered late, but never reactivates Pro.
  if not v_subscription.active
     and v_subscription.state_event_type = 'customer.subscription.deleted'
     and p_event_created > v_subscription.state_event_created then
    update public.stripe_webhook_events event_row
       set user_id = v_subscription.user_id,
           checkout_intent_id = v_subscription.checkout_intent_id,
           source_id = 'invoice:' || p_invoice_id,
           outcome = 'ignored_inactive_subscription',
           processed_at = now()
     where event_row.event_id = p_event_id;
    return 'ignored_inactive_subscription';
  end if;

  v_reason := case p_billing_reason
    when 'subscription_create' then 'pro_signup'
    else 'pro_renewal'
  end;
  v_granted := public._stripe_grant_once(
    'invoice:' || p_invoice_id,
    v_subscription.user_id,
    'pro_monthly',
    600,
    p_event_id,
    v_reason
  );

  if (
       v_subscription.active
       or v_subscription.state_event_type <>
          'customer.subscription.deleted'
     )
     and p_event_created >= v_subscription.state_event_created then
    update public.stripe_subscriptions subscription_row
       set active = true,
           current_period_end = p_period_end,
           state_event_created = p_event_created,
           state_event_id = p_event_id,
           state_event_type = 'invoice.paid',
           updated_at = now()
     where subscription_row.subscription_id = p_subscription_id;
    if public._stripe_ensure_live_billing(v_subscription.user_id) then
    update public.billing billing_row
       set is_pro = true,
           pro_until = p_period_end,
           stripe_customer_id = p_customer_id
     where billing_row.user_id = v_subscription.user_id;
    end if;
  end if;

  v_outcome := case when v_granted then 'applied' else 'duplicate_source' end;
  update public.stripe_webhook_events event_row
     set user_id = v_subscription.user_id,
         checkout_intent_id = v_subscription.checkout_intent_id,
         source_id = 'invoice:' || p_invoice_id,
         outcome = v_outcome,
         processed_at = now()
   where event_row.event_id = p_event_id;
  return v_outcome;
end;
$$;

revoke all on function public.apply_stripe_subscription_invoice(
  text,bigint,boolean,text,text,text,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_invoice(
  text,bigint,boolean,text,text,text,text,text,text,timestamptz
) to service_role;

create or replace function public.apply_stripe_subscription_state(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_subscription_id text,
  p_customer_id text,
  p_active boolean,
  p_period_end timestamptz default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.stripe_subscriptions%rowtype;
  v_new_event boolean;
  v_outcome text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_event_type not in (
       'customer.subscription.updated',
       'customer.subscription.deleted',
       'invoice.payment_failed'
     )
     or p_subscription_id is null
     or p_subscription_id !~ '^sub_[A-Za-z0-9_]{6,200}$'
     or p_customer_id is null
     or p_customer_id !~ '^cus_[A-Za-z0-9_]{6,200}$'
     or p_active is null
     or (
       p_active
       and (
         p_period_end is null
         or p_period_end < to_timestamp(p_event_created) - interval '1 day'
         or p_period_end >
            to_timestamp(p_event_created) + interval '370 days'
       )
     ) then
    raise exception 'invalid_subscription_state_event' using errcode = '22023';
  end if;

  v_new_event := public._stripe_begin_event(
    p_event_id, p_event_type, p_event_created, p_livemode, p_payload_sha256
  );
  if not v_new_event then return 'duplicate_event'; end if;

  select * into v_subscription
    from public.stripe_subscriptions subscription_row
   where subscription_row.subscription_id = p_subscription_id
   for update;
  if not found then
    raise exception 'subscription_mapping_not_ready' using errcode = '55000';
  end if;
  if v_subscription.customer_id <> p_customer_id then
    raise exception 'subscription_customer_mismatch' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe_billing:' || v_subscription.user_id::text, 0
    )
  );
  if p_event_created < v_subscription.state_event_created
     or (
       p_active
       and not v_subscription.active
       and (
         p_event_created = v_subscription.state_event_created
         or v_subscription.state_event_type =
            'customer.subscription.deleted'
       )
     ) then
    v_outcome := 'stale_state_ignored';
  else
    update public.stripe_subscriptions subscription_row
       set active = p_active,
           current_period_end = case
             when p_active then p_period_end else current_period_end
           end,
           state_event_created = p_event_created,
           state_event_id = p_event_id,
           state_event_type = p_event_type,
           updated_at = now()
     where subscription_row.subscription_id = p_subscription_id;

    if public._stripe_ensure_live_billing(v_subscription.user_id) then
    if p_active then
      update public.billing billing_row
         set is_pro = true,
             pro_until = p_period_end,
             stripe_customer_id = p_customer_id
       where billing_row.user_id = v_subscription.user_id;
      v_outcome := 'subscription_active';
    else
      -- Do not clear a newer, different active subscription for the same user.
      if not exists (
        select 1 from public.stripe_subscriptions other_subscription
         where other_subscription.user_id = v_subscription.user_id
           and other_subscription.subscription_id <> p_subscription_id
           and other_subscription.active
      ) then
        update public.billing billing_row
           set is_pro = false,
               pro_until = null
         where billing_row.user_id = v_subscription.user_id;
      end if;
      v_outcome := 'subscription_inactive';
    end if;
    else
      v_outcome := 'account_closed';
    end if;
  end if;

  update public.stripe_webhook_events event_row
     set user_id = v_subscription.user_id,
         checkout_intent_id = v_subscription.checkout_intent_id,
         source_id = 'subscription:' || p_subscription_id,
         outcome = v_outcome,
         processed_at = now()
   where event_row.event_id = p_event_id;
  return v_outcome;
end;
$$;

revoke all on function public.apply_stripe_subscription_state(
  text,text,bigint,boolean,text,text,text,boolean,timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_state(
  text,text,bigint,boolean,text,text,text,boolean,timestamptz
) to service_role;

-- Future functions in this migration are private by default, but assert the
-- complete RPC allowlist now in case an older hosted default privilege exists.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

drop index if exists public.stripe_checkout_one_open_pro_idx;
create unique index if not exists stripe_checkout_one_open_user_idx
  on public.stripe_checkout_intents (user_id)
  where state in ('created', 'bound');

-- This row can precede the original checkout event. Stripe does not promise
-- webhook ordering, so a refund/dispute must remain pending until the matching
-- payment-intent grant arrives rather than being acknowledged and forgotten.
create table if not exists public.stripe_topup_reversals (
  id uuid not null default gen_random_uuid() unique,
  source_id text primary key check (
    source_id ~ '^payment_intent:pi_[A-Za-z0-9_]{6,240}$'
    or source_id ~ '^invoice:in_[A-Za-z0-9_]{6,240}$'
  ),
  payment_intent_id text not null unique check (
    payment_intent_id ~ '^pi_[A-Za-z0-9_]{6,240}$'
  ),
  invoice_id text unique check (
    invoice_id is null or invoice_id ~ '^in_[A-Za-z0-9_]{6,240}$'
  ),
  subscription_id text check (
    subscription_id is null or
    subscription_id ~ '^sub_[A-Za-z0-9_]{6,200}$'
  ),
  provider_subscription_active boolean,
  provider_period_end timestamptz,
  charge_id text not null check (charge_id ~ '^ch_[A-Za-z0-9_]{6,240}$'),
  user_id uuid,
  credits_granted integer check (credits_granted in (600, 3000)),
  credits_reversed integer not null default 0 check (
    credits_reversed between 0 and 3000
    and (credits_granted is null or credits_reversed <= credits_granted)
  ),
  charge_amount bigint not null check (charge_amount between 1 and 1000000000),
  amount_refunded bigint not null check (
    amount_refunded between 0 and charge_amount
  ),
  charge_disputed boolean not null,
  dispute_id text check (
    dispute_id is null or dispute_id ~ '^dp_[A-Za-z0-9_]{6,240}$'
  ),
  dispute_status text check (
    dispute_status is null or dispute_status in (
      'warning_needs_response', 'warning_under_review', 'warning_closed',
      'needs_response', 'under_review', 'won', 'lost'
    )
  ),
  last_event_id text not null
    references public.stripe_webhook_events(event_id) on delete restrict,
  last_event_created bigint not null check (last_event_created >= 0),
  balance_after_adjustment integer,
  debt_at_last_adjustment integer not null default 0 check (
    debt_at_last_adjustment >= 0
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stripe_topup_reversals_user_idx
  on public.stripe_topup_reversals (user_id, updated_at desc);
create index if not exists stripe_topup_reversals_pending_idx
  on public.stripe_topup_reversals (updated_at)
  where credits_granted is null;
alter table public.stripe_topup_reversals enable row level security;
revoke all on table public.stripe_topup_reversals
  from public, anon, authenticated, service_role;

-- Reconcile one provider snapshot to one cumulative ledger adjustment. The
-- target is full revocation while funds are disputed, otherwise the ceiling
-- of the cumulative refunded fraction. A later won dispute may restore only
-- the previously revoked difference. No balance precondition exists: already
-- spent value becomes a negative balance and therefore freezes paid spending.
create or replace function public._apply_pending_stripe_topup_reversal(
  p_source_id text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reversal public.stripe_topup_reversals%rowtype;
  v_grant public.stripe_billing_grants%rowtype;
  v_target integer;
  v_delta integer;
  v_balance integer;
  v_outcome text;
  v_updated integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-topup-reversal:' || p_source_id, 0)
  );
  select reversal.* into v_reversal
    from public.stripe_topup_reversals reversal
   where reversal.source_id = p_source_id
   for update;
  if not found then return 'no_reversal'; end if;

  select grant_row.* into v_grant
    from public.stripe_billing_grants grant_row
   where grant_row.source_id = p_source_id
     and grant_row.grant_kind in ('topup', 'pro_monthly')
   for update;
  if not found then
    if v_reversal.subscription_id is not null
       and (
         v_reversal.charge_disputed
         or v_reversal.amount_refunded = v_reversal.charge_amount
       ) then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'stripe-subscription:' || v_reversal.subscription_id,
          0
        )
      );
      update public.stripe_subscriptions subscription_row
         set active = false,
             state_event_created = greatest(
               subscription_row.state_event_created,
               v_reversal.last_event_created
             ),
             state_event_id = v_reversal.last_event_id,
             state_event_type = 'credit_reversal_hold',
             updated_at = now()
       where subscription_row.subscription_id = v_reversal.subscription_id
         and subscription_row.current_period_end <= v_reversal.provider_period_end;
      get diagnostics v_updated = row_count;
      if v_updated > 0 and not exists (
        select 1
          from public.stripe_subscriptions other_subscription
         where other_subscription.user_id = (
           select held_subscription.user_id
             from public.stripe_subscriptions held_subscription
            where held_subscription.subscription_id =
              v_reversal.subscription_id
         )
           and other_subscription.subscription_id <>
             v_reversal.subscription_id
           and other_subscription.active
      ) then
        update public.billing billing_row
           set is_pro = false,
               pro_until = null
         where billing_row.user_id = (
           select subscription_row.user_id
             from public.stripe_subscriptions subscription_row
            where subscription_row.subscription_id = v_reversal.subscription_id
         );
      end if;
    end if;
    update public.stripe_webhook_events event_row
       set source_id = p_source_id,
           outcome = 'reversal_pending_grant',
           processed_at = now()
     where event_row.event_id = v_reversal.last_event_id;
    return 'reversal_pending_grant';
  end if;

  if v_reversal.user_id is not null
     and v_reversal.user_id is distinct from v_grant.user_id then
    raise exception 'stripe_reversal_owner_mismatch' using errcode = '22023';
  end if;
  if v_reversal.credits_granted is not null
     and v_reversal.credits_granted <> v_grant.credits then
    raise exception 'stripe_reversal_grant_mismatch' using errcode = '22023';
  end if;

  if v_reversal.charge_disputed
     or (
       v_reversal.dispute_status is not null
       and v_reversal.dispute_status not in ('won', 'warning_closed')
     ) then
    v_target := v_grant.credits;
  else
    v_target := least(
      v_grant.credits,
      (
        v_grant.credits::bigint * v_reversal.amount_refunded
        + v_reversal.charge_amount - 1
      ) / v_reversal.charge_amount
    )::integer;
  end if;
  v_delta := v_target - v_reversal.credits_reversed;

  if public._stripe_ensure_live_billing(v_grant.user_id) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'slop-account:' || v_grant.user_id::text,
        0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('slop_coins:' || v_grant.user_id::text)
    );
    -- Move a not-yet-observed legacy billing credit into the ledger before
    -- debiting it. The adjustment then remains exact whether refund or grant
    -- arrived first and whether the user had already spent the pack.
    perform public._sweep_credits(v_grant.user_id);
    if v_delta > 0 then
      insert into public.coin_ledger (
        user_id, delta, reason, request_id
      ) values (
        v_grant.user_id,
        -v_delta,
        'stripe_topup_reversal',
        'stripe-topup:' || v_reversal.id::text
      );
      v_outcome := 'topup_reversed';
    elsif v_delta < 0 then
      insert into public.coin_ledger (
        user_id, delta, reason, request_id
      ) values (
        v_grant.user_id,
        -v_delta,
        'stripe_topup_reinstatement',
        'stripe-topup:' || v_reversal.id::text
      );
      v_outcome := 'topup_reinstated';
    else
      v_outcome := 'reversal_current';
    end if;
    select coalesce(pg_catalog.sum(ledger.delta), 0)::integer
      into v_balance
      from public.coin_ledger ledger
     where ledger.user_id = v_grant.user_id;
  else
    v_balance := null;
    v_outcome := 'reversal_account_gone';
  end if;

  update public.stripe_topup_reversals reversal
     set user_id = v_grant.user_id,
         credits_granted = v_grant.credits,
         credits_reversed = v_target,
         balance_after_adjustment = v_balance,
         debt_at_last_adjustment = greatest(-coalesce(v_balance, 0), 0),
         updated_at = now()
   where reversal.source_id = p_source_id;

  -- A full invoice refund or any unresolved/lost dispute also suspends local
  -- Pro. The durable reversal row is checked again by the subscription-state
  -- wrapper below, so a later generic "active" event cannot bypass the hold.
  if v_reversal.subscription_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'stripe-subscription:' || v_reversal.subscription_id,
        0
      )
    );
    if v_target = v_grant.credits then
      update public.stripe_subscriptions subscription_row
         set active = false,
             state_event_created = greatest(
               subscription_row.state_event_created,
               v_reversal.last_event_created
             ),
             state_event_id = v_reversal.last_event_id,
             state_event_type = 'credit_reversal_hold',
             updated_at = now()
       where subscription_row.subscription_id = v_reversal.subscription_id
         and subscription_row.user_id is not distinct from v_grant.user_id
         and subscription_row.current_period_end <= v_reversal.provider_period_end;
      get diagnostics v_updated = row_count;
      if v_updated > 0 and not exists (
        select 1 from public.stripe_subscriptions other_subscription
         where other_subscription.user_id = v_grant.user_id
           and other_subscription.subscription_id <> v_reversal.subscription_id
           and other_subscription.active
      ) then
        update public.billing billing_row
           set is_pro = false,
               pro_until = null
         where billing_row.user_id = v_grant.user_id;
      end if;
    elsif coalesce(v_reversal.provider_subscription_active, false)
          and not exists (
            select 1
              from public.stripe_topup_reversals other_hold
             where other_hold.subscription_id = v_reversal.subscription_id
               and other_hold.source_id <> v_reversal.source_id
               and other_hold.provider_period_end >=
                 v_reversal.provider_period_end
               and (
                 (
                   other_hold.credits_granted is not null
                   and other_hold.credits_reversed =
                     other_hold.credits_granted
                 )
                 or (
                   other_hold.credits_granted is null
                   and (
                     other_hold.charge_disputed
                     or other_hold.amount_refunded = other_hold.charge_amount
                   )
                 )
               )
          )
          and not exists (
            select 1
              from public.stripe_subscriptions active_subscription
             where active_subscription.user_id = v_grant.user_id
               and active_subscription.subscription_id <>
                 v_reversal.subscription_id
               and active_subscription.active
          ) then
      update public.stripe_subscriptions subscription_row
         set active = true,
             current_period_end = greatest(
               subscription_row.current_period_end,
               v_reversal.provider_period_end
             ),
             state_event_created = greatest(
               subscription_row.state_event_created,
               v_reversal.last_event_created
             ),
             state_event_id = v_reversal.last_event_id,
             state_event_type = 'credit_reversal_cleared',
             updated_at = now()
       where subscription_row.subscription_id = v_reversal.subscription_id
         and subscription_row.user_id is not distinct from v_grant.user_id
         and subscription_row.current_period_end <=
           v_reversal.provider_period_end;
      get diagnostics v_updated = row_count;
      if v_updated > 0 then
        update public.billing billing_row
           set is_pro = true,
               pro_until = v_reversal.provider_period_end
         where billing_row.user_id = v_grant.user_id;
      end if;
    end if;
  end if;
  update public.stripe_webhook_events event_row
     set user_id = v_grant.user_id,
         source_id = p_source_id,
         outcome = v_outcome,
         processed_at = now()
   where event_row.event_id = v_reversal.last_event_id;
  return v_outcome;
end;
$$;
revoke all on function public._apply_pending_stripe_topup_reversal(text)
  from public, anon, authenticated, service_role;

create or replace function public.apply_stripe_topup_reversal(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_grant_source_id text,
  p_payment_intent_id text,
  p_invoice_id text,
  p_subscription_id text,
  p_provider_subscription_active boolean,
  p_provider_period_end timestamptz,
  p_charge_id text,
  p_charge_amount bigint,
  p_amount_refunded bigint,
  p_charge_disputed boolean,
  p_dispute_id text default null,
  p_dispute_status text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', '')
  );
  v_source text := coalesce(p_grant_source_id, '');
  v_new_event boolean;
  v_existing public.stripe_topup_reversals%rowtype;
  v_outcome text;
  v_amount_refunded bigint := p_amount_refunded;
  v_charge_disputed boolean := p_charge_disputed;
  v_dispute_id text := p_dispute_id;
  v_dispute_status text := p_dispute_status;
  v_owner uuid;
begin
  if coalesce(v_claim_role, session_user::text) <> 'service_role'
     and session_user::text not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_event_type not in (
       'charge.refunded',
       'charge.dispute.created',
       'charge.dispute.updated',
       'charge.dispute.closed',
       'charge.dispute.funds_withdrawn',
       'charge.dispute.funds_reinstated'
     )
     or not (
       (
         p_invoice_id is null
         and p_subscription_id is null
         and p_provider_subscription_active is null
         and p_provider_period_end is null
         and v_source = 'payment_intent:' || p_payment_intent_id
       )
       or (
         p_invoice_id ~ '^in_[A-Za-z0-9_]{6,240}$'
         and p_subscription_id ~ '^sub_[A-Za-z0-9_]{6,200}$'
         and p_provider_subscription_active is not null
         and p_provider_period_end is not null
         and v_source = 'invoice:' || p_invoice_id
       )
     )
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{6,240}$'
     or p_charge_id !~ '^ch_[A-Za-z0-9_]{6,240}$'
     or p_charge_amount not between 1 and 1000000000
     or p_amount_refunded not between 0 and p_charge_amount
     or p_charge_disputed is null
     or (
       (p_dispute_id is null) <> (p_dispute_status is null)
     )
     or (p_event_type <> 'charge.refunded' and p_dispute_id is null)
     or (
       p_dispute_id is not null
       and (
         p_dispute_id !~ '^dp_[A-Za-z0-9_]{6,240}$'
         or p_dispute_status not in (
           'warning_needs_response', 'warning_under_review', 'warning_closed',
           'needs_response', 'under_review', 'won', 'lost'
         )
       )
     ) then
    raise exception 'invalid_topup_reversal_event' using errcode = '22023';
  end if;

  v_new_event := public._stripe_begin_event(
    p_event_id, p_event_type, p_event_created, p_livemode, p_payload_sha256
  );
  if not v_new_event then return 'duplicate_event'; end if;

  select grant_row.user_id into v_owner
    from public.stripe_billing_grants grant_row
   where grant_row.source_id = v_source;
  if v_owner is null and p_subscription_id is not null then
    select subscription_row.user_id into v_owner
      from public.stripe_subscriptions subscription_row
     where subscription_row.subscription_id = p_subscription_id;
  end if;
  if v_owner is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('slop-account:' || v_owner::text, 0)
    );
  end if;
  if p_subscription_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'stripe-subscription:' || p_subscription_id,
        0
      )
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-topup-reversal:' || v_source, 0)
  );
  select reversal.* into v_existing
    from public.stripe_topup_reversals reversal
   where reversal.source_id = v_source
   for update;
  if found and (
    v_existing.payment_intent_id <> p_payment_intent_id
    or v_existing.invoice_id is distinct from p_invoice_id
    or v_existing.subscription_id is distinct from p_subscription_id
    or v_existing.charge_id <> p_charge_id
    or v_existing.charge_amount <> p_charge_amount
  ) then
    raise exception 'stripe_reversal_source_mismatch' using errcode = '22023';
  end if;
  if found and (
    p_amount_refunded < v_existing.amount_refunded
    or p_event_created < v_existing.last_event_created
  ) then
    update public.stripe_webhook_events event_row
       set source_id = v_source,
           outcome = 'stale_reversal_ignored',
           processed_at = now()
     where event_row.event_id = p_event_id;
    return 'stale_reversal_ignored';
  end if;
  if found and p_event_created = v_existing.last_event_created then
    -- Stripe timestamps have one-second resolution. Merge simultaneous
    -- snapshots conservatively: cumulative refunds never decrease and an
    -- unresolved dispute dominates a clear/won snapshot until a later event.
    v_amount_refunded := greatest(
      v_existing.amount_refunded,
      p_amount_refunded
    );
    v_charge_disputed := v_existing.charge_disputed or p_charge_disputed;
    if v_existing.charge_disputed and not p_charge_disputed then
      v_dispute_id := v_existing.dispute_id;
      v_dispute_status := v_existing.dispute_status;
    end if;
  end if;

  insert into public.stripe_topup_reversals (
    source_id,
    payment_intent_id,
    invoice_id,
    subscription_id,
    provider_subscription_active,
    provider_period_end,
    charge_id,
    charge_amount,
    amount_refunded,
    charge_disputed,
    dispute_id,
    dispute_status,
    last_event_id,
    last_event_created
  ) values (
    v_source,
    p_payment_intent_id,
    p_invoice_id,
    p_subscription_id,
    p_provider_subscription_active,
    p_provider_period_end,
    p_charge_id,
    p_charge_amount,
    v_amount_refunded,
    v_charge_disputed,
    v_dispute_id,
    v_dispute_status,
    p_event_id,
    p_event_created
  ) on conflict (source_id) do update
    set invoice_id = excluded.invoice_id,
        subscription_id = excluded.subscription_id,
        provider_subscription_active = excluded.provider_subscription_active,
        provider_period_end = excluded.provider_period_end,
        charge_amount = excluded.charge_amount,
        amount_refunded = excluded.amount_refunded,
        charge_disputed = excluded.charge_disputed,
        dispute_id = excluded.dispute_id,
        dispute_status = excluded.dispute_status,
        last_event_id = excluded.last_event_id,
        last_event_created = excluded.last_event_created,
        updated_at = now();

  v_outcome := public._apply_pending_stripe_topup_reversal(v_source);
  return v_outcome;
end;
$$;
revoke all on function public.apply_stripe_topup_reversal(
  text, text, bigint, boolean, text, text, text, text, text, boolean,
  timestamptz, text, bigint, bigint, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_topup_reversal(
  text, text, bigint, boolean, text, text, text, text, text, boolean,
  timestamptz, text, bigint, bigint, boolean, text, text
) to service_role;

-- Make original-grant processing reconcile a refund/dispute that arrived
-- first. The preserved implementation still owns all session, price, user,
-- amount, and payment-intent validation.
alter function public.apply_stripe_topup(
  text, text, bigint, boolean, text, uuid, text, uuid, text, text, text
) rename to _apply_stripe_topup_reversal_aware_impl;
revoke all on function public._apply_stripe_topup_reversal_aware_impl(
  text, text, bigint, boolean, text, uuid, text, uuid, text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.apply_stripe_topup(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_intent uuid,
  p_session_id text,
  p_observed_user uuid,
  p_observed_price_id text,
  p_payment_intent_id text,
  p_customer_id text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', '')
  );
  v_outcome text;
begin
  if coalesce(v_claim_role, session_user::text) <> 'service_role'
     and session_user::text not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'slop-account:' || p_observed_user::text,
      0
    )
  );
  -- This is settlement of an exact, already-bound Checkout authority. New
  -- Checkout creation/binding is rejected once deletion starts, but refusing
  -- this signed settlement would let an already-payable provider Session
  -- charge without granting or recording the liability.
  v_outcome := public._apply_stripe_topup_reversal_aware_impl(
    p_event_id,
    p_event_type,
    p_event_created,
    p_livemode,
    p_payload_sha256,
    p_intent,
    p_session_id,
    p_observed_user,
    p_observed_price_id,
    p_payment_intent_id,
    p_customer_id
  );
  perform public._apply_pending_stripe_topup_reversal(
    'payment_intent:' || p_payment_intent_id
  );
  return v_outcome;
end;
$$;
revoke all on function public.apply_stripe_topup(
  text, text, bigint, boolean, text, uuid, text, uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_topup(
  text, text, bigint, boolean, text, uuid, text, uuid, text, text, text
) to service_role;

-- Serialize the initial subscription registration with deletion and reversal
-- holds. A refund can arrive before checkout.session.completed; after the
-- preserved mapping is created, reconcile any exact pending full hold before
-- this transaction can expose Pro.
alter function public.apply_stripe_subscription_checkout(
  text, text, bigint, boolean, text, uuid, text, uuid, text, text, text,
  timestamptz
) rename to _apply_stripe_subscription_checkout_reversal_aware_impl;
revoke all on function public._apply_stripe_subscription_checkout_reversal_aware_impl(
  text, text, bigint, boolean, text, uuid, text, uuid, text, text, text,
  timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.apply_stripe_subscription_checkout(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_intent uuid,
  p_session_id text,
  p_observed_user uuid,
  p_observed_price_id text,
  p_subscription_id text,
  p_customer_id text,
  p_period_end timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', '')
  );
  v_outcome text;
  v_source text;
  v_hold_count integer;
begin
  if coalesce(v_claim_role, session_user::text) <> 'service_role'
     and session_user::text not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_subscription_id !~ '^sub_[A-Za-z0-9_]{6,200}$' then
    raise exception 'invalid_subscription_checkout' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'slop-account:' || p_observed_user::text,
      0
    )
  );
  -- Exact pre-intent Checkout settlement remains allowed. The permanent
  -- delete intent blocks new sessions; a closed account retains only its
  -- pseudonymous financial receipts and cannot receive new app entitlements.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe-subscription:' || p_subscription_id,
      0
    )
  );
  v_outcome := public._apply_stripe_subscription_checkout_reversal_aware_impl(
    p_event_id,
    p_event_type,
    p_event_created,
    p_livemode,
    p_payload_sha256,
    p_intent,
    p_session_id,
    p_observed_user,
    p_observed_price_id,
    p_subscription_id,
    p_customer_id,
    p_period_end
  );
  select pg_catalog.count(*) into v_hold_count
    from public.stripe_topup_reversals reversal
   where reversal.subscription_id = p_subscription_id
     and (
       reversal.charge_disputed
       or reversal.amount_refunded = reversal.charge_amount
     );
  if v_hold_count > 100 then
    raise exception 'subscription_reversal_set_too_large' using errcode = '54000';
  end if;
  for v_source in
    select reversal.source_id
      from public.stripe_topup_reversals reversal
     where reversal.subscription_id = p_subscription_id
       and (
         reversal.charge_disputed
         or reversal.amount_refunded = reversal.charge_amount
       )
     order by reversal.last_event_created, reversal.source_id
  loop
    perform public._apply_pending_stripe_topup_reversal(v_source);
  end loop;
  return v_outcome;
end;
$$;
revoke all on function public.apply_stripe_subscription_checkout(
  text, text, bigint, boolean, text, uuid, text, uuid, text, text, text,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_subscription_checkout(
  text, text, bigint, boolean, text, uuid, text, uuid, text, text, text,
  timestamptz
) to service_role;

-- Renewal credits use invoice:<id> as their immutable grant source. Reconcile
-- a refund/dispute that arrived before invoice.paid in the same transaction as
-- the eventual grant, exactly like the payment-intent top-up wrapper above.
alter function public.apply_stripe_subscription_invoice(
  text, bigint, boolean, text, text, text, text, text, text, timestamptz
) rename to _apply_stripe_subscription_invoice_reversal_aware_impl;
revoke all on function public._apply_stripe_subscription_invoice_reversal_aware_impl(
  text, bigint, boolean, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.apply_stripe_subscription_invoice(
  p_event_id text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_invoice_id text,
  p_subscription_id text,
  p_customer_id text,
  p_observed_price_id text,
  p_billing_reason text,
  p_period_end timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', '')
  );
  v_outcome text;
  v_owner uuid;
begin
  if coalesce(v_claim_role, session_user::text) <> 'service_role'
     and session_user::text not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_subscription_id !~ '^sub_[A-Za-z0-9_]{6,200}$' then
    raise exception 'invalid_subscription_invoice' using errcode = '22023';
  end if;
  select subscription_row.user_id into v_owner
    from public.stripe_subscriptions subscription_row
   where subscription_row.subscription_id = p_subscription_id;
  if v_owner is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('slop-account:' || v_owner::text, 0)
    );
    -- A signed renewal for an already-mapped provider subscription is a
    -- settlement, not new work. Record it even after deletion intent so the
    -- financial receipt remains after account deletion.
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe-subscription:' || p_subscription_id,
      0
    )
  );
  v_outcome := public._apply_stripe_subscription_invoice_reversal_aware_impl(
    p_event_id,
    p_event_created,
    p_livemode,
    p_payload_sha256,
    p_invoice_id,
    p_subscription_id,
    p_customer_id,
    p_observed_price_id,
    p_billing_reason,
    p_period_end
  );
  perform public._apply_pending_stripe_topup_reversal(
    'invoice:' || p_invoice_id
  );
  return v_outcome;
end;
$$;
revoke all on function public.apply_stripe_subscription_invoice(
  text, bigint, boolean, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_subscription_invoice(
  text, bigint, boolean, text, text, text, text, text, text, timestamptz
) to service_role;

-- A generic active subscription webhook must not bypass a full refund or
-- unresolved-dispute hold. A fresh reversal reconciliation clears the hold
-- only from current provider dispute/subscription state.
alter function public.apply_stripe_subscription_state(
  text, text, bigint, boolean, text, text, text, boolean, timestamptz
) rename to _apply_stripe_subscription_state_reversal_aware_impl;
revoke all on function public._apply_stripe_subscription_state_reversal_aware_impl(
  text, text, bigint, boolean, text, text, text, boolean, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.apply_stripe_subscription_state(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_subscription_id text,
  p_customer_id text,
  p_active boolean,
  p_period_end timestamptz default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', '')
  );
  v_effective_active boolean := p_active;
  v_effective_period_end timestamptz := p_period_end;
  v_owner uuid;
begin
  if coalesce(v_claim_role, session_user::text) <> 'service_role'
     and session_user::text not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_subscription_id !~ '^sub_[A-Za-z0-9_]{6,200}$'
     or (p_active and p_period_end is null) then
    raise exception 'invalid_subscription_state' using errcode = '22023';
  end if;
  select subscription_row.user_id into v_owner
    from public.stripe_subscriptions subscription_row
   where subscription_row.subscription_id = p_subscription_id;
  if v_owner is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('slop-account:' || v_owner::text, 0)
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe-subscription:' || p_subscription_id,
      0
    )
  );
  if v_owner is not null
     and public.has_account_delete_intent(v_owner) then
    v_effective_active := false;
    v_effective_period_end := null;
  end if;
  if p_active and exists (
    select 1
      from public.stripe_topup_reversals reversal
     where reversal.subscription_id = p_subscription_id
       and reversal.provider_period_end >= p_period_end
       and (
         (
           reversal.credits_granted is not null
           and reversal.credits_reversed = reversal.credits_granted
         )
         or (
           reversal.credits_granted is null
           and (
             reversal.charge_disputed
             or reversal.amount_refunded = reversal.charge_amount
           )
         )
       )
  ) then
    v_effective_active := false;
    v_effective_period_end := null;
  end if;
  return public._apply_stripe_subscription_state_reversal_aware_impl(
    p_event_id,
    p_event_type,
    p_event_created,
    p_livemode,
    p_payload_sha256,
    p_subscription_id,
    p_customer_id,
    v_effective_active,
    v_effective_period_end
  );
end;
$$;
revoke all on function public.apply_stripe_subscription_state(
  text, text, bigint, boolean, text, text, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_subscription_state(
  text, text, bigint, boolean, text, text, text, boolean, timestamptz
) to service_role;

-- Only a signed webhook backed by a freshly retrieved provider Session may
-- retire a bound Checkout. Local clocks never infer provider expiry, which
-- avoids replacing a paid session whose success webhook was merely delayed.
create or replace function public.apply_stripe_checkout_expired(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean,
  p_payload_sha256 text,
  p_intent uuid,
  p_user uuid,
  p_session_id text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', '')
  );
  v_intent public.stripe_checkout_intents%rowtype;
  v_new_event boolean;
begin
  if coalesce(v_claim_role, session_user::text) <> 'service_role'
     and session_user::text not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_event_type <> 'checkout.session.expired'
     or p_user is null
     or p_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9_]{6,240}$' then
    raise exception 'invalid_checkout_expiry' using errcode = '22023';
  end if;
  v_new_event := public._stripe_begin_event(
    p_event_id, p_event_type, p_event_created, p_livemode, p_payload_sha256
  );
  if not v_new_event then return 'duplicate_event'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('slop-account:' || p_user::text, 0)
  );
  select intent_row.* into v_intent
    from public.stripe_checkout_intents intent_row
   where intent_row.id = p_intent
   for update;
  if not found
     or v_intent.user_id <> p_user
     or v_intent.stripe_session_id <> p_session_id
     or v_intent.state not in ('bound', 'expired') then
    raise exception 'checkout_expiry_binding_mismatch' using errcode = '22023';
  end if;
  update public.stripe_checkout_intents intent_row
     set state = 'expired'
   where intent_row.id = p_intent
     and intent_row.state = 'bound';
  update public.stripe_webhook_events event_row
     set user_id = p_user,
         checkout_intent_id = p_intent,
         source_id = 'checkout:' || p_session_id,
         outcome = 'checkout_expired',
         processed_at = now()
   where event_row.event_id = p_event_id;
  return 'checkout_expired';
end;
$$;
revoke all on function public.apply_stripe_checkout_expired(
  text, text, bigint, boolean, text, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_checkout_expired(
  text, text, bigint, boolean, text, uuid, uuid, text
) to service_role;


create or replace function public.has_historical_stripe_subscription_grant(
  p_source_id text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', ''),
    session_user::text
  );
begin
  if v_role not in ('service_role', 'supabase_admin', 'postgres') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_source_id !~ '^invoice:in_[A-Za-z0-9_]{6,240}$' then
    raise exception 'invalid_historical_stripe_source' using errcode = '22023';
  end if;
  return exists (
    select 1
      from public.stripe_billing_grants grant_row
     where grant_row.source_id = p_source_id
       and grant_row.grant_kind = 'pro_monthly'
       and grant_row.credits = 600
  );
end;
$$;
revoke all on function public.has_historical_stripe_subscription_grant(text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_historical_stripe_subscription_grant(text)
  to service_role;

create or replace function public.stripe_checkout_intent_price_authority(
  p_intent uuid,
  p_user uuid,
  p_kind text
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', ''),
    session_user::text
  );
  v_price text;
begin
  if v_role not in ('service_role', 'supabase_admin', 'postgres') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  select intent_row.price_id into v_price
    from public.stripe_checkout_intents intent_row
   where intent_row.id = p_intent
     and intent_row.user_id = p_user
     and intent_row.kind = p_kind
     and intent_row.state in ('bound', 'fulfilled');
  if v_price is null then
    raise exception 'stripe_checkout_intent_authority_missing'
      using errcode = '55000';
  end if;
  return v_price;
end;
$$;
revoke all on function public.stripe_checkout_intent_price_authority(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.stripe_checkout_intent_price_authority(
  uuid, uuid, text
) to service_role;

create or replace function public.stripe_subscription_price_authority(
  p_subscription_id text,
  p_customer_id text
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', ''),
    session_user::text
  );
  v_price text;
begin
  if v_role not in ('service_role', 'supabase_admin', 'postgres') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_subscription_id !~ '^sub_[A-Za-z0-9_]{6,200}$'
     or p_customer_id !~ '^cus_[A-Za-z0-9_]{6,200}$' then
    raise exception 'invalid_stripe_subscription_authority'
      using errcode = '22023';
  end if;
  select subscription.price_id into v_price
    from public.stripe_subscriptions subscription
   where subscription.subscription_id = p_subscription_id
     and subscription.customer_id = p_customer_id;
  return v_price;
end;
$$;
revoke all on function public.stripe_subscription_price_authority(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.stripe_subscription_price_authority(text, text)
  to service_role;


-- Checkout creation and account deletion share one outer lock. The live
-- predicate is rechecked only after that lock, and any unresolved provider
-- clawback/debt freezes all new paid products rather than merely one old
-- subscription id.
alter function public.create_stripe_checkout_intent(uuid, text, text)
  rename to _create_stripe_checkout_intent_deletion_safe_impl;
revoke all on function public._create_stripe_checkout_intent_deletion_safe_impl(
  uuid, text, text
) from public, anon, authenticated, service_role;

create or replace function public.create_stripe_checkout_intent(
  p_user uuid,
  p_kind text,
  p_price_id text
) returns table (
  intent_id uuid,
  credits integer,
  stripe_customer_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', '')
  );
  v_balance bigint;
begin
  if coalesce(v_claim_role, session_user::text) <> 'service_role'
     and session_user::text not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_kind <> 'pro' then
    raise exception 'invalid_checkout_kind' using errcode = '22023';
  end if;
  if p_user is null then
    raise exception 'unknown_checkout_user' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('slop-account:' || p_user::text, 0)
  );
  if not coalesce(public.is_nonanonymous_user(p_user), false)
     or public.has_account_delete_intent(p_user) then
    raise exception 'verified_account_required' using errcode = '42501';
  end if;
  select coalesce(pg_catalog.sum(ledger.delta), 0)
    into v_balance
    from public.coin_ledger ledger
   where ledger.user_id = p_user;
  if v_balance < 0 or exists (
    select 1
      from public.stripe_topup_reversals reversal
     where reversal.user_id = p_user
       and reversal.charge_disputed
  ) then
    raise exception 'billing_reversal_hold' using errcode = '55000';
  end if;
  if exists (
    select 1
      from public.stripe_checkout_intents intent_row
     where intent_row.user_id = p_user
       and intent_row.state = 'bound'
  ) then
    -- A bound session may already be paid while its webhook is delayed. Never
    -- retire it from a database clock and create a second purchase; provider
    -- retrieval/reconciliation must explicitly settle or expire it first.
    raise exception 'checkout_reconciliation_required' using errcode = '55000';
  end if;
  select result.intent_id, result.credits, result.stripe_customer_id
    into intent_id, credits, stripe_customer_id
    from public._create_stripe_checkout_intent_deletion_safe_impl(
      p_user, p_kind, p_price_id
    ) result;
  if stripe_customer_id is not null and not exists (
    select 1
      from public.stripe_customer_owners owner_row
     where owner_row.customer_id = stripe_customer_id
       and owner_row.user_id = p_user
  ) then
    -- Legacy billing.stripe_customer_id values were once client-writable.
    -- Never send an unproven customer id to Stripe and discover the mismatch
    -- only after the customer has paid.
    raise exception 'stripe_customer_owner_unproven' using errcode = '55000';
  end if;
  if stripe_customer_id is null and exists (
    select 1
      from public.stripe_customer_owners owner_row
     where owner_row.user_id = p_user
  ) then
    raise exception 'stripe_customer_mapping_incomplete' using errcode = '55000';
  end if;
  return next;
end;
$$;
revoke all on function public.create_stripe_checkout_intent(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_stripe_checkout_intent(uuid, text, text)
  to service_role;

-- A server-only readiness receipt. No customer id comes from user-controlled
-- profile/billing columns. Returning null never guesses a legacy association.
create or replace function public.stripe_web_billing_authority(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_customer text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if not coalesce(public.is_nonanonymous_user(p_user), false)
     or public.has_account_delete_intent(p_user) then
    return jsonb_build_object('ready', false, 'customer_id', null);
  end if;
  select customer_id into v_customer from public.stripe_customer_owners
    where user_id = p_user;
  return jsonb_build_object('ready', true, 'customer_id', v_customer);
end;
$$;
revoke all on function public.stripe_web_billing_authority(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.stripe_web_billing_authority(uuid) to service_role;

comment on function public.stripe_web_billing_authority(uuid) is
  'Web membership readiness and signed-provider customer ownership; service-role only.';

-- Preserve ordinary account erasure. UUID-only transaction subjects remain
-- private to billing authority; the foreign key to the live account is nullable
-- and is cleared automatically when auth deletes that account.
create or replace function public._stripe_link_live_account()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select id into new.account_id from auth.users where id = new.user_id;
  return new;
end;
$$;
revoke all on function public._stripe_link_live_account()
  from public, anon, authenticated, service_role;
alter table public.stripe_checkout_intents add column account_id uuid references auth.users(id) on delete set null;
create trigger stripe_live_account_link before insert or update of user_id on public.stripe_checkout_intents
  for each row execute function public._stripe_link_live_account();
comment on column public.stripe_checkout_intents.user_id is 'Pseudonymous financial subject UUID; retained without account identity after deletion.';
alter table public.stripe_customer_owners add column account_id uuid references auth.users(id) on delete set null;
create trigger stripe_live_account_link before insert or update of user_id on public.stripe_customer_owners
  for each row execute function public._stripe_link_live_account();
comment on column public.stripe_customer_owners.user_id is 'Pseudonymous financial subject UUID; retained without account identity after deletion.';
alter table public.stripe_subscriptions add column account_id uuid references auth.users(id) on delete set null;
create trigger stripe_live_account_link before insert or update of user_id on public.stripe_subscriptions
  for each row execute function public._stripe_link_live_account();
comment on column public.stripe_subscriptions.user_id is 'Pseudonymous financial subject UUID; retained without account identity after deletion.';
alter table public.stripe_webhook_events add column account_id uuid references auth.users(id) on delete set null;
create trigger stripe_live_account_link before insert or update of user_id on public.stripe_webhook_events
  for each row execute function public._stripe_link_live_account();
comment on column public.stripe_webhook_events.user_id is 'Pseudonymous financial subject UUID; retained without account identity after deletion.';
alter table public.stripe_billing_grants add column account_id uuid references auth.users(id) on delete set null;
create trigger stripe_live_account_link before insert or update of user_id on public.stripe_billing_grants
  for each row execute function public._stripe_link_live_account();
comment on column public.stripe_billing_grants.user_id is 'Pseudonymous financial subject UUID; retained without account identity after deletion.';
alter table public.stripe_topup_reversals add column account_id uuid references auth.users(id) on delete set null;
create trigger stripe_live_account_link before insert or update of user_id on public.stripe_topup_reversals
  for each row execute function public._stripe_link_live_account();
comment on column public.stripe_topup_reversals.user_id is 'Pseudonymous financial subject UUID; retained without account identity after deletion.';

commit;
