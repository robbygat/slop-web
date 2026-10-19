-- Slop Worlds: client-authored JSON progress, not score/Crown/reward authority.
-- Apply only this exact migration after a BEGIN/ROLLBACK rehearsal. Never db push.
begin;

do $persist_preflight$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'games'
        and (column_name,udt_name) in (('id','uuid'),('slug','text'),
          ('owner_id','uuid'),('status','text'),('root_game_slug','text'),
          ('draft_of','text'),('media_delete_authorized','bool'),
          ('multiplayer_mode','text'))) <> 8
     or to_regprocedure('public.is_nonanonymous_user(uuid)') is null
     or to_regprocedure('public.has_account_delete_intent(uuid)') is null then
    raise exception 'persistent_games_requires_reviewed_catalog_and_account_authority';
  end if;
  if exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='games' and column_name='persistent')
     or to_regclass('public.game_saves') is not null
     or to_regclass('public.game_save_history') is not null
     or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname in ('save_game_state',
         'load_game_state','end_game_run','claim_device_saves',
         '_persist_account','_persist_lineage','_persist_validate',
         '_persist_row','_persist_archive','_persist_json_size')) then
    raise exception 'persistent_games_already_installed_or_partial';
  end if;
end;
$persist_preflight$;

-- Existing Arcade rows stay false. Only the attested publisher mirrors the
-- surviving slop.spec.json persistent contract; saves never enable this flag.
alter table public.games add column persistent boolean not null default false;
comment on column public.games.persistent is
  'Attested Slop.persist single-player contract. Save data is not score authority.';

-- Count compact JSON UTF-8, not whitespace-inflated jsonb::text. String spaces
-- and escapes are preserved. The result packs bytes*65536 + node_count so child
-- totals carry a bounded node count without session state or unsafe text edits.
-- Limits: depth<=48, <=50,000 values, <=256 KiB; profile's tighter cap is below.
-- JSONB canonical numeric spelling can differ from JavaScript JSON.stringify;
-- games should leave margin when saves contain extreme/exponential numbers.
create function public._persist_json_size(p_data jsonb,p_depth integer default 0)
returns bigint language plpgsql immutable security definer set search_path='' as $$
declare
  v_type text:=jsonb_typeof(p_data); v_bytes bigint:=0; v_nodes bigint:=1;
  v_key text; v_value jsonb; v_measure bigint; v_first boolean:=true;
begin
  if p_data is null or p_depth is null or p_depth<0 or p_depth>48 then
    raise exception 'persistent_save_depth_limit' using errcode='22023';
  end if;
  if v_type in ('object','array') then
    v_bytes:=2;
    if v_type='object' then
      for v_key,v_value in select key,value from jsonb_each(p_data) loop
        v_measure:=public._persist_json_size(v_value,p_depth+1);
        v_bytes:=v_bytes+octet_length(to_jsonb(v_key)::text)+1+v_measure/65536
          +case when v_first then 0 else 1 end;
        v_nodes:=v_nodes+v_measure%65536;
        v_first:=false;
        if v_nodes>50000 or v_bytes>262144 then
          raise exception 'persistent_save_size_or_node_limit' using errcode='22023';
        end if;
      end loop;
    else
      for v_value in select value from jsonb_array_elements(p_data) loop
        v_measure:=public._persist_json_size(v_value,p_depth+1);
        v_bytes:=v_bytes+v_measure/65536+case when v_first then 0 else 1 end;
        v_nodes:=v_nodes+v_measure%65536;
        v_first:=false;
        if v_nodes>50000 or v_bytes>262144 then
          raise exception 'persistent_save_size_or_node_limit' using errcode='22023';
        end if;
      end loop;
    end if;
  else
    v_bytes:=octet_length(p_data::text);
    if v_bytes>262144 then
      raise exception 'persistent_save_too_large' using errcode='22023';
    end if;
  end if;
  return v_bytes*65536+v_nodes;
end;
$$;

create table public.game_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  scope text not null check (scope in ('run','profile')),
  slot smallint not null default 0 check (slot=0),
  schema_version integer not null check (schema_version>0),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  data jsonb not null check (jsonb_typeof(data)='object'),
  data_bytes integer not null,
  run_label text check (run_label is null or
    (char_length(run_label)<=120 and octet_length(run_label)<=512)),
  run_status text check (run_status in ('active','finished','abandoned')),
  device_id text check (device_id is null or octet_length(device_id)<=128),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_write_at timestamptz not null default clock_timestamp(),
  primary key (user_id,game_id,scope,slot),
  check (data_bytes=public._persist_json_size(data,0)/65536 and data_bytes between 2 and
    case when scope='run' then 262144 else 131072 end),
  check ((scope='run' and run_status is not null) or
    (scope='profile' and run_status is null and run_label is null)),
  check (scope<>'run' or run_status='active' or data='{}'::jsonb)
);

-- Previous snapshots plus losing device conflicts. Retained per scope/slot,
-- at most five rows after any mutation. No table permits client DML.
create table public.game_save_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  scope text not null check (scope in ('run','profile')),
  slot smallint not null default 0 check (slot=0),
  schema_version integer not null check (schema_version>0),
  revision bigint not null check (revision between 1 and 9007199254740991),
  data jsonb not null check (jsonb_typeof(data)='object'),
  run_label text,
  run_status text check (run_status in ('active','finished','abandoned')),
  device_id text,
  saved_at timestamptz not null default clock_timestamp(),
  check (public._persist_json_size(data,0)/65536<=case when scope='run' then 262144 else 131072 end),
  check ((scope='run' and run_status is not null) or
    (scope='profile' and run_status is null and run_label is null))
);
create index game_save_history_owner_scope_idx
  on public.game_save_history(user_id,game_id,scope,slot,id desc);
alter table public.game_saves enable row level security;
alter table public.game_save_history enable row level security;
revoke all on public.game_saves,public.game_save_history
  from public,anon,authenticated,service_role;
revoke all on sequence public.game_save_history_id_seq
  from public,anon,authenticated,service_role;
grant select on public.game_saves,public.game_save_history to authenticated;
create policy game_saves_own_select on public.game_saves
  for select to authenticated using (user_id=auth.uid());
create policy game_save_history_own_select on public.game_save_history
  for select to authenticated using (user_id=auth.uid());

create function public._persist_account()
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  -- Same deletion lock as the shipping account/reward boundaries. No reward
  -- predicate is changed; anonymous sessions remain local-only in the host.
  perform pg_advisory_xact_lock(hashtextextended('slop-account:'||v_user::text,0));
  if public.has_account_delete_intent(v_user) or
     not public.is_nonanonymous_user(v_user) then
    raise exception 'eligible_account_required' using errcode='42501';
  end if;
  return v_user;
end;
$$;

-- Neither a release digest nor a caller-supplied arbitrary UUID is a save key.
-- The real catalog root is resolved on the server, with cycle/depth guards.
create function public._persist_lineage(p_game text,p_user uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_game public.games%rowtype;
  v_next public.games%rowtype;
  v_seen uuid[] := '{}';
  v_depth integer := 0;
begin
  if p_game is null or char_length(p_game)>120 or btrim(p_game)='' then
    raise exception 'invalid_persistent_game' using errcode='22023';
  end if;
  select * into v_game from public.games g
    where g.slug=btrim(p_game) or g.id::text=btrim(p_game)
    order by (g.slug=btrim(p_game)) desc limit 1;
  if not found then
    raise exception 'persistent_game_unavailable' using errcode='42501';
  end if;
  loop
    if v_game.id=any(v_seen) or v_depth>=16 then
      raise exception 'invalid_persistent_lineage' using errcode='22023';
    end if;
    if not v_game.persistent or v_game.multiplayer_mode is not null
       or v_game.media_delete_authorized
       or not (v_game.status='published' or
         (v_game.owner_id=p_user and v_game.status in ('draft','private'))) then
      raise exception 'persistent_game_unavailable' using errcode='42501';
    end if;
    v_seen:=array_append(v_seen,v_game.id);
    v_depth:=v_depth+1;
    if v_game.root_game_slug is not null then
      select * into v_next from public.games where slug=v_game.root_game_slug;
      if not found then
        raise exception 'persistent_lineage_missing' using errcode='22023';
      end if;
      v_game:=v_next;
    elsif v_game.draft_of is not null then
      select * into v_next from public.games
        where slug=v_game.draft_of and owner_id=v_game.owner_id;
      if not found then return v_game.id; end if;
      v_game:=v_next;
    else
      return v_game.id;
    end if;
  end loop;
end;
$$;

create function public._persist_validate(
  p_scope text,p_slot integer,p_schema_version integer,p_data jsonb,
  p_label text,p_status text
) returns integer language plpgsql security definer set search_path='' as $$
declare v_bytes integer;
begin
  if p_scope is null or p_scope not in ('run','profile') or p_slot is distinct from 0
     or p_schema_version is null or p_schema_version<=0
     or p_data is null or jsonb_typeof(p_data)<>'object' then
    raise exception 'invalid_persistent_save' using errcode='22023';
  end if;
  if (p_scope='run' and (p_status is null or
        p_status not in ('active','finished','abandoned') or
        (p_status<>'active' and p_data<>'{}'::jsonb)))
     or (p_scope='profile' and (p_status is not null or p_label is not null))
     or (p_label is not null and
       (char_length(p_label)>120 or octet_length(p_label)>512)) then
    raise exception 'invalid_persistent_scope_status' using errcode='22023';
  end if;
  v_bytes:=(public._persist_json_size(p_data,0)/65536)::integer;
  if v_bytes>(case when p_scope='run' then 262144 else 131072 end) then
    raise exception 'persistent_save_too_large' using errcode='22023';
  end if;
  return v_bytes;
end;
$$;

create function public._persist_row(p_row public.game_saves)
returns jsonb language sql stable security definer set search_path='' set timezone='UTC' as $$
  select case when p_row.user_id is null then null else jsonb_build_object(
    'game_id',p_row.game_id,'scope',p_row.scope,'slot',p_row.slot,
    'schema_version',p_row.schema_version,'revision',p_row.revision,
    'data',p_row.data,'data_bytes',p_row.data_bytes,'run_label',p_row.run_label,
    'run_status',p_row.run_status,'device_id',p_row.device_id,
    'created_at',p_row.created_at,'updated_at',p_row.updated_at) end
$$;

create function public._persist_archive(
  p_user uuid,p_game uuid,p_scope text,p_slot smallint,p_version integer,
  p_revision bigint,p_data jsonb,p_label text,p_status text,p_device text
) returns void language plpgsql security definer set search_path='' as $$
begin
  -- Replayed conflicting imports do not evict recovery snapshots with duplicates.
  insert into public.game_save_history(user_id,game_id,scope,slot,
    schema_version,revision,data,run_label,run_status,device_id)
  select p_user,p_game,p_scope,p_slot,p_version,p_revision,p_data,p_label,p_status,p_device
  where not exists(select 1 from public.game_save_history h
    where h.user_id=p_user and h.game_id=p_game and h.scope=p_scope and h.slot=p_slot
      and h.schema_version=p_version and h.revision=p_revision and h.data=p_data
      and h.run_status is not distinct from p_status
      and h.run_label is not distinct from p_label);
  delete from public.game_save_history h
    where h.user_id=p_user and h.game_id=p_game and h.scope=p_scope and h.slot=p_slot
      and h.id not in (select kept.id from public.game_save_history kept
        where kept.user_id=p_user and kept.game_id=p_game and kept.scope=p_scope
          and kept.slot=p_slot order by kept.id desc limit 5);
end;
$$;

create function public.load_game_state(p_game text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public._persist_account(); v_game uuid;
begin
  v_game:=public._persist_lineage(p_game,v_user);
  return jsonb_build_object('game_id',v_game,
    'run',(select public._persist_row(s) from public.game_saves s
      where s.user_id=v_user and s.game_id=v_game and s.scope='run' and s.slot=0),
    'profile',(select public._persist_row(s) from public.game_saves s
      where s.user_id=v_user and s.game_id=v_game and s.scope='profile' and s.slot=0));
end;
$$;

create function public.save_game_state(
  p_game text,p_scope text,p_slot integer,p_expected_revision bigint,
  p_schema_version integer,p_data jsonb,p_label text default null,
  p_status text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=public._persist_account(); v_game uuid;
  v_current public.game_saves%rowtype; v_exists boolean;
  v_now timestamptz; v_bytes integer; v_status text;
begin
  v_game:=public._persist_lineage(p_game,v_user);
  v_status:=case when p_scope='run' then coalesce(p_status,'active') else p_status end;
  v_bytes:=public._persist_validate(p_scope,p_slot,p_schema_version,p_data,p_label,v_status);
  if p_expected_revision is null or p_expected_revision<0
     or p_expected_revision>=9007199254740991 then
    raise exception 'invalid_persistent_revision' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'slop-persist:'||v_user::text||':'||v_game::text||':'||p_scope||':0',0));
  select * into v_current from public.game_saves
    where user_id=v_user and game_id=v_game and scope=p_scope and slot=0 for update;
  v_exists:=found;
  -- A committed save whose acknowledgement was lost must be safe to retry.
  -- Only the immediately preceding CAS and an identical complete payload can
  -- recognize that receipt; divergent/staler requests still conflict below.
  if v_exists and p_expected_revision=v_current.revision-1
     and p_schema_version=v_current.schema_version and p_data=v_current.data
     and p_label is not distinct from v_current.run_label
     and v_status is not distinct from v_current.run_status then
    return jsonb_build_object('game_id',v_game,'scope',p_scope,'conflict',false,
      'unchanged',true,'current',public._persist_row(v_current));
  end if;
  if p_expected_revision<>(case when v_exists then v_current.revision else 0 end) then
    return jsonb_build_object('game_id',v_game,'scope',p_scope,'conflict',true,
      'current',public._persist_row(v_current));
  end if;
  v_now:=clock_timestamp();
  if v_exists and v_now<v_current.last_write_at+interval '2 seconds' then
    return jsonb_build_object('game_id',v_game,'scope',p_scope,'conflict',false,
      'throttled',true,'retry_after_ms',greatest(1,ceil(extract(epoch from
        (v_current.last_write_at+interval '2 seconds'-v_now))*1000)::integer),
      'current',public._persist_row(v_current));
  end if;
  if v_exists then
    perform public._persist_archive(v_user,v_game,p_scope,0::smallint,
      v_current.schema_version,v_current.revision,v_current.data,
      v_current.run_label,v_current.run_status,v_current.device_id);
  end if;
  insert into public.game_saves(user_id,game_id,scope,slot,schema_version,revision,
    data,data_bytes,run_label,run_status,updated_at,last_write_at)
  values(v_user,v_game,p_scope,0,p_schema_version,p_expected_revision+1,
    p_data,v_bytes,p_label,v_status,v_now,v_now)
  on conflict(user_id,game_id,scope,slot) do update set
    schema_version=excluded.schema_version,revision=excluded.revision,
    data=excluded.data,data_bytes=excluded.data_bytes,run_label=excluded.run_label,
    run_status=excluded.run_status,device_id=null,updated_at=excluded.updated_at,
    last_write_at=excluded.last_write_at
  returning * into v_current;
  return jsonb_build_object('game_id',v_game,'scope',p_scope,'conflict',false,
    'current',public._persist_row(v_current));
end;
$$;

-- Clearing leaves a revisioned tombstone. An old queued write cannot create a
-- new run by mistaking DELETE/no-row for expected_revision=0. Profile is untouched.
create function public.end_game_run(
  p_game text,p_expected_revision bigint default null,p_status text default 'finished'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=public._persist_account(); v_game uuid;
  v_current public.game_saves%rowtype; v_version integer:=1; v_revision bigint:=0;
begin
  if p_status is null or p_status not in ('finished','abandoned') then
    raise exception 'invalid_persistent_end_status' using errcode='22023';
  end if;
  v_game:=public._persist_lineage(p_game,v_user);
  perform pg_advisory_xact_lock(hashtextextended(
    'slop-persist:'||v_user::text||':'||v_game::text||':run:0',0));
  select * into v_current from public.game_saves
    where user_id=v_user and game_id=v_game and scope='run' and slot=0 for update;
  if found then v_version:=v_current.schema_version; v_revision:=v_current.revision; end if;
  -- Optional only for the original API; all queued host clears send the CAS.
  return public.save_game_state(p_game,'run',0,
    coalesce(p_expected_revision,v_revision),v_version,'{}'::jsonb,null,p_status);
end;
$$;

create function public.claim_device_saves(p_saves jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=public._persist_account(); v_item jsonb; v_results jsonb:='[]';
  v_game uuid; v_scope text; v_slot integer; v_version integer;
  v_revision bigint; v_base bigint; v_bytes integer; v_status text;
  v_label text; v_device text; v_now timestamptz; v_current public.game_saves%rowtype;
  v_exists boolean; v_same boolean; v_wins boolean;
begin
  if p_saves is null or jsonb_typeof(p_saves)<>'array'
     or jsonb_array_length(p_saves)>32 or octet_length(p_saves::text)>4194304 then
    raise exception 'invalid_persistent_device_batch' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_saves) loop
    if jsonb_typeof(v_item)<>'object' or v_item ? 'user_id'
       or jsonb_typeof(v_item->'game_id') is distinct from 'string'
       or jsonb_typeof(v_item->'revision') is distinct from 'number'
       or jsonb_typeof(v_item->'schema_version') is distinct from 'number'
       or (v_item->>'revision') !~ '^[0-9]{1,16}$'
       or (v_item->>'schema_version') !~ '^[0-9]{1,10}$'
       or coalesce(v_item->>'slot','0')<>'0'
       or coalesce(v_item->>'base_revision','0') !~ '^[0-9]{1,16}$' then
      raise exception 'invalid_persistent_device_save' using errcode='22023';
    end if;
    v_game:=public._persist_lineage(v_item->>'game_id',v_user);
    v_scope:=v_item->>'scope'; v_slot:=0;
    v_revision:=(v_item->>'revision')::bigint;
    v_base:=coalesce(v_item->>'base_revision','0')::bigint;
    if v_revision<1 or v_revision>9007199254740991 or v_base<0
       or v_base>9007199254740991
       or (v_item->>'schema_version')::bigint>2147483647 then
      raise exception 'invalid_persistent_revision' using errcode='22023';
    end if;
    v_version:=(v_item->>'schema_version')::integer;
    v_status:=case when v_scope='run' then coalesce(v_item->>'run_status','active')
      else v_item->>'run_status' end;
    v_label:=v_item->>'run_label'; v_device:=v_item->>'device_id';
    if v_device is not null and octet_length(v_device)>128 then
      raise exception 'invalid_persistent_device' using errcode='22023';
    end if;
    v_bytes:=public._persist_validate(v_scope,v_slot,v_version,v_item->'data',v_label,v_status);
    perform pg_advisory_xact_lock(hashtextextended(
      'slop-persist:'||v_user::text||':'||v_game::text||':'||v_scope||':0',0));
    select * into v_current from public.game_saves
      where user_id=v_user and game_id=v_game and scope=v_scope and slot=0 for update;
    v_exists:=found;
    v_same:=v_exists and v_revision=v_current.revision
      and v_version=v_current.schema_version and v_item->'data'=v_current.data
      and v_status is not distinct from v_current.run_status
      and v_label is not distinct from v_current.run_label;
    if v_same then
      v_results:=v_results||jsonb_build_array(jsonb_build_object('game_id',v_game,
        'scope',v_scope,'conflict',false,'unchanged',true,'current',public._persist_row(v_current)));
      continue;
    end if;
    v_wins:=not v_exists or v_revision>v_current.revision;
    if v_exists and v_scope='run' and v_current.run_status<>'active'
       and v_status='active' and v_base<v_current.revision then v_wins:=false; end if;
    v_now:=clock_timestamp();
    if v_exists and v_now<v_current.last_write_at+interval '2 seconds' then
      v_results:=v_results||jsonb_build_array(jsonb_build_object('game_id',v_game,
        'scope',v_scope,'conflict',not v_wins,'throttled',true,
        'retry_after_ms',greatest(1,ceil(extract(epoch from
          (v_current.last_write_at+interval '2 seconds'-v_now))*1000)::integer),
        'current',public._persist_row(v_current)));
      continue;
    end if;
    if not v_wins then
      perform public._persist_archive(v_user,v_game,v_scope,0::smallint,v_version,
        v_revision,v_item->'data',v_label,v_status,v_device);
      update public.game_saves set last_write_at=v_now
        where user_id=v_user and game_id=v_game and scope=v_scope and slot=0;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('game_id',v_game,
        'scope',v_scope,'conflict',true,'current',public._persist_row(v_current)));
      continue;
    end if;
    if v_exists then
      perform public._persist_archive(v_user,v_game,v_scope,0::smallint,
        v_current.schema_version,v_current.revision,v_current.data,
        v_current.run_label,v_current.run_status,v_current.device_id);
    end if;
    insert into public.game_saves(user_id,game_id,scope,slot,schema_version,revision,
      data,data_bytes,run_label,run_status,device_id,updated_at,last_write_at)
    values(v_user,v_game,v_scope,0,v_version,v_revision,v_item->'data',v_bytes,
      v_label,v_status,v_device,v_now,v_now)
    on conflict(user_id,game_id,scope,slot) do update set
      schema_version=excluded.schema_version,revision=excluded.revision,
      data=excluded.data,data_bytes=excluded.data_bytes,run_label=excluded.run_label,
      run_status=excluded.run_status,device_id=excluded.device_id,updated_at=excluded.updated_at,
      last_write_at=excluded.last_write_at
    returning * into v_current;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('game_id',v_game,
      'scope',v_scope,'conflict',false,'current',public._persist_row(v_current)));
  end loop;
  return jsonb_build_object('saves',v_results);
end;
$$;

revoke all on function public._persist_account(),public._persist_lineage(text,uuid),
  public._persist_json_size(jsonb,integer),
  public._persist_validate(text,integer,integer,jsonb,text,text),
  public._persist_row(public.game_saves),
  public._persist_archive(uuid,uuid,text,smallint,integer,bigint,jsonb,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.load_game_state(text),
  public.save_game_state(text,text,integer,bigint,integer,jsonb,text,text),
  public.end_game_run(text,bigint,text),public.claim_device_saves(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.load_game_state(text),
  public.save_game_state(text,text,integer,bigint,integer,jsonb,text,text),
  public.end_game_run(text,bigint,text),public.claim_device_saves(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
