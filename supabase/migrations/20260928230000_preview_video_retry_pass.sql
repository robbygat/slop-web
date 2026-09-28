-- Retry each failure that predates a recorder pass once, without reclaiming
-- any fresh failure from that same pass. Existing publication, active-claim,
-- current-release, owner, media validation and privilege guards are unchanged.
begin;

create or replace function public.game_preview_video_service(p_action text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gm public.games%rowtype;
  v_key text; v_limit integer; v_shards integer; v_shard integer; v_force boolean;
  v_games jsonb; v_size bigint; v_poster_size bigint; v_id uuid;
  v_retry_before timestamptz;
begin
  if p_action = 'claim' then
    v_limit := least(greatest(coalesce((p->>'limit')::integer, 4), 1), 50);
    v_shards := least(greatest(coalesce((p->>'shards')::integer, 1), 1), 32);
    v_shard := least(greatest(coalesce((p->>'shard')::integer, 0), 0), v_shards - 1);
    v_force := coalesce((p->>'retry_failed')::boolean, false);
    if v_force then
      -- Issue the first cutoff from the database clock, then reuse it for the
      -- whole pass. Reject future/expired cutoffs rather than moving them.
      if p->>'retry_before' is null then
        v_retry_before := now();
      else
        if jsonb_typeof(p->'retry_before') <> 'string' then raise exception 'invalid_request'; end if;
        begin
          v_retry_before := (p->>'retry_before')::timestamptz;
        exception when others then raise exception 'invalid_request'; end;
        if not isfinite(v_retry_before) or v_retry_before > now()
           or v_retry_before < now() - interval '2 hours' then raise exception 'invalid_request'; end if;
      end if;
    elsif p->>'retry_before' is not null then
      raise exception 'invalid_request';
    end if;
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
                              or (a.attempts >= 2 and not v_force)
                              or (v_force and a.updated_at >= v_retry_before)))
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
    return jsonb_build_object('games', v_games, 'retry_before', v_retry_before);
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
    if p->>'release_key' is distinct from v_key then raise exception 'revision_superseded'; end if;
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
