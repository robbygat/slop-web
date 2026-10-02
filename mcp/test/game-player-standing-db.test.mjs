// Executes the actual website migration with the MCP package's existing PGlite.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const {PGlite} = await import(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$select nullif(current_setting('test.owner', true), '')::uuid$$;
    create function auth.jwt() returns jsonb language sql as
      $$select jsonb_build_object('is_anonymous', coalesce(current_setting('test.anonymous', true), 'false') = 'true')$$;
    create table public.profiles(id uuid primary key);
    create table public.games(slug text primary key, status text);
    create table public.scores(game text, user_id uuid, score bigint);
    create table public.ranking_fixture(game_key text, user_id uuid, score bigint, crown_rank bigint, score_authority text);
    create function public._live_crown_rankings(p_game text)
      returns setof public.ranking_fixture language sql stable as
      $$select * from public.ranking_fixture where game_key = p_game$$;
    create function public.competitive_top_scores(text,integer) returns void language sql as $$select$$;
    create function public.top_scores(text,integer) returns void language sql as $$select$$;
    insert into public.profiles values ('${owner}'), ('${other}');
    insert into public.games values ('zero-only','published'),('removed-game','removed');
    insert into public.scores values ('zero-only','${owner}',0),('zero-only','${other}',0),('removed-game','${owner}',1000);
    insert into public.ranking_fixture values
      ('tied-game','${owner}',800,24,'community_unverified'),
      ('tied-game','${other}',800,23,'community_unverified'),
      ('champion-game','${owner}',950,1,'community_unverified'),
      ('verified-game','${other}',20,1,'verified_receipt'),
      ('capped-game','${owner}',800,2,'community_unverified'),
      ('capped-game','${other}',99999999,1,'community_unverified');
    insert into public.scores values ('verified-game','${owner}',5000);
    revoke all on public.scores, public.ranking_fixture from public, anon, authenticated;
    revoke all on function public._live_crown_rankings(text) from public, anon, authenticated;
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261002120000_game_player_standing.sql', import.meta.url),'utf8'));
});
after(async () => { await db?.close(); });

async function asOwner(id = owner, anonymous = false) {
  await db.query("select set_config('test.owner',$1,false), set_config('test.anonymous',$2,false)",[id || '',String(anonymous)]);
}
async function standing(game) {
  return (await db.query('select public.my_game_standing($1) as value',[game])).rows[0].value;
}

test('SQL migration executes and returns rank 24 with the original tie ordering', async () => {
  await asOwner();
  const value = await standing('tied-game');
  assert.equal(value.rank,24);
  assert.equal(value.next_rank,23);
  assert.equal(value.points_to_next,1);
  assert.equal(value.best,800);
});

test('SQL champion and unavailable board entry have null next targets', async () => {
  await asOwner();
  const champion = await standing('champion-game');
  assert.equal(champion.rank,1);
  assert.equal(champion.next_score,null);
  assert.equal(champion.points_to_next,null);
  const empty = await standing('empty-game');
  assert.equal(empty.has_score,false);
  assert.equal(empty.best,null);
  assert.equal(empty.rank,null);
});

test('SQL verified board never imports a larger unverified personal best', async () => {
  await asOwner();
  const value = await standing('verified-game');
  assert.equal(value.score_authority,'verified_receipt');
  assert.equal(value.has_score,false);
  assert.equal(value.best,null);
  assert.equal(value.rank,null);
});

test('SQL zero-only fallback follows legacy user-ID ordering and catalog visibility', async () => {
  await asOwner(other);
  const value = await standing('zero-only');
  assert.equal(value.has_score,true);
  assert.equal(value.best,0);
  assert.equal(value.rank,2);
  assert.equal(value.next_rank,1);
  assert.equal(value.points_to_next,1);
  await asOwner();
  assert.equal((await standing('removed-game')).has_score,false);
});

test('SQL score cap does not invent an unattainable target', async () => {
  await asOwner();
  const value = await standing('capped-game');
  assert.equal(value.next_score,99999999);
  assert.equal(value.next_rank,1);
  assert.equal(value.points_to_next,null);
});

test('SQL rejects guests, anonymous identities and malformed game keys', async () => {
  await asOwner(null);
  await assert.rejects(standing('tied-game'), /authentication_required/);
  await asOwner(owner,true);
  await assert.rejects(standing('tied-game'), /authentication_required/);
  await asOwner();
  await assert.rejects(standing(''), /invalid_score_game/);
  await assert.rejects(standing('x'.repeat(161)), /invalid_score_game/);
});

test('SQL grants only the account RPC without exposing score tables or private helpers', async () => {
  const {rows} = await db.query(`select
    has_function_privilege('anon','public.my_game_standing(text)','execute') as guest_rpc,
    has_function_privilege('authenticated','public.my_game_standing(text)','execute') as owner_rpc,
    has_function_privilege('authenticated','public._live_crown_rankings(text)','execute') as private_ranking,
    has_table_privilege('authenticated','public.scores','select') as score_table`);
  assert.deepEqual(rows[0],{guest_rpc:false,owner_rpc:true,private_ranking:false,score_table:false});
});
