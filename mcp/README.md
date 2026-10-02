# Slop MCP

Build a little mobile game with your coding agent, then playtest it in Slop on
your phone or at [slop.game](https://slop.game/#/connect). The local MCP adapter
connects to Slop's deployed account and private-game services. You approve the
computer once, and review each draft revision before it becomes playable.

Connections can send private drafts and read their delivery status. Publishing
requires the owner to enable Auto-publish for that connection, or to review and
submit a draft in Slop. Connections cannot spend coins, buy assets, or change your account. Your agent never
receives your Slop password, account session, or private preview URL.

## Slop Worlds (0.6.0 candidate)

This source/package adds persistent-v1 support. The package, web host, mobile host
and bundle authority must be rolled out together before a World can be published.
Local validation does not establish that the live service supports this version.

Call `slop_game_template({persistent:true,target_platform:"cross-platform"})`.
Keep its composed `slop.js` unchanged: it includes the Creator surface API and
the canonical persistence/asset runtime. Arcade still uses unchanged creator-v1.

- Await `Slop.persist({version,run,profile,migrate(old,fromVersion,scope)})`
  before first-frame `Slop.ready()`. Run/profile migrate independently.
- Mutate the returned live objects, then `save.commit()`; call
  `save.checkpoint(label)` at room/floor transitions. `run.__label` appears in
  the platform-owned Continue sheet. Never draw your own Continue/start UI.
- `await Slop.persist.newRun()` clears only run; profile survives.
  A genuine `Slop.finished(score)` first checkpoints the ended run/profile.
  Saves and game-authored scores do not authorize rewards.
- Budgets are decoded decimal bytes: 50,000,000 total, 8,000,000 per file,
  400 files including platform metadata, and 5,000,000 first load. Arcade
  remains 2,000,000 / 512,000 / 64 including metadata.
- `slop.spec.json` must contain `persistent:true` and `first_load:[...]`
  listing index.html plus the complete static HTML/CSS/module boot closure
  and any early assets. A flag without an executable Slop.persist call is dropped.
- Text is a string. Allowed World binary files (.glb .bin .jpg .webp .ktx2 .ogg)
  use `{encoding:"base64",data:"canonical base64"}`. Hashes and limits use
  decoded bytes, not the larger JSON/base64 transport. The request also has a
  separate 70,000,000-byte raw JSON ceiling; pathological escaping can reach
  that transport limit before the decoded bundle limit.
- `await Slop.asset("zones/forge.glb")` returns `{url,arrayBuffer()}` from the
  game's exact verified release only. Before ready, the path must be in
  first_load. The host caches content hashes and evicts least-recently-played
  release assets at 500 MB; it never evicts player save records.
- `await Slop.three()` / `await Slop.loadGLTF("model.glb")` support bundled
  self-contained GLB. External resources and unsupported compressed decoders
  are rejected. KTX2 bytes are supported, not an advertised GLTF KTX2 decoder.
- Never use localStorage, sessionStorage, IndexedDB or external fetch in game
  code. The existing opaque sandbox/CSP stays unchanged.
- Device commits precede ACKs and cloud sync. Explicit in-app closes await a
  final flush; browser/OS termination can only preserve the last durable
  checkpoint. Real hard-kill/offline/cross-device acceptance is a separate gate.

## Connect your coding agent

Install Node.js 22.12 or later. The versioned package is hosted by Slop; there is
no npm registry package to guess. It contains only the local adapter and its
pinned runtime dependencies are resolved by npm.

Upgrading an existing connection: update its package URL to `slop-game-mcp-0.6.0.tgz`
and restart the coding app’s MCP server. Keep the saved Slop credential; no new
pairing is needed. Versioned URLs prevent reuse of an older cached adapter.

### Codex

Run in your computer's terminal:

```sh
codex mcp add slop -- npx --yes --package=https://slop.game/downloads/slop-game-mcp-0.6.0.tgz slop-mcp
```

Restart Codex and check its MCP settings, or run `codex mcp list`.
[Official Codex instructions](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Claude Code

```sh
claude mcp add --transport stdio --scope user slop -- npx --yes --package=https://slop.game/downloads/slop-game-mcp-0.6.0.tgz slop-mcp
```

Restart Claude Code and run `/mcp` to check Slop.
[Official Claude Code instructions](https://code.claude.com/docs/en/mcp).

### OpenCode

Merge this entry into your OpenCode configuration, keeping the rest of your
settings:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "slop": {
      "type": "local",
      "command": [
        "npx",
        "--yes",
        "--package=https://slop.game/downloads/slop-game-mcp-0.6.0.tgz",
        "slop-mcp"
      ],
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

Restart OpenCode and check that Slop is enabled in its MCP servers.
[Official OpenCode instructions](https://opencode.ai/v2/docs/mcp-servers).

### OpenChamber

Open **Settings → MCP**, add a personal local server named `slop`, and use:

```sh
npx --yes --package=https://slop.game/downloads/slop-game-mcp-0.6.0.tgz slop-mcp
```

Save the server and leave it enabled.
[Official OpenChamber instructions](https://docs.openchamber.dev/mcp/).
OpenChamber uses the OpenCode MCP registry, so one `slop` entry is enough for
both. The server intentionally writes nothing until its host sends an MCP
handshake. If the desktop app cannot resolve `npx`, replace it with the absolute
path printed by `command -v npx` and allow a 60-second startup timeout.

### Cursor and other local MCP clients

Merge the Slop entry into `~/.cursor/mcp.json`, preserving your other servers,
then enable Slop in Cursor's MCP settings:

```json
{
  "mcpServers": {
    "slop": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "--yes",
        "--package=https://slop.game/downloads/slop-game-mcp-0.6.0.tgz",
        "slop-mcp"
      ]
    }
  }
}
```

[Official Cursor instructions](https://cursor.com/docs/mcp). Other clients use
their own local MCP configuration with the same command and arguments. If a
desktop app cannot find `npx`, use its actual absolute executable path.

### Any local model or agent

The model does not authenticate directly. Run it in any MCP-compatible host and
add the same local STDIO configuration above. This works with local models such
as Qwen because the host launches the Slop adapter and exposes its eight tools to
the model. After one browser approval, the adapter keeps a private, narrow
30-day credential and can deliver new private drafts headlessly. It can request
publication only when the owner enables Auto-publish for that connection; it
cannot spend coins or change the account.

## Pair, send, play

1. Ask your agent: **“Call slop_pair and show me the QR code and pairing link.”**
2. Scan the computer's QR with your phone camera. Slop.game opens its secure
   mobile review page; sign in, review the named agent, and allow draft access.
   The scanner in the installed Slop app also accepts the same QR.
3. Choose `mobile`, `desktop`, or `cross-platform`. Ask the agent to check
   `slop_connection_status`, call `slop_game_template` with that
   `target_platform`, and build around its unchanged `slop.js`. Send the
   complete bundle with `slop_send_draft` and the same target.
4. The draft appears in the same account's computer connection inbox on web and
   mobile. Select **Try on my phone** or **Playtest & publish** on the website.
   Play the real build while Slop records gameplay frames directly into an
   H.264 MP4 feed preview and poster; never convert a GIF into the feed video.
   A moving GIF and cover are also retained for older clients; their existing
   validation still applies, and they cannot replace the required MP4.
   A validated, immutable private preview opens
   after approval. Browser capture requires H.264 encoding support; the
   server video pass backfills missing previews for published games.
5. For another iteration, ask your agent to send the next revision. Review it
   separately. Disconnect the computer any time in Slop.

A QR is a pending request, not a connection. Delivery marked
`awaiting_confirmation` is waiting for you; it is not yet a playable preview.
Pairing challenges expire after ten minutes; approved connections last thirty
days unless revoked sooner. Publishing is a separate Slop action.

Available tools: `slop_pair`, `slop_connection_status`, `slop_game_template`,
`slop_check_bundle`, `slop_send_draft`, `slop_publish`, `slop_draft_status`, and `slop_disconnect`.

### Auto-publish (no browser)

Switch on **Auto-publish** for a connected app at slop.game/#/connect. The agent
can then call `slop_publish` with a `submission_id` (or pass `publish: true` to
`slop_send_draft`). Slop's server playtests the latest revision in a headless
browser and records gameplay frames directly into a moving H.264 MP4 feed loop
and JPEG poster, plus a legacy GIF and cover for older clients. The MP4 is never
a converted GIF. Video recording must succeed before publication
proceeds; a failed recording leaves the job retryable. Staff accounts go live
immediately, everyone else goes to review. Feed videos are 720×1280 (9:16),
or 1280×720 (16:9) for desktop games, at 30 fps for about seven seconds.
Accepted video must match the current immutable release. A later revision of an
already published project updates that game. `slop_draft_status` reports each
revision's `publication` (`requested`, `recording`, `publishing`, `published`,
`pending_review`, or `failed` with a `failure_code` such as `no_motion`,
`blank_canvas` or `boot_error`). The recorder runs every five minutes.
`slop_check_bundle` runs the same file, runtime and sandbox rules locally, so an
agent can fix a bundle before the owner is asked to review it.

## Feed framing and HUD

Portrait clips are 720×1280 and landscape clips are 1280×720. The For You feed
preserves the full canvas with adaptive contain fitting and a backdrop for other
screen shapes; gameplay and controls must not be cropped. Keep the player,
targets and HUD inside the centered ~80% of the width for readability, and frame
the camera or playfield slightly wide, not tight.

Keep the HUD tiny: one big score or number near top-center, plus at most one or
two small icons. No sentences and no `SCORE:` / `LEVEL:` labels. A control hint
is four words or fewer and disappears on the first input. Callouts such as
`+10` or `PERFECT` are one or two words. `slop_game_template` returns these
rules to the agent with the template.

## Bundle contract

Keep `project_id` stable, increment integer `revision`, and use a new
`request_id` for each new revision. Reuse a request ID only for an identical
retry. Include `index.html`; use relative file paths. Arcade bundles remain
self-contained text: HTML, JavaScript, CSS, JSON, SVG, and TXT, with a maximum
64 files, 512,000 bytes per file and 2,000,000 total. Validated Slop Worlds use
the larger decoded-byte budget and restricted binary descriptors described
above. Paid Store asset manifests, archives and arbitrary binaries are not
supported by this adapter.

Source remains private. The service verifies your Slop session, reserves each
upload through the mobile app's owner-bound storage rules, and asks the existing
game-bundle authority to verify the exact manifest and mint an immutable
fifteen-minute preview. Agents receive only delivery status.

Each revision has a separate server-generated slug. Superseded work, expired
leases and revoked connections cannot finish as newly ready. A lost success
response can be reconciled through status and a fresh preview of the same
latest revision. An interrupted confirmation may need three minutes before retry.

Limits are ten active connections, twenty projects, sixty new revisions a day,
and twenty MB of retained source per account. Disconnecting removes future
bridge access; it preserves existing private games and does not retroactively
revoke independent, already issued fifteen-minute previews.

## Local development and operations

```sh
cd mcp
npm ci
npm test
npm run package
node cli.mjs
```

The adapter speaks MCP on standard input/output. An idle terminal is expected.
`SLOP_MCP_URL` can override the default deployed REST bridge
`https://api.slop.game/functions/v1/slop-mcp`; this is not a remote MCP URL.
`SLOP_MCP_CREDENTIALS` can select an isolated credential file. The default is
`~/.config/slop/mcp.json`. On Unix it requires mode 0600; on Windows it uses a
protected, owner-only file ACL, created through the bundled Windows PowerShell.
Every read verifies those permissions and rejects links or directories. Storage
that cannot enforce private permissions is rejected. It stores only this
adapter's limited grant and pairing poll secret. Never add it to version control.

If an older Windows release left a credential file with inherited permissions,
the updated adapter rejects it. Set `SLOP_MCP_CREDENTIALS` in your MCP host's
environment to a new, unused file path, restart the host, and call `slop_pair`
again. Approve the new connection in Slop, revoke any previous connection there,
then remove its old credential file. The adapter does not silently trust or
repair an unsafe existing credential file.

[Mobile/web HTTP contract](MOBILE-CONTRACT.md) and
[release verification](../docs/mcp-release-2026-09-16.md) describe deployment and
security checks. The Edge endpoint permits only owner routes from the exact
`https://slop.game` browser origin. It validates user JWTs itself; opaque local
agent tokens require gateway JWT verification to stay disabled.

The historical Arcade MCP schema is already live. Worlds additionally requires
the separately guarded `20261002130000_persistent_bundle_admission.sql` rollout
from the mobile authority repository, followed by the matching `game-bundle`
and `slop-mcp` functions. Do not infer those capabilities from this local package.
The save migration `20261002120000` is already recorded and must not be replayed.
Deploy only the exact reviewed function trees, preserving the downloaded live
rollback sources. **Do not bulk push migrations or deploy/prune all functions:**
mobile and web migration histories differ. Full-size 50 MB Edge memory acceptance
and the guarded rehearsal/postflight are required before deploying this candidate.
Modern Supabase publishable/secret key maps take precedence over legacy keys;
server secrets stay in server-only API headers. Rollback first disables the
feature/endpoint, then revokes bridge entry points with [rollback.sql](rollback.sql).
Retain private source and idempotency records instead of dropping data.

Start every game with `slop_game_template`. It returns the native Slop runtime
and a working canvas example. Keep the returned slop.js unchanged; preserve
ready-after-first-frame, score, finished, restart, pause and touch integration.
For desktop games implement keyboard and mouse controls; for cross-platform
games implement equivalent keyboard/mouse and touch controls around one game
state. The selected target is sealed into `slop-platform.json` and becomes the
published game's platform metadata. In the website draft inbox, the owner
playtests and records real gameplay before submitting through the same review
process used by the app. With owner-enabled Auto-publish, the server performs
that playtest and records the MP4 preview, poster, legacy GIF and cover. The
coding agent cannot bypass that connection permission or the media checks.

The returned `authorization_uri` starts on `api.slop.game` and redirects to the
fixed Slop account review page while keeping the short-lived challenge in the
fragment. `confirmation_uri` remains the QR URL accepted by the mobile scanner.
