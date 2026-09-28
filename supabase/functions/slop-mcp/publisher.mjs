// Server-side recorder authority for MCP auto-publish.
//
// Only one caller may claim publish jobs: the mcp-autopublish workflow on the
// main branch of robbygat/slop-web, running on a GitHub-hosted runner from a
// schedule or a manual dispatch. It proves that with a GitHub Actions OIDC
// token, verified here (RS256 against GitHub's JWKS) and immediately exchanged
// for a single-job lease. The repository is public: pull requests, forks and
// other workflows or branches produce tokens that fail these pinned claims.
import { BridgeError, requireValue } from "./contract.mjs";

export const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
export const PUBLISHER_POLICY = Object.freeze({
  audience: "https://api.slop.game/functions/v1/slop-mcp",
  repository: "robbygat/slop-web",
  repository_id: "1269836680",
  repository_owner: "robbygat",
  repository_owner_id: "195066519",
  ref: "refs/heads/main",
  workflow_ref:
    "robbygat/slop-web/.github/workflows/mcp-autopublish.yml@refs/heads/main",
  events: ["schedule", "workflow_dispatch"],
  runner_environment: "github-hosted",
});
export const LEASE = /^slop_lease_[0-9a-f]{64}$/;
export const FAILURE_CODES = new Set([
  "boot_error", "not_ready", "blank_canvas", "no_motion", "capture_too_large",
  "runtime_invalid", "recorder_error",
]);
const SKEW = 60;

function b64url(value) {
  requireValue(typeof value === "string" && /^[A-Za-z0-9_-]*$/.test(value), "invalid_publisher", 401);
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
function jsonPart(value) {
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b64url(value)));
    requireValue(parsed && typeof parsed === "object" && !Array.isArray(parsed), "invalid_publisher", 401);
    return parsed;
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new BridgeError("invalid_publisher", 401);
  }
}

export function createOidcVerifier({
  fetcher = fetch,
  now = () => Date.now(),
  policy = PUBLISHER_POLICY,
  cacheMs = 10 * 60_000,
} = {}) {
  let cache = null, lastRefresh = -Infinity;
  async function keys(force = false) {
    if (!force && cache && now() - cache.at < cacheMs) return cache.keys;
    // An unknown kid may force one refresh per minute (GitHub key rotation),
    // never one per request.
    if (force && now() - lastRefresh < 60_000 && cache) return cache.keys;
    lastRefresh = now();
    const response = await fetcher(`${GITHUB_ISSUER}/.well-known/jwks`, {
      redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    const body = response.ok ? await response.json().catch(() => null) : null;
    if (!Array.isArray(body?.keys)) throw new BridgeError("publisher_unavailable", 503);
    cache = { at: now(), keys: body.keys };
    return cache.keys;
  }
  return async function verify(token) {
    requireValue(typeof token === "string" && token.length <= 4096, "invalid_publisher", 401);
    const parts = token.split(".");
    requireValue(parts.length === 3, "invalid_publisher", 401);
    const header = jsonPart(parts[0]);
    requireValue(header.alg === "RS256" && typeof header.kid === "string" && header.kid.length <= 200, "invalid_publisher", 401);
    let jwk = (await keys()).find((k) => k?.kid === header.kid);
    if (!jwk) jwk = (await keys(true)).find((k) => k?.kid === header.kid);
    requireValue(jwk && jwk.kty === "RSA" && typeof jwk.n === "string" && typeof jwk.e === "string" &&
      (jwk.alg == null || jwk.alg === "RS256") && (jwk.use == null || jwk.use === "sig"), "invalid_publisher", 401);
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    requireValue(valid, "invalid_publisher", 401);
    const claims = jsonPart(parts[1]);
    const t = Math.floor(now() / 1000);
    requireValue(
      claims.iss === GITHUB_ISSUER &&
        (claims.aud === policy.audience ||
          (Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === policy.audience)) &&
        Number.isFinite(claims.exp) && claims.exp > t - SKEW &&
        (claims.nbf == null || (Number.isFinite(claims.nbf) && claims.nbf <= t + SKEW)) &&
        Number.isFinite(claims.iat) && claims.iat <= t + SKEW && claims.exp - claims.iat <= 3600 &&
        claims.repository === policy.repository &&
        String(claims.repository_id) === policy.repository_id &&
        claims.repository_owner === policy.repository_owner &&
        String(claims.repository_owner_id) === policy.repository_owner_id &&
        claims.ref === policy.ref &&
        claims.workflow_ref === policy.workflow_ref &&
        policy.events.includes(claims.event_name) &&
        claims.runner_environment === policy.runner_environment,
      "invalid_publisher",
      401,
    );
    return { run_id: String(claims.run_id ?? ""), event_name: claims.event_name };
  };
}

// Canonical recorder media: the website's 720x1280 / 1280x720 JPEG cover and
// 360x640 / 640x360 animated GIF (3-40 timed frames, <= 2 MiB).
export function jpegSize(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let p = 2;
  while (p + 9 < bytes.length) {
    if (bytes[p] !== 0xff) return null;
    const marker = bytes[p + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { p += 2; continue; }
    const length = (bytes[p + 2] << 8) | bytes[p + 3];
    if (length < 2) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[p + 5] << 8) | bytes[p + 6], width: (bytes[p + 7] << 8) | bytes[p + 8] };
    }
    p += 2 + length;
  }
  return null;
}
export function gifSize(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 ||
    String.fromCharCode(...bytes.slice(0, 6)) !== "GIF89a") return null;
  const width = bytes[6] | (bytes[7] << 8), height = bytes[8] | (bytes[9] << 8);
  let p = 6; const packed = bytes[p + 4]; p += 7;
  if (packed & 128) p += 3 * (1 << ((packed & 7) + 1));
  let frames = 0, delays = 0;
  const blocks = () => {
    while (true) {
      if (p >= bytes.length) return false;
      const size = bytes[p++];
      if (!size) return true;
      p += size;
      if (p > bytes.length) return false;
    }
  };
  while (p < bytes.length) {
    const marker = bytes[p++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[p++];
      if (label === 0xf9) {
        if (bytes[p++] !== 4 || p + 4 > bytes.length) return null;
        if ((bytes[p + 1] | (bytes[p + 2] << 8)) >= 2) delays++;
        p += 4;
        if (bytes[p++] !== 0) return null;
      } else if (!blocks()) return null;
      continue;
    }
    if (marker === 0x2c) {
      if (p + 9 > bytes.length) return null;
      const local = bytes[p + 8]; p += 9;
      if (local & 128) p += 3 * (1 << ((local & 7) + 1));
      if (p >= bytes.length) return null;
      p++;
      if (!blocks()) return null;
      frames++;
      continue;
    }
    return null;
  }
  return { width, height, frames, timed: delays >= frames };
}
export function validateMedia(kind, bytes) {
  if (kind === "cover") {
    const size = jpegSize(bytes);
    requireValue(bytes.length >= 1 && bytes.length <= 716_800 && size &&
      ((size.width === 720 && size.height === 1280) || (size.width === 1280 && size.height === 720)),
      "media_invalid", 422);
    return { width: size.width, height: size.height, frame_count: null };
  }
  if (kind === "gif") {
    const size = gifSize(bytes);
    requireValue(bytes.length >= 1 && bytes.length <= 2_097_152 && size && size.timed &&
      size.frames >= 3 && size.frames <= 40 &&
      ((size.width === 360 && size.height === 640) || (size.width === 640 && size.height === 360)),
      "media_invalid", 422);
    return { width: size.width, height: size.height, frame_count: size.frames };
  }
  throw new BridgeError("invalid_request");
}

// Feed preview video: a faststart (moov before mdat) H.264 MP4 of 720x1280 or
// 1280x720, 2-15 s, <= 4 MiB, with a same-size poster JPEG.
export const VIDEO_MAX = 4_194_304;
export const VIDEO_FAILURE = /^[a-z_]{1,40}$/;
function boxes(bytes, start, end) {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) return null;
      const high = view.getUint32(p + 8), low = view.getUint32(p + 12);
      if (high) return null;
      size = low; header = 16;
    } else if (size === 0) size = end - p;
    if (size < header || p + size > end) return null;
    out.push({ type, start: p + header, end: p + size });
    p += size;
  }
  return p === end ? out : null;
}
export function mp4Info(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 64) return null;
  const top = boxes(bytes, 0, bytes.length);
  if (!top?.length || top[0].type !== "ftyp") return null;
  const moovIndex = top.findIndex((b) => b.type === "moov"), mdatIndex = top.findIndex((b) => b.type === "mdat");
  if (moovIndex < 0 || mdatIndex < 0 || moovIndex > mdatIndex) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const moov = boxes(bytes, top[moovIndex].start, top[moovIndex].end);
  const mvhd = moov?.find((b) => b.type === "mvhd");
  if (!mvhd) return null;
  const v1 = bytes[mvhd.start] === 1;
  const timescale = view.getUint32(mvhd.start + (v1 ? 20 : 12));
  const duration = v1 ? view.getUint32(mvhd.start + 28) : view.getUint32(mvhd.start + 16);
  if (!timescale) return null;
  const video = [];
  for (const trak of moov.filter((b) => b.type === "trak")) {
    const kids = boxes(bytes, trak.start, trak.end);
    const tkhd = kids?.find((b) => b.type === "tkhd");
    const mdia = kids?.find((b) => b.type === "mdia");
    if (!tkhd || !mdia) return null;
    const minf = boxes(bytes, mdia.start, mdia.end)?.find((b) => b.type === "minf");
    const stbl = minf && boxes(bytes, minf.start, minf.end)?.find((b) => b.type === "stbl");
    const stsd = stbl && boxes(bytes, stbl.start, stbl.end)?.find((b) => b.type === "stsd");
    if (!stsd || stsd.end - stsd.start < 16) return null;
    const codec = String.fromCharCode(...bytes.subarray(stsd.start + 12, stsd.start + 16));
    const width = view.getUint32(tkhd.end - 8) >>> 16, height = view.getUint32(tkhd.end - 4) >>> 16;
    if (width && height) video.push({ codec, width, height });
  }
  if (video.length !== 1) return null;
  return { ...video[0], duration_ms: Math.round((duration / timescale) * 1000) };
}
export function validateVideo(bytes) {
  const info = mp4Info(bytes);
  requireValue(bytes.length >= 1 && bytes.length <= VIDEO_MAX && info && info.codec === "avc1" &&
    ((info.width === 720 && info.height === 1280) || (info.width === 1280 && info.height === 720)) &&
    info.duration_ms >= 2000 && info.duration_ms <= 15000, "media_invalid", 422);
  return info;
}
export function validatePoster(bytes, width, height) {
  const size = jpegSize(bytes);
  requireValue(bytes.length >= 1 && bytes.length <= 716_800 && size && size.width === width && size.height === height,
    "media_invalid", 422);
  return size;
}
