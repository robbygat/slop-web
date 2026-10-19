# Turn-based multiplayer rollout

## Explicit game types (MCP 0.8.0)

The current MCP requires `game_type: "single-player"` or `"multiplayer"` for
template, check, send and publish. `slop_game_types` and the resource
`slop://guides/game-types` explain the choice before source is generated.
The setup page also requires a game-type choice before showing a starter prompt.
New source specs declare the type; existing untyped source retains its bytes and
is checked against its inferred capability. A project's type cannot change.

The web Multiplayer tab is `#/multiplayer` and lists published, enabled
`turns-v1`/`match` games only. Home and Play list single-player games. Legacy
real-time games, including Air Hockey, are not admitted to either selection.
Direct supported match links still open the authenticated room gate.

Release order: apply the reviewed MCP game-type SQL authority migration and
deploy this repository's `supabase/functions/slop-mcp` folder to the verified
Slop project before publishing MCP 0.8.0 through the normal Pages workflow.
Do not change old source digests or archives. The backend verifies the requested
type against source and stored project when creating, updating and publishing.
Record the final migration/deployment receipt separately; a local package check
does not demonstrate that the production gate is deployed.

## Initial platform support (MCP 0.7.0)

This change adds MCP 0.7.0, the pinned multiplayer-v1 SDK, generic turns-v1
admission, and a web room host. It does not deploy any service by itself.

The matching mobile implementation and database authority are in the Slop mobile
repository. Apply only the reviewed additive migration to the independently
verified Slop Supabase project yqlolbebqfsodqgjlbeh; never run a blanket DB push.
Deploy the reviewed game-bundle authority and this repository's slop-mcp
function together with the updated hosts. Live slop-mcp v18 source was read
back and all eight files matched this branch's normalized HEAD baseline before
these changes. Preserve its existing verify_jwt=false setting: the
handler performs the separate agent/owner/recorder authentication.

The existing .github/workflows/pages.yml builds the installable MCP archive,
builds the web app, and publishes through GitHub Pages on main. It does not
need a Cloudflare account. Keep cloudflare-deploy-blocked.mjs, the nonexistent
Cloudflare account pin and all Parky/work resource boundaries intact.
The updated setup page points to /downloads/slop-game-mcp-0.7.0.tgz; the
workflow rebuilds that archive from the pinned package source. Earlier downloads
are retained unchanged.

Web catalog games with multiplayer_protocol turns-v1 open a compact
create/join gate. Signed-in hosts bind the room, seat and immutable release URL
before loading the game; no authored message can choose an identity or room.
An older unsupported multiplayer contract displays an unavailable message.
Standalone private previews and recording retain explicit CPU practice.

The web controller polls full authoritative snapshots, rejects mismatched room,
seat, game and release identities, fences account changes, and routes typed
submissions through mp_turn_submit. The server validates turn/revision/epoch
and action schema; deterministic game logic derives the presentation and result.
It does not trust client-authored winners, grant competitive rewards or submit
match scores into the solo leaderboard. Both players may vote to rematch,
including after an early client-derived knockout. The new epoch resets the
runtime lifecycle and host result overlay once.

## Local verification

Run npm ci --ignore-scripts, npm ci --ignore-scripts --prefix mcp,
npm test --prefix mcp, npm test, npm run build, and node mcp/build-package.mjs.
Verified locally for MCP 0.8.0: all 141 MCP tests passed, including the 52-check
PostgreSQL migration/authority test; the full web suite passed 503 tests,
skipped 10 and had the one Windows
symlink permission failure described below. The production build and package
build both passed.

The browser integration fixture uses the real web match controller,
source-checked message parser and exact packaged SDK in two independent browser
contexts. Its RPC authority is in memory and never contacts a Slop service.
Set PUPPETEER_MODULE to an installed puppeteer-core ESM entrypoint and
BROWSER_PATH to Chrome or Edge, then run node tools/turn-match-browser-test.mjs.

It covers 200 ms RPC delay, alternating accepted turns, out-of-turn rejection,
complete-log reconnect and a two-vote rematch. The root game task also tests
Tankfall itself with the real local SQL authority.

Windows checkouts must preserve the LF bytes of all pinned runtimes. The new
.gitattributes entries cover the composed runtime, the existing persistent
runtime, and the existing SRI-pinned r128 host engine.
On this Windows host, the full web suite has one environment-only failure:
test/stage-android-download.test.mjs:119 requires a directory symlink and
returns EPERM without Windows symlink privileges. The GitHub Pages test runner
is Linux. Do not weaken that safety test to make this host's check pass.
