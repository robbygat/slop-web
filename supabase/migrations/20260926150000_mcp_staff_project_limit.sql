-- Staff accounts publish official MCP games in batches: raise their MCP
-- project cap from 20 to 500. Everyone else keeps 20. Existing projects and
-- submissions are untouched. (The CASE is parenthesized: PL/pgSQL IF takes the
-- first unparenthesized THEN as its own.) This edits the live mcp_service body in place
-- and fails closed if that body drifted from the reviewed bridge text.
begin;
do $migration$
declare
  v_sql text := pg_get_functiondef('public.mcp_service(text,jsonb)'::regprocedure);
  v_old text := $old$if v_latest is null and (select count(*) from public.mcp_projects where owner_id=v_owner)>=20 then raise exception 'project_limit'; end if;$old$;
  v_new text := $new$if v_latest is null and (select count(*) from public.mcp_projects where owner_id=v_owner)>=
    (case when exists(select 1 from public.admin_users staff where staff.user_id=v_owner) then 500 else 20 end) then raise exception 'project_limit'; end if;$new$;
begin
  if strpos(v_sql, 'staff.user_id=v_owner) then 500 else 20') > 0 then return; end if;
  if strpos(v_sql, v_old) = 0
     or length(v_sql) - length(replace(v_sql, v_old, '')) <> length(v_old) then
    raise exception 'mcp_service project limit drift';
  end if;
  execute replace(v_sql, v_old, v_new);
end
$migration$;
revoke all on function public.mcp_service(text,jsonb) from public, anon, authenticated;
grant execute on function public.mcp_service(text,jsonb) to service_role;
commit;
