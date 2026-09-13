import test from "node:test";
import assert from "node:assert/strict";
import {
  BridgeError,
  sha256,
  trustedPreview,
  validateDraft,
} from "../../supabase/functions/slop-mcp/contract.mjs";
import { createHandler } from "../../supabase/functions/slop-mcp/handler.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const draftInput = {
  project_id: id,
  request_id: id,
  revision: 1,
  name: "Pocket bounce",
  files: { "index.html": "<canvas></canvas>", "game.js": "const score=0;" },
};
const request = (path, { token = "phone.jwt", body, headers = {} } = {}) =>
  new Request(`https://api.slop.game/functions/v1/slop-mcp${path}`, {
    method: body == null ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body == null ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
test("canonical digest matches exact versioned UTF-8 manifest; rejects traversal, oversized and malformed source", async () => {
  const valid = await validateDraft(draftInput);
  await assert.rejects(
    () =>
      validateDraft({
        ...draftInput,
        files: { ...draftInput.files, "styles.css": "" },
      }),
    /empty_file/,
  );
  assert.equal(
    valid.digest,
    await sha256(
      valid.manifest.map((e) => `${e.path}:${e.bytes}:${e.sha256}`).join("\n"),
    ),
  );
  const reverse = await validateDraft({
    ...draftInput,
    files: { "game.js": "const score=0;", "index.html": "<canvas></canvas>" },
  });
  assert.equal(valid.digest, reverse.digest);
  for (
    const path of [
      "../index.html",
      "/index.html",
      "a//b.js",
      "a/../x.js",
      ".env",
      "file.exe",
      "a%2fx.js",
    ]
  ) {
    await assert.rejects(
      () =>
        validateDraft({
          ...draftInput,
          files: { ...draftInput.files, [path]: "x" },
        }),
      /invalid_path/,
    );
  }
  await assert.rejects(
    () =>
      validateDraft({
        ...draftInput,
        files: { "index.html": "x".repeat(512001) },
      }),
    /bundle_too_large/,
  );
  await assert.rejects(
    () => validateDraft({ ...draftInput, revision: 0 }),
    /invalid_request/,
  );
  await assert.rejects(
    () => validateDraft({ ...draftInput, files: { "a.js": "hi" } }),
    /invalid_bundle/,
  );
});
test("pair start never stores raw secrets; status requires poll bearer, phone review requires actual verified JWT", async () => {
  const calls = [];
  const handler = createHandler({
    service: async (action, input) => {
      calls.push({ action, input });
      return { pairing_id: id, status: "pending" };
    },
    verifyUser: async (token) => {
      calls.push({ token });
      throw new BridgeError("authentication_required", 401);
    },
  });
  const response = await handler(
    request("/pair/start", {
      token: null,
      body: { client_name: "My agent", access_token_hash: "a".repeat(64) },
    }),
  );
  assert.equal(response.status, 201);
  const pair = await response.json();
  assert.equal(
    pair.confirmation_uri,
    `https://slop.game/mcp/pair#id=${id}&code=${pair.confirmation_code}`,
  );
  assert.equal(calls[0].input.code_hash, await sha256(pair.confirmation_code));
  assert.equal(calls[0].input.poll_hash, await sha256(pair.poll_token));
  assert.ok(!JSON.stringify(calls[0]).includes(pair.poll_token));
  assert.equal(
    (await handler(request(`/pair/status?pairing_id=${id}`, { token: null })))
      .status,
    401,
  );
  assert.equal(
    (await handler(
      request(`/pair/review?pairing_id=${id}&code=${pair.confirmation_code}`),
    )).status,
    401,
  );
});
test("agent uploads hash bearer, ignore supplied owner and never touch game storage before phone approval", async () => {
  const calls = [];
  const handler = createHandler({
    service: async (action, input) => {
      calls.push({ action, input });
      return { status: "awaiting_confirmation" };
    },
  });
  const token = "slop_mcp_" + "b".repeat(64);
  const response = await handler(
    request("/agent/drafts", {
      token,
      body: { ...draftInput, owner_id: "other" },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls[0].action, "send_draft");
  assert.equal(calls[0].input.token_hash, await sha256(token));
  assert.equal(calls[0].input.owner_id, undefined);
});
test("confirmed preview uses same JWT, exact digest, lease checks; only private service finalizes", async () => {
  const validated = await validateDraft(draftInput);
  const calls = [];
  const slug = "mcp-" + "a".repeat(32);
  const draft = {
    ...validated,
    submission_id: id,
    owner_id: id,
    slug,
    lease: id,
  };
  const preview = {
    ok: true,
    url: `https://api.slop.game/functions/v1/game-bundle/preview/${
      "c".repeat(64)
    }/${slug}/1.0.0/index.html`,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const deps = {
    verifyUser: async (token) => calls.push(["verify", token]),
    phone: async (token, action, input) => {
      calls.push([action, token, input]);
      return action === "claim_draft" ? draft : { ok: true };
    },
    ensureDraft: async (token, input) => {
      calls.push(["insert", token, input]);
      return { id };
    },
    uploadFiles: async (token, slug, files) =>
      calls.push(["upload", token, slug, files]),
    preview: async (token, input) => {
      calls.push(["preview", token, input]);
      return preview;
    },
    service: async (action, input) => {
      calls.push([action, input]);
      return { status: "ready", owner_id: id, game_id: id };
    },
  };
  const response = await createHandler(deps)(
    request("/drafts/confirm", {
      body: { submission_id: id, expected_digest: validated.digest },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).preview_url, preview.url);
  assert.deepEqual(calls.map((c) => c[0]), [
    "verify",
    "claim_draft",
    "insert",
    "check_lease",
    "upload",
    "check_lease",
    "preview",
    "finish_draft",
  ]);
  assert.ok(calls.slice(0, -1).every((c) => c[1] === "phone.jwt"));
  assert.equal(calls[6][2].expected_bundle_digest, validated.digest);
  assert.deepEqual(calls[6][2].expected_bundle_manifest, validated.manifest);
  assert.equal(calls.at(-1)[1].owner_id, id);
});
test("preview failure, external URL, expired capability, or revocation never finalizes ready", async () => {
  const validated = await validateDraft(draftInput);
  const slug = "mcp-" + "a".repeat(32);
  const valid = {
    ok: true,
    url: `https://api.slop.game/functions/v1/game-bundle/preview/${
      "c".repeat(64)
    }/${slug}/1.0.0/index.html`,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  for (
    const preview of [{}, {
      ...valid,
      url: valid.url.replace("api.slop.game", "evil.example"),
    }, { ...valid, expires_at: "2000-01-01T00:00:00Z" }]
  ) {
    let finalized = false;
    const response = await createHandler({
      verifyUser: async () => id,
      phone: async (_token, action) =>
        action === "claim_draft"
          ? { ...validated, slug, submission_id: id, owner_id: id, lease: id }
          : { ok: true },
      ensureDraft: async () => ({ id }),
      uploadFiles: async () => {},
      preview: async () => preview,
      service: async () => {
        finalized = true;
      },
    })(
      request("/drafts/confirm", {
        body: { submission_id: id, expected_digest: validated.digest },
      }),
    );
    assert.equal(response.status, 503);
    assert.equal(finalized, false);
  }
  let uploaded = false;
  const revoked = await createHandler({
    verifyUser: async () => id,
    phone: async (_token, action) => {
      if (action === "claim_draft") {
        return {
          ...validated,
          slug,
          submission_id: id,
          owner_id: id,
          lease: id,
        };
      }
      throw new BridgeError("invalid_connection", 403);
    },
    ensureDraft: async () => ({ id }),
    uploadFiles: async () => {
      uploaded = true;
    },
  })(
    request("/drafts/confirm", {
      body: { submission_id: id, expected_digest: validated.digest },
    }),
  );
  assert.equal(revoked.status, 403);
  assert.equal(uploaded, false);
  assert.equal(
    trustedPreview({ ...valid, url: valid.url + "?token=x" }, slug, [
      "https://api.slop.game",
    ]),
    false,
  );
});
test("cross-origin, oversized streaming body and unknown routes fail closed without exposing upstream error", async () => {
  const handler = createHandler({
    verifyUser: async () => {
      throw new Error("secret upstream credential");
    },
  });
  assert.equal(
    (await handler(
      request("/health", { headers: { origin: "https://evil.example" } }),
    )).status,
    403,
  );
  const error = await handler(request("/drafts"));
  assert.deepEqual(await error.json(), {
    ok: false,
    code: "service_unavailable",
  });
  const response = await handler(
    new Request("https://api.slop.game/functions/v1/slop-mcp/pair/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: " ".repeat(2_300_001),
    }),
  );
  assert.equal(response.status, 413);
});
