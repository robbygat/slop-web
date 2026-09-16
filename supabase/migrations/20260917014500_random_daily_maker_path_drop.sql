-- Daily Drop awards exactly one unowned item from the permanent Maker Path.
-- Selection and ownership checks stay on the server; the client never chooses
-- the reward or supplies an account id.
do $$
begin
  if to_regclass('public.maker_path_rewards') is null
     or to_regclass('public.slop_cosmetic_entitlements') is null
     or to_regclass('public.profile_banner_entitlements') is null then
    raise exception 'Daily Maker Path prerequisites are missing';
  end if;
end
$$;

create table if not exists public.maker_path_daily_drops (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_day date not null default (now() at time zone 'utc')::date,
  reward_id text not null references public.maker_path_rewards(reward_id)
    on update cascade on delete restrict,
  claimed_at timestamptz not null default now(),
  primary key (user_id, claim_day)
);

alter table public.maker_path_daily_drops enable row level security;
drop policy if exists "owners read maker path daily drops"
  on public.maker_path_daily_drops;
create policy "owners read maker path daily drops"
  on public.maker_path_daily_drops
  for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.maker_path_daily_drops
  from public, anon, authenticated;

create or replace function public.claim_daily_slop_cosmetic()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_reward public.maker_path_rewards%rowtype;
begin
  if v_uid is null or not exists (
    select 1 from auth.users account
    where account.id = v_uid
      and account.deleted_at is null
      and account.is_anonymous is not true
  ) then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('maker-path-daily:' || v_uid::text, 0)
  );

  select reward.* into v_reward
  from public.maker_path_daily_drops drop_receipt
  join public.maker_path_rewards reward
    on reward.reward_id = drop_receipt.reward_id
  where drop_receipt.user_id = v_uid
    and drop_receipt.claim_day = v_today;

  if found then
    return jsonb_build_object(
      'version', 3, 'user_id', v_uid, 'ok', false,
      'code', 'already_claimed', 'owned', true,
      'reward_id', v_reward.reward_id,
      'reward_kind', v_reward.reward_kind,
      'cosmetic_id', v_reward.slop_cosmetic_id,
      'banner_id', v_reward.profile_banner_id,
      'last_daily', v_today::text
    );
  end if;

  select reward.* into v_reward
  from public.maker_path_rewards reward
  where reward.active
    and (
      (reward.reward_kind = 'slop_cosmetic' and not exists (
        select 1 from public.slop_cosmetic_entitlements entitlement
        where entitlement.user_id = v_uid
          and entitlement.cosmetic_id = reward.slop_cosmetic_id
      ))
      or
      (reward.reward_kind = 'profile_banner' and not exists (
        select 1 from public.profile_banner_entitlements entitlement
        where entitlement.user_id = v_uid
          and entitlement.banner_id = reward.profile_banner_id
      ))
    )
  order by pg_catalog.md5(v_uid::text || ':' || v_today::text || ':' || reward.reward_id)
  limit 1;

  if not found then
    return jsonb_build_object(
      'version', 3, 'user_id', v_uid, 'ok', false,
      'code', 'collection_complete', 'owned', false,
      'reward_id', null, 'reward_kind', null,
      'cosmetic_id', null, 'banner_id', null,
      'last_daily', null
    );
  end if;

  if v_reward.reward_kind = 'slop_cosmetic' then
    insert into public.slop_cosmetic_entitlements (
      user_id, cosmetic_id, source, price_paid, acquired_at
    ) values (
      v_uid, v_reward.slop_cosmetic_id, 'daily_maker_path_drop', 0, now()
    ) on conflict (user_id, cosmetic_id) do nothing;
  else
    insert into public.profile_banner_entitlements (
      user_id, banner_id, source, price_paid, acquired_at
    ) values (
      v_uid, v_reward.profile_banner_id, 'daily_maker_path_drop', 0, now()
    ) on conflict (user_id, banner_id) do nothing;
  end if;

  insert into public.maker_path_daily_drops (user_id, claim_day, reward_id)
  values (v_uid, v_today, v_reward.reward_id);

  return jsonb_build_object(
    'version', 3, 'user_id', v_uid, 'ok', true,
    'code', 'claimed', 'owned', true,
    'reward_id', v_reward.reward_id,
    'reward_kind', v_reward.reward_kind,
    'cosmetic_id', v_reward.slop_cosmetic_id,
    'banner_id', v_reward.profile_banner_id,
    'last_daily', v_today::text
  );
end;
$$;

revoke all on function public.claim_daily_slop_cosmetic()
  from public, anon, authenticated;
grant execute on function public.claim_daily_slop_cosmetic()
  to authenticated;

comment on table public.maker_path_daily_drops is
  'One server-selected unowned Maker Path reward per eligible account and UTC day.';
comment on function public.claim_daily_slop_cosmetic() is
  'Awards one deterministic-random unowned active Maker Path item per UTC day.';
