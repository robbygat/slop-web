import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const privateFileError = () => new Error(
  "Slop credentials must be a private regular file (0600 on Unix; owner-only ACL on Windows).",
);
// Node's Windows mode bits do not describe NTFS permissions. Protect the empty
// temporary file before writing secrets, and inspect its real DACL on reads.
// No path or credential is interpolated into executable PowerShell source.
const windowsAclScript = `
$ErrorActionPreference = 'Stop'
$file = New-Object IO.FileInfo($env:SLOP_MCP_ACL_PATH)
if (!$file.Exists -or ($file.Attributes -band [IO.FileAttributes]::Directory) -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Not a regular file' }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($env:SLOP_MCP_ACL_ACTION -eq 'protect') {
  $acl = New-Object Security.AccessControl.FileSecurity
  # The owner can restrict a DACL without WRITE_OWNER. Avoid requesting that
  # extra right when an inherited Modify grant already created our own file.
  if ($file.GetAccessControl().GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { $acl.SetOwner($sid) }
  $acl.SetAccessRuleProtection($true, $false)
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
  $acl.AddAccessRule($rule)
  $file.SetAccessControl($acl)
}
$acl = $file.GetAccessControl()
if (!$acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Unprotected owner' }
$ownerCanRead = $false
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
    if ($rule.IdentityReference.Value -ne $sid.Value -or $rule.IsInherited) { throw 'Non-private access' }
    if ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadData) { $ownerCanRead = $true }
  }
}
if (!$ownerCanRead) { throw 'No owner access' }
`;
async function windowsAcl(path, action) {
  try {
    await runFile(join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(windowsAclScript, "utf16le").toString("base64"),
    ], {
      env: { ...process.env, SLOP_MCP_ACL_PATH: path, SLOP_MCP_ACL_ACTION: action },
      windowsHide: true,
      timeout: 15_000,
    });
  } catch {
    // Fail closed on unsupported filesystems or unavailable ACL tooling.
    throw privateFileError();
  }
}
function regularFile(info) {
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw privateFileError();
}

export function bridgeUrl(raw) {
  const url = new URL(raw);
  if (
    url.username || url.password || url.search || url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)))
  ) throw new Error("A trusted HTTPS Slop bridge URL is required.");
  return url.href.replace(/\/$/, "");
}
export class LocalCredentials {
  constructor(path) {
    this.path = path;
  }
  async read() {
    let file;
    try {
      const info = await lstat(this.path);
      regularFile(info);
      file = await open(this.path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const opened = await file.stat();
      regularFile(opened);
      if (info.dev !== opened.dev || info.ino !== opened.ino) throw privateFileError();
      if (process.platform === "win32") await windowsAcl(this.path, "verify");
      else if (opened.mode & 0o077) throw privateFileError();
      // Recheck the path after ACL inspection before reading from the handle.
      const checked = await lstat(this.path);
      regularFile(checked);
      if (checked.dev !== opened.dev || checked.ino !== opened.ino) throw privateFileError();
      return JSON.parse(await file.readFile("utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    } finally {
      await file?.close();
    }
  }
  async save(value) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    try {
      regularFile(await lstat(this.path));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const temporary = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
    let file;
    let created = false;
    try {
      file = await open(temporary, "wx", 0o600);
      created = true;
      if (process.platform === "win32") await windowsAcl(temporary, "protect");
      const opened = await file.stat(), protectedFile = await lstat(temporary);
      regularFile(opened);
      regularFile(protectedFile);
      if (opened.dev !== protectedFile.dev || opened.ino !== protectedFile.ino) throw privateFileError();
      await file.writeFile(JSON.stringify(value));
      await file.sync();
      await file.close();
      file = null;
      await rename(temporary, this.path);
    } finally {
      await file?.close();
      if (created) await rm(temporary, { force: true });
    }
  }
}
const PAIR_AGAIN =
  "Call slop_pair for a new pairing link, then ask the owner to approve it.";
// Server codes are stable; agents need the next action, not only the code.
const HINTS = {
  invalid_pairing: "This pairing request no longer exists. " + PAIR_AGAIN,
  pairing_expired: "The ten-minute pairing request expired. " + PAIR_AGAIN,
  invalid_connection:
    "This computer is not connected (never approved, expired or revoked). " +
    PAIR_AGAIN,
  connection_limit:
    "The account already has ten connections. Ask the owner to disconnect one in Slop.",
  request_conflict:
    "That request_id was already used with different content. Use a new request_id for a new revision.",
  revision_conflict:
    "That revision number was already used. Send the next higher revision.",
  revision_superseded:
    "A newer revision of this project exists. Send a higher revision.",
  rate_limited: "Too many requests. Wait a minute, then retry.",
  project_limit:
    "The account has twenty projects. Reuse an existing project_id for new revisions.",
  bundle_too_large:
    "The bundle is too large. Arcade: 512 KB per file / 2 MB total. Validated Slop Worlds: 8 MB per file / 50 MB total / 5 MB first_load. Run slop_check_bundle.",
  request_too_large:
    "The bundle is too large. Arcade: 512 KB per file / 2 MB total. Validated Slop Worlds: 8 MB per file / 50 MB total / 5 MB first_load. Run slop_check_bundle.",
  invalid_bundle:
    "Include index.html and at most 64 Arcade files, or 400 validated Slop World files including metadata. Run slop_check_bundle first.",
  invalid_path:
    "File names may only use letters, digits, _ and - with one html/js/css/json/svg/txt extension. Run slop_check_bundle first.",
  empty_file: "Every file needs content. Remove empty files.",
  empty_entry_point: "index.html is empty.",
  store_assets_not_supported:
    "File names that look like Store asset manifests (containing 'asset' or 'entitlement' with 'slop' or 'manifest') are reserved. Rename the file.",
  invalid_platform:
    "target_platform must be mobile, desktop or cross-platform.",
  invalid_request:
    "Slop rejected the request. Run slop_check_bundle to find the problem.",
  auto_publish_disabled:
    "Auto-publish is off for this connection. Ask the owner to switch on Auto-publish for this app at slop.game/#/connect, or to publish it there.",
  submission_not_found: "That submission_id does not belong to this connection. Check slop_draft_status.",
  publish_in_progress: "Another revision of this project is already being published. Wait for it to finish (slop_draft_status).",
  target_pending_review: "This project's game is waiting for review. Wait for the decision before publishing another update.",
  already_published: "This revision is already published.",
  service_unavailable: "Slop is temporarily unavailable. Retry shortly.",
  upstream_unavailable: "Slop is temporarily unavailable. Retry shortly.",
};
const DRAFT_RECOVERY =
  "Do not resend automatically. Call slop_draft_status and check this project_id and revision first. " +
  "If no receipt exists, retry only the identical files, project_id, revision and request_id; do not create a new request_id.";

function requestTimeout(path, body, serialized) {
  if (path !== "/agent/drafts" || body == null) return 30_000;
  const bytes = Buffer.byteLength(serialized, "utf8");
  // Timing is not admission: the server still validates runtime, decoded
  // budgets and auth. Never extend an already-over-limit 70 MB wire request.
  if (bytes > 70_000_000) return 30_000;
  if (bytes > 2_000_000) return 120_000;
  try {
    if (JSON.parse(body.files?.["slop.spec.json"])?.persistent === true) return 120_000;
  } catch { /* Malformed specs retain the ordinary timeout and server checks. */ }
  return 30_000;
}

function unknownDraftOutcome(reason) {
  const error = new Error(`Slop draft delivery outcome is unknown (${reason}). ${DRAFT_RECOVERY}`);
  error.code = "draft_outcome_unknown";
  error.outcomeUnknown = true;
  return error;
}

export class SlopBridge {
  constructor({ base, credentials, fetcher = fetch }) {
    this.base = bridgeUrl(base);
    this.credentials = credentials;
    this.fetcher = fetcher;
  }
  async request(path, token, body) {
    const serialized = body == null ? undefined : JSON.stringify(body);
    const sendingDraft = path === "/agent/drafts" && body != null;
    let response;
    try {
      response = await this.fetcher(`${this.base}${path}`, {
        method: body == null ? "GET" : "POST",
        redirect: "error",
        credentials: "omit",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body == null ? {} : { "content-type": "application/json" }),
        },
        body: serialized,
        signal: AbortSignal.timeout(requestTimeout(path, body, serialized)),
      });
    } catch (error) {
      if (!sendingDraft) throw error;
      // A lost response is not proof the server did not commit. Do not expose
      // raw fetch errors (which can include URLs), retry or replace identity.
      throw unknownDraftOutcome(
        error?.name === "TimeoutError" || error?.name === "AbortError" ? "request timed out" : "network failure",
      );
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        typeof result?.code === "string" && /^[a-z_]{1,60}$/.test(result.code)
          ? result.code
          : "service_unavailable";
      const uncertain = sendingDraft && (response.status >= 500 || response.status === 408);
      const hint = uncertain ? DRAFT_RECOVERY : HINTS[code];
      const error = new Error(`Slop request failed: ${code}` + (hint ? `. ${hint}` : ""));
      error.code = code;
      if (uncertain) error.outcomeUnknown = true;
      throw error;
    }
    if (sendingDraft && result === null) throw unknownDraftOutcome("unreadable receipt");
    return result;
  }
  async config() {
    const config = await this.credentials.read();
    if (config && config.base !== this.base) {
      throw new Error(
        "Saved Slop connection belongs to a different endpoint. Use a separate credential file.",
      );
    }
    return config;
  }
  async pair(clientName) {
    const old = await this.config();
    if (old?.token) {
      try {
        const active = await this.request("/agent/status", old.token);
        if (active.status === "active") {
          return {
            ...active,
            message:
              "Already paired. Revoke this connection before replacing it.",
          };
        }
      } catch (error) {
        // A network failure must not discard an existing possibly-live grant.
        if (!error.message.includes("invalid_connection")) throw error;
      }
    }
    const token = `slop_mcp_${randomBytes(32).toString("hex")}`;
    const result = await this.request("/pair/start", null, {
      client_name: clientName,
      access_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    await this.credentials.save({
      base: this.base,
      token,
      pairing_id: result.pairing_id,
      poll_token: result.poll_token,
    });
    return {
      pairing_id: result.pairing_id,
      status: result.status,
      expires_at: result.expires_at,
      confirmation_uri: result.confirmation_uri,
      authorization_uri: result.authorization_uri,
      message:
        "Open this pairing link at slop.game or scan the QR in Slop on your phone. Review the requested draft access and explicitly approve it. Opening the link does not approve.",
    };
  }
  async status() {
    const config = await this.config();
    if (!config) return { status: "not_paired", next_step: PAIR_AGAIN };
    if (config.poll_token) {
      let pair = null;
      try {
        pair = await this.request(
          `/pair/status?pairing_id=${encodeURIComponent(config.pairing_id)}`,
          config.poll_token,
        );
      } catch (error) {
        // The pairing row is gone. The token below is the real authority, so
        // fall through to it instead of reporting a dead end.
        if (error.code !== "invalid_pairing") throw error;
      }
      if (pair?.status === "pending") {
        return {
          ...pair,
          next_step:
            "Waiting for the owner to approve this computer at slop.game or in the Slop app.",
        };
      }
      if (pair && pair.status !== "approved") {
        return { ...pair, next_step: PAIR_AGAIN };
      }
    }
    try {
      return await this.request("/agent/status", config.token);
    } catch (error) {
      if (error.code !== "invalid_connection") throw error;
      return { status: "not_connected", next_step: PAIR_AGAIN };
    }
  }
  async authorized(path, body) {
    const config = await this.config();
    if (!config) throw new Error("Pair Slop before sending a draft.");
    return this.request(path, config.token, body);
  }
}
