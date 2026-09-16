import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {PGlite}=createRequire(new URL('../../../mcp/package.json',import.meta.url))('@electric-sql/pglite');
const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';

test('creator project list and detail return the owner-bound permanent public name',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create table public.slop_creator_projects(
    id uuid primary key,owner_id uuid not null,game_slug text not null,title text,
    archived_at timestamptz,updated_at timestamptz not null default now()
   );
   create table public.game_url_claims(name text primary key,game_slug text not null unique,owner_id uuid);
   create function public.slop_creator_service(p_action text,p_owner uuid,p jsonb default '{}')
   returns jsonb language plpgsql security definer set search_path='' as $creator$
   declare v_project public.slop_creator_projects%rowtype;
   begin
    if p_action='projects' then
     return jsonb_build_object('owner_id',p_owner,'projects',coalesce((
      select jsonb_agg(to_jsonb(project) order by project.updated_at desc)
      from (select * from public.slop_creator_projects where owner_id=p_owner and archived_at is null order by updated_at desc limit 50) project
     ),'[]'));
    elsif p_action='project' then
     select * into v_project from public.slop_creator_projects where id=(p->>'id')::uuid and owner_id=p_owner and archived_at is null;
     if not found then raise exception 'project_not_found' using errcode='P0002';end if;
     return jsonb_build_object('owner_id',p_owner,'project',to_jsonb(v_project),
      'runs','[]'::jsonb,'revisions','[]'::jsonb);
    end if;
    return null;
   end $creator$;
  `);
  const migration=await readFile(new URL('../../migrations/20260917034500_creator_project_public_game_urls.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.query("insert into public.slop_creator_projects(id,owner_id,game_slug,title)values($1,$2,'internal-game-42','Night Drift')",[project,owner]);
  await db.query("insert into public.game_url_claims(name,game_slug,owner_id)values('night-drift','internal-game-42',$1)",[owner]);
  const list=(await db.query("select public.slop_creator_service('projects',$1,'{}') result",[owner])).rows[0].result;
  const detail=(await db.query("select public.slop_creator_service('project',$1,jsonb_build_object('id',$2::text)) result",[owner,project])).rows[0].result;
  assert.equal(list.projects[0].public_name,'night-drift');
  assert.equal(detail.project.public_name,'night-drift');
  await db.query('delete from public.game_url_claims');
  const without=(await db.query("select public.slop_creator_service('project',$1,jsonb_build_object('id',$2::text)) result",[owner,project])).rows[0].result;
  assert.equal(without.project.public_name,null);
 }finally{await db.close();}
});
