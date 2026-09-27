-- Staff accounts publish official MCP games in large batches: raise their
-- daily submission cap (60 -> 1000) and lifetime stored bytes (20 MB -> 1 GB).
-- Everyone else keeps 60/day and 20 MB. Edits the live mcp_service body in
-- place and fails closed if that text drifted. Idempotent.
begin;
do $migration$
declare
  v_sql text := pg_get_functiondef('public.mcp_service(text,jsonb)'::regprocedure);
  v_old text := $old$if (select count(*) from public.mcp_submissions where owner_id=v_owner and created_at>now()-interval '1 day')>=60
    or (select coalesce(sum(bytes),0) from public.mcp_submissions where owner_id=v_owner)+(p->>'bytes')::integer>20000000 then$old$;
  v_new text := $new$if (select count(*) from public.mcp_submissions where owner_id=v_owner and created_at>now()-interval '1 day')>=
      (case when exists(select 1 from public.admin_users staff where staff.user_id=v_owner) then 1000 else 60 end)
    or (select coalesce(sum(bytes),0) from public.mcp_submissions where owner_id=v_owner)+(p->>'bytes')::integer>
      (case when exists(select 1 from public.admin_users staff where staff.user_id=v_owner) then 1000000000 else 20000000 end) then$new$;
begin
  if strpos(v_sql, 'then 1000000000 else 20000000 end') > 0 then return; end if;
  if strpos(v_sql, v_old) = 0
     or length(v_sql) - length(replace(v_sql, v_old, '')) <> length(v_old) then
    raise exception 'mcp_service send limit drift';
  end if;
  execute replace(v_sql, v_old, v_new);
end
$migration$;
revoke all on function public.mcp_service(text,jsonb) from public, anon, authenticated;
grant execute on function public.mcp_service(text,jsonb) to service_role;
commit;
