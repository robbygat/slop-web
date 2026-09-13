# Slop MCP bridge

Implemented and narrowly deployed; **not connected to a real account yet**.
This is a local MCP STDIO server plus one Supabase Edge REST service. It lets an
agent pair with an authenticated Slop account, send a private game revision, and
wait for the user to confirm a validated preview on their phone. It does not
publish, generate game assets, spend credits, or expose account/session tokens.

## Run the desktop MCP adapter

Requires Node 22.5+:

```sh
cd mcp
npm ci
npm test
node cli.mjs
```

### Install from the public repository

There is no published npm launcher yet. `@slop-game/mcp-bridge` is currently a
private package in this public repository, without a `bin` entry. Use the
reviewed source checkout; do not configure a nonexistent `npx` package or point
an MCP client directly at the REST bridge URL.

```sh
git clone https://github.com/robbygat/slop-web.git "$HOME/slop-mcp"
git -C "$HOME/slop-mcp" checkout --detach 0c7aef1d4c9b916e2278b265e7558428ea6e68ed
npm --prefix "$HOME/slop-mcp/mcp" ci --omit=dev
```

This pins the reviewed adapter rather than silently pulling later changes.
Choose a different new checkout directory if `~/slop-mcp` already exists.

**Codex** ([official MCP setup](https://developers.openai.com/codex/mcp/)):

```sh
codex mcp add slop --env SLOP_MCP_URL=https://api.slop.game/functions/v1/slop-mcp -- node "$HOME/slop-mcp/mcp/cli.mjs"
```

**Claude Code** ([official MCP setup](https://code.claude.com/docs/en/mcp)):

```sh
claude mcp add --transport stdio --scope user slop --env SLOP_MCP_URL=https://api.slop.game/functions/v1/slop-mcp -- node "$HOME/slop-mcp/mcp/cli.mjs"
```

**Cursor** uses the JSON below in `~/.cursor/mcp.json` (global) or
`.cursor/mcp.json` (project), as described in its
[official MCP setup](https://cursor.com/docs/mcp). Replace the argument with
the checkout's actual absolute path, for example
`/Users/yourname/slop-mcp/mcp/cli.mjs`; a JSON string does not expand `$HOME`.
If a desktop client cannot find Node, use the absolute path reported by
`command -v node` as its `command` value.

`node cli.mjs` speaks MCP on stdin/stdout; a blank terminal is expected. Configure
your agent's local MCP launcher with command `node` and the **absolute** path to
`mcp/cli.mjs`. Optional environment settings:

```json
{
  "mcpServers": {
    "slop": {
      "command": "node",
      "args": ["/absolute/path/to/slop-web-mcp/mcp/cli.mjs"],
      "env": {
        "SLOP_MCP_URL": "https://api.slop.game/functions/v1/slop-mcp"
      }
    }
  }
}
```

This is the common launcher JSON shape; an agent with a different settings
format still uses that same command/argument. `SLOP_MCP_CREDENTIALS` may select a
dedicated credential file. Default: `~/.config/slop/mcp.json`, mode 0600. Do not
check it in. It holds only this limited, revocable MCP grant and its pairing
poll secret, never the account's Supabase session or refresh token.

Available tools: `slop_pair`, `slop_connection_status`, `slop_send_draft`,
`slop_draft_status`, `slop_disconnect`. Start with `slop_pair`: it displays a real
640px QR image on the computer, generated locally. Scan it inside Slop's Build
camera flow, explicitly allow the named agent, then check real connection status.
The exact pairing link is included as an accessibility/manual fallback.
Use a stable project UUID, increasing integer revisions and a unique request
UUID. Reuse the same request UUID for an identical retry. A response saying
`awaiting_confirmation` is **not** a playable game. The owner confirms it on the
phone; only the bundle authority's accepted snapshot makes it ready.

The local adapter uses the pinned official
[MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server) STDIO
transport. This release does not advertise remote OAuth/Streamable HTTP support;
the Edge endpoint is a private REST bridge for the local adapter and phone.

## Deployment review

See [MOBILE-CONTRACT.md](MOBILE-CONTRACT.md) for exact requests/responses.
Deployment has three separately reviewable artifacts:

1. **One SQL migration**:
   `supabase/migrations/20260914170000_slop_mcp_bridge.sql`. It creates three
   private MCP tables and four scoped functions. Existing game/Storage RLS,
   publishing/review, billing, GIFs, and table grants remain untouched. Apply
   only this file after staging or transaction-rollback validation against the
   linked schema. **Do not run a bulk `supabase db push`: repository histories
   diverge.** Record this exact version through the established narrow process.
2. **One Edge function**: `supabase/functions/slop-mcp`. Its injected Supabase
   URL and named API keys remain server-only. It needs
   `verify_jwt = false` because opaque agent tokens are distinct from user JWTs;
   its handler explicitly verifies phone JWTs and uses private SQL grant hashes
   for agents. Review `supabase/slop-mcp.config.toml`. Proposed command after
   approval: `supabase functions deploy slop-mcp --project-ref
   yqlolbebqfsodqgjlbeh --no-verify-jwt`. Do not deploy unrelated functions.
3. **Phone/link delivery**: ship the authenticated mobile pairing/review UI,
   enable the deployment gate only after the endpoint works, and publish the
   updated AASA `/mcp/pair` entry + the character-free fallback page. iOS
   association caching may delay a newly added universal-link route; pasting
   the exact pairing link in the app is the fallback.

The service validates a phone JWT through Supabase Auth, then passes that exact
JWT to existing `games` owner insertion, private `game-drafts` uploads, and the
existing `game-bundle` preview action. The latter checks the full exact manifest
and mints an immutable fifteen-minute snapshot. Only then does a private
service-only RPC record readiness. A direct phone RPC cannot mark a game ready.
No borrowed user identity or service-role-as-user context is constructed.

### Narrow deployment commands

Keep `SLOP_MCP_ENABLED` off in released mobile builds during these steps. They
are deployment instructions, not a statement that deployment has happened.

1. From this repository, emit the rollback-only preflight:

   ```sh
   node mcp/deployment-preflight.mjs > /tmp/slop-mcp-deployment-preflight.sql
   ```

   From the already linked mobile checkout, run:

   ```sh
   supabase db query --linked --file /tmp/slop-mcp-deployment-preflight.sql --output json
   ```

   This substitutes the migration's final `COMMIT` with real role/RLS/grant,
   missing identity, nonexistent account, pending pairing, wrong poll secret,
   and unapproved connection assertions, then `ROLLBACK`. It creates no Auth
   accounts, approved connections, games, or uploads. Its last row must contain
   three nulls (`rolled_back_table`, `rolled_back_service`, `rolled_back_phone`).
   The generator itself is tested against PostgreSQL through PGlite.
2. Review and apply the one migration file using the linked checkout's
   `supabase db query --linked --file /absolute/path/to/slop-web/supabase/migrations/20260914170000_slop_mcp_bridge.sql --output json`.
   Record only version `20260914170000` through the project's established narrow
   migration-history process. Never push or repair unrelated versions.
3. From this repository, deploy exactly this Edge function:

   ```sh
   supabase functions deploy slop-mcp --project-ref yqlolbebqfsodqgjlbeh --no-verify-jwt --use-api
   ```

   The platform injects `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and
   `SUPABASE_SECRET_KEYS`. The two key variables are JSON dictionaries; this
   function reads each `default` key. It falls back to legacy
   `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` only when the corresponding
   dictionary is absent. New `sb_secret_` keys go in `apikey` only; phone
   requests still use the actual user's JWT in `Authorization`. See
   [Supabase's key migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
   No additional provider secret or OAuth client registration is needed.
   Never copy these values into agent
   setup, QR codes, or mobile configuration. `--use-api` bundles the three source
   modules without requiring local Docker. No `--prune` and no other functions.
4. Read `/functions/v1/slop-mcp/health` on `https://api.slop.game`: expect version1,
   `stdio-bridge`, and deployed true. A credential-free `/connections` must return
   401; an invalid opaque agent grant must fail. These checks prove deployment
   and denial behavior, not account pairing or playable delivery.

Before the real-device trial, the `game-drafts` bucket must remain private and
the existing `game-bundle` preview action must be deployed. Use a signed-in,
nonanonymous Slop account without a deletion intent. The phone sends its own
current session JWT; the desktop starts without account credentials. For the
trial build only, set `--dart-define=SLOP_MCP_ENABLED=true`, then perform the
consented end-to-end flow below. Enable general release only after it passes.

Before enabling production, exercise one real consenting test account end to
end: pair; scan + explicit approval; send a harmless text bundle; phone confirm;
open real private preview; retry same request; advance revision; revoke; verify
further uploads fail. Test a second account cannot approve/read the first one's
pending grant. This run has not performed those live account operations.

## Bounds and recovery

- Pair QR challenge: ten minutes, one account confirmation; connection: thirty
  days, revocable. Agents receive no private preview bearer URLs.
- Source-only bundles: at most 64 safe relative HTML/JS/CSS/JSON/SVG/TXT files,
  512 KB/file and 2 MB total. `index.html` required. Paid Store asset manifests,
  archives, binary uploads and remote-fetch tools are outside this release.
- Limits: ten active connections/account, twenty projects/account, sixty new
  revisions/day, twenty MB retained source/account. This initial bounded queue
  retains source for retry; a reviewed retention workflow is a later addition.
  Reaching its cap gives an honest limit error, never silent deletion.
- Every revision has a separate server-generated slug. The current project
  revision is checked before upload, preview, and finalization. A newer revision
  or revocation can leave a harmless owner-only partial draft, but never overwrites
  an earlier immutable snapshot or reports the old revision as newly ready.
- An interrupted phone confirmation retains a three-minute lease. The user can
  retry the same immutable source afterward. A lost success response can be
  reconciled through status and a new preview of that same latest revision.
- Revocation prevents future bridge operations and hides the grant's delivery
  queue; previously created private games and already issued fifteen-minute
  preview capabilities keep the existing game's lifecycle. Connection revocation
  does not retroactively revoke independent game preview capabilities.
- Rollback: first turn off the mobile feature and undeploy/disable only the Edge
  endpoint, then use [rollback.sql](rollback.sql) to revoke both entry points.
  Retain private data and idempotency records; do not replay earlier submissions
  by dropping/recreating tables. Existing private games are not deleted.

## Verified evidence

`npm test`: twenty-one behavioral tests covering actual SDK STDIO handshakes,
HTTP handler boundaries, and the real migration/functions in isolated PGlite
PostgreSQL. SQL tests exercise ownership, grants, anonymous/deleted-account
denial, expiry, request replay/conflict, stale revisions, leases, revocation and
the service-only ready transition. Upstream Storage/Auth/preview calls are
injected fixtures in HTTP tests; they are not evidence of a live phone scan.
The actual Edge fetch adapter is also exercised with injected upstream responses.
QR tests decode the generated PNG and verify the exact intended challenge URL.
`npx --yes deno check supabase/functions/slop-mcp/index.ts` passes.

Initial read-only linked-schema preflight on 2026-09-14 found no MCP objects
before deployment. The current private-bundle columns and eligibility helpers exist,
and owner draft insertion + private draft Storage writes have compatible live
policies. The old web `api.publishGame` uses a direct-public insert; this bridge
deliberately avoids that obsolete path. No account data, claims or credentials
were changed during verification. Live PostgREST/Edge limits and full installed
Simulator-to-service delivery still require the deployment check above.

A fresh 2026-09-14 readiness check confirms origin/main is
`0c7aef1d4c9b916e2278b265e7558428ea6e68ed` and the repository is public. The
production `/mcp/pair` fallback matches this repository byte for byte, and AASA
already includes `/mcp/pair` for `6S8Z64V9JP.game.slop.slop`. The root deployment
then applied and recorded only migration `20260914170000`, and deployed only
`slop-mcp`. Health returned 200 and a credential-free connection request 401.
The first live unapproved SDK pairing exposed a legacy Edge credential mismatch:
`slop_pair` returned `authentication_required` before a challenge was created.
The named-key compatibility fix is covered by both current and legacy Edge
adapter tests, and the same single function was then redeployed. A fresh real
SDK STDIO smoke against `api.slop.game` verified all five tools, successful
pending pairing, the actual 640×640 PNG decoding to its exact challenge URI,
0600 temporary credentials, and a second server poll still reporting pending.
A wrong poll secret returned 403 `invalid_pairing`; the unapproved agent token
returned 403 `invalid_connection`, and draft listing was denied. Temporary
local credentials were removed without logging tokens, codes, or the QR.
Only one ownerless ten-minute challenge was created. No account was approved,
read, or given a game upload; no private preview was minted.

The real phone scan → explicit approval → draft delivery → validated private
preview → retry/new revision → revoke trial is still outstanding. The Mac was
locked before that UI trial, and the mobile deployment gate remains false.
General enablement must wait for that trial. Health and a pending QR alone
never mean Connected or prove private draft delivery.
