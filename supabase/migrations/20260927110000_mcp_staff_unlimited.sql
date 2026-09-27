-- Staff (admins and moderators) post official MCP games in bulk: lift their MCP
-- project cap to 10000 and apply every staff MCP limit to moderators too.
-- Everyone else is unchanged. Fails closed on drift; idempotent.
begin;
do $migration$
declare
  v_sql text := pg_get_functiondef('public.mcp_service(text,jsonb)'::regprocedure);
  v_new text;
begin
  if strpos(v_sql, 'then 10000 else 20 end') > 0 then return; end if;
  if strpos(v_sql, 'then 500 else 20 end') = 0 then raise exception 'mcp_service staff limit drift'; end if;
  v_new := replace(v_sql, 'then 500 else 20 end', 'then 10000 else 20 end');
  v_new := replace(v_new, 'exists(select 1 from public.admin_users staff where staff.user_id=v_owner)',
    '(exists(select 1 from public.admin_users staff where staff.user_id=v_owner) or exists(select 1 from public.moderator_users mods where mods.user_id=v_owner))');
  execute v_new;
end
$migration$;
revoke all on function public.mcp_service(text,jsonb) from public, anon, authenticated;
grant execute on function public.mcp_service(text,jsonb) to service_role;
commit;
