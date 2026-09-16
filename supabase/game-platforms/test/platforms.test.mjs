import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {PGlite}=createRequire(new URL('../../../mcp/package.json',import.meta.url))('@electric-sql/pglite');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('only the captured nonanonymous owner can change bounded platform metadata; status and media remain unchanged',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function public.is_nonanonymous_user(p uuid)returns bool language sql as $$select p is not null$$;create function public._reserve_client_mutation(uuid,text,int,int,int,int)returns bool language sql as $$select true$$;create table public.games(slug text primary key,owner_id uuid,media_delete_authorized bool default false,status text default 'published',preview_width int default360,preview_height int default640);insert into public.games(slug,owner_id)values('owned-game','${A}'),('foreign-game','${B}');grant usage on schema public,auth to anon,authenticated;grant select,truncate,references,trigger on public.games to anon,authenticated;` .replace('default360','default 360').replace('default640','default 640'));
  await db.exec(await readFile(new URL('../platforms.sql',import.meta.url),'utf8'));
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${A}',false);`);
  const call=(owner,slug,platforms)=>db.query('select public.set_game_supported_platforms($1,$2,$3) as value',[owner,slug,platforms]);
  assert.deepEqual((await call(A,'owned-game',['desktop','mobile'])).rows[0].value.supported_platforms,['mobile','desktop']);
  await assert.rejects(()=>call(B,'foreign-game',['desktop']),/Authenticated game owner/);await assert.rejects(()=>call(A,'foreign-game',['desktop']),/another owner/);
  for(const value of [[],['tablet'],['mobile','mobile'],['mobile',null],null])await assert.rejects(()=>call(A,'owned-game',value));
  assert.deepEqual((await db.query("select status,preview_width,preview_height from public.games where slug='owned-game'")).rows[0],{status:'published',preview_width:360,preview_height:640});
  await assert.rejects(()=>db.exec("update public.games set supported_platforms=array['desktop']"),/permission denied/);await assert.rejects(()=>db.exec('truncate public.games'),/permission denied/);
  await db.exec('set role anon');await assert.rejects(()=>call(A,'owned-game',['desktop']),/permission denied/);
 }finally{await db.close();}
});
