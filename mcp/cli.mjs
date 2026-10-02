#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LocalCredentials, SlopBridge } from "./client.mjs";
import { gameTemplate } from "./game-template.mjs";
import { checkBundle } from "./bundle-check.mjs";
import { pairingResult } from "./pairing-display.mjs";

const bridge = new SlopBridge({
  base: process.env.SLOP_MCP_URL ??
    "https://api.slop.game/functions/v1/slop-mcp",
  credentials: new LocalCredentials(
    process.env.SLOP_MCP_CREDENTIALS ??
      join(homedir(), ".config", "slop", "mcp.json"),
  ),
});
const server = new McpServer({ name: "slop", version: "0.6.0" });
function result(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
function tool(name, description, inputSchema, action, annotations = {}) {
  server.registerTool(name, {
    description,
    inputSchema,
    annotations: {
      destructiveHint: false,
      openWorldHint: true,
      ...annotations,
    },
  }, async (args) => {
    try {
      const data = await action(args);
      return name === "slop_pair" ? await pairingResult(data) : result(data);
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error.message }],
      };
    }
  });
}
tool(
  "slop_pair",
  "Display a real QR image and web pairing link for Slop. Start a ten-minute pairing request; the user must explicitly approve draft access in their signed-in mobile app or at slop.game. No connection exists until approval. Show the returned image and link to the user.",
  { client_name: z.string().min(1).max(60).default("My coding agent") },
  (args) => bridge.pair(args.client_name),
);
tool(
  "slop_connection_status",
  "Check real server approval, expiry and revocation for this local Slop connection.",
  {},
  () => bridge.status(),
  { readOnlyHint: true },
);
tool("slop_game_template", "Choose mobile, desktop, or cross-platform and get the canonical Slop.js runtime plus a responsive working canvas game. Set persistent:true for a Slop World with awaited saving, checkpoints and profile progression. Use before building any Slop game so ready, score, finish, restart, pointer, keyboard, touch and pause work on web/iOS/Android. Its instructions include the feed framing and terse-HUD rules. No account or connection required.", {target_platform:z.enum(['mobile','desktop','cross-platform']).default('cross-platform'),persistent:z.boolean().default(false).describe('Use true for Slop Worlds with durable run/profile saving and the persistent-v1 runtime.')}, gameTemplate, {readOnlyHint:true,openWorldHint:false});
tool(
  "slop_send_draft",
  "Use slop_game_template first for the same target_platform. Include its unchanged slop.js plus ready/score/finished integration. Send a private game bundle (strings for text, strict base64 descriptors for allowed World binaries) for owner confirmation and validation in Slop on web or mobile. Keep project_id stable, increase revision, and reuse request_id only for an identical retry. Private by default; publish:true requests publication only with owner-enabled Auto-publish. Does not charge credits. index.html is required. Arcade: 64 files / 2,000,000 decoded bytes total / 512,000 per file. Slop Worlds: actual Slop.persist + persistent:true spec; 400 files / 50,000,000 total / 8,000,000 per file / first_load <=5,000,000 bytes. No paid Store assets in this bridge.",
  {
    project_id: z.string().uuid(),
    request_id: z.string().uuid(),
    revision: z.number().int().min(1).max(1_000_000),
    target_platform: z.enum(['mobile','desktop','cross-platform']),
    name: z.string().min(1).max(80),
    description: z.string().max(240).optional(),
    files: z.record(z.union([z.string(),z.object({encoding:z.literal('base64'),data:z.string()}).strict()])),
    publish: z.boolean().optional().describe("Also ask Slop to publish this revision (needs Auto-publish on for this connection at slop.game/#/connect)."),
  },
  async ({publish, ...args}) => {
    const files = {...args.files,'slop-platform.json':JSON.stringify({target_platform:args.target_platform})};
    // Advisory only: the server stays the authority on what it accepts.
    const local_check = await checkBundle(files, { target_platform: args.target_platform });
    const sent = await bridge.authorized("/agent/drafts", {...args, files});
    const publication = publish ? await bridge.authorized("/agent/publish", { submission_id: sent.submission_id }).catch((error) => ({ error: error.message })) : undefined;
    const result = publication ? { ...sent, publication } : sent;
    return local_check.ok && !local_check.warnings.length ? result : { ...result, local_check };
  },
  { idempotentHint: true },
);
tool(
  "slop_check_bundle",
  "Check a game bundle locally before slop_send_draft: file names, sizes, the unchanged slop.js runtime, required meta tags and script order, and sandbox rules Slop enforces (no storage or network, WebGL needs preserveDrawingBuffer:true so covers are not black). Returns problems (will be rejected or broken) and warnings. No account, connection or network needed.",
  {
    target_platform: z.enum(['mobile','desktop','cross-platform']).optional(),
    files: z.record(z.union([z.string(),z.object({encoding:z.literal('base64'),data:z.string()}).strict()])),
  },
  (args) => checkBundle(args.files, { target_platform: args.target_platform }),
  { readOnlyHint: true, openWorldHint: false },
);
tool(
  "slop_publish",
  "Publish a draft revision without a browser: Slop's server playtests it, records a moving H.264 MP4 feed video plus a poster and legacy GIF/cover, and publishes it only after video recording succeeds (staff accounts go live immediately; everyone else goes to review). Needs the owner to switch on Auto-publish for this connection at slop.game/#/connect. Only the project's latest revision can be published; a later revision of an already-published project updates that game. Poll slop_draft_status for publication status (requested, recording, publishing, published, pending_review, failed with a reason).",
  { submission_id: z.string().uuid() },
  (args) => bridge.authorized("/agent/publish", { submission_id: args.submission_id }),
  { idempotentHint: true },
);
tool(
  "slop_draft_status",
  "List this connection’s private draft revisions, whether the owner has confirmed a validated preview, and each revision’s auto-publish state (publication). Private preview URLs are delivered only to the signed-in owner, never to the agent.",
  {},
  () => bridge.authorized("/agent/drafts"),
  { readOnlyHint: true },
);
tool(
  "slop_disconnect",
  "Revoke this Slop connection. Further uploads stop immediately; existing private games stay in the account.",
  {},
  () => bridge.authorized("/agent/revoke", {}),
  { destructiveHint: true, idempotentHint: true },
);
await server.connect(new StdioServerTransport());
