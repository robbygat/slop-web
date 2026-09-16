// Streaming request/response body readers with a hard byte ceiling.
//
// Content-Length is only an early rejection hint: HTTP/2 and chunked requests
// commonly omit it, and buffering with text()/json()/arrayBuffer() before
// checking the decoded size allows an attacker to exhaust an Edge isolate.

export type BodyReadFailure = "invalid" | "too_large" | "timeout";

export type BodyReadOptions = {
  // One absolute deadline prevents a peer that trickles a byte just before an
  // idle timeout from retaining an Edge isolate indefinitely.
  timeoutMs?: number;
};

const DEFAULT_BODY_READ_TIMEOUT_MS = 30_000;

export class BoundedBodyError extends Error {
  readonly failure: BodyReadFailure;

  constructor(failure: BodyReadFailure) {
    super(
      failure === "too_large"
        ? "body exceeds byte limit"
        : failure === "timeout"
        ? "body read timed out"
        : "invalid body",
    );
    this.name = "BoundedBodyError";
    this.failure = failure;
  }
}

type ReadableBody = {
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  readonly signal?: AbortSignal;
};

export function isJsonContentType(
  source: Pick<ReadableBody, "headers">,
): boolean {
  const raw = source.headers.get("content-type") ?? "";
  const mediaType = raw.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function validateLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError("maxBytes must be a non-negative safe integer");
  }
}

function readTimeout(options: BodyReadOptions): number {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BODY_READ_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000
  ) {
    throw new TypeError("timeoutMs must be an integer between 1 and 300000");
  }
  return timeoutMs;
}

function validateAnnouncedLength(source: ReadableBody, maxBytes: number): void {
  const raw = source.headers.get("content-length");
  if (raw == null) return;
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) throw new BoundedBodyError("invalid");
  const announced = Number(normalized);
  if (!Number.isSafeInteger(announced)) throw new BoundedBodyError("invalid");
  if (announced > maxBytes) throw new BoundedBodyError("too_large");
}

export async function readBoundedBytes(
  source: ReadableBody,
  maxBytes: number,
  options: BodyReadOptions = {},
): Promise<Uint8Array> {
  validateLimit(maxBytes);
  validateAnnouncedLength(source, maxBytes);
  if (source.body == null) return new Uint8Array();

  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Date.now() + readTimeout(options);
  try {
    while (true) {
      if (source.signal?.aborted) throw new BoundedBodyError("timeout");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new BoundedBodyError("timeout");

      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort: (() => void) | undefined;
      const interrupted = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new BoundedBodyError("timeout")),
          remaining,
        );
        if (source.signal) {
          abort = () => reject(new BoundedBodyError("timeout"));
          source.signal.addEventListener("abort", abort, { once: true });
        }
      });
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await Promise.race([reader.read(), interrupted]);
      } catch (error) {
        // Do not await cancellation: a hostile or broken stream may also stall
        // its cancel hook. Releasing the request promptly is authoritative.
        void reader.cancel("body read interrupted").catch(() => undefined);
        throw error;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (abort && source.signal) {
          source.signal.removeEventListener("abort", abort);
        }
      }

      const { done, value } = chunk;
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel("body exceeds byte limit").catch(() => undefined);
        throw new BoundedBodyError("too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedText(
  source: ReadableBody,
  maxBytes: number,
  options: BodyReadOptions = {},
): Promise<string> {
  const bytes = await readBoundedBytes(source, maxBytes, options);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new BoundedBodyError("invalid");
  }
}

export async function readBoundedJsonObject(
  source: ReadableBody,
  maxBytes: number,
  options: BodyReadOptions = {},
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBoundedText(source, maxBytes, options));
  } catch (error) {
    if (error instanceof BoundedBodyError) throw error;
    throw new BoundedBodyError("invalid");
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BoundedBodyError("invalid");
  }
  return parsed as Record<string, unknown>;
}
