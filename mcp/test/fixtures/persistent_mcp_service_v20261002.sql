-- Read-only inspected live authority fixture; no grants, tokens or player rows.
-- Live pg_get_functiondef MD5 4676f2b257c9bf41cdc60004ceb84418.
CREATE OR REPLACE FUNCTION public.mcp_service(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if left(p_action,10)='publisher_' then return public._mcp_publisher(p_action,p); end if;
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
  if p_action in ('request_publish','publish_status') then return public._mcp_agent_publish(p_action,p,c); end if;
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
  if (select count(*) from public.mcp_submissions where owner_id=v_owner and created_at>now()-interval '1 day')>=
      (case when (exists(select 1 from public.admin_users staff where staff.user_id=v_owner) or exists(select 1 from public.moderator_users mods where mods.user_id=v_owner)) then 1000 else 60 end)
    or (select coalesce(sum(bytes),0) from public.mcp_submissions where owner_id=v_owner)+(p->>'bytes')::integer>
      (case when (exists(select 1 from public.admin_users staff where staff.user_id=v_owner) or exists(select 1 from public.moderator_users mods where mods.user_id=v_owner)) then 1000000000 else 20000000 end) then
    raise exception 'rate_limited'; end if;
  v_revision := (p->>'revision')::integer;
  select latest_revision into v_latest from public.mcp_projects where connection_id=c.id and id=(p->>'project_id')::uuid;
  if found and v_revision <= v_latest then raise exception 'revision_conflict'; end if;
  if v_latest is null and (select count(*) from public.mcp_projects where owner_id=v_owner)>=
    (case when (exists(select 1 from public.admin_users staff where staff.user_id=v_owner) or exists(select 1 from public.moderator_users mods where mods.user_id=v_owner)) then 10000 else 20 end) then raise exception 'project_limit'; end if;
  insert into public.mcp_projects(id,connection_id,owner_id,latest_revision)
    values((p->>'project_id')::uuid,c.id,v_owner,v_revision)
    on conflict(connection_id,id) do update set latest_revision=excluded.latest_revision;
  v_id := gen_random_uuid();
  insert into public.mcp_submissions(id,connection_id,owner_id,project_id,request_id,revision,name,description,files,digest,request_digest,bytes,slug)
    values(v_id,c.id,v_owner,(p->>'project_id')::uuid,(p->>'request_id')::uuid,v_revision,p->>'name',p->>'description',p->'files',
      p->>'digest',p->>'request_digest',(p->>'bytes')::integer,'mcp-'||replace(v_id::text,'-','')) returning * into s;
  return public._mcp_submission_json(s);
end;
$function$
