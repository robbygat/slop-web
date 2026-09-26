import test from "node:test";
import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { bridgeUrl, LocalCredentials, SlopBridge } from "../client.mjs";

test("credentials stay in a private local file and never appear in tool results", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slop-mcp-"));
  try {
    const credentials = new LocalCredentials(join(dir, "connection.json"));
    const requests = [];
    const bridge = new SlopBridge({
      base: "https://api.slop.game/functions/v1/slop-mcp",
      credentials,
      fetcher: async (url, options) => {
        requests.push({ url, options });
        return Response.json({
          pairing_id: "test",
          poll_token: "private-poll",
          confirmation_uri: "https://slop.game/mcp/pair#id=test",
          status: "pending",
        });
      },
    });
    const result = await bridge.pair("My computer");
    const saved = await credentials.read();
    assert.match(saved.token, /^slop_mcp_[0-9a-f]{64}$/);
    if (process.platform !== "win32") assert.equal((await stat(credentials.path)).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(result).includes(saved.token));
    assert.ok(!JSON.stringify(result).includes(saved.poll_token));
    assert.ok(!requests[0].options.body.includes(saved.token));
    const other = new SlopBridge({ base: "https://example.com", credentials });
    await assert.rejects(() => other.config(), /different endpoint/);
    await writeFile(join(dir, "public.json"), "{}", { mode: 0o644 });
    await assert.rejects(
      () => new LocalCredentials(join(dir, "public.json")).read(),
      /private regular file/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("credential replacement is atomic and failed writes remove their temporary files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slop-mcp-atomic-"));
  try {
    const credentials = new LocalCredentials(join(dir, "connection.json"));
    await credentials.save({ token: "first" });
    await credentials.save({ token: "second" });
    assert.deepEqual(await new LocalCredentials(credentials.path).read(), { token: "second" });
    await assert.rejects(() => credentials.save({ token: 1n }), /BigInt/);
    assert.deepEqual(await credentials.read(), { token: "second" });
    assert.deepEqual(await readdir(dir), ["connection.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("credentials reject directories, directory links, and hard links on read and save", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slop-mcp-links-"));
  try {
    const folder = join(dir, "folder"), junction = join(dir, "junction");
    await mkdir(folder);
    await symlink(folder, junction, process.platform === "win32" ? "junction" : "dir");
    const original = new LocalCredentials(join(dir, "original.json"));
    await original.save({ token: "private" });
    const linked = join(dir, "linked.json");
    await link(original.path, linked);
    for (const path of [folder, junction, linked, original.path]) {
      const credentials = new LocalCredentials(path);
      await assert.rejects(() => credentials.read(), /private regular file/);
      await assert.rejects(() => credentials.save({}), /private regular file/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Windows credentials reject an explicitly broadened ACL", { skip: process.platform !== "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "slop-mcp-acl-"));
  try {
    const credentials = new LocalCredentials(join(dir, "connection.json"));
    await credentials.save({ token: "private" });
    const script = `
$ErrorActionPreference = 'Stop'
$file = New-Object IO.FileInfo($env:SLOP_TEST_CREDENTIALS)
$acl = $file.GetAccessControl()
$everyone = New-Object Security.Principal.SecurityIdentifier('S-1-1-0')
$rule = New-Object Security.AccessControl.FileSystemAccessRule($everyone, 'Read', 'Allow')
$acl.AddAccessRule($rule)
$file.SetAccessControl($acl)
`;
    await promisify(execFile)(join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64"),
    ], { env: { ...process.env, SLOP_TEST_CREDENTIALS: credentials.path }, windowsHide: true });
    await assert.rejects(() => new LocalCredentials(credentials.path).read(), /owner-only ACL/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Windows credentials work under an inherited Modify grant without WRITE_OWNER", { skip: process.platform !== "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "slop-mcp-modify-"));
  try {
    const script = `
$ErrorActionPreference = 'Stop'
$folder = New-Object IO.DirectoryInfo($env:SLOP_TEST_DIRECTORY)
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'Modify', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
$folder.SetAccessControl($acl)
`;
    await promisify(execFile)(join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64"),
    ], { env: { ...process.env, SLOP_TEST_DIRECTORY: dir }, windowsHide: true });
    const credentials = new LocalCredentials(join(dir, "space and $literal.json"));
    await credentials.save({ token: "private" });
    assert.deepEqual(await new LocalCredentials(credentials.path).read(), { token: "private" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("existing credentials survive a transient outage; no replacement pairing is created", async () => {
  let saves = 0, requests = 0;
  const bridge = new SlopBridge({
    base: "https://api.slop.game",
    credentials: {
      read: async () => ({ base: "https://api.slop.game", token: "existing" }),
      save: async () => saves++,
    },
    fetcher: async () => {
      requests++;
      return Response.json({ code: "service_unavailable" }, { status: 503 });
    },
  });
  await assert.rejects(() => bridge.pair("My computer"), /service_unavailable/);
  assert.equal(saves, 0);
  assert.equal(requests, 1);
  assert.throws(
    () => bridgeUrl("https://token:password@example.com"),
    /trusted HTTPS/,
  );
  assert.throws(() => bridgeUrl("http://example.com"), /trusted HTTPS/);
});
test("official SDK performs real STDIO handshake, lists tools, and returns honest unpaired state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slop-mcp-sdk-"));
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../cli.mjs", import.meta.url))],
    env: { SLOP_MCP_CREDENTIALS: join(dir, "credentials.json") },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((t) => t.name), [
      "slop_pair",
      "slop_connection_status",
      "slop_game_template",
      "slop_send_draft",
      "slop_check_bundle",
      "slop_draft_status",
      "slop_disconnect",
    ]);
    assert.deepEqual(listed.tools.find(t=>t.name==="slop_game_template").inputSchema.properties.target_platform.enum,["mobile","desktop","cross-platform"]);
    assert.ok(listed.tools.find(t=>t.name==="slop_send_draft").inputSchema.required.includes("target_platform"));
    const template=await client.callTool({name:"slop_game_template",arguments:{target_platform:"desktop"}});assert.equal(JSON.parse(template.content[0].text).target_platform,"desktop");
    const result = await client.callTool({
      name: "slop_connection_status",
      arguments: {},
    });
    const unpaired = JSON.parse(result.content[0].text);
    assert.equal(unpaired.status, "not_paired");
    assert.match(unpaired.next_step, /slop_pair/);
    const checked = await client.callTool({
      name: "slop_check_bundle",
      arguments: { target_platform: "desktop", files: JSON.parse(template.content[0].text).files },
    });
    assert.equal(JSON.parse(checked.content[0].text).ok, true);
    const send = await client.callTool({
      name: "slop_send_draft",
      arguments: {
        project_id: "11111111-1111-4111-8111-111111111111",
        request_id: "22222222-2222-4222-8222-222222222222",
        revision: 1,
        target_platform: "cross-platform",
        name: "test",
        files: { "index.html": "<canvas/>" },
      },
    });
    assert.equal(send.isError, true);
    assert.match(send.content[0].text, /Pair Slop/);
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("STDIO pairing survives a process restart and stays pending until owner approval", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slop-mcp-pair-"));
  let approved = false, pairRequests = 0;
  const http = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    res.setHeader("content-type", "application/json");
    if (req.url === "/pair/start") {
      pairRequests++;
      assert.match(JSON.parse(raw).access_token_hash, /^[0-9a-f]{64}$/);
      res.end(
        JSON.stringify({
          pairing_id: "11111111-1111-4111-8111-111111111111",
          status: "pending",
          poll_token: "p".repeat(64),
          confirmation_uri:
            "https://slop.game/mcp/pair#id=11111111-1111-4111-8111-111111111111&code=abcdefabcdefabcdefabcdefabcdefab",
        }),
      );
    } else if (req.url.startsWith("/pair/status?")) {
      assert.equal(req.headers.authorization, `Bearer ${"p".repeat(64)}`);
      res.end(JSON.stringify({ status: approved ? "approved" : "pending" }));
    } else if (req.url === "/agent/status") {
      assert.ok(approved);
      assert.match(req.headers.authorization, /^Bearer slop_mcp_[0-9a-f]{64}$/);
      res.end(JSON.stringify({ status: "active" }));
    } else { res.statusCode = 404; res.end("{}"); }
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  let client = new Client({ name: "integration-test", version: "1.0.0" });
  const transport = () => new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../cli.mjs", import.meta.url))],
    env: {
      ...process.env,
      SLOP_MCP_CREDENTIALS: join(dir, "credentials.json"),
      SLOP_MCP_URL: `http://127.0.0.1:${http.address().port}`,
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport());
    const pairing = await client.callTool({
      name: "slop_pair",
      arguments: { client_name: "Test laptop" },
    });
    assert.equal(JSON.parse(pairing.content[0].text).status, "pending");
    assert.equal(pairing.content[1].type, "image");
    assert.equal(pairing.content[1].mimeType, "image/png");
    const status = await client.callTool({
      name: "slop_connection_status",
      arguments: {},
    });
    assert.equal(JSON.parse(status.content[0].text).status, "pending");
    assert.ok(!status.content[0].text.includes("slop_mcp_"));
    await client.close();
    client = new Client({ name: "restarted-agent", version: "1.0.0" });
    await client.connect(transport());
    const pending = await client.callTool({ name: "slop_connection_status", arguments: {} });
    assert.equal(pending.isError, undefined);
    assert.equal(JSON.parse(pending.content[0].text).status, "pending");
    approved = true;
    const active = await client.callTool({ name: "slop_connection_status", arguments: {} });
    assert.equal(JSON.parse(active.content[0].text).status, "active");
    assert.equal(pairRequests, 1);
  } finally {
    await client.close();
    http.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("an approved local agent sends its chosen platform headlessly and cannot choose public publication",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"slop-mcp-headless-")),credentials=join(dir,"credentials.json"),token="slop_mcp_"+"a".repeat(64);let received;
 const http=createServer(async(req,res)=>{let raw="";for await(const part of req)raw+=part;res.setHeader("content-type","application/json");if(req.url==="/agent/drafts"){assert.equal(req.headers.authorization,`Bearer ${token}`);received=JSON.parse(raw);res.end(JSON.stringify({status:"awaiting_confirmation",submission_id:"11111111-1111-4111-8111-111111111111"}));}else res.end(JSON.stringify({status:"active"}));});
 http.listen(0,"127.0.0.1");await once(http,"listening");const base=`http://127.0.0.1:${http.address().port}`;await new LocalCredentials(credentials).save({base,token});const client=new Client({name:"local-model",version:"1.0.0"});
 try{await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL("../cli.mjs",import.meta.url))],env:{SLOP_MCP_CREDENTIALS:credentials,SLOP_MCP_URL:base},stderr:"pipe"}));const sent=await client.callTool({name:"slop_send_draft",arguments:{project_id:"11111111-1111-4111-8111-111111111111",request_id:"22222222-2222-4222-8222-222222222222",revision:1,target_platform:"desktop",name:"Desktop proof",files:{"index.html":"<canvas></canvas>","slop.js":"runtime"}}});assert.equal(JSON.parse(sent.content[0].text).status,"awaiting_confirmation");assert.equal(JSON.parse(received.files["slop-platform.json"]).target_platform,"desktop");assert.equal(Object.hasOwn(received,"publish"),false);}
 finally{await client.close();http.close();await rm(dir,{recursive:true,force:true});}
});

test("a vanished pairing falls through to the real token and ends in an honest next step", async () => {
  const seen = [];
  const bridge = new SlopBridge({
    base: "https://api.slop.game",
    credentials: {
      read: async () => ({ base: "https://api.slop.game", token: "t", pairing_id: "11111111-1111-4111-8111-111111111111", poll_token: "p" }),
      save: async () => {},
    },
    fetcher: async (url) => {
      seen.push(new URL(url).pathname);
      const code = url.includes("/pair/status") ? "invalid_pairing" : "invalid_connection";
      return Response.json({ ok: false, code }, { status: 403 });
    },
  });
  const status = await bridge.status();
  assert.deepEqual(seen, ["/pair/status", "/agent/status"]);
  assert.equal(status.status, "not_connected");
  assert.match(status.next_step, /slop_pair/);
  await assert.rejects(() => bridge.authorized("/agent/drafts"), (error) =>
    error.code === "invalid_connection" && /Slop request failed: invalid_connection\. .*slop_pair/.test(error.message));
});
test("an approved token still reports active after its pairing row is cleaned up", async () => {
  const bridge = new SlopBridge({
    base: "https://api.slop.game",
    credentials: {
      read: async () => ({ base: "https://api.slop.game", token: "t", pairing_id: "11111111-1111-4111-8111-111111111111", poll_token: "p" }),
      save: async () => {},
    },
    fetcher: async (url) => url.includes("/pair/status")
      ? Response.json({ ok: false, code: "invalid_pairing" }, { status: 403 })
      : Response.json({ status: "active", connection_id: "c" }),
  });
  assert.equal((await bridge.status()).status, "active");
});
