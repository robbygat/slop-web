-- Forward-only, conditional Worlds admission. Apply only after the exact
-- persistence migration. No game is published, backfilled, or granted rewards.
begin;
do $preflight$
begin
  if md5(pg_get_functiondef(to_regprocedure('public.mcp_service(text,jsonb)'))) is distinct from '4676f2b257c9bf41cdc60004ceb84418'
     or to_regprocedure('public._game_bundle_manifest_digest(jsonb)') is null
     or to_regclass('public.game_bundle_operation_leases') is null
     or not exists(select 1 from information_schema.columns where table_schema='public'
       and table_name='games' and column_name='persistent' and udt_name='bool')
     or exists(select 1 from information_schema.columns where table_schema='public'
       and table_name='mcp_submissions' and column_name='persistent') then
    raise exception 'persistent_bundle_admission_schema_drift';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.mcp_submissions'::regclass and conname='mcp_submissions_bytes_check')
      is distinct from 'CHECK (((bytes >= 1) AND (bytes <= 2000000)))' then
    raise exception 'persistent_bundle_admission_bytes_guard_drift';
  end if;
end;
$preflight$;

alter table public.games add column persistent_attestation_digest text
  check(persistent_attestation_digest ~ '^[0-9a-f]{64}$');
alter table public.games add column persistent_attestation_capability boolean;
alter table public.games add constraint game_persistent_attestation_pair check(
  (persistent_attestation_digest is null)=(persistent_attestation_capability is null));
alter table public.mcp_submissions add column persistent boolean not null default false;

-- Decoded bytes are measured independently of the service's supplied receipt.
-- Only the service-only MCP admission can attest executable boot ordering;
-- this private SQL helper additionally binds that flag to the actual spec.
create function public._mcp_persistent_bundle_bytes(p_files jsonb,p_persistent boolean)
returns integer language plpgsql immutable security definer set search_path='' as $$
declare v_spec jsonb; v_path text; v_item jsonb; v_bytes integer; v_raw bytea;
  v_total integer:=0; v_count integer:=0;
begin
  if jsonb_typeof(p_files) is distinct from 'object' or p_persistent is null then
    raise exception 'invalid_bundle' using errcode='22023';
  end if;
  if p_persistent then
    if jsonb_typeof(p_files->'slop.spec.json') is distinct from 'string' then
      raise exception 'invalid_bundle' using errcode='22023';
    end if;
    begin v_spec:=(p_files->>'slop.spec.json')::jsonb;
    exception when others then raise exception 'invalid_bundle' using errcode='22023'; end;
    if v_spec->'persistent' is distinct from 'true'::jsonb
       or jsonb_typeof(v_spec->'first_load') is distinct from 'array'
       or jsonb_array_length(v_spec->'first_load') not between 1 and 400 then
      raise exception 'invalid_bundle' using errcode='22023';
    end if;
  end if;
  if jsonb_typeof(p_files->'index.html') is distinct from 'string'
     or length(btrim(p_files->>'index.html'))=0 then
    raise exception 'invalid_bundle' using errcode='22023';
  end if;
  for v_path,v_item in select key,value from jsonb_each(p_files) loop
    v_count:=v_count+1;
    if length(v_path)>160 or v_path~*'slop.*(asset|entitlement)|(asset|entitlement).*manifest'
       or (p_persistent and v_path~*'^(covers|previews)/')
       or (v_path<>'slop.spec.json' and (case when p_persistent then
         v_path !~ '^(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(html|js|css|json|svg|txt|glb|bin|jpg|webp|ktx2|ogg)$'
       else v_path !~ '^(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.(html|js|css|json|svg|txt)$' end)) then
      raise exception 'invalid_bundle' using errcode='22023';
    end if;
    if v_path~'\.(html|js|css|json|svg|txt)$' then
      if jsonb_typeof(v_item) is distinct from 'string' then raise exception 'invalid_bundle' using errcode='22023'; end if;
      v_bytes:=octet_length(v_item#>>'{}');
    else
      if not p_persistent or jsonb_typeof(v_item) is distinct from 'object'
         or (select count(*) from jsonb_object_keys(v_item))<>2
         or v_item->>'encoding' is distinct from 'base64'
         or jsonb_typeof(v_item->'data') is distinct from 'string'
         or length(v_item->>'data')>10666668
         or (v_item->>'data') !~ '^[A-Za-z0-9+/]*={0,2}$' then
        raise exception 'invalid_bundle' using errcode='22023';
      end if;
      begin v_raw:=decode(v_item->>'data','base64');
      exception when others then raise exception 'invalid_bundle' using errcode='22023'; end;
      if replace(encode(v_raw,'base64'),chr(10),'') is distinct from v_item->>'data' then
        raise exception 'invalid_bundle' using errcode='22023';
      end if;
      v_bytes:=octet_length(v_raw);
    end if;
    v_total:=v_total+v_bytes;
    if v_bytes<1 or v_bytes>(case when p_persistent then 8000000 else 512000 end)
       or v_total>(case when p_persistent then 50000000 else 2000000 end)
       or v_count>(case when p_persistent then 400 else 64 end) then
      raise exception 'invalid_bundle' using errcode='22023';
    end if;
  end loop;
  return v_total;
end;
$$;
revoke all on function public._mcp_persistent_bundle_bytes(jsonb,boolean)
  from public,anon,authenticated,service_role;

alter table public.mcp_submissions drop constraint mcp_submissions_bytes_check;
alter table public.mcp_submissions add constraint mcp_submissions_bytes_check check(
  bytes between 1 and (case when persistent then 50000000 else 2000000 end));

-- Exact anchored replacement preserves pairing, identity, idempotency, leases,
-- account deletion fences, staff limits and publication queue behavior.
do $mcp_budget$
declare v_sql text:=pg_get_functiondef('public.mcp_service(text,jsonb)'::regprocedure);
  v_old text; v_new text;
begin
  v_old:=$old$if jsonb_typeof(p->'files') is distinct from 'object' or octet_length((p->'files')::text)>2300000$old$;
  v_new:=$new$if (p ? 'persistent' and jsonb_typeof(p->'persistent') is distinct from 'boolean')
    or jsonb_typeof(p->'bytes') is distinct from 'number'
    or (p->>'bytes') !~ '^[0-9]{1,8}$'
    or public._mcp_persistent_bundle_bytes(p->'files',coalesce(p->'persistent'='true'::jsonb,false))<>(p->>'bytes')::integer$new$;
  if strpos(v_sql,v_old)=0 then raise exception 'persistent_mcp_source_guard_drift'; end if;
  v_sql:=replace(v_sql,v_old,v_new);
  v_old:=$old$(select coalesce(sum(bytes),0) from public.mcp_submissions where owner_id=v_owner)+(p->>'bytes')::integer>$old$;
  v_new:=$new$(select coalesce(sum(bytes),0) from public.mcp_submissions where owner_id=v_owner
      and (coalesce(p->'persistent'='true'::jsonb,false) or not persistent))+(p->>'bytes')::integer>$new$;
  if strpos(v_sql,v_old)=0 then raise exception 'persistent_mcp_owner_quota_drift'; end if;
  v_sql:=replace(v_sql,v_old,v_new);
  v_old:='then 1000000000 else 20000000 end)';
  v_new:=$new$then 1000000000 else
        (case when coalesce(p->'persistent'='true'::jsonb,false) then 70000000 else 20000000 end) end)$new$;
  if strpos(v_sql,v_old)=0 then raise exception 'persistent_mcp_staff_quota_drift'; end if;
  v_sql:=replace(v_sql,v_old,v_new);
  v_old:='request_digest,bytes,slug)'; v_new:='request_digest,bytes,persistent,slug)';
  if strpos(v_sql,v_old)=0 then raise exception 'persistent_mcp_insert_shape_drift'; end if;
  v_sql:=replace(v_sql,v_old,v_new);
  v_old:=$old$(p->>'bytes')::integer,'mcp-'$old$;
  v_new:=$new$(p->>'bytes')::integer,coalesce(p->'persistent'='true'::jsonb,false),'mcp-'$new$;
  if strpos(v_sql,v_old)=0 then raise exception 'persistent_mcp_insert_values_drift'; end if;
  execute replace(v_sql,v_old,v_new);
end;
$mcp_budget$;

create function public.protect_game_persistent_attestation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_release_change boolean;
begin
  if (tg_op='INSERT' and (new.persistent or new.persistent_attestation_digest is not null
       or new.persistent_attestation_capability is not null))
     or (tg_op='UPDATE' and (new.persistent is distinct from old.persistent
       or new.persistent_attestation_digest is distinct from old.persistent_attestation_digest
       or new.persistent_attestation_capability is distinct from old.persistent_attestation_capability)) then
    if current_setting('slop.persistent_attest_slug',true) is distinct from new.slug then
      raise exception 'persistent_capability_is_server_owned' using errcode='42501';
    end if;
  end if;
  v_release_change:=tg_op='UPDATE' and (
      (new.published_bundle_path is not null and new.published_bundle_path is distinct from old.published_bundle_path)
      or (new.private_bundle_path is not null and new.private_bundle_path is distinct from old.private_bundle_path)
      or (new.bundle_digest is not null and new.bundle_digest is distinct from old.bundle_digest));
  if v_release_change then
    if new.bundle_digest is not null and
       new.bundle_digest=new.persistent_attestation_digest then
      -- Capability changes become visible in the SAME row transition as the
      -- existing digest-bound immutable release finalizer, never when staged.
      new.persistent:=new.persistent_attestation_capability;
    elsif new.persistent or new.persistent_attestation_capability is true then
      raise exception 'persistent_release_attestation_digest_mismatch' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_game_persistent_attestation() from public,anon,authenticated,service_role;
create trigger protect_game_persistent_attestation before insert or update on public.games
  for each row execute function public.protect_game_persistent_attestation();

-- Edge has just re-attested exact decoded source, required static first-load
-- closure and real persist boot/commit calls. Only stage the leased intent: an
-- old private/public release MUST keep its old capability if finalization fails.
-- The protected trigger activates/clears it with the exact finalizer transition.
create function public.attest_game_persistent_release(p_slug text,p_actor uuid,p_operation_id uuid,
  p_manifest jsonb,p_digest text,p_persistent boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_game public.games%rowtype; v_owner uuid; v_account uuid;
begin
  if p_actor is null or p_operation_id is null or p_persistent is null
     or p_slug !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'
     or p_digest !~ '^[0-9a-f]{64}$'
     or p_digest is distinct from public._game_bundle_manifest_digest(p_manifest)
     or not public.is_nonanonymous_user(p_actor) or public.has_account_delete_intent(p_actor) then
    raise exception 'invalid_persistent_attestation' using errcode='42501';
  end if;
  select owner_id into v_owner from public.games where slug=p_slug;
  for v_account in select distinct account_id from (values(p_actor),(v_owner)) ids(account_id)
    where account_id is not null order by account_id loop
    perform pg_advisory_xact_lock_shared(hashtextextended('slop-account:'||v_account::text,0));
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('slop-game:'||p_slug,0));
  select * into v_game from public.games where slug=p_slug for update;
  if not found or v_game.owner_id is distinct from v_owner
     or v_game.status not in ('draft','private','pending_review','published')
     or coalesce(v_game.media_delete_authorized,false)
     or public.has_account_delete_intent(v_game.owner_id)
     or not (v_game.owner_id=p_actor or exists(select 1 from public.admin_users where user_id=p_actor)
       or exists(select 1 from public.moderator_users where user_id=p_actor))
     or not exists(select 1 from public.game_bundle_operation_leases where resource='game:'||p_slug
       and operation_id=p_operation_id and issued_to=p_actor and expires_at>clock_timestamp()) then
    raise exception 'persistent_attestation_owner_or_lease_unavailable' using errcode='42501';
  end if;
  perform set_config('slop.persistent_attest_slug',p_slug,true);
  update public.games set persistent_attestation_digest=p_digest,
    persistent_attestation_capability=p_persistent where slug=p_slug;
  return true;
end;
$$;
revoke all on function public.attest_game_persistent_release(text,uuid,uuid,jsonb,text,boolean)
  from public,anon,authenticated;
grant execute on function public.attest_game_persistent_release(text,uuid,uuid,jsonb,text,boolean) to service_role;
commit;
