import test from "node:test";
import assert from "node:assert/strict";
import { validateDraft } from "../../supabase/functions/slop-mcp/contract.mjs";

test('modern platform keys keep server secrets in apikey and user JWTs in Authorization', async () => {
  const originalDeno=globalThis.Deno, originalFetch=globalThis.fetch;
  let handler;const calls=[];
  globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://backend.example',SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_publishable_test"}',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_test"}',SUPABASE_ANON_KEY:'revoked-anon',SUPABASE_SERVICE_ROLE_KEY:'revoked-service'})[key]},serve:value=>handler=value};
  globalThis.fetch=async(url,options)=>{
    calls.push({url,...options});
    if(url.endsWith('/rest/v1/rpc/mcp_service')){
      assert.equal(options.headers.apikey,'sb_secret_test');assert.equal(options.headers.Authorization,undefined);assert.equal(options.redirect,'error');
      return Response.json({pairing_id:'11111111-1111-4111-8111-111111111111',status:'pending'});
    }
    assert.equal(options.headers.apikey,'sb_publishable_test');assert.equal(options.headers.Authorization,'Bearer owner.jwt');
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner',is_anonymous:false});
    return Response.json({owner_id:'owner',connections:[]});
  };
  try{
    await import('../../supabase/functions/slop-mcp/index.ts?modern-key-test');
    const pair=await handler(new Request('https://backend.example/functions/v1/slop-mcp/pair/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Key migration test',access_token_hash:'a'.repeat(64)})}));
    assert.equal(pair.status,201);
    const owner=await handler(new Request('https://backend.example/functions/v1/slop-mcp/connections',{headers:{Authorization:'Bearer owner.jwt'}}));assert.equal(owner.status,200);assert.equal(calls.length,3);
    assert.equal(JSON.stringify(calls.filter(c=>!c.url.endsWith('/mcp_service'))).includes('sb_secret_test'),false);
  }finally{globalThis.Deno=originalDeno;globalThis.fetch=originalFetch;}
});

test("real Edge adapter uses phone RLS for bytes and server authority only for ready commit", async () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const slug = "mcp-" + "a".repeat(32);
  const validated = await validateDraft({
    project_id: owner,
    request_id: owner,
    revision: 1,
    name: "Tiny game",
    description: "A test",
    files: {
      "index.html": "<canvas></canvas>",
      "game.js": 'const text="hello";',
    },
  });
  const draft = {
    ...validated,
    submission_id: owner,
    owner_id: owner,
    slug,
    lease: owner,
  };
  let handler, inserted = false, badReservation = false;
  const seen = [];
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  globalThis.Deno = {
    env: {
      get: (key) =>
        ({
          SUPABASE_URL: "https://backend.example",
          SUPABASE_ANON_KEY: "test-anon",
          SUPABASE_SERVICE_ROLE_KEY: "test-service",
        })[key],
    },
    serve: (value) => {
      handler = value;
    },
  };
  globalThis.fetch = async (raw, options) => {
    const url = new URL(raw), path = url.pathname;
    seen.push({ path, ...options });
    if (path === "/auth/v1/user") {
      return Response.json({ id: owner, is_anonymous: false });
    }
    if (path === "/rest/v1/rpc/mcp_phone") {
      const input = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, "Bearer phone-access");
      return Response.json(
        input.p_action === "claim_draft" ? draft : { ok: true },
      );
    }
    if (path === "/rest/v1/games") {
      assert.equal(options.headers.Authorization, "Bearer phone-access");
      if (options.method === "POST") {
        const row = JSON.parse(options.body);
        assert.equal(row.owner_id, owner);
        assert.equal(row.status, "draft");
        assert.ok(!row.html.includes("canvas"));
        inserted = true;
        return new Response(null, { status: 204 });
      }
      return Response.json(
        inserted ? [{ id: owner, slug, owner_id: owner, status: "draft" }] : [],
      );
    }
    if (path === "/rest/v1/rpc/reserve_game_draft_upload") {
      assert.equal(options.headers.Authorization, "Bearer phone-access");
      const manifest = JSON.parse(options.body);
      assert.equal(manifest.p_slug, slug);
      assert.deepEqual(manifest.p_objects.map(item => item.bytes),
        Object.values(validated.files).map(body => new TextEncoder().encode(body).length));
      return Response.json({owner_id: badReservation ? 'another-owner' : owner, slug, object_count: 2,
        upload_id: owner, expires_at: new Date(Date.now()+600000).toISOString()});
    }
    if (path.startsWith("/storage/")) {
      assert.equal(options.headers.Authorization, "Bearer phone-access");
      const file = path.split("/").at(-1);
      assert.equal(options.body, validated.files[file]);
      assert.equal(options.headers["x-upsert"], "true");
      assert.deepEqual(JSON.parse(atob(options.headers["x-metadata"])), {slop_upload_id: owner});
      return Response.json({ Key: path });
    }
    if (path === "/functions/v1/game-bundle") {
      assert.equal(options.headers.Authorization, "Bearer phone-access");
      const input = JSON.parse(options.body);
      assert.equal(input.expected_bundle_digest, validated.digest);
      return Response.json({
        ok: true,
        url: `https://api.slop.game/functions/v1/game-bundle/preview/${
          "c".repeat(64)
        }/${slug}/1.0.0/index.html`,
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
    }
    if (path === "/rest/v1/rpc/mcp_service") {
      assert.equal(options.headers.Authorization, "Bearer test-service");
      assert.equal(JSON.parse(options.body).p_action, "finish_draft");
      return Response.json({ status: "ready", owner_id: owner });
    }
    throw new Error(`Unexpected test route ${path}`);
  };
  try {
    await import("../../supabase/functions/slop-mcp/index.ts");
    const response = await handler(
      new Request(
        "https://api.slop.game/functions/v1/slop-mcp/drafts/confirm",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer phone-access",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            submission_id: owner,
            expected_digest: validated.digest,
          }),
        },
      ),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ready");
    assert.equal(
      seen.filter((row) => row.path.startsWith("/storage/")).length,
      2,
    );
    assert.ok(
      seen.filter((row) => !row.path.endsWith("/mcp_service")).every((row) =>
        row.headers.Authorization !== "Bearer test-service"
      ),
    );
    badReservation = true;
    const beforeStorage = seen.filter(row => row.path.startsWith('/storage/')).length;
    const beforeReady = seen.filter(row => row.path.endsWith('/mcp_service')).length;
    const denied = await handler(new Request('https://api.slop.game/functions/v1/slop-mcp/drafts/confirm',{
      method:'POST',headers:{Authorization:'Bearer phone-access','content-type':'application/json'},
      body:JSON.stringify({submission_id:owner,expected_digest:validated.digest}),
    }));
    assert.equal(denied.status,503);
    assert.equal((await denied.json()).code,'upload_not_confirmed');
    assert.equal(seen.filter(row=>row.path.startsWith('/storage/')).length,beforeStorage);
    assert.equal(seen.filter(row=>row.path.endsWith('/mcp_service')).length,beforeReady);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
  }
});
