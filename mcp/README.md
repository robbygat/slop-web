# Slop MCP

Build a little mobile game with your coding agent, then playtest it in Slop on
your phone or at [slop.game](https://slop.game/#/connect). The local MCP adapter
connects to Slop's deployed account and private-game services. You approve the
computer once, and review each draft revision before it becomes playable.

Connections can send private drafts and read their delivery status. They cannot
publish games, spend coins, buy assets, or change your account. Your agent never
receives your Slop password, account session, or private preview URL.

## Connect your coding agent

Install Node.js 22.12 or later. The versioned package is hosted by Slop; there is
no npm registry package to guess. It contains only the local adapter and its
pinned runtime dependencies are resolved by npm.

### Codex

Run in your computer's terminal:

```sh
codex mcp add slop -- npx --yes --package=https://slop.game/downloads/slop-game-mcp-0.4.0.tgz slop-mcp
```

Restart Codex and check its MCP settings, or run `codex mcp list`.
[Official Codex instructions](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Claude Code

```sh
claude mcp add --transport stdio --scope user slop -- npx --yes --package=https://slop.game/downloads/slop-game-mcp-0.4.0.tgz slop-mcp
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
        "--package=https://slop.game/downloads/slop-game-mcp-0.4.0.tgz",
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
npx --yes --package=https://slop.game/downloads/slop-game-mcp-0.4.0.tgz slop-mcp
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
        "--package=https://slop.game/downloads/slop-game-mcp-0.4.0.tgz",
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
as Qwen because the host launches the Slop adapter and exposes its seven tools to
the model. After one browser approval, the adapter keeps a private, narrow
30-day credential and can deliver new private drafts headlessly. It cannot
publish publicly, spend coins, or change the account.

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
   Play the real build and record its required gameplay GIF. The recorder
   captures 12 timed frames and refuses a static sequence; publication parses
   the encoded GIF and rejects missing, malformed, untimed, or lost frames.
   A validated, immutable private preview opens after approval.
5. For another iteration, ask your agent to send the next revision. Review it
   separately. Disconnect the computer any time in Slop.

A QR is a pending request, not a connection. Delivery marked
`awaiting_confirmation` is waiting for you; it is not yet a playable preview.
Pairing challenges expire after ten minutes; approved connections last thirty
days unless revoked sooner. Publishing is a separate Slop action.

Available tools: `slop_pair`, `slop_connection_status`, `slop_game_template`,
`slop_check_bundle`, `slop_send_draft`, `slop_draft_status`, and `slop_disconnect`.
`slop_check_bundle` runs the same file, runtime and sandbox rules locally, so an
agent can fix a bundle before the owner is asked to review it.

## Bundle contract

Keep `project_id` stable, increment integer `revision`, and use a new
`request_id` for each new revision. Reuse a request ID only for an identical
retry. Include `index.html`; use relative file paths. Bundles are self-contained
text: HTML, JavaScript, CSS, JSON, SVG, and TXT. Maximum 64 files, 512 KB per file,
and 2 MB total. Paid Store asset manifests, archives and binary uploads are not
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

Deploy only the `slop-mcp` Edge function. The existing MCP migration is already
live. **Do not bulk push migrations:** mobile and web migration histories differ.
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
published game's platform metadata. The owner must playtest and record a real cover and GIF
in the website draft inbox before explicitly submitting the game through the
same review process used by the app. The coding agent has no publishing
permission and cannot bypass the GIF requirement.

The returned `authorization_uri` starts on `api.slop.game` and redirects to the
fixed Slop account review page while keeping the short-lived challenge in the
fragment. `confirmation_uri` remains the QR URL accepted by the mobile scanner.
