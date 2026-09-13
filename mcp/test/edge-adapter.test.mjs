import test from "node:test";
import assert from "node:assert/strict";
import { validateDraft } from "../../supabase/functions/slop-mcp/contract.mjs";

for (const keyMode of ["legacy", "named"]) {
  test(`real Edge adapter ${keyMode} keys preserve phone RLS and server-only ready commit`, async () => {
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
    let handler, inserted = false;
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
            ...(keyMode === "named"
              ? {
                SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
                  default: "sb_publishable_current",
                }),
                SUPABASE_SECRET_KEYS: JSON.stringify({
                  default: "sb_secret_current",
                }),
              }
              : {}),
          })[key],
      },
      serve: (value) => {
        handler = value;
      },
    };
    globalThis.fetch = async (raw, options) => {
      const url = new URL(raw), path = url.pathname;
      seen.push({ path, ...options });
      assert.equal(
        options.headers.apikey,
        path === "/rest/v1/rpc/mcp_service"
          ? (keyMode === "named" ? "sb_secret_current" : "test-service")
          : (keyMode === "named" ? "sb_publishable_current" : "test-anon"),
      );
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
          inserted
            ? [{ id: owner, slug, owner_id: owner, status: "draft" }]
            : [],
        );
      }
      if (path.startsWith("/storage/")) {
        assert.equal(options.headers.Authorization, "Bearer phone-access");
        const file = path.split("/").at(-1);
        assert.equal(options.body, validated.files[file]);
        assert.equal(options.headers["x-upsert"], "true");
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
        assert.equal(
          options.headers.Authorization,
          keyMode === "named" ? undefined : "Bearer test-service",
        );
        assert.equal(JSON.parse(options.body).p_action, "finish_draft");
        return Response.json({ status: "ready", owner_id: owner });
      }
      throw new Error(`Unexpected test route ${path}`);
    };
    try {
      await import(
        `../../supabase/functions/slop-mcp/index.ts?keys=${keyMode}`
      );
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
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.Deno = originalDeno;
    }
  });
}
