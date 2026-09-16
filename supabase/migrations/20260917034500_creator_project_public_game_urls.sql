-- Return the immutable public game name with creator project summaries and
-- detail. The canonical mapping stays in game_url_claims; projects and games
-- do not duplicate it into a mutable client-writable column.
begin;
set local lock_timeout='3s';

do $migration$
declare
 v_sql text:=pg_catalog.pg_get_functiondef('public.slop_creator_service(text,uuid,jsonb)'::regprocedure);
 v_old text;
 v_new text;
begin
 v_old:=$old$select jsonb_agg(to_jsonb(project) order by project.updated_at desc)$old$;
 v_new:=$new$select jsonb_agg(to_jsonb(project)||jsonb_build_object('public_name',(
        select claim.name from public.game_url_claims claim
        where claim.game_slug=project.game_slug and claim.owner_id=project.owner_id
      )) order by project.updated_at desc)$new$;
 if strpos(v_sql,v_old)=0 then raise exception 'creator project list projection drift';end if;
 v_sql:=replace(v_sql,v_old,v_new);

 v_old:=$old$return jsonb_build_object('owner_id',p_owner,'project',to_jsonb(v_project),$old$;
 v_new:=$new$return jsonb_build_object('owner_id',p_owner,'project',to_jsonb(v_project)||jsonb_build_object('public_name',(
      select claim.name from public.game_url_claims claim
      where claim.game_slug=v_project.game_slug and claim.owner_id=v_project.owner_id
    )),$new$;
 if strpos(v_sql,v_old)=0 then raise exception 'creator project detail projection drift';end if;
 execute replace(v_sql,v_old,v_new);
end
$migration$;

commit;
