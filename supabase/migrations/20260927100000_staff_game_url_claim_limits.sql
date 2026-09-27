-- Staff accounts publish official games in batches: raise their game-link
-- claim quota from 3/min, 15/hour, 30/day to 30/min, 300/hour, 2000/day.
-- Everyone else is unchanged. Edits the live claim_game_url body in place and
-- fails closed if the reservation text drifted. Idempotent.
begin;
do $migration$
declare
  v_sig regprocedure := 'public.claim_game_url(uuid,text,text)'::regprocedure;
  v_sql text := pg_get_functiondef(v_sig);
  v_old text := $old$public._reserve_client_mutation(p_owner,'game_url_claim',3,15,30,1000)$old$;
  v_new text := $new$public._reserve_client_mutation(p_owner,'game_url_claim',
    case when exists(select 1 from public.admin_users staff where staff.user_id=p_owner) then 30 else 3 end,
    case when exists(select 1 from public.admin_users staff where staff.user_id=p_owner) then 300 else 15 end,
    case when exists(select 1 from public.admin_users staff where staff.user_id=p_owner) then 2000 else 30 end,
    1000)$new$;
begin
  if strpos(v_sql, 'then 2000 else 30 end') > 0 then return; end if;
  if strpos(v_sql, v_old) = 0
     or length(v_sql) - length(replace(v_sql, v_old, '')) <> length(v_old) then
    raise exception 'claim_game_url limit drift';
  end if;
  execute replace(v_sql, v_old, v_new);
end
$migration$;
commit;
