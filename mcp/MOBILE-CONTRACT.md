# Slop MCP bridge v1 — web and mobile

Base: `https://api.slop.game/functions/v1/slop-mcp`. API responses return JSON and
`Cache-Control: no-store`, except the public `GET /authorize` redirect described below. Phone routes require `Authorization: Bearer <current
Supabase access JWT>`. Never send refresh tokens, user IDs as authorization, or
the desktop connection token. The exact browser Origin `https://slop.game` may
call authenticated owner routes using the same user JWT. Browser requests to
agent routes, pairing creation, and polling secrets are denied. Other browser
origins, including `null`, are denied.

The mobile UI must enable this only after deployment is verified. HTTP health is
not connection proof; only an account-bound connection with `status: active` is.
Clear state and discard late responses when the authenticated account changes.

## Pair a desktop

Local MCP tool `slop_pair` displays a locally generated PNG QR for the phone's
in-app camera scanner, plus its exact ten-minute URL as a manual fallback:
`https://slop.game/mcp/pair#id=<uuid>&code=<32 lowercase hex>`.
Only accept that exact HTTPS host and path, no userinfo/port/query or other
fragment keys. Opening/scanning this link only opens a review; it never approves.
The fragment contains a confirmation challenge, not the desktop access token.

- `GET /pair/review?pairing_id=<uuid>&code=<32hex>` shows:
  `{pairing_id, owner_id, connection_id, client_name, status, approved_at,
  expires_at, pairing_expires_at, last_seen_at, requires_confirmation,
  scopes:["drafts:send","drafts:status"]}`.
- Explain the requested permission: this named agent can send private game drafts
  and read their delivery status. Each revision still requires phone approval.
  Treat client_name as plain untrusted text. Explicit "Allow this agent" invokes
  `POST /pair/confirm` with `{pairing_id,code}`. Same response, now `status:active`,
  `requires_confirmation:false`, expiry thirty days from approval.
- `GET /connections` returns `{owner_id, connections:[{connection_id,client_name,
  status,approved_at,expires_at,last_seen_at,scopes}]}`. Status is `pending`,
  `active`, `expired`, or `revoked`; only active is a usable connection.
- `POST /connections/revoke` with `{connection_id}` returns connection plus
  `owner_id`. Revocation preserves existing private games.

## Receive a private draft

- `GET /drafts` returns `{owner_id,submissions:[...]}` for active grants, latest
  fifty by creation. Each submission:
  `{submission_id,project_id,request_id,revision,name,description,digest,bytes,
  status,slug,game_id,created_at,ready_at}`. Status is `awaiting_confirmation`,
  `validating`, or `ready`. game_id and ready_at are null until validation.
- Review the name, agent-created nature and revision; an explicit "Try on my
  phone" invokes `POST /drafts/confirm` with `{submission_id,expected_digest}`.
  It reserves the current revision, registers an owner-only draft using existing
  game RLS, uploads bounded UTF-8 files to private `game-drafts`, and requests the
  existing game-bundle authority's exact-manifest immutable preview.
- Success is the submission fields plus `{owner_id,preview_url,
  preview_expires_at}`. Only the phone receives that fifteen-minute capability.
  Open it with the existing private preview runtime, not the published feed or
  share route. A ready private draft has **no public share URL**. Reconfirm the
  same latest submission to mint a fresh preview after expiry. Pending revisions
  never appear as public games, trigger publication, award XP, or spend credits.
- Old revisions are rejected after a newer revision is submitted. Each revision
  uses its own draft slug, so a previous valid preview remains immutable. Keep
  the last valid preview and show a clear retry if upload/validation fails.

Error body: `{ok:false,code:<stable code>}`. Auth errors 401/403, state conflicts
409, capacity/rate 429, invalid payload 400/413, backend unavailable 503. Codes:
`authentication_required`, `account_unavailable`, `invalid_pairing`,
`pairing_expired`, `invalid_connection`, `connection_not_found`,
`connection_limit`, `request_conflict`, `revision_conflict`,
`revision_superseded`, `rate_limited`, `project_limit`, `confirmation_busy`,
`confirmation_expired`, `version_changed`, `draft_unavailable`,
`upload_not_confirmed`, `preview_not_confirmed`, `upstream_unavailable`,
`service_unavailable`. A failed upload retains its three-minute reservation;
explain retry shortly instead of presenting an unverified connection or preview.

## Desktop-only endpoints

`POST /pair/start` receives `{client_name,access_token_hash}` and returns
`{pairing_id,status:"pending",expires_at,confirmation_code,poll_token,
confirmation_uri,authorization_uri}`. The local adapter generates/stores its own secret first.
`GET /pair/status?pairing_id=...` authenticates with the poll token and returns
pending/approved/expired/revoked. The token itself is never returned again.
Opaque `slop_mcp_<64hex>` authenticates `/agent/status`, `/agent/drafts` GET/POST,
and `/agent/revoke` POST. Agent requests cannot supply an effective owner.

## Browser authorization and publication

`GET /authorize` returns a fixed 303 redirect to `https://slop.game/mcp/pair`,
with no-store and no-referrer. Its absent redirect fragment preserves the
original `#id=<uuid>&code=<32hex>` in the browser. Opening it only reviews the
request; explicit signed-in owner approval is still required. The local tool
returns this API-host authorization link alongside the canonical native QR.

The website owner may play a confirmed private draft, capture its real canvas,
reserve a game link, and explicitly submit through the existing game-bundle
review authority. Agents receive no publication capability. Covers use
720×1280, 1280×720 or 1280×1280; corresponding GIFs use 360×640, 640×360 or
640×640, with 3–40 frames and at most 2 MiB. Exact source digests, storage byte
receipts and review nonce checks remain mandatory.
