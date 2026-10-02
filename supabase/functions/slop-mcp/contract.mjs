import {inspectBundle,fileBytes} from './bundle-rules.mjs';
import {mcpRuntimeProblem} from './runtime-policy.mjs';
export {fileBytes};
export const VERSION = "1.0.0";
export const MAX_BODY = 2_300_000;
export const MAX_DRAFT_BODY = 70_000_000;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const HASH = /^[0-9a-f]{64}$/;
export class BridgeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function requireValue(
  condition,
  code = "invalid_request",
  status = 400,
) {
  if (!condition) throw new BridgeError(code, status);
}
export async function sha256(value) {
  const data = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function secret(bytes = 32) {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function object(value) {
  requireValue(
    value != null && typeof value === "object" && !Array.isArray(value),
  );
  return value;
}
export function boundedText(value, max, optional = false) {
  requireValue(
    typeof value === "string" && value.length <= max &&
      (optional || value.trim().length > 0) &&
      !Array.from(value).some((c) =>
        c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127
      ),
  );
  return value.trim();
}
export async function validateDraft(input) {
  object(input);
  requireValue(
    UUID.test(input.project_id ?? "") && UUID.test(input.request_id ?? ""),
  );
  requireValue(
    Number.isSafeInteger(input.revision) && input.revision > 0 &&
      input.revision <= 1_000_000,
  );
  const name = boundedText(input.name, 80);
  const description = boundedText(input.description ?? "", 240, true);
  let checked;
  try { checked=inspectBundle(object(input.files),{retainDecoded:false}); }
  catch(error) { throw new BridgeError(error.message,error.message.includes('too_large')?413:400); }
  const files = checked.files;
  let target_platform = "mobile";
  if (Object.hasOwn(files, "slop-platform.json")) {
    let metadata;
    try { metadata = object(JSON.parse(files["slop-platform.json"])); }
    catch (error) { if (error instanceof BridgeError) throw error; throw new BridgeError("invalid_platform"); }
    requireValue(Object.keys(metadata).length === 1 &&
      ["mobile", "desktop", "cross-platform"].includes(metadata.target_platform), "invalid_platform");
    target_platform = metadata.target_platform;
  }
  const paths = Object.keys(files).sort();
  requireValue(
    paths.length > 0 && paths.length <= checked.budget.files &&
      Object.hasOwn(files, "index.html"),
    "invalid_bundle",
  );
  let bytes = 0;
  const manifest = [];
  // Reuse one bounded decode buffer only after each awaited digest completes.
  // Raw source strings remain immutable; SDK/client callers retain independent
  // byte arrays by default. No 50 MB collection of temporary binary buffers.
  const binaryBuffer=new Uint8Array(Math.max(0,...paths.filter(path=>typeof files[path]!=='string').map(path=>checked.byteLengths.get(path))));
  for (const path of paths) {
    requireValue(
      !/slop.*(?:asset|entitlement)|(?:asset|entitlement).*manifest/i.test(
        path,
      ),
      "store_assets_not_supported",
    );
    // Decode/hash one bounded asset at a time instead of retaining 50 MB of
    // binary buffers while serializing the outgoing source descriptors.
    const data = fileBytes(path,files[path],binaryBuffer);
    requireValue(data.length > 0, "empty_file");
    bytes += data.length;
    requireValue(
      data.length <= checked.budget.file && bytes <= checked.budget.total,
      "bundle_too_large",
      413,
    );
    manifest.push({
      path: `${VERSION}/${path}`,
      bytes: data.length,
      sha256: await sha256(data),
    });
  }
  requireValue(files["index.html"].trim().length > 0, "empty_entry_point");
  if(checked.persistent)requireValue(mcpRuntimeProblem(manifest,files['index.html'],true)===null,'runtime_invalid');
  const digest = await sha256(
    manifest.map((e) => `${e.path}:${e.bytes}:${e.sha256}`).join("\n"),
  );
  const requestDigest = await sha256(
    JSON.stringify({
      project_id: input.project_id,
      revision: input.revision,
      name,
      description,
      target_platform,
      digest,
    }),
  );
  return {
    project_id: input.project_id,
    request_id: input.request_id,
    revision: input.revision,
    name,
    description,
    target_platform,
    persistent: checked.persistent,
    files,
    manifest,
    digest,
    request_digest: requestDigest,
    bytes,
  };
}
export function mime(path) {
  return ({
    html: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    glb: "model/gltf-binary", bin: "application/octet-stream", jpg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2", ogg: "audio/ogg",
  })[path.split(".").pop()];
}
export function trustedPreview(receipt, slug, origins, now = Date.now()) {
  try {
    const url = new URL(receipt?.url);
    const expiry = Date.parse(receipt?.expires_at);
    return receipt?.ok === true && origins.includes(url.origin) &&
      url.protocol === "https:" &&
      !url.username && !url.password && !url.search && !url.hash &&
      new RegExp(
        `^/functions/v1/game-bundle/preview/[0-9a-f]{64}/${slug}/${
          VERSION.replaceAll(".", "\\.")
        }/index\\.html$`,
      ).test(url.pathname) &&
      Number.isFinite(expiry) && expiry > now && expiry <= now + 16 * 60_000;
  } catch {
    return false;
  }
}
