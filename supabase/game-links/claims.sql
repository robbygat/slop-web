-- Friendly public URLs are aliases. Game slugs, bundles, owners and review
-- authority remain unchanged. Deletion leaves a name tombstone, not a takeover.
begin;
set local lock_timeout='3s';
create table public.game_url_claims(
 name text primary key check(name ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' and length(name) between 3 and 50),
 game_slug text not null unique,
 owner_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.game_url_claims enable row level security;
revoke all on public.game_url_claims from public,anon,authenticated;

create or replace function public.game_url_name_reserved(p_name text)
returns boolean language sql immutable set search_path='' as $$
 select p_name in ('home','feed','play','games','g','r','build','studio','social','shop','you','settings','connect','download','open','invite','profile','mcp','assets','api','auth','privacy','terms','tos','support','help','about','newsite','releases','bridge','404','index','favicon','robots','sitemap','admin','login','signup','logout','account','billing','uploads','downloads','game-frame','native-character','native-wasm','appearance','service-worker','sw');
$$;
revoke all on function public.game_url_name_reserved(text) from public,anon,authenticated;

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
 -- Project ownership allows a name reservation before a new game's canonical
 -- row is created by the existing publication finalizer.
 if not exists(select 1 from public.games where slug=p_game_slug and owner_id=p_owner and not media_delete_authorized)
   and not exists(select 1 from public.slop_creator_projects where game_slug=p_game_slug and owner_id=p_owner) then
  raise exception 'Game belongs to another owner or is unavailable' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('game-url-game:'||p_game_slug,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('game-url-name:'||v_name,0));
 select * into v_existing from public.game_url_claims where game_slug=p_game_slug;
 if found then
  if v_existing.owner_id is distinct from p_owner or v_existing.name<>v_name then raise exception 'This game already has a permanent URL' using errcode='23505';end if;
 else
  if exists(select 1 from public.game_url_claims where name=v_name)
    or exists(select 1 from public.games where lower(slug)=v_name and (slug<>p_game_slug or owner_id<>p_owner))
    or exists(select 1 from public.slop_creator_projects where lower(game_slug)=v_name and (game_slug<>p_game_slug or owner_id<>p_owner))
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

create or replace function public.resolve_public_game_name(p_name text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('game_id',g.id,'slug',g.slug,'name',c.name)
 from public.games g left join public.game_url_claims c on c.game_slug=g.slug and c.owner_id=g.owner_id
 where p_name ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$'
  and (g.slug=p_name or c.name=p_name) and g.status='published' and not g.media_delete_authorized
  and not public.is_game_slug_retired(g.slug)
 order by (c.name=p_name)desc limit 1;
$$;
revoke all on function public.resolve_public_game_name(text) from public;
grant execute on function public.resolve_public_game_name(text) to anon,authenticated;

create or replace function public.game_public_names(p_game_slugs text[])
returns table(game_slug text,name text) language plpgsql stable security definer set search_path='' as $$
begin
 if cardinality(p_game_slugs)>100 then raise exception 'Too many game names' using errcode='22023';end if;
 return query select c.game_slug,c.name from public.game_url_claims c join public.games g on g.slug=c.game_slug and g.owner_id=c.owner_id
 where c.game_slug=any(p_game_slugs) and g.status='published' and not g.media_delete_authorized and not public.is_game_slug_retired(g.slug);
end $$;
revoke all on function public.game_public_names(text[]) from public;
grant execute on function public.game_public_names(text[]) to anon,authenticated;

create or replace function public.my_game_url(p_owner uuid,p_game_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_owner is distinct from auth.uid() or not public.is_nonanonymous_user(p_owner) then raise exception 'Authenticated owner required' using errcode='42501';end if;
 return(select jsonb_build_object('name',name,'game_slug',game_slug,'owner_id',owner_id,'url','https://slop.game/'||name)from public.game_url_claims where game_slug=p_game_slug and owner_id=p_owner);
end $$;
revoke all on function public.my_game_url(uuid,text) from public,anon;
grant execute on function public.my_game_url(uuid,text) to authenticated;

-- A later game/project cannot steal an alias by creating the same raw slug.
create or replace function public.enforce_game_url_namespace()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_slug text;
begin
 if tg_table_name='games' then v_slug:=new.slug;else v_slug:=new.game_slug;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('game-url-name:'||lower(v_slug),0));
 if exists(select 1 from public.game_url_claims c where c.name=lower(v_slug) and (c.game_slug<>v_slug or c.owner_id is distinct from new.owner_id)) then
  raise exception 'That game URL is already reserved' using errcode='23505';
 end if;
 return new;
end $$;
revoke all on function public.enforce_game_url_namespace() from public,anon,authenticated;
create trigger enforce_game_url_namespace before insert or update of slug,owner_id on public.games for each row execute function public.enforce_game_url_namespace();
create trigger enforce_creator_game_url_namespace before insert or update of game_slug,owner_id on public.slop_creator_projects for each row execute function public.enforce_game_url_namespace();
notify pgrst,'reload schema';
commit;
