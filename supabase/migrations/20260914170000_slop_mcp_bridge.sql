-- Narrow, opt-in MCP queue. Do not bulk-apply this repository's older schema.
-- This migration needs the current mobile private-bundle schema and helpers.
begin;
do $$ begin
  if to_regprocedure('public.is_nonanonymous_user(uuid)') is null
     or to_regprocedure('public.has_account_delete_intent(uuid)') is null
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='private_bundle_path') then
    raise exception 'Current Slop private-bundle schema required';
  end if;
end $$;

create table public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  client_name text not null check (length(client_name) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  poll_hash text not null check (poll_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  pairing_expires_at timestamptz not null default now() + interval '10 minutes',
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz
);
create table public.mcp_projects (
  id uuid not null,
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  latest_revision integer not null,
  primary key (connection_id,id)
);
create table public.mcp_submissions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  request_id uuid not null,
  revision integer not null check (revision between 1 and 1000000),
  name text not null,
  description text not null,
  files jsonb not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes between 1 and 2000000),
  slug text not null unique,
  game_id uuid,
  status text not null default 'awaiting_confirmation' check (status in ('awaiting_confirmation','validating','ready')),
  lease uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique (connection_id, request_id),
  unique (connection_id, project_id, revision),
  foreign key (connection_id, project_id) references public.mcp_projects(connection_id,id) on delete cascade
);
create index mcp_submissions_owner_created on public.mcp_submissions(owner_id, created_at desc);
alter table public.mcp_connections enable row level security;
alter table public.mcp_projects enable row level security;
alter table public.mcp_submissions enable row level security;
revoke all on public.mcp_connections, public.mcp_projects, public.mcp_submissions from public, anon, authenticated, service_role;

create function public._mcp_connection_json(c public.mcp_connections)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('connection_id',c.id,'client_name',c.client_name,
    'status',case when c.revoked_at is not null then 'revoked'
      when c.approved_at is null and c.pairing_expires_at <= now() then 'expired'
      when c.approved_at is null then 'pending'
      when c.expires_at <= now() then 'expired' else 'active' end,
    'approved_at',c.approved_at,'expires_at',c.expires_at,
    'last_seen_at',c.last_seen_at,'scopes',jsonb_build_array('drafts:send','drafts:status'));
$$;
create function public._mcp_submission_json(s public.mcp_submissions)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('submission_id',s.id,'project_id',s.project_id,
    'request_id',s.request_id,'revision',s.revision,'name',s.name,
    'description',s.description,'digest',s.digest,'bytes',s.bytes,
    'status',s.status,'slug',s.slug,'game_id',s.game_id,
    'created_at',s.created_at,'ready_at',s.ready_at);
$$;

-- Only the Edge service may call this endpoint. Every agent action resolves the
-- owner from a live grant hash, then locks account lifecycle before grant state.
create function public.mcp_service(p_action text, p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.mcp_connections%rowtype; s public.mcp_submissions%rowtype;
  v_owner uuid; v_id uuid; v_latest integer; v_revision integer;
begin
  if p_action = 'pair_start' then
    perform pg_advisory_xact_lock(hashtextextended('mcp-pair-start',0));
    -- Public pairing creates no grant. Bound anonymous queue/storage abuse.
    delete from public.mcp_connections where owner_id is null and pairing_expires_at < now()-interval '1 hour';
    if (select count(*) from public.mcp_connections where created_at > now()-interval '1 minute') >= 30
       or (select count(*) from public.mcp_connections where owner_id is null) >= 1000 then
      raise exception 'rate_limited' using errcode='P0001'; end if;
    insert into public.mcp_connections(client_name,token_hash,code_hash,poll_hash)
      values(p->>'client_name',p->>'token_hash',p->>'code_hash',p->>'poll_hash') returning * into c;
    return jsonb_build_object('pairing_id',c.id,'status','pending','expires_at',c.pairing_expires_at);
  end if;
  if p_action = 'pair_status' then
    select * into c from public.mcp_connections where id=(p->>'pairing_id')::uuid and poll_hash=p->>'poll_hash';
    if not found then raise exception 'invalid_pairing' using errcode='42501'; end if;
    return jsonb_build_object('pairing_id',c.id,'status',case
      when c.revoked_at is not null then 'revoked'
      when c.approved_at is not null and c.expires_at > now() then 'approved'
      when c.pairing_expires_at <= now() then 'expired' else 'pending' end,
      'connection_id',case when c.approved_at is not null then c.id else null end,
      'expires_at',coalesce(c.expires_at,c.pairing_expires_at));
  end if;
  if p_action = 'finish_draft' then
    select owner_id into v_owner from public.mcp_submissions where id=(p->>'submission_id')::uuid;
    if v_owner is null or v_owner is distinct from (p->>'owner_id')::uuid then raise exception 'invalid_connection' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended('slop-account:'||v_owner::text,0));
    if not coalesce(public.is_nonanonymous_user(v_owner),false) or public.has_account_delete_intent(v_owner) then raise exception 'account_unavailable' using errcode='42501'; end if;
    select c0.* into c from public.mcp_connections c0 join public.mcp_submissions s0 on s0.connection_id=c0.id
      where s0.id=(p->>'submission_id')::uuid for update of c0;
    if c.revoked_at is not null or c.expires_at<=now() then raise exception 'invalid_connection' using errcode='42501'; end if;
    select * into s from public.mcp_submissions where id=(p->>'submission_id')::uuid for update;
    select latest_revision into v_latest from public.mcp_projects where connection_id=c.id and id=s.project_id;
    if s.revision is distinct from v_latest then raise exception 'revision_superseded'; end if;
    if s.status<>'validating' or s.lease is distinct from (p->>'lease')::uuid or s.lease_until<=now() then raise exception 'confirmation_expired'; end if;
    if not exists(select 1 from public.games where id=(p->>'game_id')::uuid and slug=s.slug and owner_id=v_owner and status='draft') then raise exception 'game_not_found'; end if;
    update public.mcp_submissions set status='ready',game_id=(p->>'game_id')::uuid,ready_at=now(),lease=null,lease_until=null
      where id=s.id returning * into s;
    return public._mcp_submission_json(s)||jsonb_build_object('owner_id',v_owner);
  end if;
  select owner_id into v_owner from public.mcp_connections where token_hash=p->>'token_hash';
  if v_owner is null then raise exception 'invalid_connection' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('slop-account:'||v_owner::text,0));
  select * into c from public.mcp_connections where token_hash=p->>'token_hash' for update;
  if c.owner_id is distinct from v_owner or c.approved_at is null or c.revoked_at is not null or c.expires_at <= now()
     or not coalesce(public.is_nonanonymous_user(v_owner),false) or public.has_account_delete_intent(v_owner) then
    raise exception 'invalid_connection' using errcode='42501'; end if;
  if p_action = 'agent_revoke' then
    update public.mcp_connections set revoked_at=now() where id=c.id;
    return jsonb_build_object('connection_id',c.id,'status','revoked');
  end if;
  update public.mcp_connections set last_seen_at=now() where id=c.id returning * into c;
  if p_action = 'agent_status' then return public._mcp_connection_json(c); end if;
  if p_action = 'agent_drafts' then
    return jsonb_build_object('submissions',coalesce((select jsonb_agg(public._mcp_submission_json(x) order by x.created_at desc)
      from (select * from public.mcp_submissions where connection_id=c.id order by created_at desc limit 50) x),'[]'::jsonb));
  end if;
  if p_action <> 'send_draft' then raise exception 'invalid_action'; end if;
  -- Idempotency is checked before quotas and revision advancement. Reusing a
  -- request for changed bytes/metadata fails; replay never creates a new row.
  select * into s from public.mcp_submissions where connection_id=c.id and request_id=(p->>'request_id')::uuid;
  if found then
    if s.request_digest is distinct from p->>'request_digest' then raise exception 'request_conflict'; end if;
    return public._mcp_submission_json(s);
  end if;
  if jsonb_typeof(p->'files') is distinct from 'object' or octet_length((p->'files')::text)>2300000
    or length(p->>'name') not between 1 and 80 or length(p->>'description')>240 then raise exception 'invalid_bundle'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mcp-owner:'||v_owner::text,0));
  if (select count(*) from public.mcp_submissions where owner_id=v_owner and created_at>now()-interval '1 day')>=60
    or (select coalesce(sum(bytes),0) from public.mcp_submissions where owner_id=v_owner)+(p->>'bytes')::integer>20000000 then
    raise exception 'rate_limited'; end if;
  v_revision := (p->>'revision')::integer;
  select latest_revision into v_latest from public.mcp_projects where connection_id=c.id and id=(p->>'project_id')::uuid;
  if found and v_revision <= v_latest then raise exception 'revision_conflict'; end if;
  if v_latest is null and (select count(*) from public.mcp_projects where owner_id=v_owner)>=20 then raise exception 'project_limit'; end if;
  insert into public.mcp_projects(id,connection_id,owner_id,latest_revision)
    values((p->>'project_id')::uuid,c.id,v_owner,v_revision)
    on conflict(connection_id,id) do update set latest_revision=excluded.latest_revision;
  v_id := gen_random_uuid();
  insert into public.mcp_submissions(id,connection_id,owner_id,project_id,request_id,revision,name,description,files,digest,request_digest,bytes,slug)
    values(v_id,c.id,v_owner,(p->>'project_id')::uuid,(p->>'request_id')::uuid,v_revision,p->>'name',p->>'description',p->'files',
      p->>'digest',p->>'request_digest',(p->>'bytes')::integer,'mcp-'||replace(v_id::text,'-','')) returning * into s;
  return public._mcp_submission_json(s);
end;
$$;

-- Phone RPCs are user-JWT-only. Source code and pairing hashes never appear in
-- listing responses. Claiming a revision is an explicit authenticated action.
create function public.mcp_phone(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid := auth.uid(); c public.mcp_connections%rowtype;
  s public.mcp_submissions%rowtype; v_connection uuid; v_latest integer;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('slop-account:'||v_owner::text,0));
  if not coalesce(public.is_nonanonymous_user(v_owner),false) or public.has_account_delete_intent(v_owner) then
    raise exception 'account_unavailable' using errcode='42501'; end if;
  if p_action in ('pair_review','pair_confirm') then
    select * into c from public.mcp_connections where id=(p->>'pairing_id')::uuid and code_hash=p->>'code_hash' for update;
    if not found or c.revoked_at is not null or (c.owner_id is not null and c.owner_id<>v_owner) then raise exception 'invalid_pairing' using errcode='42501'; end if;
    if c.approved_at is null and c.pairing_expires_at<=now() then raise exception 'pairing_expired'; end if;
    if p_action='pair_confirm' and c.approved_at is null then
      if (select count(*) from public.mcp_connections where owner_id=v_owner and revoked_at is null and expires_at>now())>=10 then raise exception 'connection_limit'; end if;
      update public.mcp_connections set owner_id=v_owner,approved_at=now(),expires_at=now()+interval '30 days' where id=c.id returning * into c;
    end if;
    return public._mcp_connection_json(c)||jsonb_build_object('pairing_id',c.id,'pairing_expires_at',c.pairing_expires_at,
      'owner_id',v_owner,'requires_confirmation',c.approved_at is null);
  end if;
  if p_action='connections' then
    return jsonb_build_object('owner_id',v_owner,'connections',coalesce((select jsonb_agg(public._mcp_connection_json(x) order by x.created_at desc)
      from public.mcp_connections x where owner_id=v_owner),'[]'::jsonb));
  end if;
  if p_action='revoke' then
    update public.mcp_connections set revoked_at=coalesce(revoked_at,now()) where id=(p->>'connection_id')::uuid and owner_id=v_owner returning * into c;
    if not found then raise exception 'connection_not_found' using errcode='42501'; end if;
    return public._mcp_connection_json(c)||jsonb_build_object('owner_id',v_owner);
  end if;
  if p_action='drafts' then
    return jsonb_build_object('owner_id',v_owner,'submissions',coalesce((select jsonb_agg(public._mcp_submission_json(x) order by x.created_at desc)
      from (select queued.* from public.mcp_submissions queued join public.mcp_connections grant_row on grant_row.id=queued.connection_id
        where queued.owner_id=v_owner and grant_row.revoked_at is null and grant_row.expires_at>now() order by queued.created_at desc limit 50) x),'[]'::jsonb));
  end if;
  select connection_id into v_connection from public.mcp_submissions where id=(p->>'submission_id')::uuid and owner_id=v_owner;
  select * into c from public.mcp_connections where id=v_connection and owner_id=v_owner for update;
  if not found or c.revoked_at is not null or c.expires_at<=now() then raise exception 'invalid_connection' using errcode='42501'; end if;
  select * into s from public.mcp_submissions where id=(p->>'submission_id')::uuid and owner_id=v_owner for update;
  select latest_revision into v_latest from public.mcp_projects where connection_id=c.id and id=s.project_id;
  if s.revision is distinct from v_latest then raise exception 'revision_superseded'; end if;
  if p_action='claim_draft' then
    if s.digest is distinct from p->>'expected_digest' then raise exception 'version_changed'; end if;
    if s.status='validating' and s.lease_until>now() then raise exception 'confirmation_busy'; end if;
    update public.mcp_submissions set status='validating',lease=gen_random_uuid(),lease_until=now()+interval '3 minutes'
      where id=s.id returning * into s;
    return public._mcp_submission_json(s)||jsonb_build_object('owner_id',v_owner,'files',s.files,'lease',s.lease);
  end if;
  if s.status<>'validating' or s.lease is distinct from (p->>'lease')::uuid or s.lease_until<=now() then raise exception 'confirmation_expired'; end if;
  if p_action='check_lease' then return jsonb_build_object('ok',true); end if;
  raise exception 'invalid_action';
end;
$$;
revoke all on function public._mcp_connection_json(public.mcp_connections), public._mcp_submission_json(public.mcp_submissions),
  public.mcp_service(text,jsonb), public.mcp_phone(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mcp_service(text,jsonb) to service_role;
grant execute on function public.mcp_phone(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
