# Slop MCP bridge

Implemented in this branch; **not deployed or connected to a real account yet**.
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
   URL, anon key and service-role key remain server-only. It needs
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

`npm test`: nineteen behavioral tests covering actual SDK STDIO handshakes,
HTTP handler boundaries, and the real migration/functions in isolated PGlite
PostgreSQL. SQL tests exercise ownership, grants, anonymous/deleted-account
denial, expiry, request replay/conflict, stale revisions, leases, revocation and
the service-only ready transition. Upstream Storage/Auth/preview calls are
injected fixtures in HTTP tests; they are not evidence of a live phone scan.
The actual Edge fetch adapter is also exercised with injected upstream responses.
QR tests decode the generated PNG and verify the exact intended challenge URL.
`npx --yes deno check supabase/functions/slop-mcp/index.ts` passes.

Read-only linked-schema preflight on 2026-09-14 confirms the MCP objects do not
exist yet, the current private-bundle columns and eligibility helpers exist,
and owner draft insertion + private draft Storage writes have compatible live
policies. The old web `api.publishGame` uses a direct-public insert; this bridge
deliberately avoids that obsolete path. No account data, claims or credentials
were changed during verification. Live PostgREST/Edge limits and full installed
Simulator-to-service delivery still require the deployment check above.
