import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { deploymentPreflight } from "../deployment-preflight.mjs";

test("deployment preflight executes real grants/negative RPCs then rolls all new objects back", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.is_nonanonymous_user(p uuid) returns bool language sql as $$
        select exists(select 1 from auth.users where id=p) $$;
      create function public.has_account_delete_intent(p uuid) returns bool language sql as $$ select false $$;
      create table public.games(id uuid primary key,slug text,owner_id uuid,status text,private_bundle_path text);
    `);
    const migration = await readFile(new URL(
      "../../supabase/migrations/20260914170000_slop_mcp_bridge.sql", import.meta.url,
    ), "utf8");
    const sql = deploymentPreflight(migration);
    assert.doesNotMatch(sql, /^commit;\s*$/im);
    const results = await db.exec(sql);
    assert.deepEqual(results.at(-1).rows, [{
      rolled_back_table: null, rolled_back_service: null, rolled_back_phone: null,
    }]);
    assert.deepEqual((await db.query("select count(*)::int as users from auth.users")).rows, [{users:0}]);
    assert.throws(() => deploymentPreflight(migration + "\ncommit;\n"), /one final COMMIT/);
  } finally {
    await db.close();
  }
});
