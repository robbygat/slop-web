-- MCP game type is an explicit creation choice, bound to the project and its
-- immutable source. Existing untyped projects/retries keep their prior path.
begin;

do $mcp_type_preflight$
declare item record;
begin
  for item in select * from (values
    ('public.mcp_service(text,jsonb)','a10e62a197238c61e2e72a9e3a9a16a9'),
    ('public._mcp_agent_publish(text,jsonb,public.mcp_connections)','4fc65e4d4be79b374644618d7936c49c'),
    ('public._mcp_submission_json(public.mcp_submissions)','c2d04f4a1d5d705ededab0ad02f8a636')
  ) expected(signature,source_md5) loop
    if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid=to_regprocedure(item.signature))
       is distinct from item.source_md5 then raise exception 'mcp_game_type_source_drift: %',item.signature;end if;
  end loop;
  if to_regprocedure('public._mp_turn_contract_valid(jsonb)') is null
     or exists(select 1 from information_schema.columns where table_schema='public'
       and table_name in('mcp_projects','mcp_submissions') and column_name='game_type') then
    raise exception 'mcp_game_type_schema_drift';
  end if;
end;
$mcp_type_preflight$;

alter table public.mcp_projects add column game_type text check(game_type in('single-player','multiplayer'));
alter table public.mcp_submissions add column game_type text check(game_type in('single-player','multiplayer'));

create function public._mcp_source_game_type(p_files jsonb,p_expected text,p_require_declaration boolean)
returns text language plpgsql immutable security definer set search_path='' as $$
declare spec jsonb:='{}'::jsonb; declared text; actual text;
begin
  if p_expected is not null and p_expected not in('single-player','multiplayer') then raise exception 'invalid_game_type';end if;
  if jsonb_typeof(p_files) is distinct from 'object' then raise exception 'invalid_bundle';end if;
  if p_files ? 'slop.spec.json' then
    if jsonb_typeof(p_files->'slop.spec.json') is distinct from 'string'
       or octet_length(p_files->>'slop.spec.json')>8000000 then raise exception 'invalid_bundle';end if;
    begin spec:=(p_files->>'slop.spec.json')::jsonb;
    exception when invalid_text_representation then raise exception 'invalid_bundle';end;
    if jsonb_typeof(spec) is distinct from 'object' then raise exception 'invalid_bundle';end if;
  end if;
  if spec ? 'game_type' then
    if jsonb_typeof(spec->'game_type') is distinct from 'string'
       or spec->>'game_type' not in('single-player','multiplayer') then raise exception 'invalid_game_type';end if;
    declared:=spec->>'game_type';
  end if;
  if spec->'multiplayer' is null or spec->'multiplayer' in('null'::jsonb,'false'::jsonb) then
    actual:='single-player';
  else
    if not public._mp_turn_contract_valid(spec->'multiplayer') then raise exception 'invalid_multiplayer_contract';end if;
    if spec->'persistent'='true'::jsonb then raise exception 'persistent_multiplayer_conflict';end if;
    actual:='multiplayer';
  end if;
  if declared is not null and declared<>actual then raise exception 'game_type_mismatch';end if;
  if p_expected is not null and p_expected<>actual then raise exception 'game_type_mismatch';end if;
  if p_require_declaration and declared is distinct from p_expected then raise exception 'game_type_declaration_required';end if;
  return actual;
end;
$$;

create function public._mcp_send_game_type(c public.mcp_connections,p jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare expected text; actual text; bound text; prior text; project_exists boolean;
  retry public.mcp_submissions%rowtype;
begin
  if p ? 'game_type' then
    if jsonb_typeof(p->'game_type') is distinct from 'string'
       or p->>'game_type' not in('single-player','multiplayer') then raise exception 'invalid_game_type';end if;
    expected:=p->>'game_type';
  end if;
  -- A byte-identical request is a read of its original receipt. Binding a
  -- later revision must not strand earlier clients or alter their digest.
  select * into retry from public.mcp_submissions
    where connection_id=c.id and request_id=(p->>'request_id')::uuid;
  if found then
    if retry.request_digest is distinct from p->>'request_digest'
       or retry.project_id is distinct from (p->>'project_id')::uuid then
      raise exception 'request_conflict';
    end if;
    actual:=public._mcp_source_game_type(retry.files,expected,false);
    if public._mcp_source_game_type(p->'files',expected,false)<>actual then
      raise exception 'game_type_mismatch';
    end if;
    return actual;
  end if;
  select game_type into bound from public.mcp_projects
    where connection_id=c.id and id=(p->>'project_id')::uuid;
  project_exists:=found;
  if (not project_exists or bound is not null) and expected is null then raise exception 'game_type_required';end if;
  actual:=public._mcp_source_game_type(p->'files',expected,not project_exists);
  if bound is null and project_exists then
    select coalesce(s.game_type,public._mcp_source_game_type(s.files,null,false)) into prior
      from public.mcp_submissions s where s.connection_id=c.id and s.project_id=(p->>'project_id')::uuid
      order by s.revision desc limit 1;
    bound:=prior;
  end if;
  if bound is not null and bound<>actual then raise exception 'project_game_type_mismatch';end if;
  -- Existing publication target lookup spans an owner's connections. Match
  -- that project identity here; the enclosing account lock serializes sends.
  if exists(select 1 from public.mcp_projects project
    left join lateral(select coalesce(s.game_type,public._mcp_source_game_type(s.files,null,false)) game_type
      from public.mcp_submissions s where s.connection_id=project.connection_id and s.project_id=project.id
      order by s.revision desc limit 1) latest on true
    where project.owner_id=c.owner_id and project.id=(p->>'project_id')::uuid
      and coalesce(project.game_type,latest.game_type)<>actual) then
    raise exception 'project_game_type_mismatch';
  end if;
  return actual;
end;
$$;

create function public._mcp_publish_game_type(s public.mcp_submissions,p jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare expected text; actual text; bound text;
begin
  if p ? 'game_type' then
    if jsonb_typeof(p->'game_type') is distinct from 'string'
       or p->>'game_type' not in('single-player','multiplayer') then raise exception 'invalid_game_type';end if;
    expected:=p->>'game_type';
  end if;
  select game_type into bound from public.mcp_projects where connection_id=s.connection_id and id=s.project_id;
  if bound is not null and expected is null then raise exception 'game_type_required';end if;
  -- Existing immutable submissions may predate the declaration field.
  actual:=public._mcp_source_game_type(s.files,expected,false);
  if (bound is not null and bound<>actual) or (s.game_type is not null and s.game_type<>actual) then
    raise exception 'project_game_type_mismatch';
  end if;
  if exists(select 1 from public.mcp_projects project
    left join lateral(select coalesce(other.game_type,public._mcp_source_game_type(other.files,null,false)) game_type
      from public.mcp_submissions other where other.connection_id=project.connection_id and other.project_id=project.id
      order by other.revision desc limit 1) latest on true
    where project.owner_id=s.owner_id and project.id=s.project_id
      and coalesce(project.game_type,latest.game_type)<>actual) then
    raise exception 'project_game_type_mismatch';
  end if;
  return actual;
end;
$$;

revoke all on function public._mcp_source_game_type(jsonb,text,boolean),
  public._mcp_send_game_type(public.mcp_connections,jsonb),
  public._mcp_publish_game_type(public.mcp_submissions,jsonb) from public,anon,authenticated,service_role;

do $mcp_type_binding$
declare code text; old text; replacement text; metadata jsonb;
begin
  select replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'),to_jsonb(p)-'prosrc' into code,metadata
    from pg_proc p where p.oid='public.mcp_service(text,jsonb)'::regprocedure;
  old:='v_owner uuid; v_id uuid; v_latest integer; v_revision integer;';
  if strpos(code,old)=0 then raise exception 'mcp_type_declaration_anchor_drift';end if;
  code:=replace(code,old,old||' v_game_type text;');
  old:=$anchor$  if p_action <> 'send_draft' then raise exception 'invalid_action'; end if;$anchor$;
  if strpos(code,old)=0 then raise exception 'mcp_type_send_anchor_drift';end if;
  code:=replace(code,old,old||E'\n  v_game_type:=public._mcp_send_game_type(c,p);');
  old:=$anchor$insert into public.mcp_projects(id,connection_id,owner_id,latest_revision)
    values((p->>'project_id')::uuid,c.id,v_owner,v_revision)
    on conflict(connection_id,id) do update set latest_revision=excluded.latest_revision;$anchor$;
  replacement:=$replacement$insert into public.mcp_projects(id,connection_id,owner_id,latest_revision,game_type)
    values((p->>'project_id')::uuid,c.id,v_owner,v_revision,case when p ? 'game_type' then v_game_type else null end)
    on conflict(connection_id,id) do update set latest_revision=excluded.latest_revision,
      game_type=coalesce(mcp_projects.game_type,excluded.game_type);$replacement$;
  if strpos(code,old)=0 then raise exception 'mcp_type_project_anchor_drift';end if;
  code:=replace(code,old,replacement);
  old:='request_digest,bytes,persistent,slug)';
  if strpos(code,old)=0 then raise exception 'mcp_type_submission_column_drift';end if;
  code:=replace(code,old,'request_digest,bytes,persistent,slug,game_type)');
  old:=$anchor$coalesce(p->'persistent'='true'::jsonb,false),'mcp-'||replace(v_id::text,'-','')) returning * into s;$anchor$;
  if strpos(code,old)=0 then raise exception 'mcp_type_submission_value_drift';end if;
  code:=replace(code,old,$replacement$coalesce(p->'persistent'='true'::jsonb,false),'mcp-'||replace(v_id::text,'-',''),v_game_type) returning * into s;$replacement$);
  execute code;
  if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.mcp_service(text,jsonb)'::regprocedure) is distinct from metadata then
    raise exception 'mcp_type_service_metadata_changed';end if;

  select replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'),to_jsonb(p)-'prosrc' into code,metadata
    from pg_proc p where p.oid='public._mcp_agent_publish(text,jsonb,public.mcp_connections)'::regprocedure;
  old:=$anchor$  if p_action<>'request_publish' then raise exception 'invalid_action'; end if;$anchor$;
  if strpos(code,old)=0 then raise exception 'mcp_type_publish_anchor_drift';end if;
  code:=replace(code,old,old||E'\n  perform public._mcp_publish_game_type(s,p);');
  execute code;
  if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public._mcp_agent_publish(text,jsonb,public.mcp_connections)'::regprocedure) is distinct from metadata then
    raise exception 'mcp_type_publish_metadata_changed';end if;

  select replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'),to_jsonb(p)-'prosrc' into code,metadata
    from pg_proc p where p.oid='public._mcp_submission_json(public.mcp_submissions)'::regprocedure;
  old:=$anchor$'description',s.description,'digest',s.digest,'bytes',s.bytes,$anchor$;
  if strpos(code,old)=0 then raise exception 'mcp_type_receipt_anchor_drift';end if;
  code:=replace(code,old,old||E'\n    ''game_type'',coalesce(s.game_type,public._mcp_source_game_type(s.files,null,false)),');
  execute code;
  if (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public._mcp_submission_json(public.mcp_submissions)'::regprocedure) is distinct from metadata then
    raise exception 'mcp_type_receipt_metadata_changed';end if;
end;
$mcp_type_binding$;

commit;
