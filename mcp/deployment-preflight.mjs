// Emit a reviewable, rollback-only SQL preflight. This script never connects.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function deploymentPreflight(migration) {
  if (!/^--[\s\S]*\nbegin;\s/i.test(migration) ||
      !/\ncommit;\s*$/i.test(migration) ||
      (migration.match(/^commit;\s*$/gim) ?? []).length !== 1) {
    throw new Error("Expected the reviewed migration with one final COMMIT");
  }
  // Retain its BEGIN and replace its only COMMIT. A surrounding transaction
  // would not be sufficient: the embedded COMMIT would persist the migration.
  return migration.replace(/\ncommit;\s*$/i, String.raw`

-- All fixtures below are unapproved pairing challenges, never real accounts.
do $check$
declare r text; t text; f text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    foreach t in array array['mcp_connections','mcp_projects','mcp_submissions'] loop
      if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Unexpected direct table grant: % %',r,t;
      end if;
      if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then
        raise exception 'Missing RLS: %',t;
      end if;
    end loop;
    foreach f in array array['_mcp_connection_json(public.mcp_connections)', '_mcp_submission_json(public.mcp_submissions)'] loop
      if has_function_privilege(r,'public.'||f,'EXECUTE') then
        raise exception 'Unexpected private projector grant: % %',r,f;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('service_role','public.mcp_service(text,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.mcp_service(text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.mcp_service(text,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.mcp_phone(text,jsonb)','EXECUTE')
     or has_function_privilege('service_role','public.mcp_phone(text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.mcp_phone(text,jsonb)','EXECUTE') then
    raise exception 'Incorrect bridge entry-point grants';
  end if;
end $check$;

set local role authenticated;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{}';
do $check$ begin
  begin
    perform public.mcp_phone('connections','{}');
    raise exception 'Missing identity was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'authentication_required' then raise; end if;
  end;
  begin
    perform public.mcp_service('agent_status','{}');
    raise exception 'Phone could invoke service entry point';
  exception when insufficient_privilege then null;
  end;
end $check$;
reset role;

-- Choose a UUID known not to be an Auth account. Do not insert an Auth fixture.
do $check$ declare u uuid := gen_random_uuid(); begin
  while exists(select 1 from auth.users where id=u) loop u := gen_random_uuid(); end loop;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $check$;
set local role authenticated;
do $check$ begin
  begin
    perform public.mcp_phone('connections','{}');
    raise exception 'Nonexistent account was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'account_unavailable' then raise; end if;
  end;
end $check$;
reset role;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{}';

set local role service_role;
do $check$
declare pair jsonb; receipt jsonb;
  token_hash text := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  code_hash text := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  poll_hash text := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
  pair := public.mcp_service('pair_start',jsonb_build_object('client_name','Rollback-only preflight',
    'token_hash',token_hash,'code_hash',code_hash,'poll_hash',poll_hash));
  if pair->>'status' is distinct from 'pending' or pair->>'pairing_id' is null then
    raise exception 'Pairing was not pending';
  end if;
  receipt := public.mcp_service('pair_status',jsonb_build_object('pairing_id',pair->>'pairing_id','poll_hash',poll_hash));
  if receipt->>'status' is distinct from 'pending' then raise exception 'Pending status mismatch'; end if;
  begin
    perform public.mcp_service('pair_status',jsonb_build_object('pairing_id',pair->>'pairing_id','poll_hash',repeat('0',64)));
    raise exception 'Wrong pairing secret was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'invalid_pairing' then raise; end if;
  end;
  begin
    perform public.mcp_service('agent_status',jsonb_build_object('token_hash',token_hash));
    raise exception 'Unapproved connection was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'invalid_connection' then raise; end if;
  end;
end $check$;
reset role;
do $check$ begin
  if (select count(*) from public.mcp_connections) <> 1
     or exists(select 1 from public.mcp_connections where owner_id is not null or approved_at is not null)
     or exists(select 1 from public.mcp_projects)
     or exists(select 1 from public.mcp_submissions) then
    raise exception 'Unexpected account-bound state created';
  end if;
end $check$;
rollback;

-- Expected: all three values null. No migration-history receipt is written.
select to_regclass('public.mcp_connections') as rolled_back_table,
       to_regprocedure('public.mcp_service(text,jsonb)') as rolled_back_service,
       to_regprocedure('public.mcp_phone(text,jsonb)') as rolled_back_phone;
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(deploymentPreflight(await readFile(new URL(
    "../supabase/migrations/20260914170000_slop_mcp_bridge.sql", import.meta.url,
  ), "utf8")));
}
