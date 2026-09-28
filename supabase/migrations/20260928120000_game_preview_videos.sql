-- Feed preview videos. A 720x1280 (desktop: 1280x720) H.264 loop plus a
-- poster JPEG, recorded per published release by the server recorder
-- (mcp-autopublish workflow, OIDC-verified by slop-mcp) or uploaded by the
-- owner from the website publish flow. The GIF/cover contract is untouched:
-- clients without video support keep using games.preview_url and games.thumb.
--
-- Additive only. Videos live in their own table (no games row updates, so no
-- games triggers fire and updated_at never moves) and their own public bucket
-- (release roots stay exactly their attested manifests). A row is visible
-- only while its game is published and it belongs to the game's current
-- release; a newer release hides it until it is re-recorded.
begin;

create table if not exists public.game_preview_videos (
  game_id uuid primary key references public.games(id) on delete cascade,
  release_key text not null check (length(release_key) between 3 and 300),
  video_path text not null check (video_path ~ '^[0-9a-f-]{36}/v1-[0-9a-f]{32}/preview\.mp4$'),
  poster_path text not null check (poster_path ~ '^[0-9a-f-]{36}/v1-[0-9a-f]{32}/poster\.jpg$'),
  width integer not null,
  height integer not null,
  duration_ms integer not null check (duration_ms between 2000 and 15000),
  video_bytes integer not null check (video_bytes between 1 and 4194304),
  poster_bytes integer not null check (poster_bytes between 1 and 716800),
  source text not null check (source in ('recorder', 'owner')),
  recorded_at timestamptz not null default now(),
  constraint game_preview_videos_size check ((width = 720 and height = 1280) or (width = 1280 and height = 720))
);
alter table public.game_preview_videos enable row level security;
revoke all on public.game_preview_videos from public, anon, authenticated, service_role;
grant select on public.game_preview_videos to anon, authenticated;
drop policy if exists game_preview_videos_current_select on public.game_preview_videos;
create policy game_preview_videos_current_select on public.game_preview_videos
  for select to anon, authenticated
  using (exists (
    select 1 from public.games g
     where g.id = game_preview_videos.game_id
       and g.status = 'published'
       and not coalesce(g.media_delete_authorized, false)
       and game_preview_videos.release_key = coalesce(g.published_bundle_path, 'legacy/' || g.slug)));

-- Recorder bookkeeping (private): a short claim window so parallel runners
-- never record the same game, and a bounded retry count per release.
create table if not exists public.game_preview_video_attempts (
  game_id uuid primary key references public.games(id) on delete cascade,
  release_key text not null,
  attempts integer not null default 0,
  failure_code text check (failure_code ~ '^[a-z_]{1,40}$'),
  claimed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.game_preview_video_attempts enable row level security;
revoke all on public.game_preview_video_attempts from public, anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('game-preview-videos', 'game-preview-videos', true, 4194304, array['video/mp4', 'image/jpeg'])
  on conflict (id) do nothing;

create or replace function public.game_preview_video_service(p_action text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gm public.games%rowtype;
  v_key text; v_limit integer; v_shards integer; v_shard integer; v_force boolean;
  v_games jsonb; v_size bigint; v_poster_size bigint; v_id uuid;
begin
  if p_action = 'claim' then
    v_limit := least(greatest(coalesce((p->>'limit')::integer, 4), 1), 50);
    v_shards := least(greatest(coalesce((p->>'shards')::integer, 1), 1), 32);
    v_shard := least(greatest(coalesce((p->>'shard')::integer, 0), 0), v_shards - 1);
    v_force := coalesce((p->>'retry_failed')::boolean, false);
    with candidates as (
      select g.id, g.slug, g.published_bundle_path, g.bundle_version, g.supported_platforms,
             g.preview_width, g.preview_height,
             coalesce(g.published_bundle_path, 'legacy/' || g.slug) as key
        from public.games g
       where g.status = 'published'
         and not coalesce(g.media_delete_authorized, false)
         and g.html ilike '%slop.js%'
         and ((hashtextextended(g.id::text, 0) & 1023) % v_shards) = v_shard
         and not exists (select 1 from public.game_preview_videos v
                          where v.game_id = g.id and v.release_key = coalesce(g.published_bundle_path, 'legacy/' || g.slug))
         and not exists (select 1 from public.game_preview_video_attempts a
                          where a.game_id = g.id and a.release_key = coalesce(g.published_bundle_path, 'legacy/' || g.slug)
                            and ((a.claimed_at is not null and a.claimed_at > now() - interval '20 minutes')
                              or (a.attempts >= 2 and not v_force)))
       order by g.qualified_play_count desc nulls last, g.created_at desc
       limit v_limit
       for update of g skip locked
    ), marked as (
      insert into public.game_preview_video_attempts as a (game_id, release_key, attempts, claimed_at, updated_at)
      select id, key, 0, now(), now() from candidates
      on conflict (game_id) do update set
        attempts = case when a.release_key = excluded.release_key then a.attempts else 0 end,
        release_key = excluded.release_key, claimed_at = now(), updated_at = now()
      returning a.game_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'game_id', c.id, 'slug', c.slug, 'release_key', c.key,
        'entry_base', coalesce(c.published_bundle_path, c.slug) || '/' ||
          case when coalesce(c.bundle_version, '') ~ '^\d+(\.\d+){0,3}$' then c.bundle_version else '1.0.0' end || '/',
        'target', case when (c.preview_width = 640 and c.preview_height = 360)
                         or (c.supported_platforms is not null and c.supported_platforms = array['desktop']) then 'desktop' else 'mobile' end)), '[]'::jsonb)
      into v_games
      from candidates c where c.id in (select game_id from marked);
    return jsonb_build_object('games', v_games);
  end if;

  if coalesce(p->>'game_id', '') !~ '^[0-9a-f-]{36}$' then raise exception 'invalid_request'; end if;
  v_id := (p->>'game_id')::uuid;
  select * into gm from public.games where id = v_id for share;
  if not found or gm.status <> 'published' or coalesce(gm.media_delete_authorized, false) then
    raise exception 'target_unavailable';
  end if;
  v_key := coalesce(gm.published_bundle_path, 'legacy/' || gm.slug);

  if p_action = 'fail' then
    insert into public.game_preview_video_attempts as a (game_id, release_key, attempts, failure_code, claimed_at, updated_at)
      values (gm.id, v_key, 1, left(coalesce(p->>'failure_code', 'recorder_error'), 40), null, now())
      on conflict (game_id) do update set
        attempts = case when a.release_key = excluded.release_key then a.attempts + 1 else 1 end,
        release_key = excluded.release_key, failure_code = excluded.failure_code, claimed_at = null, updated_at = now();
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'record' then
    if p->>'source' not in ('recorder', 'owner') then raise exception 'invalid_request'; end if;
    if p->>'source' = 'owner' and (p->>'owner_id' is null or gm.owner_id::text is distinct from p->>'owner_id') then
      raise exception 'target_unavailable';
    end if;
    -- The recorder proves which release it played; an owner upload is always
    -- for the release the owner just published.
    if (p->>'source' = 'recorder' or p->>'release_key' is not null) and p->>'release_key' is distinct from v_key then
      raise exception 'revision_superseded';
    end if;
    if split_part(p->>'video_path', '/', 1) <> gm.id::text or split_part(p->>'poster_path', '/', 1) <> gm.id::text
       or split_part(p->>'video_path', '/', 2) <> split_part(p->>'poster_path', '/', 2) then
      raise exception 'media_invalid';
    end if;
    select nullif(o.metadata->>'size', '')::bigint into v_size from storage.objects o
     where o.bucket_id = 'game-preview-videos' and o.name = p->>'video_path';
    select nullif(o.metadata->>'size', '')::bigint into v_poster_size from storage.objects o
     where o.bucket_id = 'game-preview-videos' and o.name = p->>'poster_path';
    if v_size is distinct from (p->>'video_bytes')::bigint or v_poster_size is distinct from (p->>'poster_bytes')::bigint then
      raise exception 'media_invalid';
    end if;
    insert into public.game_preview_videos as v (game_id, release_key, video_path, poster_path, width, height,
        duration_ms, video_bytes, poster_bytes, source, recorded_at)
      values (gm.id, v_key, p->>'video_path', p->>'poster_path', (p->>'width')::integer, (p->>'height')::integer,
        (p->>'duration_ms')::integer, (p->>'video_bytes')::integer, (p->>'poster_bytes')::integer, p->>'source', now())
      on conflict (game_id) do update set release_key = excluded.release_key, video_path = excluded.video_path,
        poster_path = excluded.poster_path, width = excluded.width, height = excluded.height,
        duration_ms = excluded.duration_ms, video_bytes = excluded.video_bytes, poster_bytes = excluded.poster_bytes,
        source = excluded.source, recorded_at = now();
    delete from public.game_preview_video_attempts where game_id = gm.id;
    return jsonb_build_object('ok', true, 'game_id', gm.id, 'video_path', p->>'video_path', 'poster_path', p->>'poster_path');
  end if;
  raise exception 'invalid_action';
end;
$$;
revoke all on function public.game_preview_video_service(text, jsonb) from public, anon, authenticated;
grant execute on function public.game_preview_video_service(text, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
