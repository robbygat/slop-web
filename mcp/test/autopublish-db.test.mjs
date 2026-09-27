import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { sha256, validateDraft } from "../../supabase/functions/slop-mcp/contract.mjs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const LEASE = "d".repeat(64);
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

async function fixture(owner = OWNER) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint,allowed_mime_types text[]);
    create table auth.users(id uuid primary key,eligible bool default true,deleting bool default false);
    insert into auth.users(id) values ('${OWNER}'),('${STAFF}');
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$;
    create function public.is_nonanonymous_user(p uuid) returns bool language sql as $$ select eligible from auth.users where id=p $$;
    create function public.has_account_delete_intent(p uuid) returns bool language sql as $$ select deleting from auth.users where id=p $$;
    create table public.admin_users(user_id uuid primary key);
    create table public.moderator_users(user_id uuid primary key);
    insert into public.admin_users values ('${STAFF}');
    create table public.games(id uuid primary key default gen_random_uuid(),slug text unique,owner_id uuid,status text,private_bundle_path text,
      name text,description text,prompt text,html text,published_bundle_path text,thumb text,preview_url text,media_delete_authorized bool default false,
      review_submission_id uuid,supported_platforms text[],preview_width int,preview_height int,preview_frames int,recorded_by uuid);
    -- Stand-ins for the owner receipts: they only accept the owner's identity.
    create function public.record_game_cover(p_slug text,p_version text,p_path text,p_bytes bigint) returns text language plpgsql as $$
    begin if auth.uid() is distinct from (select owner_id from public.games where slug=p_slug) then raise exception 'not owner'; end if;
      update public.games set thumb=p_path,recorded_by=auth.uid() where slug=p_slug; return p_path; end $$;
    create function public.record_game_preview(p_slug text,p_version text,p_build_id text,p_path text,p_width int,p_height int,p_frame_count int,p_bytes bigint) returns jsonb language plpgsql as $$
    begin if auth.uid() is distinct from (select owner_id from public.games where slug=p_slug) then raise exception 'not owner'; end if;
      update public.games set preview_url=p_path,preview_width=p_width,preview_height=p_height,preview_frames=p_frame_count where slug=p_slug;
      return jsonb_build_object('saved',true,'path',p_path); end $$;
    create function public.set_game_supported_platforms(p_owner uuid,p_game_slug text,p_platforms text[]) returns jsonb language plpgsql as $$
    begin if p_owner is distinct from auth.uid() then raise exception 'not owner'; end if;
      update public.games set supported_platforms=p_platforms where slug=p_game_slug;
      return jsonb_build_object('owner_id',p_owner,'game_slug',p_game_slug,'supported_platforms',p_platforms); end $$;
  `);
  for (const name of ["20260914170000_slop_mcp_bridge.sql", "20260926150000_mcp_staff_project_limit.sql", "20260926160000_mcp_auto_publish.sql",
    "20260927090000_mcp_staff_send_limits.sql", "20260927110000_mcp_staff_unlimited.sql"]) {
    await db.exec(await migration(name));
  }
  const service = async (action, p = {}) =>
    (await db.query("select public.mcp_service($1,$2::jsonb) result", [action, JSON.stringify(p)])).rows[0].result;
  const phone = async (as, action, p = {}) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [as ?? ""]);
    try {
      return (await db.query("select public.mcp_phone($1,$2::jsonb) result", [action, JSON.stringify(p)])).rows[0].result;
    } finally {
      await db.query("select set_config('request.jwt.claim.sub','',false)");
    }
  };
  const token = "slop_mcp_" + "a".repeat(64), token_hash = await sha256(token);
  const pairing = await service("pair_start", { client_name: "Agent", token_hash, code_hash: "b".repeat(64), poll_hash: "c".repeat(64) });
  await phone(owner, "pair_confirm", { pairing_id: pairing.pairing_id, code_hash: "b".repeat(64) });
  let request = 0;
  const send = async (revision, target = "mobile", project = PROJECT) => {
    const id = `44444444-4444-4444-8444-${String(++request).padStart(12, "0")}`;
    const draft = await validateDraft({ project_id: project, request_id: id, revision, name: "Pocket bounce", description: "Bounce",
      files: { "index.html": "<!doctype html><canvas></canvas>", "slop-platform.json": JSON.stringify({ target_platform: target }) } });
    return service("send_draft", { ...draft, token_hash });
  };
  return { db, service, phone, token_hash, connection: pairing.pairing_id, send, owner };
}

test("auto-publish is opt-in per connection, owner-only, and visible in connection JSON", async () => {
  const f = await fixture();
  const sub = await f.send(1);
  assert.equal((await f.service("agent_status", { token_hash: f.token_hash })).auto_publish, false);
  await assert.rejects(() => f.service("request_publish", { token_hash: f.token_hash, submission_id: sub.submission_id }), /auto_publish_disabled/);
  await assert.rejects(() => f.phone(STAFF, "set_auto_publish", { connection_id: f.connection, enabled: true }), /connection_not_found/);
  await assert.rejects(() => f.phone(OWNER, "set_auto_publish", { connection_id: f.connection, enabled: "yes" }), /invalid_request/);
  const on = await f.phone(OWNER, "set_auto_publish", { connection_id: f.connection, enabled: true });
  assert.equal(on.auto_publish, true);
  assert.deepEqual(on.scopes, ["drafts:send", "drafts:status"]);
  const priv = await f.db.query(`select has_function_privilege('authenticated','public.mcp_publisher_record(jsonb)','execute') a,
    has_function_privilege('service_role','public.mcp_publisher_record(jsonb)','execute') b,
    has_function_privilege('service_role','public._mcp_publisher(text,jsonb)','execute') c,
    has_table_privilege('service_role','public.mcp_publish_jobs','select') d`);
  assert.deepEqual(priv.rows[0], { a: false, b: true, c: false, d: false });
});

test("full job lifecycle: request, claim with lease, media, load creates owner draft, record as owner, finish", async () => {
  const f = await fixture();
  await f.phone(OWNER, "set_auto_publish", { connection_id: f.connection, enabled: true });
  const sub = await f.send(1, "mobile");
  const job = await f.service("request_publish", { token_hash: f.token_hash, submission_id: sub.submission_id });
  assert.equal(job.status, "requested");
  assert.equal(job.update, false);
  assert.deepEqual(await f.service("request_publish", { token_hash: f.token_hash, submission_id: sub.submission_id }), job);
  const listed = await f.service("agent_drafts", { token_hash: f.token_hash });
  assert.equal(listed.submissions[0].publication.status, "requested");

  const claimed = (await f.service("publisher_claim", { lease_hash: LEASE })).job;
  assert.equal(claimed.job_id, job.job_id);
  assert.equal(claimed.files["index.html"], "<!doctype html><canvas></canvas>");
  assert.equal((await f.service("publisher_claim", { lease_hash: "e".repeat(64) })).job, null);
  await assert.rejects(() => f.service("publisher_media", { job_id: job.job_id, lease_hash: "e".repeat(64), kind: "cover", sha256: "1".repeat(64), bytes: 10, width: 720, height: 1280 }), /invalid_lease/);
  await assert.rejects(() => f.service("publisher_media", { job_id: job.job_id, lease_hash: LEASE, kind: "gif", sha256: "2".repeat(64), bytes: 10, width: 640, height: 360, frame_count: 12 }), /media_invalid/);
  await assert.rejects(() => f.service("publisher_load", { job_id: job.job_id, lease_hash: LEASE }), /media_invalid/);
  await f.service("publisher_media", { job_id: job.job_id, lease_hash: LEASE, kind: "cover", sha256: "1".repeat(64), bytes: 10, width: 720, height: 1280 });
  await f.service("publisher_media", { job_id: job.job_id, lease_hash: LEASE, kind: "gif", sha256: "2".repeat(64), bytes: 20, width: 360, height: 640, frame_count: 12 });
  const load = await f.service("publisher_load", { job_id: job.job_id, lease_hash: LEASE });
  assert.equal(load.owner_id, OWNER);
  assert.equal(load.slug, sub.slug);
  assert.equal(load.update, false);
  assert.equal(load.gif.path, `jobs/${job.job_id}/preview.gif`);
  const game = (await f.db.query("select * from public.games where slug=$1", [sub.slug])).rows[0];
  assert.equal(game.owner_id, OWNER);
  assert.equal(game.status, "draft");

  const build = "b3-" + "f".repeat(32);
  const paths = {
    cover_path: `${sub.slug}/1.0.0/covers/${game.id}/${build}-c3-${"1".repeat(32)}/cover.jpg`,
    gif_path: `${sub.slug}/1.0.0/previews/${game.id}/${build}-c3-${"2".repeat(32)}/preview.gif`,
  };
  const record = (extra = {}) => f.db.query("select public.mcp_publisher_record($1::jsonb) r",
    [JSON.stringify({ job_id: job.job_id, lease_hash: LEASE, build_id: build, ...paths, ...extra })]);
  await assert.rejects(() => record({ gif_path: paths.gif_path.replace("preview.gif", "other.gif") }), /media_invalid/);
  await assert.rejects(() => record({ lease_hash: "e".repeat(64) }), /invalid_lease/);
  await record();
  const recorded = (await f.db.query("select * from public.games where slug=$1", [sub.slug])).rows[0];
  assert.equal(recorded.recorded_by, OWNER);
  assert.deepEqual(recorded.supported_platforms, ["mobile"]);
  assert.equal(recorded.html, "<!doctype html><canvas></canvas>");
  assert.equal(recorded.prompt, "Created with a connected coding app");
  // Identity was only borrowed for that statement.
  assert.equal((await f.db.query("select auth.uid() u")).rows[0].u, null);

  await assert.rejects(() => f.service("publisher_finish", { job_id: job.job_id, lease_hash: LEASE }), /publish_failed/);
  await f.db.query("update public.games set status='published' where slug=$1", [sub.slug]);
  const done = await f.service("publisher_finish", { job_id: job.job_id, lease_hash: LEASE });
  assert.equal(done.status, "published");
  const after = (await f.service("agent_drafts", { token_hash: f.token_hash })).submissions[0];
  assert.equal(after.status, "ready");
  assert.equal(after.game_id, game.id);
  assert.equal(after.publication.status, "published");
  await assert.rejects(() => f.service("publisher_fail", { job_id: job.job_id, lease_hash: LEASE, failure_code: "no_motion" }), /invalid_lease/);
});

test("a later revision updates the project's live game; pending review and in-flight jobs block", async () => {
  const f = await fixture();
  await f.phone(OWNER, "set_auto_publish", { connection_id: f.connection, enabled: true });
  const first = await f.send(1);
  const live = (await f.db.query("insert into public.games(slug,owner_id,status) values($1,$2,'published') returning id", [first.slug, OWNER])).rows[0].id;
  await f.db.query("update public.mcp_submissions set game_id=$1,status='ready' where id=$2", [live, first.submission_id]);
  const second = await f.send(2, "desktop");
  const job = await f.service("request_publish", { token_hash: f.token_hash, submission_id: second.submission_id });
  assert.equal(job.update, true);
  assert.equal(job.game_slug, first.slug);
  await assert.rejects(() => f.service("request_publish", { token_hash: f.token_hash, submission_id: first.submission_id }), /revision_superseded/);
  const third = await f.send(3);
  await assert.rejects(() => f.service("request_publish", { token_hash: f.token_hash, submission_id: third.submission_id }), /publish_in_progress/);
  // The claimed superseded revision fails instead of publishing old bytes.
  assert.equal((await f.service("publisher_claim", { lease_hash: LEASE })).job, null);
  assert.equal((await f.service("publish_status", { token_hash: f.token_hash, submission_id: second.submission_id })).publication.failure_code, "revision_superseded");
  await f.db.query("update public.games set status='pending_review' where id=$1", [live]);
  await assert.rejects(() => f.service("request_publish", { token_hash: f.token_hash, submission_id: third.submission_id }), /target_pending_review/);
});

test("revocation, disabling and lease expiry fail or requeue jobs; attempts are bounded; failures carry codes", async () => {
  const f = await fixture();
  await f.phone(OWNER, "set_auto_publish", { connection_id: f.connection, enabled: true });
  const sub = await f.send(1);
  const job = await f.service("request_publish", { token_hash: f.token_hash, submission_id: sub.submission_id });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const claimed = (await f.service("publisher_claim", { lease_hash: LEASE })).job;
    assert.equal(claimed.attempt, attempt);
    const failed = await f.service("publisher_fail", { job_id: job.job_id, lease_hash: LEASE, failure_code: "no_motion", retryable: true });
    assert.equal(failed.status, attempt < 3 ? "requested" : "failed");
    assert.equal(failed.failure_code, "no_motion");
  }
  assert.equal((await f.service("publisher_claim", { lease_hash: LEASE })).job, null);

  const g = await fixture();
  await g.phone(OWNER, "set_auto_publish", { connection_id: g.connection, enabled: true });
  const s2 = await g.send(1);
  const j2 = await g.service("request_publish", { token_hash: g.token_hash, submission_id: s2.submission_id });
  await g.service("publisher_claim", { lease_hash: LEASE });
  await g.db.query("update public.mcp_publish_jobs set lease_until=now()-interval '1 second'");
  await assert.rejects(() => g.service("publisher_load", { job_id: j2.job_id, lease_hash: LEASE }), /lease_expired/);
  await g.phone(OWNER, "set_auto_publish", { connection_id: g.connection, enabled: false });
  assert.equal((await g.service("publisher_claim", { lease_hash: LEASE })).job, null);
  assert.equal((await g.service("publish_status", { token_hash: g.token_hash, submission_id: s2.submission_id })).publication.failure_code, "auto_publish_disabled");
});

test("rate limits: three publications an hour for creators, thirty for staff; staff get 500 projects", async () => {
  const f = await fixture();
  await f.phone(OWNER, "set_auto_publish", { connection_id: f.connection, enabled: true });
  for (let i = 0; i < 3; i++) {
    const sub = await f.send(1, "mobile", `55555555-5555-4555-8555-${String(i).padStart(12,"0")}`);
    const job = await f.service("request_publish", { token_hash: f.token_hash, submission_id: sub.submission_id });
    await f.service("publisher_claim", { lease_hash: LEASE });
    await f.service("publisher_fail", { job_id: job.job_id, lease_hash: LEASE, failure_code: "boot_error" });
  }
  const extra = await f.send(1, "mobile", "88888888-8888-4888-8888-000000000009");
  await assert.rejects(() => f.service("request_publish", { token_hash: f.token_hash, submission_id: extra.submission_id }), /rate_limited/);
  for (let i = 5; i < 21; i++) await f.send(1, "mobile", `55555555-5555-4555-8555-${String(i).padStart(12,"0")}`);
  await assert.rejects(() => f.send(1, "mobile", "66666666-6666-4666-8666-000000000000"), /project_limit/);

  const staff = await fixture(STAFF);
  for (let i = 0; i < 21; i++) await staff.send(1, "mobile", `77777777-7777-4777-8777-0000000000${String(i).padStart(2, "0")}`);
  const count = (await staff.db.query("select count(*)::int n from public.mcp_projects")).rows[0].n;
  assert.equal(count, 21);
});

test("migrations are idempotent when replayed", async () => {
  const f = await fixture();
  await f.db.exec(await migration("20260926160000_mcp_auto_publish.sql"));
  const def = (await f.db.query("select pg_get_functiondef('public.mcp_service(text,jsonb)'::regprocedure) d")).rows[0].d;
  assert.equal(def.split("_mcp_publisher(").length, 2);
  assert.equal(def.split("then 10000 else 20").length, 2);
});
