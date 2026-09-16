import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {PGlite}=createRequire(new URL('../../../mcp/package.json',import.meta.url))('@electric-sql/pglite');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
async function fixture(){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,is_anonymous bool default false);
 create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.is_nonanonymous_user(p uuid)returns bool language sql stable security definer as $$select exists(select 1 from auth.users where id=p and not is_anonymous)$$;
 create table public.games(id uuid default gen_random_uuid(),slug text unique,owner_id uuid,status text,media_delete_authorized bool default false);
 create table public.slop_creator_projects(game_slug text unique,owner_id uuid);
 create table public.retired(slug text);
 create function public.is_game_slug_retired(p text)returns bool language sql stable as $$select exists(select 1 from public.retired where slug=p)$$;
 create function public._reserve_client_mutation(uuid,text,int,int,int,int)returns bool language sql as $$select true$$;
 insert into auth.users(id)values('${A}'),('${B}');
 insert into public.games(slug,owner_id,status)values('native-original-1','${A}','published'),('other-game','${B}','published'),('private-draft','${A}','draft');
 insert into public.slop_creator_projects values('creator-future-project','${A}');
 insert into public.retired values('retired-name');
 grant usage on schema public,auth to anon,authenticated;
 `);await db.exec(await readFile(new URL('../claims.sql',import.meta.url),'utf8'));
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const owner=async(id=A)=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const claim=(game,name,id=A)=>scalar('select public.claim_game_url($1,$2,$3)',[id,game,name]);
 return{db,scalar,owner,claim};}
test('a claim binds an owned immutable target, is idempotent and resolves only a published game',async()=>{const f=await fixture();try{
 await f.owner();const r=await f.claim('native-original-1','night-drift');assert.equal(r.url,'https://slop.game/night-drift');assert.deepEqual(await f.claim('native-original-1','night-drift'),r);
 await assert.rejects(()=>f.claim('native-original-1','another-name'),/permanent URL/);
 await f.claim('creator-future-project','future-game');assert.equal(await f.scalar("select public.resolve_public_game_name('future-game')"),null);
 await f.db.exec('reset role');await f.db.query("insert into public.games(slug,owner_id,status)values('creator-future-project',$1,'draft')",[A]);await f.db.exec("update public.games set status='published' where slug='creator-future-project'");
 await f.db.exec('set role anon');assert.equal((await f.scalar("select public.resolve_public_game_name('night-drift')")).slug,'native-original-1');assert.equal((await f.scalar("select public.resolve_public_game_name('future-game')")).slug,'creator-future-project');
 assert.equal(await f.scalar("select public.resolve_public_game_name('private-draft')"),null);
 }finally{await f.db.close();}});
test('another owner cannot claim, steal a raw slug, reuse a retired name or read private reservations',async()=>{const f=await fixture();try{
 await f.owner();await assert.rejects(()=>f.claim('other-game','stolen-name'),/another owner/);await assert.rejects(()=>f.claim('native-original-1','my-game',B),/Authenticated game owner/);
 for(const n of ['other-game','retired-name','mcp','assets','home','bad--name'])await assert.rejects(()=>f.claim('native-original-1',n));
 await f.claim('native-original-1','night-drift');await f.owner(B);await assert.rejects(()=>f.claim('other-game','night-drift',B),/already taken/);
 await f.db.exec('set role anon');await assert.rejects(()=>f.claim('native-original-1','new-name'),/permission denied/);await assert.rejects(()=>f.scalar('select count(*)from public.game_url_claims'),/permission denied/);
 }finally{await f.db.close();}});
test('reserved names block future raw-slug takeover and survive account deletion as private tombstones',async()=>{const f=await fixture();try{
 await f.owner();await f.claim('native-original-1','night-drift');await f.db.exec('reset role');
 await assert.rejects(()=>f.db.query("insert into public.games(slug,owner_id,status)values('night-drift',$1,'published')",[B]),/already reserved/);
 await assert.rejects(()=>f.db.query("insert into public.slop_creator_projects(game_slug,owner_id)values('night-drift',$1)",[B]),/already reserved/);
 await f.db.query('delete from auth.users where id=$1',[A]);assert.equal(await f.scalar("select owner_id from public.game_url_claims where name='night-drift'"),null);
 await f.owner(B);await assert.rejects(()=>f.claim('other-game','night-drift',B),/already taken/);assert.equal(await f.scalar("select public.resolve_public_game_name('night-drift')"),null);
 }finally{await f.db.close();}});
test('creator URL stays on its canonical game through pending heads and approved successor releases',async()=>{const f=await fixture();try{
 await f.owner();await f.claim('creator-future-project','my-space-game');
 await f.db.exec('reset role');await f.db.query("insert into public.games(slug,owner_id,status)values('creator-future-project',$1,'draft'),('creator-release-first',$1,'pending_review'),('creator-release-next',$1,'draft')",[A]);
 await f.db.exec('set role anon');assert.equal(await f.scalar("select public.resolve_public_game_name('my-space-game')"),null);
 // The native finalizer promotes target_game_id at project.game_slug and returns
 // creator-release-* to draft. Pending heads never become public alias targets.
 await f.db.exec("reset role;update public.games set status='published' where slug='creator-future-project';update public.games set status='draft' where slug='creator-release-first';set role anon");
 const first=await f.scalar("select public.resolve_public_game_name('my-space-game')");assert.equal(first.slug,'creator-future-project');
 await f.db.exec("reset role;update public.games set status='pending_review' where slug='creator-release-next';set role anon");
 assert.deepEqual(await f.scalar("select public.resolve_public_game_name('my-space-game')"),first);
 assert.equal(await f.scalar("select public.resolve_public_game_name('creator-release-next')"),null);
 assert.deepEqual((await f.db.query("select * from public.game_public_names(array['creator-future-project','creator-release-first','creator-release-next'])")).rows,[{game_slug:'creator-future-project',name:'my-space-game'}]);
 await f.db.exec("reset role;update public.games set status='draft' where slug='creator-release-next';set role anon");
 assert.deepEqual(await f.scalar("select public.resolve_public_game_name('my-space-game')"),first);
 }finally{await f.db.close();}});
test('an owned project reservation never resolves another owner’s matching game or private release',async()=>{const f=await fixture();try{
 await f.owner();await f.claim('creator-future-project','my-space-game');await f.db.exec('reset role');
 await f.db.query("insert into public.games(slug,owner_id,status)values('creator-future-project',$1,'published')",[B]);
 await f.db.exec('set role anon');assert.equal(await f.scalar("select public.resolve_public_game_name('my-space-game')"),null);
 assert.deepEqual((await f.db.query("select * from public.game_public_names(array['creator-future-project'])")).rows,[]);
 }finally{await f.db.close();}});
