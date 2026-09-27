-- MCP auto-publish. An owner may opt a connection into publishing without a
-- browser window: the agent requests publication of its latest revision, a
-- server-side recorder (GitHub Actions, OIDC-verified by slop-mcp) playtests
-- the bundle and records the cover and feed GIF with the website's capture
-- code, and the game-bundle authority publishes it as the owner. Staff owners
-- auto-approve through the existing submit_review path; everyone else lands in
-- pending_review.
--
-- Additive only. The existing bridge functions are edited by exact anchored
-- text insertion and fail closed if their live bodies drifted.
begin;
do $$ begin
  if to_regprocedure('public.mcp_service(text,jsonb)') is null
     or to_regprocedure('public.mcp_phone(text,jsonb)') is null
     or to_regprocedure('public.record_game_cover(text,text,text,bigint)') is null
     or to_regprocedure('public.record_game_preview(text,text,text,text,integer,integer,integer,bigint)') is null
     or to_regprocedure('public.set_game_supported_platforms(uuid,text,text[])') is null
     or to_regclass('public.admin_users') is null then
    raise exception 'Current Slop MCP bridge and media authority required';
  end if;
end $$;

alter table public.mcp_connections
  add column if not exists auto_publish boolean not null default false,
  add column if not exists auto_publish_changed_at timestamptz;

create table if not exists public.mcp_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.mcp_submissions(id) on delete cascade,
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  -- The owner's live (or mid-update) game of the same project, resolved when
  -- the agent asks. Null publishes the submission as a new game.
  target_game_id uuid,
  target_slug text,
  status text not null default 'requested' check (status in
    ('requested','recording','publishing','published','pending_review','failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_hash text check (lease_hash ~ '^[0-9a-f]{64}$'),
  lease_until timestamptz,
  failure_code text check (failure_code in (
    'boot_error','not_ready','blank_canvas','no_motion','capture_too_large',
    'runtime_invalid','recorder_error','grant_inactive','auto_publish_disabled',
    'revision_superseded','target_pending_review','target_unavailable',
    'already_published','media_invalid','bundle_invalid','publish_rejected',
    'publish_failed','lease_expired','attempts_exhausted')),
  game_id uuid,
  slug text,
  review_submission_id uuid,
  cover_sha256 text check (cover_sha256 ~ '^[0-9a-f]{64}$'),
  cover_bytes integer check (cover_bytes between 1 and 716800),
  cover_width integer,
  cover_height integer,
  gif_sha256 text check (gif_sha256 ~ '^[0-9a-f]{64}$'),
  gif_bytes integer check (gif_bytes between 1 and 2097152),
  width integer,
  height integer,
  frame_count integer check (frame_count between 3 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz
);
create index if not exists mcp_publish_jobs_queue on public.mcp_publish_jobs(status, created_at);
create index if not exists mcp_publish_jobs_owner_created on public.mcp_publish_jobs(owner_id, created_at desc);
alter table public.mcp_publish_jobs enable row level security;
revoke all on public.mcp_publish_jobs from public, anon, authenticated, service_role;

-- Private staging for recorder media. No storage policies: only the service
-- role (slop-mcp writes, game-bundle reads) can touch it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('mcp-publisher-staging', 'mcp-publisher-staging', false, 2097152,
    array['image/jpeg','image/gif'])
  on conflict (id) do nothing;

create or replace function public._mcp_publish_job_json(j public.mcp_publish_jobs)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('job_id',j.id,'submission_id',j.submission_id,
    'status',j.status,'failure_code',j.failure_code,'attempts',j.attempts,
    'update',j.target_game_id is not null,'game_slug',coalesce(j.slug,j.target_slug),
    'review_submission_id',j.review_submission_id,'requested_at',j.created_at,
    'updated_at',j.updated_at,'finished_at',j.finished_at);
$$;

-- Connection and submission JSON gain auto_publish / publication. Replace
-- only the exact reviewed bodies (whitespace-insensitive).
do $migration$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid='public._mcp_connection_json(public.mcp_connections)'::regprocedure;
  if strpos(v_src,'auto_publish')=0 then
    if md5(regexp_replace(v_src,'\s','','g'))<>'56e05410d820f116485aa15ea85e10cd' then
      raise exception '_mcp_connection_json drift';
    end if;
    execute $fn$
create or replace function public._mcp_connection_json(c public.mcp_connections)
returns jsonb language sql stable set search_path='' as $body$
  select jsonb_build_object('connection_id',c.id,'client_name',c.client_name,
    'status',case when c.revoked_at is not null then 'revoked'
      when c.approved_at is null and c.pairing_expires_at <= now() then 'expired'
      when c.approved_at is null then 'pending'
      when c.expires_at <= now() then 'expired' else 'active' end,
    'approved_at',c.approved_at,'expires_at',c.expires_at,
    'last_seen_at',c.last_seen_at,'scopes',jsonb_build_array('drafts:send','drafts:status'),
    'auto_publish',c.auto_publish,'auto_publish_changed_at',c.auto_publish_changed_at);
$body$;
$fn$;
  end if;
  select prosrc into v_src from pg_proc where oid='public._mcp_submission_json(public.mcp_submissions)'::regprocedure;
  if strpos(v_src,'publication')=0 then
    if md5(regexp_replace(v_src,'\s','','g'))<>'f88a268bed7f2f2ff75d29387fea65ea' then
      raise exception '_mcp_submission_json drift';
    end if;
    execute $fn$
create or replace function public._mcp_submission_json(s public.mcp_submissions)
returns jsonb language sql stable set search_path='' as $body$
  select jsonb_build_object('submission_id',s.id,'project_id',s.project_id,
    'request_id',s.request_id,'revision',s.revision,'name',s.name,
    'description',s.description,'digest',s.digest,'bytes',s.bytes,
    'status',s.status,'slug',s.slug,'game_id',s.game_id,
    'created_at',s.created_at,'ready_at',s.ready_at,
    'publication',(select public._mcp_publish_job_json(j) from public.mcp_publish_jobs j where j.submission_id=s.id));
$body$;
$fn$;
  end if;
end
$migration$;

-- Agent side: request publication of the connection's latest revision, or
-- read its state. Runs inside mcp_service after the grant row is locked.
create or replace function public._mcp_agent_publish(p_action text, p jsonb, c public.mcp_connections)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.mcp_submissions%rowtype; j public.mcp_publish_jobs%rowtype;
  v_latest integer; v_staff boolean; v_tid uuid; v_tslug text; v_tstatus text;
begin
  if coalesce(p->>'submission_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_request'; end if;
  select * into s from public.mcp_submissions where id=(p->>'submission_id')::uuid and connection_id=c.id;
  if not found then raise exception 'submission_not_found'; end if;
  if p_action='publish_status' then
    select * into j from public.mcp_publish_jobs where submission_id=s.id;
    return jsonb_build_object('submission_id',s.id,'publication',
      case when found then public._mcp_publish_job_json(j) else null end,'auto_publish',c.auto_publish);
  end if;
  if p_action<>'request_publish' then raise exception 'invalid_action'; end if;
  if not c.auto_publish then raise exception 'auto_publish_disabled'; end if;
  select * into s from public.mcp_submissions where id=s.id for update;
  select latest_revision into v_latest from public.mcp_projects where connection_id=c.id and id=s.project_id;
  if s.revision is distinct from v_latest then raise exception 'revision_superseded'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mcp-owner:'||c.owner_id::text,0));
  select * into j from public.mcp_publish_jobs where submission_id=s.id for update;
  if found then
    -- Idempotent. A failed job may be asked for again while attempts remain.
    if j.status='failed' and j.attempts<3 and j.failure_code in
       ('boot_error','not_ready','blank_canvas','no_motion','capture_too_large','recorder_error',
        'media_invalid','publish_failed','lease_expired','auto_publish_disabled','grant_inactive') then
      update public.mcp_publish_jobs set status='requested',finished_at=null,updated_at=now()
        where id=j.id returning * into j;
    end if;
    return public._mcp_publish_job_json(j);
  end if;
  if exists(select 1 from public.mcp_publish_jobs where owner_id=c.owner_id and project_id=s.project_id
      and status in ('requested','recording','publishing')) then
    raise exception 'publish_in_progress';
  end if;
  v_staff := exists(select 1 from public.admin_users staff where staff.user_id=c.owner_id);
  if (select count(*) from public.mcp_publish_jobs where owner_id=c.owner_id and created_at>now()-interval '1 hour')
       >= (case when v_staff then 30 else 3 end)
     or (select count(*) from public.mcp_publish_jobs where owner_id=c.owner_id and created_at>now()-interval '1 day')
       >= (case when v_staff then 300 else 10 end) then
    raise exception 'rate_limited';
  end if;
  if s.game_id is not null and exists(select 1 from public.games g where g.id=s.game_id and g.status<>'draft') then
    raise exception 'already_published';
  end if;
  -- Same rule as the web inbox: a later revision updates the project's live
  -- (or mid-update) game instead of publishing a duplicate beside it.
  select g.id, g.slug, g.status into v_tid, v_tslug, v_tstatus
    from public.mcp_submissions s2
    join public.games g on g.id=s2.game_id and g.owner_id=c.owner_id
   where s2.owner_id=c.owner_id and s2.project_id=s.project_id and s2.id<>s.id
     and not coalesce(g.media_delete_authorized,false)
     and (g.status in ('published','pending_review')
       or (g.status='draft' and (g.published_bundle_path is not null or (g.thumb is not null and g.preview_url is not null))))
   order by s2.revision desc, s2.created_at desc limit 1;
  if v_tstatus='pending_review' then raise exception 'target_pending_review'; end if;
  insert into public.mcp_publish_jobs(submission_id,connection_id,owner_id,project_id,digest,target_game_id,target_slug)
    values(s.id,c.id,c.owner_id,s.project_id,s.digest,v_tid,v_tslug) returning * into j;
  return public._mcp_publish_job_json(j);
end;
$$;

-- Publisher side. Only mcp_service (service role) reaches this; every call
-- after claim proves the per-job lease (a SHA-256 of a secret held only by
-- slop-mcp's caller) and rechecks the grant, opt-in and latest revision.
create or replace function public._mcp_publisher(p_action text, p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.mcp_publish_jobs%rowtype; c public.mcp_connections%rowtype;
  s public.mcp_submissions%rowtype; g public.games%rowtype;
  v_latest integer; v_code text; v_i integer; v_target text; v_w integer; v_h integer;
  v_claims text; v_sub text; v_role text;
begin
  if coalesce(p->>'lease_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_request'; end if;
  if p_action='publisher_claim' then
    -- Abandoned leases (a crashed recorder or publisher) return to the queue.
    update public.mcp_publish_jobs set
      status=case when attempts>=3 then 'failed' else 'requested' end,
      failure_code=coalesce(failure_code,case when attempts>=3 then 'attempts_exhausted' else 'lease_expired' end),
      finished_at=case when attempts>=3 then now() else null end,
      lease_hash=null,lease_until=null,updated_at=now()
     where status in ('recording','publishing') and lease_until<=now();
    for v_i in 1..20 loop
      select * into j from public.mcp_publish_jobs where status='requested'
        order by created_at limit 1 for update skip locked;
      if not found then return jsonb_build_object('job',null); end if;
      perform pg_advisory_xact_lock(hashtextextended('slop-account:'||j.owner_id::text,0));
      select * into c from public.mcp_connections where id=j.connection_id;
      select * into s from public.mcp_submissions where id=j.submission_id;
      select latest_revision into v_latest from public.mcp_projects where connection_id=c.id and id=s.project_id;
      v_code:=null;
      if c.revoked_at is not null or c.approved_at is null or c.expires_at<=now() or c.owner_id is distinct from j.owner_id
         or not coalesce(public.is_nonanonymous_user(j.owner_id),false) or public.has_account_delete_intent(j.owner_id) then
        v_code:='grant_inactive';
      elsif not c.auto_publish then v_code:='auto_publish_disabled';
      elsif s.revision is distinct from v_latest or s.digest is distinct from j.digest then v_code:='revision_superseded';
      elsif j.attempts>=3 then v_code:='attempts_exhausted';
      end if;
      if v_code is not null then
        update public.mcp_publish_jobs set status='failed',failure_code=v_code,finished_at=now(),
          lease_hash=null,lease_until=null,updated_at=now() where id=j.id;
        continue;
      end if;
      update public.mcp_publish_jobs set status='recording',attempts=attempts+1,lease_hash=p->>'lease_hash',
        lease_until=now()+interval '15 minutes',claimed_at=now(),updated_at=now(),
        cover_sha256=null,cover_bytes=null,cover_width=null,cover_height=null,
        gif_sha256=null,gif_bytes=null,width=null,height=null,frame_count=null
       where id=j.id returning * into j;
      return jsonb_build_object('job',jsonb_build_object('job_id',j.id,'attempt',j.attempts,
        'lease_until',j.lease_until,'name',s.name,'digest',s.digest,'files',s.files,
        'update',j.target_game_id is not null));
    end loop;
    return jsonb_build_object('job',null);
  end if;

  if coalesce(p->>'job_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_request'; end if;
  select * into j from public.mcp_publish_jobs where id=(p->>'job_id')::uuid for update;
  if not found or j.lease_hash is null or j.lease_hash is distinct from p->>'lease_hash' then
    raise exception 'invalid_lease' using errcode='42501';
  end if;

  if p_action='publisher_fail' then
    if j.status not in ('recording','publishing') then raise exception 'invalid_lease' using errcode='42501'; end if;
    v_code:=p->>'failure_code';
    if v_code is null or v_code not in (
      'boot_error','not_ready','blank_canvas','no_motion','capture_too_large',
      'runtime_invalid','recorder_error','grant_inactive','auto_publish_disabled',
      'revision_superseded','target_pending_review','target_unavailable',
      'already_published','media_invalid','bundle_invalid','publish_rejected',
      'publish_failed','lease_expired') then v_code:='publish_failed'; end if;
    update public.mcp_publish_jobs set
      status=case when coalesce((p->>'retryable')::boolean,false) and attempts<3 then 'requested' else 'failed' end,
      finished_at=case when coalesce((p->>'retryable')::boolean,false) and attempts<3 then null else now() end,
      failure_code=v_code,lease_hash=null,lease_until=null,updated_at=now()
     where id=j.id returning * into j;
    return public._mcp_publish_job_json(j);
  end if;

  if j.lease_until is null or j.lease_until<=now() then raise exception 'lease_expired'; end if;
  select * into s from public.mcp_submissions where id=j.submission_id;
  v_target:=coalesce((s.files->>'slop-platform.json')::jsonb->>'target_platform','mobile');
  if v_target='desktop' then v_w:=640; v_h:=360; else v_w:=360; v_h:=640; end if;

  if p_action='publisher_media' then
    if j.status<>'recording' then raise exception 'invalid_lease' using errcode='42501'; end if;
    if coalesce(p->>'sha256','') !~ '^[0-9a-f]{64}$' then raise exception 'media_invalid'; end if;
    if p->>'kind'='cover' then
      if (p->>'bytes')::integer not between 1 and 716800
         or (p->>'width')::integer is distinct from v_w*2 or (p->>'height')::integer is distinct from v_h*2 then
        raise exception 'media_invalid';
      end if;
      update public.mcp_publish_jobs set cover_sha256=p->>'sha256',cover_bytes=(p->>'bytes')::integer,
        cover_width=(p->>'width')::integer,cover_height=(p->>'height')::integer,updated_at=now()
       where id=j.id returning * into j;
    elsif p->>'kind'='gif' then
      if (p->>'bytes')::integer not between 1 and 2097152
         or (p->>'width')::integer is distinct from v_w or (p->>'height')::integer is distinct from v_h
         or (p->>'frame_count')::integer not between 3 and 40 then
        raise exception 'media_invalid';
      end if;
      update public.mcp_publish_jobs set gif_sha256=p->>'sha256',gif_bytes=(p->>'bytes')::integer,
        width=(p->>'width')::integer,height=(p->>'height')::integer,frame_count=(p->>'frame_count')::integer,updated_at=now()
       where id=j.id returning * into j;
    else raise exception 'invalid_request';
    end if;
    return jsonb_build_object('ok',true,'kind',p->>'kind');
  end if;

  if p_action='publisher_load' then
    if j.status<>'recording' then raise exception 'invalid_lease' using errcode='42501'; end if;
    if j.cover_sha256 is null or j.gif_sha256 is null or j.width is distinct from v_w or j.height is distinct from v_h
       or j.cover_width is distinct from v_w*2 or j.cover_height is distinct from v_h*2 then
      raise exception 'media_invalid';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('slop-account:'||j.owner_id::text,0));
    select * into c from public.mcp_connections where id=j.connection_id for update;
    select latest_revision into v_latest from public.mcp_projects where connection_id=c.id and id=s.project_id;
    if c.revoked_at is not null or c.approved_at is null or c.expires_at<=now() or c.owner_id is distinct from j.owner_id
       or not coalesce(public.is_nonanonymous_user(j.owner_id),false) or public.has_account_delete_intent(j.owner_id) then
      raise exception 'grant_inactive';
    end if;
    if not c.auto_publish then raise exception 'auto_publish_disabled'; end if;
    if s.revision is distinct from v_latest or s.digest is distinct from j.digest then raise exception 'revision_superseded'; end if;
    if j.target_game_id is not null then
      select * into g from public.games where id=j.target_game_id and owner_id=j.owner_id for update;
      if not found or g.slug is distinct from j.target_slug or coalesce(g.media_delete_authorized,false) then
        raise exception 'target_unavailable';
      end if;
      if g.status='pending_review' then raise exception 'target_pending_review'; end if;
      if g.status not in ('published','draft','private') then raise exception 'target_unavailable'; end if;
    else
      select * into g from public.games where slug=s.slug for update;
      if found then
        if g.owner_id is distinct from j.owner_id or coalesce(g.media_delete_authorized,false) then raise exception 'target_unavailable'; end if;
        if g.status in ('pending_review','published') then raise exception 'already_published'; end if;
        if g.status<>'draft' then raise exception 'target_unavailable'; end if;
      else
        -- The same placeholder row the web/phone confirmation creates, written
        -- under the owner's identity so every insert guard sees the owner.
        v_claims:=current_setting('request.jwt.claims',true);
        v_sub:=current_setting('request.jwt.claim.sub',true);
        v_role:=current_setting('request.jwt.claim.role',true);
        perform set_config('request.jwt.claims',jsonb_build_object('sub',j.owner_id::text,'role','authenticated')::text,true);
        perform set_config('request.jwt.claim.sub',j.owner_id::text,true);
        perform set_config('request.jwt.claim.role','authenticated',true);
        insert into public.games(slug,owner_id,status,name,description,prompt,html)
          values(s.slug,j.owner_id,'draft',s.name,s.description,'Created with Slop MCP',
            '<!doctype html><html><body>Open this private draft in Slop.</body></html>')
          returning * into g;
        perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
        perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
        perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
      end if;
    end if;
    update public.mcp_publish_jobs set status='publishing',game_id=g.id,slug=g.slug,
      lease_until=greatest(lease_until,now()+interval '10 minutes'),updated_at=now()
     where id=j.id returning * into j;
    return jsonb_build_object('job_id',j.id,'owner_id',j.owner_id,'submission_id',s.id,
      'slug',g.slug,'game_id',g.id,'game_status',g.status,'update',j.target_game_id is not null,
      'target_platform',v_target,'files',s.files,'digest',s.digest,
      'cover',jsonb_build_object('path','jobs/'||j.id||'/cover.jpg','bytes',j.cover_bytes,'sha256',j.cover_sha256),
      'gif',jsonb_build_object('path','jobs/'||j.id||'/preview.gif','bytes',j.gif_bytes,'sha256',j.gif_sha256,
        'width',j.width,'height',j.height,'frame_count',j.frame_count));
  end if;

  if p_action='publisher_finish' then
    if j.status<>'publishing' then raise exception 'invalid_lease' using errcode='42501'; end if;
    select * into g from public.games where id=j.game_id and owner_id=j.owner_id and slug=j.slug;
    if not found or g.status not in ('published','pending_review') then raise exception 'publish_failed'; end if;
    if j.target_game_id is null and g.slug=s.slug then
      update public.mcp_submissions set status='ready',game_id=g.id,ready_at=coalesce(ready_at,now()),lease=null,lease_until=null
       where id=s.id;
    end if;
    update public.mcp_publish_jobs set status=g.status,
      review_submission_id=case when g.status='pending_review' then g.review_submission_id else coalesce(nullif(p->>'review_submission_id','')::uuid,review_submission_id) end,
      failure_code=null,finished_at=now(),lease_hash=null,lease_until=null,updated_at=now()
     where id=j.id returning * into j;
    return public._mcp_publish_job_json(j);
  end if;
  raise exception 'invalid_action';
end;
$$;

-- Records the recorder's media and the published metadata as the owner, by
-- running the unchanged owner receipts (record_game_cover/preview,
-- set_game_supported_platforms) with the owner's identity for this
-- transaction only. Service-only; requires the job's live publishing lease.
create or replace function public.mcp_publisher_record(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.mcp_publish_jobs%rowtype; s public.mcp_submissions%rowtype;
  v_claims text; v_sub text; v_role text; v_target text; v_platforms text[];
  v_cover text; v_preview jsonb; v_platform jsonb; v_build text := p->>'build_id';
begin
  if coalesce(p->>'lease_hash','') !~ '^[0-9a-f]{64}$' or coalesce(p->>'job_id','') !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(v_build,'') !~ '^b3-[0-9a-f]{32}$' then
    raise exception 'invalid_request';
  end if;
  select * into j from public.mcp_publish_jobs where id=(p->>'job_id')::uuid for update;
  if not found or j.lease_hash is distinct from p->>'lease_hash' or j.status<>'publishing'
     or j.lease_until is null or j.lease_until<=now() or j.slug is null or j.game_id is null then
    raise exception 'invalid_lease' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('slop-account:'||j.owner_id::text,0));
  if not coalesce(public.is_nonanonymous_user(j.owner_id),false) or public.has_account_delete_intent(j.owner_id) then
    raise exception 'grant_inactive';
  end if;
  select * into s from public.mcp_submissions where id=j.submission_id;
  if s.digest is distinct from j.digest then raise exception 'revision_superseded'; end if;
  if p->>'cover_path' is distinct from (j.slug||'/1.0.0/covers/'||j.game_id||'/'||v_build||'-c3-'||left(j.cover_sha256,32)||'/cover.jpg')
     or p->>'gif_path' is distinct from (j.slug||'/1.0.0/previews/'||j.game_id||'/'||v_build||'-c3-'||left(j.gif_sha256,32)||'/preview.gif') then
    raise exception 'media_invalid';
  end if;
  v_target:=coalesce((s.files->>'slop-platform.json')::jsonb->>'target_platform','mobile');
  v_platforms:=case v_target when 'desktop' then array['desktop'] when 'cross-platform' then array['mobile','desktop'] else array['mobile'] end;
  v_claims:=current_setting('request.jwt.claims',true);
  v_sub:=current_setting('request.jwt.claim.sub',true);
  v_role:=current_setting('request.jwt.claim.role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',j.owner_id::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',j.owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_cover:=public.record_game_cover(j.slug,'1.0.0',p->>'cover_path',j.cover_bytes::bigint);
  if v_cover is distinct from p->>'cover_path' then raise exception 'media_invalid'; end if;
  v_preview:=public.record_game_preview(j.slug,'1.0.0',v_build,p->>'gif_path',j.width,j.height,j.frame_count,j.gif_bytes::bigint);
  if (v_preview->>'saved') is distinct from 'true' then raise exception 'media_invalid'; end if;
  v_platform:=public.set_game_supported_platforms(j.owner_id,j.slug,v_platforms);
  update public.games set name=s.name,description=coalesce(s.description,''),
      prompt='Created with a connected coding app',html=s.files->>'index.html'
   where id=j.game_id and slug=j.slug and owner_id=j.owner_id and status in ('draft','private');
  if not found then raise exception 'target_unavailable'; end if;
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_role,''),true);
  return jsonb_build_object('ok',true,'slug',j.slug,'cover',v_cover,'preview',v_preview->>'path',
    'supported_platforms',v_platform->'supported_platforms');
end;
$$;

-- Wire the new actions into the existing entry points by anchored insertion.
do $migration$
declare v_sql text; v_anchor text; v_insert text;
begin
  v_sql:=pg_get_functiondef('public.mcp_service(text,jsonb)'::regprocedure);
  if strpos(v_sql,'_mcp_publisher(')=0 then
    v_anchor:=$a$  select owner_id into v_owner from public.mcp_connections where token_hash=p->>'token_hash';$a$;
    v_insert:=$i$  if left(p_action,10)='publisher_' then return public._mcp_publisher(p_action,p); end if;
$i$;
    if length(v_sql)-length(replace(v_sql,v_anchor,''))<>length(v_anchor) then raise exception 'mcp_service publisher anchor drift'; end if;
    v_sql:=replace(v_sql,v_anchor,v_insert||v_anchor);
    v_anchor:=$a$  if p_action <> 'send_draft' then raise exception 'invalid_action'; end if;$a$;
    v_insert:=$i$  if p_action in ('request_publish','publish_status') then return public._mcp_agent_publish(p_action,p,c); end if;
$i$;
    if length(v_sql)-length(replace(v_sql,v_anchor,''))<>length(v_anchor) then raise exception 'mcp_service agent anchor drift'; end if;
    execute replace(v_sql,v_anchor,v_insert||v_anchor);
  end if;
  v_sql:=pg_get_functiondef('public.mcp_phone(text,jsonb)'::regprocedure);
  if strpos(v_sql,'set_auto_publish')=0 then
    v_anchor:=$a$  if p_action='connections' then$a$;
    v_insert:=$i$  if p_action='set_auto_publish' then
    if jsonb_typeof(p->'enabled') is distinct from 'boolean' then raise exception 'invalid_request'; end if;
    update public.mcp_connections set auto_publish=(p->>'enabled')::boolean,auto_publish_changed_at=now()
      where id=(p->>'connection_id')::uuid and owner_id=v_owner and revoked_at is null
        and approved_at is not null and expires_at>now() returning * into c;
    if not found then raise exception 'connection_not_found' using errcode='42501'; end if;
    return public._mcp_connection_json(c)||jsonb_build_object('owner_id',v_owner);
  end if;
$i$;
    if length(v_sql)-length(replace(v_sql,v_anchor,''))<>length(v_anchor) then raise exception 'mcp_phone anchor drift'; end if;
    execute replace(v_sql,v_anchor,v_insert||v_anchor);
  end if;
end
$migration$;

revoke all on function public._mcp_publish_job_json(public.mcp_publish_jobs),
  public._mcp_agent_publish(text,jsonb,public.mcp_connections),
  public._mcp_publisher(text,jsonb),
  public.mcp_publisher_record(jsonb),
  public._mcp_connection_json(public.mcp_connections),
  public._mcp_submission_json(public.mcp_submissions)
  from public, anon, authenticated, service_role;
grant execute on function public.mcp_publisher_record(jsonb) to service_role;
revoke all on function public.mcp_service(text,jsonb) from public, anon, authenticated;
grant execute on function public.mcp_service(text,jsonb) to service_role;
revoke all on function public.mcp_phone(text,jsonb) from public, anon, service_role;
grant execute on function public.mcp_phone(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
