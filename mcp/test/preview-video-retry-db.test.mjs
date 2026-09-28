import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createVideoRetryPass} from '../../scripts/mcp-publisher/safety.mjs';

const id = n => `11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,metadata jsonb);
    create table public.games(id uuid primary key,slug text,owner_id uuid,status text default 'published',html text default '<script src="slop.js"></script>',
      published_bundle_path text,bundle_version text default '1.0.0',supported_platforms text[] default array['mobile'],preview_width int,preview_height int,
      media_delete_authorized bool default false,qualified_play_count int default 0,created_at timestamptz default now());
  `);
  for(const name of ['20260928120000_game_preview_videos.sql','20260928230000_preview_video_retry_pass.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  }
  const service = async (action,input={}) => (await db.query('select public.game_preview_video_service($1,$2::jsonb) result',[action,JSON.stringify(input)])).rows[0].result;
  const game = async (n, attempts=0) => {
    await db.query('insert into public.games(id,slug,qualified_play_count) values($1,$2,$3)',[id(n),`fixture-${n}`,1000-n]);
    if(attempts) await db.query(`insert into public.game_preview_video_attempts(game_id,release_key,attempts,failure_code,updated_at)
      values($1,$2,$3,'no_motion',now()-interval '1 hour')`,[id(n),`legacy/fixture-${n}`,attempts]);
  };
  return {db,service,game};
}

test('a forced pass reaches every old failure once and cannot loop on old or first-time fresh failures',async t=>{
  const {db,service,game}=await fixture(t);
  await game(1,2); await game(2,3); await game(3);
  const pass=createVideoRetryPass(true), seen=[];
  for(let n=0;n<3;n++){
    const result=await service('claim',{limit:1,...pass.claimInput()});
    pass.acceptClaim(result);
    assert.equal(result.games.length,1);
    const current=result.games[0];seen.push(current.game_id);
    await service('fail',{game_id:current.game_id,failure_code:'no_motion'});
  }
  assert.deepEqual(seen,[id(1),id(2),id(3)]);
  assert.deepEqual((await service('claim',{limit:1,...pass.claimInput()})).games,[]);
  assert.deepEqual((await db.query('select attempts from public.game_preview_video_attempts order by game_id')).rows.map(x=>x.attempts),[3,4,1]);
  // A later explicitly requested pass may retry the same failed release.
  const next=await service('claim',{limit:1,retry_failed:true});
  assert.equal(next.games[0].game_id,id(1));
});

test('normal retry limits, active claims, current releases and private permissions stay intact',async t=>{
  const {db,service,game}=await fixture(t);
  await game(1,2); await game(2,1); await game(3,2); await game(4); await game(5); await game(6);
  await db.query("update public.game_preview_video_attempts set claimed_at=now() where game_id=$1",[id(3)]);
  await db.query("update public.games set status='draft' where id=$1",[id(4)]);
  await db.query('update public.games set media_delete_authorized=true where id=$1',[id(5)]);
  await db.query("update public.games set html='<canvas></canvas>' where id=$1",[id(6)]);
  assert.equal((await service('claim',{limit:1})).games[0].game_id,id(2));
  await service('fail',{game_id:id(2),failure_code:'no_motion'});
  assert.deepEqual((await service('claim',{limit:10})).games,[]);
  const forced=await service('claim',{limit:10,retry_failed:true});
  assert.deepEqual(forced.games.map(x=>x.game_id),[id(1),id(2)]);
  await db.query("update public.games set published_bundle_path='releases/new/fixture-3' where id=$1",[id(3)]);
  assert.equal((await service('claim',{limit:1,retry_failed:true,retry_before:forced.retry_before})).games[0].game_id,id(3),'old-release attempts cannot block a new release');
  const privileges=(await db.query(`select has_function_privilege('anon','public.game_preview_video_service(text,jsonb)','execute') anon,
    has_function_privilege('authenticated','public.game_preview_video_service(text,jsonb)','execute') authenticated,
    has_function_privilege('service_role','public.game_preview_video_service(text,jsonb)','execute') service,
    has_table_privilege('service_role','public.game_preview_video_attempts','select') attempts`)).rows[0];
  assert.deepEqual(privileges,{anon:false,authenticated:false,service:true,attempts:false});
});

test('invalid, future and expired cutoffs fail closed without claiming a game',async t=>{
  const {db,service,game}=await fixture(t);await game(1,2);
  for(const retry_before of ['tomorrow','infinity',42,'2099-01-01T00:00:00Z','2000-01-01T00:00:00Z']){
    await assert.rejects(service('claim',{retry_failed:true,retry_before}),/invalid_request/);
  }
  await assert.rejects(service('claim',{retry_failed:false,retry_before:'2026-09-28T00:00:00Z'}),/invalid_request/);
  assert.equal((await db.query('select claimed_at from public.game_preview_video_attempts')).rows[0].claimed_at,null);
});


test('live release-key requirement stays strict for owner and recorder uploads',async t=>{
  const {db,service,game}=await fixture(t);await game(1);
  await db.query('update public.games set owner_id=$1 where id=$2',[id(9),id(1)]);
  for(const source of ['owner','recorder']){
    for(const release_key of [undefined,'legacy/previous']){
      await assert.rejects(service('record',{game_id:id(1),owner_id:id(9),source,release_key}),/revision_superseded/);
    }
  }
});
