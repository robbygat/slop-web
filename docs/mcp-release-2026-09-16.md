# MCP web and mobile release — 2026-09-16

The `slop-mcp` Edge service is deployed to project
`yqlolbebqfsodqgjlbeh`, version 6, with gateway JWT verification disabled.
The handler independently verifies Slop user sessions and opaque agent grants.
No database migration or unrelated Edge function was deployed in this change.

## Integration changes

- Exact `https://slop.game` origin may call only owner review, approval,
  connections, drafts and health routes. Other browser origins, agent routes,
  pairing creation and secret polling fail closed.
- Modern Supabase publishable/secret key maps take precedence over legacy
  injected keys. Server API secrets are sent only as server `apikey` headers;
  each owner request keeps its original user JWT. This fixed an actual live
  `authentication_required` failure on public pairing creation.
- Private source uploads use the same owner-issued
  `reserve_game_draft_upload` manifest and `slop_upload_id` metadata as mobile.
  Another owner's or malformed reservation cannot write bytes or finalize ready.
- Adapter 0.2.0 exposes the `slop-mcp` binary, with a versioned download at
  `/downloads/slop-game-mcp-0.2.0.tgz`. `npm --prefix mcp run package` validates
  the five-file allowlist before writing the public artifact. It contains no
  tests, deployment source, credentials, or local state.
- Web setup supplies separate Codex, Cursor and Claude Code instructions;
  native and web inboxes use the same authenticated owner contracts.

## Automated verification

`npm --prefix mcp test`: 24 passing tests, including actual SDK STDIO handshake,
QR decoding to the exact challenge, migration/authority checks in PGlite,
owner isolation, anonymous/deleting account denial, replay/conflict, revisions,
leases, revocation, preview receipt validation, modern key headers, upload
reservation ownership and browser origin boundaries.

`npx --yes deno check supabase/functions/slop-mcp/index.ts`: passed before the
narrow deployment. Package audit found zero vulnerabilities at build time.

An independent process installed the actual versioned tarball with `npx`,
launched its binary and connected through the official MCP SDK: version 0.2.0,
five tools, and honest `not_paired` status all passed. The installed package
also created a live production pairing challenge and returned a PNG QR that
decoded to the exact phone approval URI; this remained pending and granted no
agent authority.

## Live verification

A clearly labeled temporary QA account was created with no email delivery,
then signed in through the normal password endpoint. No existing user session
was borrowed. No paid generation, purchase, public game or user email occurred.

The actual local STDIO adapter and production Edge/SQL/Storage service passed:

1. SDK initialization and five-tool discovery.
2. A real QR/pairing challenge, initially pending.
3. Owner review without prematurely granting agent access.
4. Explicit owner approval and identical approval retry.
5. Active agent status.
6. One harmless private Pocket Bounce text bundle.
7. Identical submission retry without a duplicate game.
8. Owner confirmation using the real upload reservation, exact digest and
   existing game-bundle authority.
9. A real immutable private preview returning HTTP 200, matching game HTML and
   `Cache-Control: no-store`.
10. Agent status `ready` with no preview capability disclosed.

Production also denied an unauthenticated owner request, untrusted browser
origins (including `null`), and a browser request to an agent endpoint. The
allowed owner preflight returned 204.

The final signed Android APK completed actual in-app owner approval of a second
agent connection. Its scanner opened, then the exact QR URI was delivered through
an Android intent in the headless emulator. Camera decoding was not claimed.
The native owner confirmed Phone Bounce, opened its private WebView, and three
actual Android taps advanced the displayed counter from 0 to 3. The mobile release
also corrected stale trusted SDK metadata that initially prevented any native
player from loading; this was independent of the MCP authority.

A second real revision was submitted through the installed tarball with separate
HTML, JavaScript and CSS. Owner confirmation returned ready; each immutable file
returned HTTP 200 with exact bytes. This caught and fixed a real MIME mismatch:
JavaScript must use `text/javascript; charset=utf-8`, matching mobile and the
strict game-bundle gateway. The MCP Edge adapter and website creator uploader now
use the same type. All authority tests passed before version 6 was deployed.

The website's exact `privatePreview` module also prepared the single authorized
free Astra candidate through its owner reservation, four uploads and immutable
preview receipt. Twelve focused web-contract tests cover account-switch isolation,
publication receipt fields, expiration, bundle digest, player sandbox boundaries,
OAuth pairing restoration, accepted-head selection and the JavaScript MIME regression. No paid generation
was requested. The real browser playtest/capture and feedback advanced that
Astra run to ready (version 46); its accepted head is Pocket Hop, version 1.
The website reloads accepted metadata even when its revision ID matches the
previous preview candidate. The game remains private and was not published.

The temporary account and private drafts remain while browser creator checks
finish. Live revocation, account cleanup and public download delivery must be
recorded separately when completed.

## Final bridge and owner publication follow-up

- Production slop-mcp v7 adds `GET /authorize`, a fixed no-store 303 redirect to the existing web pairing review page. Actual browser navigation retained the fake QA id/code fragment across the API→site redirect. Agent pairing still returns the unchanged native-compatible QR URL plus an API-hosted authorization URL; neither opens an approval automatically.
- The downloadable 0.2.0 adapter now includes `slop_game_template`, supplying the unchanged native creator-v1 runtime with a canvas example that reports ready only after drawing, scores during play, finishes once and supports restart. The package contains seven allowlisted runtime/readme files, no credentials/tests/backend sources.27 MCP tests pass including real SDK transport, QR decode, substituted authorization rejection and template lifecycle.
- The installed tarball's template was sent as a third private QA revision through the live service. HTML, game.js and canonical slop.js all returned200 with exact stored bytes; only the owner received the immutable preview capability.
- Web owner publication uses the ordinary mobile `game-bundle/submit_review` path for MCP-owned game rows, not creator project IDs. It verifies the owner and approved source digest, records a real captured cover and gameplay clip through native media receipt RPCs, and waits for an authoritative review receipt. The inbox now hides superseded revisions and displays actual pending/published state. Live public submission is intentionally excluded from temporary QA; final capture/media preparation verification is pending below.

## Canonical capture and publication validation

The mobile authority migration `20260916200000_canonical_preview_orientations.sql`
was exercised twice in a real production PostgreSQL transaction and rolled back,
then applied alone. It expands only the two dimension constraints and two exact
receipt/publication guards. Shapes are 360×640, 640×360 and 640×640; frames remain
3–40 and GIF bytes remain bounded to 2 MiB. ACLs, owners, security definer and
search paths were checked unchanged. The game-bundle decoder now accepts the
matching doubled cover shapes and rejects arbitrary device dimensions. Local
publication10/10 and decoder/storage9/9 tests passed.

The real canonical MCP template's unchanged mobile `creator-v1.js` was delivered
as `slop.js`, explicitly approved, played in the website and captured through the
actual game canvas. Fresh visible output was720×1280 JPEG (24,075bytes) and a
12-frame360×640 GIF (144,029bytes). Owner-bound reservations, immutable storage
uploads, source digest and both captured-media receipts passed live. These
five actual stored files were downloaded again, hashed and decoded before the
real production `finalize_game_bundle_submission` was exercised inside a
transaction. It produced `pending_review` and an authoritative review nonce for
the expected owner, build and media. ROLLBACK preserved the private draft with
zero activity rows and zero queued pushes.

A committed QA submission was intentionally not performed: the current review
submission trigger generates admin/moderator activity and the activity trigger
queues external device pushes. The rollback test proves the database transition
without notifying staff. This is distinct from a committed Edge publication.

MCP posting additionally requires the unchanged9612-byte native SDK (SHA-256
`cf80d35f8be857d6e092460b362aaf0bd7238f34085d20c15ae376e994922d2f`), its explicit
local script inclusion and creator runtime metadata. Both the website preflight
and the game-bundle submission path for server-generated MCP slugs enforce it.
Receiving/previewing older private drafts and ordinary legacy game submissions
remain supported. The repair message directs coding agents to
`slop_game_template`. Two web policy tests and three tests of the actual Edge
submission function cover valid SDKs, missing/tampered/unlinked SDKs, ordinary
games and stale digests.

The final deployed versions are slop-mcp7 and game-bundle39, both ACTIVE with
custom authentication enabled inside their functions. The live negative test
submitted only the controlled SDK-free private QA draft and received400 with
the template repair instruction; its owner/status/empty review nonce remained
unchanged. The current valid SDK draft and QA account remain private for the
remaining website checks.

Published MCP recovery now recognizes the mobile finalizer's cleared queue
nonce only when the protected immutable release path and exact stored manifest
match the originally approved source digest. Pending review still requires the
actual server nonce. Two additional receipt tests cover this distinction.

### Temporary integration account cleanup

After the final version-2 creator playtest and same-frame SDK replay test, both controlled MCP grants were revoked. Production currently exposes the older `authorize_account_delete` / `delete_account` path, not the pulled mobile source's `request_account_deletion` RPC. Cleanup used those existing owner-authorized functions and game-bundle's owner deletion path; no unrelated account-maintenance migration was deployed.

The cleanup removed eight private QA games, eleven community-score rows belonging only to the temporary QA account, and three diagnostic preview roots. The final database check confirmed zero QA auth accounts, games, connections and scores. All three official curated desktop originals remained published under their existing owner. Local evidence: `/tmp/slop-web-redesign/qa-cleanup-result.json`. No temporary QA review submission was committed or left in the public feed.
