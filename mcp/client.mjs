import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";

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
    try {
      const info = await lstat(this.path);
      if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) {
        throw new Error(
          "Slop credentials must be a private regular file (0600).",
        );
      }
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async save(value) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
    } finally {
      await file.close();
    }
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
  }
}
export class SlopBridge {
  constructor({ base, credentials, fetcher = fetch }) {
    this.base = bridgeUrl(base);
    this.credentials = credentials;
    this.fetcher = fetcher;
  }
  async request(path, token, body) {
    const response = await this.fetcher(`${this.base}${path}`, {
      method: body == null ? "GET" : "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body == null ? {} : { "content-type": "application/json" }),
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        `Slop request failed: ${
          typeof result?.code === "string" && /^[a-z_]{1,60}$/.test(result.code)
            ? result.code
            : "service_unavailable"
        }`,
      );
    }
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
      message:
        "Open this pairing link in Slop on your phone. Review the requested draft access and approve it there. Opening the link does not approve.",
    };
  }
  async status() {
    const config = await this.config();
    if (!config) return { status: "not_paired" };
    if (config.poll_token) {
      const pair = await this.request(
        `/pair/status?pairing_id=${encodeURIComponent(config.pairing_id)}`,
        config.poll_token,
      );
      if (pair.status !== "approved") return pair;
    }
    return this.request("/agent/status", config.token);
  }
  async authorized(path, body) {
    const config = await this.config();
    if (!config) throw new Error("Pair Slop before sending a draft.");
    return this.request(path, config.token, body);
  }
}
