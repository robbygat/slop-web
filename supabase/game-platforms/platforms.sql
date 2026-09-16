-- Product compatibility is owner-authored metadata, separate from preview size.
-- Existing native games remain mobile until their compatibility is reviewed.
begin;
set local lock_timeout='3s';
alter table public.games add column supported_platforms text[] not null default array['mobile']::text[];
alter table public.games add constraint games_supported_platforms_check check(
 supported_platforms=array['mobile']::text[] or supported_platforms=array['desktop']::text[]
 or supported_platforms=array['mobile','desktop']::text[]
);
create index games_supported_platforms_idx on public.games using gin(supported_platforms);
-- No direct INSERT or UPDATE grant is added for this column. Preserve existing
-- native deletion policies; remove unrelated DDL privileges from client roles.
revoke truncate,references,trigger on public.games from public,anon,authenticated;

create function public.set_game_supported_platforms(p_owner uuid,p_game_slug text,p_platforms text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_platforms text[];
begin
 if p_owner is null or p_owner is distinct from auth.uid() or not public.is_nonanonymous_user(p_owner) then
  raise exception 'Authenticated game owner required' using errcode='42501';
 end if;
 if p_platforms is null or array_ndims(p_platforms)<>1 or cardinality(p_platforms) not between 1 and 2
   or array_position(p_platforms,null) is not null or exists(select 1 from unnest(p_platforms)p where p not in('mobile','desktop'))
   or (select count(distinct p)from unnest(p_platforms)p)<>cardinality(p_platforms) then
  raise exception 'Choose mobile, desktop, or both' using errcode='22023';
 end if;
 v_platforms:=case when cardinality(p_platforms)=2 then array['mobile','desktop']::text[] else p_platforms end;
 perform 1 from public.games where slug=p_game_slug and owner_id=p_owner and not media_delete_authorized for update;
 if not found then raise exception 'Game belongs to another owner or is unavailable' using errcode='42501';end if;
 if not public._reserve_client_mutation(p_owner,'game_platforms',10,60,300,10000) then raise exception 'Game settings update limit reached' using errcode='54000';end if;
 update public.games set supported_platforms=v_platforms where slug=p_game_slug and owner_id=p_owner;
 return jsonb_build_object('owner_id',p_owner,'game_slug',p_game_slug,'supported_platforms',v_platforms);
end $$;
revoke all on function public.set_game_supported_platforms(uuid,text,text[]) from public,anon;
grant execute on function public.set_game_supported_platforms(uuid,text,text[]) to authenticated;
notify pgrst,'reload schema';
commit;
