-- Give every existing published game one immutable, human-readable address and
-- expose the same conflict-resolved preview used by web and mobile creators.
begin;
set local lock_timeout='3s';

create or replace function public.game_url_name_reserved(p_name text)
returns boolean language sql immutable set search_path='' as $$
 select p_name in ('home','feed','play','games','g','r','build','studio','social','shop','you','activity','settings','connect','download','open','invite','profile','mcp','assets','api','auth','privacy','terms','tos','support','help','about','newsite','releases','bridge','404','index','favicon','robots','sitemap','admin','login','signup','logout','account','billing','uploads','downloads','game-frame','native-character','native-wasm','appearance','service-worker','sw');
$$;
revoke all on function public.game_url_name_reserved(text) from public,anon,authenticated;

create or replace function public.suggest_game_url_name(p_game_slug text,p_owner uuid,p_title text)
returns text language plpgsql stable security definer set search_path='' as $$
declare
 v_base text;
 v_candidate text;
 v_suffix text;
 v_attempt integer:=1;
begin
 v_base:=regexp_replace(lower(btrim(coalesce(nullif(p_title,''),p_game_slug))),'[^a-z0-9]+','-','g');
 v_base:=btrim(v_base,'-');
 if v_base !~ '^[a-z]' then v_base:='game-'||v_base;end if;
 v_base:=rtrim(left(v_base,50),'-');
 if length(v_base)<3 then v_base:='game-'||substr(md5(coalesce(p_game_slug,'')),1,8);end if;
 if public.game_url_name_reserved(v_base) then v_base:=rtrim(left(v_base,45),'-')||'-game';end if;
 loop
  v_suffix:=case when v_attempt=1 then '' else '-'||v_attempt::text end;
  v_candidate:=rtrim(left(v_base,50-length(v_suffix)),'-')||v_suffix;
  if not public.game_url_name_reserved(v_candidate)
    and not public.is_game_slug_retired(v_candidate)
    and not exists(select 1 from public.game_url_claims c where c.name=v_candidate)
    and not exists(select 1 from public.games g where lower(g.slug)=v_candidate and (g.slug<>p_game_slug or g.owner_id is distinct from p_owner))
    and not exists(select 1 from public.slop_creator_projects p where lower(p.game_slug)=v_candidate and (p.game_slug<>p_game_slug or p.owner_id is distinct from p_owner)) then
   return v_candidate;
  end if;
  v_attempt:=v_attempt+1;
  if v_attempt>9999 then raise exception 'No game URL is currently available' using errcode='54000';end if;
 end loop;
end $$;
revoke all on function public.suggest_game_url_name(text,uuid,text) from public,anon,authenticated;

create or replace function public.owns_game_url_target(p_owner uuid,p_game_slug text)
returns boolean language sql stable security definer set search_path='' as $$
 select
  not exists(select 1 from public.games g where g.slug=p_game_slug and g.owner_id is distinct from p_owner)
  and not exists(select 1 from public.game_url_claims c where c.name=lower(p_game_slug) and (c.game_slug<>p_game_slug or c.owner_id is distinct from p_owner))
  and (
   exists(select 1 from public.games g where g.slug=p_game_slug and g.owner_id=p_owner and not g.media_delete_authorized)
   or exists(select 1 from public.slop_creator_projects p where p.game_slug=p_game_slug and p.owner_id=p_owner)
   or exists(
    select 1 from public.games d
    where d.owner_id=p_owner and d.status='draft' and not d.media_delete_authorized
      and d.draft_of=p_game_slug
      and d.slug ~ ('^draft--'||p_game_slug||'--[A-Za-z0-9-]{1,80}$')
   )
  );
$$;
revoke all on function public.owns_game_url_target(uuid,text) from public,anon,authenticated;

create or replace function public.claim_game_url(p_owner uuid,p_game_slug text,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_name text:=lower(btrim(coalesce(p_name,'')));v_existing public.game_url_claims%rowtype;
begin
 if p_owner is null or p_owner is distinct from auth.uid() or not public.is_nonanonymous_user(p_owner) then
  raise exception 'Authenticated game owner required' using errcode='42501';
 end if;
 if p_game_slug is null or p_game_slug !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$'
   or v_name !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' or length(v_name) not between 3 and 50
   or public.game_url_name_reserved(v_name) then raise exception 'Choose a game name with 3–50 letters, numbers and single hyphens' using errcode='22023';end if;
 if not public.owns_game_url_target(p_owner,p_game_slug) then
  raise exception 'Game belongs to another owner or is unavailable' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('game-url-game:'||p_game_slug,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('game-url-name:'||v_name,0));
 select * into v_existing from public.game_url_claims where game_slug=p_game_slug;
 if found then
  if v_existing.owner_id is distinct from p_owner or v_existing.name<>v_name then raise exception 'This game already has a permanent URL' using errcode='23505';end if;
 else
  if exists(select 1 from public.game_url_claims where name=v_name)
    or exists(select 1 from public.games where lower(slug)=v_name and (slug<>p_game_slug or owner_id is distinct from p_owner))
    or exists(select 1 from public.slop_creator_projects where lower(game_slug)=v_name and (game_slug<>p_game_slug or owner_id is distinct from p_owner))
    or public.is_game_slug_retired(v_name) then
   raise exception 'That game name is already taken' using errcode='23505';
  end if;
  if not public._reserve_client_mutation(p_owner,'game_url_claim',3,15,30,1000) then raise exception 'Game name claim limit reached' using errcode='54000';end if;
  insert into public.game_url_claims(name,game_slug,owner_id)values(v_name,p_game_slug,p_owner);
 end if;
 return jsonb_build_object('name',v_name,'game_slug',p_game_slug,'owner_id',p_owner,'url','https://slop.game/'||v_name);
end $$;
revoke all on function public.claim_game_url(uuid,text,text) from public,anon;
grant execute on function public.claim_game_url(uuid,text,text) to authenticated;

create or replace function public.preview_game_url(p_owner uuid,p_game_slug text,p_title text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_existing public.game_url_claims%rowtype;v_name text;
begin
 if p_owner is null or p_owner is distinct from auth.uid() or not public.is_nonanonymous_user(p_owner) then
  raise exception 'Authenticated game owner required' using errcode='42501';
 end if;
 if p_game_slug is null or p_game_slug !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$'
   or not public.owns_game_url_target(p_owner,p_game_slug) then
  raise exception 'Game belongs to another owner or is unavailable' using errcode='42501';
 end if;
 select * into v_existing from public.game_url_claims where game_slug=p_game_slug;
 if found then
  if v_existing.owner_id is distinct from p_owner then raise exception 'Game belongs to another owner or is unavailable' using errcode='42501';end if;
  return jsonb_build_object('name',v_existing.name,'game_slug',p_game_slug,'owner_id',p_owner,'url','https://slop.game/'||v_existing.name,'claimed',true);
 end if;
 v_name:=public.suggest_game_url_name(p_game_slug,p_owner,p_title);
 return jsonb_build_object('name',v_name,'game_slug',p_game_slug,'owner_id',p_owner,'url','https://slop.game/'||v_name,'claimed',false);
end $$;
revoke all on function public.preview_game_url(uuid,text,text) from public,anon;
grant execute on function public.preview_game_url(uuid,text,text) to authenticated;

create or replace function public.ensure_published_game_url()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
 if new.status<>'published' or new.media_delete_authorized or new.owner_id is null
   or public.is_game_slug_retired(new.slug)
   or not exists(select 1 from auth.users where id=new.owner_id)
   or exists(select 1 from public.game_url_claims where game_slug=new.slug) then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('game-url-game:'||new.slug,0));
 if exists(select 1 from public.game_url_claims where game_slug=new.slug) then return new;end if;
 loop
  v_name:=public.suggest_game_url_name(new.slug,new.owner_id,new.name);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('game-url-name:'||v_name,0));
  exit when v_name=public.suggest_game_url_name(new.slug,new.owner_id,new.name);
 end loop;
 insert into public.game_url_claims(name,game_slug,owner_id) values(v_name,new.slug,new.owner_id);
 return new;
end $$;
revoke all on function public.ensure_published_game_url() from public,anon,authenticated;
drop trigger if exists ensure_published_game_url on public.games;
create trigger ensure_published_game_url after insert or update of status,name,owner_id,media_delete_authorized on public.games for each row execute function public.ensure_published_game_url();

do $$
declare g record;v_name text;
begin
 for g in
  select games.slug,games.owner_id,games.name
  from public.games
  join auth.users on auth.users.id=games.owner_id
  where games.status='published' and not games.media_delete_authorized
    and not public.is_game_slug_retired(games.slug)
    and not exists(select 1 from public.game_url_claims c where c.game_slug=games.slug)
  order by games.created_at,games.slug
 loop
  v_name:=public.suggest_game_url_name(g.slug,g.owner_id,g.name);
  insert into public.game_url_claims(name,game_slug,owner_id) values(v_name,g.slug,g.owner_id);
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
