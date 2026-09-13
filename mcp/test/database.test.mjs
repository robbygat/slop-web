import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  sha256,
  validateDraft,
} from "../../supabase/functions/slop-mcp/contract.mjs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const REQUEST = "44444444-4444-4444-8444-444444444444";
const token = "slop_mcp_" + "a".repeat(64);
const tokenHash = await sha256(token);
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,eligible bool default true,deleting bool default false);
    insert into auth.users(id) values ('${OWNER}'),('${OTHER}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.is_nonanonymous_user(p uuid) returns bool language sql as $$ select eligible from auth.users where id=p $$;
    create function public.has_account_delete_intent(p uuid) returns bool language sql as $$ select deleting from auth.users where id=p $$;
    create table public.games(id uuid primary key,slug text unique,owner_id uuid,status text,private_bundle_path text);
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260914170000_slop_mcp_bridge.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const service = async (action, p = {}) =>
    (await db.query("select public.mcp_service($1,$2::jsonb) result", [
      action,
      JSON.stringify(p),
    ])).rows[0].result;
  const phone = async (owner, action, p = {}) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner ?? "",
    ]);
    return (await db.query("select public.mcp_phone($1,$2::jsonb) result", [
      action,
      JSON.stringify(p),
    ])).rows[0].result;
  };
  const pairing = await service("pair_start", {
    client_name: "Test agent",
    token_hash: tokenHash,
    code_hash: "b".repeat(64),
    poll_hash: "c".repeat(64),
  });
  const approve = () =>
    phone(OWNER, "pair_confirm", {
      pairing_id: pairing.pairing_id,
      code_hash: "b".repeat(64),
    });
  const draft = async (overrides = {}) =>
    validateDraft({
      project_id: PROJECT,
      request_id: REQUEST,
      revision: 1,
      name: "Pocket bounce",
      files: { "index.html": "<!doctype html><canvas></canvas>" },
      ...overrides,
    });
  return { db, service, phone, pairing, approve, draft };
}
test("migration runs; tables private, phone cannot call service, anonymous cannot call phone", async () => {
  const f = await fixture();
  try {
    const result = await f.db.query(
      `select has_function_privilege('authenticated','public.mcp_service(text,jsonb)','execute') as service,
      has_function_privilege('anon','public.mcp_phone(text,jsonb)','execute') as phone,
      has_table_privilege('authenticated','public.mcp_submissions','select') as table_read,
      has_table_privilege('service_role','public.mcp_submissions','select') as service_read`,
    );
    assert.deepEqual(result.rows[0], {
      service: false,
      phone: false,
      table_read: false,
      service_read: false,
    });
    await assert.rejects(
      () => f.phone(null, "connections"),
      /authentication_required/,
    );
    await assert.rejects(
      () => f.service("agent_status", { token_hash: tokenHash }),
      /invalid_connection/,
    );
  } finally {
    await f.db.close();
  }
});
test("pairing requires exact code and real owner; review never grants, confirmation idempotent, other account denied", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      () =>
        f.phone(OWNER, "pair_review", {
          pairing_id: f.pairing.pairing_id,
          code_hash: "e".repeat(64),
        }),
      /invalid_pairing/,
    );
    const review = await f.phone(OWNER, "pair_review", {
      pairing_id: f.pairing.pairing_id,
      code_hash: "b".repeat(64),
    });
    assert.equal(review.requires_confirmation, true);
    await assert.rejects(
      () => f.service("agent_status", { token_hash: tokenHash }),
      /invalid_connection/,
    );
    const approved = await f.approve();
    assert.equal(approved.status, "active");
    assert.deepEqual(await f.approve(), approved);
    await assert.rejects(
      () =>
        f.phone(OTHER, "pair_confirm", {
          pairing_id: f.pairing.pairing_id,
          code_hash: "b".repeat(64),
        }),
      /invalid_pairing/,
    );
    assert.equal((await f.phone(OTHER, "connections")).connections.length, 0);
    assert.equal(
      (await f.service("pair_status", {
        pairing_id: f.pairing.pairing_id,
        poll_hash: "c".repeat(64),
      })).status,
      "approved",
    );
    assert.equal(
      (await f.service("agent_status", { token_hash: tokenHash })).status,
      "active",
    );
  } finally {
    await f.db.close();
  }
});
test("expired pairing and deleted account are rejected", async () => {
  const f = await fixture();
  try {
    await f.db.exec(
      "update public.mcp_connections set pairing_expires_at=now()-interval '1 second'",
    );
    await assert.rejects(() => f.approve(), /pairing_expired/);
    await f.db.exec(
      "update public.mcp_connections set pairing_expires_at=now()+interval '1 minute'",
    );
    await f.approve();
    await f.db.exec(`update auth.users set deleting=true where id='${OWNER}'`);
    await assert.rejects(
      () => f.service("agent_status", { token_hash: tokenHash }),
      /invalid_connection/,
    );
    await assert.rejects(
      () => f.phone(OWNER, "connections"),
      /account_unavailable/,
    );
  } finally {
    await f.db.close();
  }
});
test("duplicate requests never create duplicate games; changed payload and stale revision rejected", async () => {
  const f = await fixture();
  try {
    await f.approve();
    const draft = await f.draft();
    const first = await f.service("send_draft", {
      ...draft,
      token_hash: tokenHash,
      owner_id: OTHER,
    });
    assert.equal(first.status, "awaiting_confirmation");
    assert.equal(first.game_id, null);
    assert.deepEqual(
      await f.service("send_draft", { ...draft, token_hash: tokenHash }),
      first,
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from public.mcp_submissions"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from public.games")).rows[0].n,
      0,
    );
    assert.equal((await f.phone(OWNER, "drafts")).submissions.length, 1);
    assert.equal((await f.phone(OTHER, "drafts")).submissions.length, 0);
    await assert.rejects(
      () =>
        f.service("send_draft", {
          ...draft,
          request_digest: "0".repeat(64),
          token_hash: tokenHash,
        }),
      /request_conflict/,
    );
    await assert.rejects(
      () =>
        f.service("send_draft", {
          ...draft,
          request_id: OTHER,
          token_hash: tokenHash,
        }),
      /revision_conflict/,
    );
    assert.equal(
      (await f.db.query("select owner_id from public.mcp_submissions")).rows[0]
        .owner_id,
      OWNER,
    );
  } finally {
    await f.db.close();
  }
});
test("owner confirmation leases; phone cannot mark ready; only server validated exact lease can finish", async () => {
  const f = await fixture();
  try {
    await f.approve();
    const draft = await f.draft();
    const sent = await f.service("send_draft", {
      ...draft,
      token_hash: tokenHash,
    });
    const confirm = {
      submission_id: sent.submission_id,
      expected_digest: draft.digest,
    };
    await assert.rejects(
      () => f.phone(OTHER, "claim_draft", confirm),
      /invalid_connection/,
    );
    await assert.rejects(
      () =>
        f.phone(OWNER, "claim_draft", {
          ...confirm,
          expected_digest: "0".repeat(64),
        }),
      /version_changed/,
    );
    const claimed = await f.phone(OWNER, "claim_draft", confirm);
    await assert.rejects(
      () => f.phone(OWNER, "claim_draft", confirm),
      /confirmation_busy/,
    );
    await assert.rejects(
      () =>
        f.phone(OWNER, "finish_draft", {
          submission_id: sent.submission_id,
          lease: claimed.lease,
        }),
      /invalid_action/,
    );
    const finish = {
      submission_id: sent.submission_id,
      owner_id: OWNER,
      lease: claimed.lease,
      game_id: OTHER,
    };
    await assert.rejects(
      () => f.service("finish_draft", finish),
      /game_not_found/,
    );
    await f.db.query(
      "insert into public.games(id,slug,owner_id,status) values($1,$2,$3,$4)",
      [OTHER, claimed.slug, OWNER, "draft"],
    );
    const ready = await f.service("finish_draft", finish);
    assert.equal(ready.status, "ready");
    assert.equal(ready.game_id, OTHER);
    assert.ok(!JSON.stringify(ready).includes("files"));
    assert.ok(!JSON.stringify(ready).includes("preview_url"));
    await assert.rejects(
      () => f.service("finish_draft", finish),
      /confirmation_expired/,
    );
  } finally {
    await f.db.close();
  }
});
test("new revision or revocation defeats an in-flight confirmation", async () => {
  const f = await fixture();
  try {
    const connection = await f.approve();
    const draft = await f.draft();
    const sent = await f.service("send_draft", {
      ...draft,
      token_hash: tokenHash,
    });
    const claimed = await f.phone(OWNER, "claim_draft", {
      submission_id: sent.submission_id,
      expected_digest: draft.digest,
    });
    const second = await f.draft({ revision: 2, request_id: OTHER });
    await f.service("send_draft", { ...second, token_hash: tokenHash });
    await assert.rejects(
      () =>
        f.phone(OWNER, "check_lease", {
          submission_id: sent.submission_id,
          lease: claimed.lease,
        }),
      /revision_superseded/,
    );
    await f.phone(OWNER, "revoke", { connection_id: connection.connection_id });
    await assert.rejects(
      () => f.service("send_draft", { ...draft, token_hash: tokenHash }),
      /invalid_connection/,
    );
    await assert.rejects(
      () =>
        f.service("finish_draft", {
          submission_id: sent.submission_id,
          lease: claimed.lease,
          owner_id: OWNER,
          game_id: OTHER,
        }),
      /invalid_connection/,
    );
    assert.deepEqual((await f.phone(OWNER, "drafts")).submissions, []);
  } finally {
    await f.db.close();
  }
});
