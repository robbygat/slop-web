import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {PGlite}=createRequire(new URL('../../../mcp/package.json',import.meta.url))('@electric-sql/pglite');
const OWNER='11111111-1111-4111-8111-111111111111', OTHER='22222222-2222-4222-8222-222222222222';
const GAME='33333333-3333-4333-8333-333333333333', ROOT='44444444-4444-4444-8444-444444444444';
async function fixture(){
 const db=new PGlite();
 await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions;
  create table auth.users(id uuid primary key,is_anonymous bool default false);
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
  create function public.is_nonanonymous_user(p uuid) returns bool language sql stable security definer as $$ select exists(select 1 from auth.users where id=p and not is_anonymous) $$;
  create table public.profiles(id uuid primary key,username text,avatar_url text,slop_look jsonb);
  create table public.games(id uuid primary key,slug text unique,owner_id uuid,status text,media_delete_authorized bool default false);
  create table public.trainer_native_games(game_id text primary key,active bool);
  create table public.game_comments(id uuid primary key default gen_random_uuid(),game_id text not null,user_id uuid not null references auth.users(id) on delete cascade,username text,avatar_url text,body text not null,created_at timestamptz not null default now(),gif_url text,parent_id uuid references public.game_comments(id) on delete cascade);
  create table public.game_likes(game_id text,user_id uuid);
  create table public.gif_media_receipts(user_id uuid,media_url text,expires_at timestamptz);
  create table public.gif_media_assets(token_hash text,claimed_at timestamptz);
  create function extensions.digest(bytea,text) returns bytea language sql immutable as $$ select $1 $$;
  create function public._valid_giphy_comment_url(p text) returns bool language sql immutable as $$ select p ~ '^https://api\\.slop\\.game/functions/v1/gif-proxy/media/[0-9a-f]{64}$' $$;
  create table public.client_mutation_attempts(user_id uuid,kind text,attempted_at timestamptz default clock_timestamp());
  create function public._reserve_client_mutation(p uuid,k text,m int,h int,d int,g int) returns bool language plpgsql as $$ begin
    if (select count(*) from public.client_mutation_attempts where user_id=p and kind=k and attempted_at>clock_timestamp()-interval '1 minute')>=m then return false; end if;
    insert into public.client_mutation_attempts(user_id,kind)values(p,k);return true;end $$;
  insert into auth.users(id) values('${OWNER}'),('${OTHER}');
  insert into public.profiles values('${OWNER}','real-owner','https://example.test/a.png','{"shape":"sunbeam"}'),('${OTHER}','other-owner',null,null);
  insert into public.games values('${GAME}','public-game','${OWNER}','published',false),('55555555-5555-4555-8555-555555555555','other-game','${OTHER}','published',false),('66666666-6666-4666-8666-666666666666','private-game','${OWNER}','draft',false),('77777777-7777-4777-8777-777777777777','deleting-game','${OWNER}','published',true);
  insert into public.trainer_native_games values('night-drift',true),('retired-game',false);
  insert into public.game_comments(id,game_id,user_id,username,body,created_at) values
    ('${ROOT}','public-game','${OWNER}','outdated-name','Root','2026-09-08T07:06:17.841763Z'),
    ('44444444-4444-4444-8444-444444444443','public-game','${OWNER}','outdated-name','Tied root','2026-09-08T07:06:17.841763Z'),
    ('88888888-8888-4888-8888-888888888888','private-game','${OWNER}','real-owner','Private history','2026-09-08T07:06:17Z');
  insert into public.game_comments(id,game_id,user_id,body,parent_id,created_at) values
    ('99999999-9999-4999-8999-999999999999','public-game','${OTHER}','Reply','${ROOT}','2026-09-09T07:06:17Z');
  alter table public.game_comments enable row level security;
  create policy game_comments_read_all on public.game_comments for select using(true);
  create policy game_comments_insert_own on public.game_comments for insert to authenticated with check(user_id=auth.uid());
  create policy game_comments_delete_own on public.game_comments for delete to authenticated using(user_id=auth.uid());
  grant usage on schema public,auth to anon,authenticated;
  grant all on public.game_comments to anon,authenticated;
 `);
 await db.exec(await readFile(new URL('../restore-comments.sql',import.meta.url),'utf8'));
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const role=async(owner=OWNER)=>{await db.exec(`set role authenticated;`);await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[owner]);};
 const post=(owner=OWNER,game=GAME,body='A real comment',gif=null,parent=null)=>scalar('select public.post_game_comment($1,$2,$3,$4,$5)',[owner,game,body,gif,parent]);
 const page=(id=GAME,cursor=null,root=null,limit=1)=>scalar('select public.game_comment_page($1,$2,$3,$4,$5)',[id,root,cursor?.created_at??null,cursor?.id??null,limit]);
 return{db,scalar,role,post,page};
}
test('public comment pages resolve UUID aliases and preserve timestamp ties, thread roots and identity',async()=>{
 const f=await fixture();try{
  await f.db.exec('set role anon');
  const first=await f.page();assert.equal(first.total_count,3);assert.equal(first.comments.length,1);assert.equal(first.comments[0].id,ROOT);
  assert.equal(first.comments[0].username,'real-owner');assert.equal(first.comments[0].reply_count,1);assert.equal(first.has_more,true);
  assert.ok(first.next_cursor.created_at.includes('.841763'));
  const next=await f.page(GAME,first.next_cursor);assert.equal(next.comments.length,1);assert.notEqual(next.comments[0].id,ROOT);assert.equal(next.has_more,false);
  const replies=await f.page(GAME,null,ROOT);assert.equal(replies.comments.length,2);assert.equal(replies.has_more,false);
  assert.equal((await f.page('app:night-drift')).total_count,0);
  for(const id of ['private-game','deleting-game','missing-game','app:retired-game'])await assert.rejects(()=>f.page(id),/Game unavailable/);
  await assert.rejects(()=>f.page(GAME,{created_at:'2026-09-08T07:06:17Z'}),/Incomplete comment cursor/);
  assert.equal(await f.scalar('select count(*) from public.game_comments'),3);
  assert.equal(Number(await f.scalar('select comments from public.game_social_counts(array[$1])',[GAME])),3);
 }finally{await f.db.close();}
});
test('posting requires the captured nonanonymous owner and a published target',async()=>{
 const f=await fixture();try{
  await f.db.exec('set role anon');await assert.rejects(()=>f.post(),/permission denied/);
  await f.role();await assert.rejects(()=>f.post(OTHER),/Authenticated comment owner required/);
  for(const id of ['private-game','deleting-game','unknown-game'])await assert.rejects(()=>f.post(OWNER,id),/unknown_comment_game/);
  await f.db.exec('reset role');await f.db.query('update auth.users set is_anonymous=true where id=$1',[OWNER]);await f.role();
  await assert.rejects(()=>f.post(),/Authenticated comment owner required/);
  assert.equal(await f.scalar('select count(*) from public.game_comments'),3);
 }finally{await f.db.close();}
});
test('the real insert authority authors canonical game, owner, profile, timestamp and bounded body',async()=>{
 const f=await fixture();try{
  await f.role();const posted=await f.post(OWNER,GAME,'  Hello from the web  ');
  assert.equal(posted.user_id,OWNER);assert.equal(posted.game_id,'public-game');assert.equal(posted.body,'Hello from the web');assert.equal(posted.username,'real-owner');
  assert.equal(posted.slop_look.shape,'sunbeam');assert.ok(Date.now()-Date.parse(posted.created_at)<10000);
  const direct=await f.scalar(`insert into public.game_comments(game_id,user_id,username,body,created_at)values($1,$2,'forged-name','Direct client intent','2099-01-01')returning to_jsonb(game_comments)`,[GAME,OWNER]);
  assert.equal(direct.username,'real-owner');assert.equal(direct.game_id,'public-game');assert.ok(Date.parse(direct.created_at)<Date.parse('2099-01-01'));
  await assert.rejects(()=>f.post(OWNER,GAME,''),/empty_comment/);
  await assert.rejects(()=>f.post(OWNER,GAME,'x'.repeat(501)),/invalid_comment_body/);
  await assert.rejects(()=>f.post(OWNER,GAME,'control\x01'),/invalid_comment_body/);
  await assert.rejects(()=>f.post(OWNER,GAME,'GIF','https://evil.test/pixel.gif'),/invalid_comment_gif/);
  await assert.rejects(()=>f.post(OWNER,'other-game','Cross-game reply',null,ROOT),/invalid_comment_parent/);
 }finally{await f.db.close();}
});
test('comment rate limits, own deletion, and ancestor deletion preserve another account reply',async()=>{
 const f=await fixture();try{
  await f.role();for(let i=0;i<5;i++)await f.post(OWNER,GAME,`Comment ${i}`);
  await assert.rejects(()=>f.post(),/comment_rate_limit/);
  await f.db.query('delete from public.game_comments where id=$1',[ROOT]);
  const child=await f.scalar("select to_jsonb(c) from public.game_comments c where id='99999999-9999-4999-8999-999999999999'");
  assert.equal(child.parent_id,null);assert.equal(child.user_id,OTHER);
  await f.db.exec("delete from public.game_comments where id='99999999-9999-4999-8999-999999999999'");
  assert.equal(await f.scalar("select count(*) from public.game_comments where id='99999999-9999-4999-8999-999999999999'"),1);
  for(const role of ['anon','authenticated'])for(const privilege of ['UPDATE','TRUNCATE','TRIGGER'])assert.equal(await f.scalar('select has_table_privilege($1,$2,$3)',[role,'public.game_comments',privilege]),false);
 }finally{await f.db.close();}
});
