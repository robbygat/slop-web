-- Targeted live-schema repair, derived from mobile main e2538ff:
-- 20260820181000_catalog_social_write_hardening (resolver, insert authority,
-- aggregate counts only) and 20260907040000_social_reconciliation (comments only).
-- Historical rows are preserved. No unrelated social/catalog migration is run.
-- The resolver additionally excludes media pending deletion, matching the web
-- catalog. Direct comment reads use the same target visibility as the RPC.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if to_regclass('public.game_comments') is null
    or to_regclass('public.games') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.trainer_native_games') is null
    or to_regclass('public.gif_media_receipts') is null
    or to_regclass('public.gif_media_assets') is null
    or to_regprocedure('public.is_nonanonymous_user(uuid)') is null
    or to_regprocedure('public._reserve_client_mutation(uuid,text,integer,integer,integer,integer)') is null
    or to_regprocedure('public._valid_giphy_comment_url(text)') is null then
    raise exception 'Comment authority prerequisites missing';
  end if;
end $$;

create or replace function public._resolve_client_game(p_game_id text)
returns table (game_id text, owner_id uuid, is_native boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_requested text := pg_catalog.btrim(coalesce(p_game_id, ''));
begin
  if v_requested = ''
     or pg_catalog.char_length(v_requested) > 160
     or pg_catalog.octet_length(v_requested) > 640
     or v_requested ~ '[[:cntrl:]]' then
    return;
  end if;
  return query
    select game.slug::text, game.owner_id, false
      from public.games game
     where game.status = 'published'
       and not game.media_delete_authorized
       and (game.slug = v_requested or game.id::text = v_requested)
     order by (game.slug = v_requested) desc
     limit 1;
  if found then return; end if;

  if pg_catalog.starts_with(v_requested, 'app:') then
    return query
      select v_requested, null::uuid, true
        from public.trainer_native_games native
       where native.active
         and native.game_id = pg_catalog.substr(v_requested, 5)
       limit 1;
  else
    return query
      select v_requested, null::uuid, true
        from public.trainer_native_games native
       where native.active and native.game_id = v_requested
       limit 1;
  end if;
end;
$$;
revoke all on function public._resolve_client_game(text)
  from public, anon, authenticated, service_role;

create or replace function public.enforce_game_comment_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_game text;
  v_parent_game text;
  v_body text := pg_catalog.btrim(coalesce(new.body, ''));
  v_gif text := nullif(pg_catalog.btrim(coalesce(new.gif_url, '')), '');
  v_profile public.profiles%rowtype;
begin
  if v_role = 'service_role' then return new; end if;
  if not public.is_nonanonymous_user(v_uid) then
    raise exception 'verified_account_required' using errcode = '42501';
  end if;
  select resolved.game_id into v_game
    from public._resolve_client_game(new.game_id) resolved;
  if v_game is null then
    raise exception 'unknown_comment_game' using errcode = '22023';
  end if;
  select profile.* into v_profile
    from public.profiles profile
    join auth.users account on account.id = profile.id
   where profile.id = v_uid
     and not coalesce(account.is_anonymous, false);
  if not found then
    raise exception 'public_profile_required' using errcode = '42501';
  end if;
  if v_gif is not null and (
    not public._valid_giphy_comment_url(v_gif)
    or not exists (
      select 1 from public.gif_media_receipts receipt
       where receipt.user_id = v_uid
         and receipt.media_url = v_gif
         and receipt.expires_at > pg_catalog.clock_timestamp()
    )
    or not exists (
      select 1 from public.gif_media_assets asset
       where asset.token_hash = pg_catalog.encode(
         extensions.digest(
           pg_catalog.convert_to(pg_catalog.right(v_gif, 64), 'UTF8'),
           'sha256'
         ),
         'hex'
       )
    )
  ) then
    raise exception 'invalid_comment_gif' using errcode = '22023';
  end if;
  if v_body = '' and v_gif is null then
    raise exception 'empty_comment' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_body) > 500
     or pg_catalog.octet_length(v_body) > 2000
     or pg_catalog.replace(
       pg_catalog.replace(
         pg_catalog.replace(v_body, pg_catalog.chr(9), ''),
         pg_catalog.chr(10), ''
       ),
       pg_catalog.chr(13), ''
     ) ~ '[[:cntrl:]]' then
    raise exception 'invalid_comment_body' using errcode = '22023';
  end if;
  if new.parent_id is not null then
    select resolved.game_id into v_parent_game
      from public.game_comments parent
      cross join lateral public._resolve_client_game(parent.game_id) resolved
     where parent.id = new.parent_id;
    if v_parent_game is null or v_parent_game is distinct from v_game then
      raise exception 'invalid_comment_parent' using errcode = '22023';
    end if;
  end if;
  if not public._reserve_client_mutation(v_uid, 'comment', 5, 40, 200, 20000)
  then
    raise exception 'comment_rate_limit' using errcode = '54000';
  end if;
  if (
    select pg_catalog.count(*) from public.game_comments comment
     where comment.user_id = v_uid
  ) >= 10000 then
    raise exception 'comment_storage_limit' using errcode = '54000';
  end if;

  new.id := gen_random_uuid();
  new.game_id := v_game;
  new.user_id := v_uid;
  new.username := v_profile.username;
  new.avatar_url := v_profile.avatar_url;
  new.body := case when v_body = '' then ' ' else v_body end;
  new.gif_url := v_gif;
  new.created_at := pg_catalog.clock_timestamp();
  if v_gif is not null then
    update public.gif_media_assets asset
       set claimed_at = coalesce(asset.claimed_at, new.created_at)
     where asset.token_hash = pg_catalog.encode(
       extensions.digest(
         pg_catalog.convert_to(pg_catalog.right(v_gif, 64), 'UTF8'),
         'sha256'
       ),
       'hex'
     );
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_game_comment_write()
  from public, anon, authenticated, service_role;
drop trigger if exists enforce_game_comment_write on public.game_comments;
create trigger enforce_game_comment_write
before insert on public.game_comments
for each row execute function public.enforce_game_comment_write();
revoke update on table public.game_comments from public, anon, authenticated;

create or replace function public.game_social_counts(p_ids text[])
returns table (game_id text, likes bigint, comments bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  if pg_catalog.cardinality(coalesce(p_ids, '{}'::text[])) > 100 then
    raise exception 'too_many_game_ids' using errcode = '54000';
  end if;
  foreach v_id in array coalesce(p_ids, '{}'::text[]) loop
    if v_id is null
       or pg_catalog.char_length(v_id) not between 1 and 160
       or pg_catalog.octet_length(v_id) > 640
       or v_id ~ '[[:cntrl:]]' then
      raise exception 'invalid_game_id' using errcode = '22023';
    end if;
  end loop;
  -- Resolve each requested identifier once, then aggregate both relation
  -- tables set-wise. This avoids two count queries per caller-supplied ID.
  return query
    with requested as (
      select item.requested_id, item.ordinality
        from pg_catalog.unnest(coalesce(p_ids, '{}'::text[]))
          with ordinality as item(requested_id, ordinality)
    ), resolved as (
      select requested.requested_id,
             requested.ordinality,
             canonical.game_id as resolved_id
        from requested
        left join lateral public._resolve_client_game(requested.requested_id)
          canonical on true
    ), resolved_ids as (
      select distinct resolved.resolved_id
        from resolved
       where resolved.resolved_id is not null
    ), like_counts as (
      select liked.game_id, pg_catalog.count(*)::bigint as total
        from public.game_likes liked
        join resolved_ids wanted on wanted.resolved_id = liked.game_id
       group by liked.game_id
    ), comment_counts as (
      select comment.game_id, pg_catalog.count(*)::bigint as total
        from public.game_comments comment
        join resolved_ids wanted on wanted.resolved_id = comment.game_id
       group by comment.game_id
    )
    select resolved.requested_id,
           coalesce(like_counts.total, 0)::bigint,
           coalesce(comment_counts.total, 0)::bigint
      from resolved
      left join like_counts
        on like_counts.game_id = resolved.resolved_id
      left join comment_counts
        on comment_counts.game_id = resolved.resolved_id
     order by resolved.ordinality;
end;
$$;
revoke all on function public.game_social_counts(text[]) from public;
grant execute on function public.game_social_counts(text[]) to anon, authenticated;

-- Bind posting intent to the account captured by the client. The existing
-- insert trigger remains the authority for body, GIF, parent, identity and rate.
create or replace function public.post_game_comment(
  p_owner uuid, p_game_id text, p_body text,
  p_gif_url text default null, p_parent_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.game_comments%rowtype; v_look jsonb;
begin
  if p_owner is null or p_owner is distinct from auth.uid() or not public.is_nonanonymous_user(p_owner) then
    raise exception 'Authenticated comment owner required' using errcode = '42501';
  end if;
  insert into public.game_comments(game_id, user_id, body, gif_url, parent_id)
    values (p_game_id, p_owner, p_body, p_gif_url, p_parent_id) returning * into v_row;
  select slop_look into v_look from public.profiles where id = p_owner;
  return to_jsonb(v_row) || jsonb_build_object('slop_look', v_look);
end;
$$;
revoke all on function public.post_game_comment(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.post_game_comment(uuid, text, text, text, uuid) to authenticated;

create index if not exists game_comments_root_page_idx
  on public.game_comments(game_id, created_at desc, id desc) where parent_id is null;
create index if not exists game_comments_parent_page_idx
  on public.game_comments(game_id, parent_id, created_at, id);

-- Page roots independently of replies. A popular thread cannot push its parent
-- out of a newest-N row window. Reply pages include the complete ancestor path
-- for each selected descendant, including when a child predates its parent.
create or replace function public.game_comment_page(
  p_game_id text, p_root_id uuid default null,
  p_before_time timestamptz default null, p_before_id uuid default null,
  p_limit integer default 20
) returns jsonb language plpgsql stable security definer
set search_path = '' set statement_timeout = '5s' as $$
declare
  v_game text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_result jsonb;
begin
  select r.game_id into v_game from public._resolve_client_game(p_game_id) r;
  if v_game is null then raise exception 'Game unavailable' using errcode = '22023'; end if;
  if (p_before_time is null) <> (p_before_id is null) then
    raise exception 'Incomplete comment cursor' using errcode = '22023';
  end if;
  if p_root_id is not null and not exists (
    select 1 from public.game_comments where id = p_root_id and game_id = v_game and parent_id is null
  ) then raise exception 'Comment thread unavailable' using errcode = '22023'; end if;

  with recursive
  root_window as materialized (
    select c.* from public.game_comments c
    where c.game_id = v_game and c.parent_id is null and p_root_id is null
      and (p_before_time is null or (c.created_at, c.id) < (p_before_time, p_before_id))
    order by c.created_at desc, c.id desc limit v_limit + 1
  ),
  roots as materialized (
    select c.* from root_window c order by c.created_at desc, c.id desc limit v_limit
  ),
  tree as (
    select c.*, c.id as root_id, array[c.id] as path from public.game_comments c
      where c.game_id = v_game and
        ((p_root_id is not null and c.id = p_root_id) or c.id in (select id from roots))
    union all
    select c.*, t.root_id, t.path || c.id from public.game_comments c join tree t on c.parent_id = t.id
      where c.game_id = v_game and not c.id = any(t.path)
  ),
  reply_window as materialized (
    select t.* from tree t where p_root_id is not null and t.id <> p_root_id
      and (p_before_time is null or (t.created_at, t.id) > (p_before_time, p_before_id))
    order by t.created_at, t.id limit v_limit + 1
  ),
  reply_page as materialized (
    select t.* from reply_window t order by t.created_at, t.id limit v_limit
  ),
  chosen as (
    select t.* from tree t where
      (p_root_id is null and t.id = t.root_id) or
      (p_root_id is not null and (t.id = p_root_id or t.id in (select unnest(path) from reply_page)))
  ),
  enriched as (
    select c.*, p.id as profile_id, p.username as profile_name, p.avatar_url as profile_avatar,
      p.slop_look as profile_look,
      (select count(*) from tree t where t.root_id = c.id and t.id <> c.id) as reply_count
    from chosen c left join public.profiles p on p.id = c.user_id
  )
  select jsonb_build_object(
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'user_id', c.user_id, 'username', coalesce(c.profile_name, c.username, 'player'),
      'avatar_url', case when c.profile_id is not null then c.profile_avatar else c.avatar_url end,
      'slop_look', c.profile_look, 'body', c.body, 'gif_url', c.gif_url,
      'parent_id', c.parent_id, 'created_at', c.created_at, 'reply_count', c.reply_count
    ) order by c.created_at desc, c.id desc) from enriched c), '[]'::jsonb),
    'total_count', (select count(*) from public.game_comments where game_id = v_game),
    'has_more', case when p_root_id is null then (select count(*) from root_window) > v_limit
      else (select count(*) from reply_window) > v_limit end,
    'next_cursor', case when p_root_id is null then (
      select jsonb_build_object('created_at', c.created_at, 'id', c.id) from roots c
      order by c.created_at, c.id limit 1
    ) else (
      select jsonb_build_object('created_at', c.created_at, 'id', c.id) from reply_page c
      order by c.created_at desc, c.id desc limit 1
    ) end
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.game_comment_page(text, uuid, timestamptz, uuid, integer) from public;
grant execute on function public.game_comment_page(text, uuid, timestamptz, uuid, integer) to anon, authenticated;

-- Preserve another account's reply when a parent is removed, as in mobile's
-- current contract. This is a constraint-only change; existing rows are intact.
alter table public.game_comments drop constraint if exists game_comments_parent_id_fkey;
alter table public.game_comments add constraint game_comments_parent_id_fkey
  foreign key (parent_id) references public.game_comments(id) on delete set null;
create index if not exists game_comments_user_created_idx
  on public.game_comments(user_id, created_at desc);

-- A boolean-only security-definer policy bridge keeps the resolver private
-- while preventing direct table reads from exposing an unpublished game thread.
create or replace function public.can_read_game_comment_target(p_game_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public._resolve_client_game(p_game_id));
$$;
revoke all on function public.can_read_game_comment_target(text) from public;
grant execute on function public.can_read_game_comment_target(text) to anon, authenticated;
drop policy if exists game_comments_read_all on public.game_comments;
drop policy if exists game_comments_read_visible on public.game_comments;
create policy game_comments_read_visible on public.game_comments for select
  to anon, authenticated using (public.can_read_game_comment_target(game_id));
-- Explicitly retain the existing own insert/delete policies and service access.
-- Client roles never receive UPDATE, TRUNCATE, REFERENCES or TRIGGER rights.
revoke all on public.game_comments from public, anon, authenticated;
grant select on public.game_comments to anon;
grant select, insert, delete on public.game_comments to authenticated;
notify pgrst, 'reload schema';
commit;
