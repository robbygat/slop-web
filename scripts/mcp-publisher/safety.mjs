// A narrow anonymous read protects feed traffic before background writes.
export const PUBLISHABLE_KEY = "sb_publishable_hR6MXJRNM9VuADkU8z-2mg_K9t7FBQL";
const HEALTH_URL = "https://api.slop.game/rest/v1/games?select=slug&limit=1";
export class ApiHealthFailure extends Error {
  constructor() { super("api_unhealthy"); this.code = "api_unhealthy"; }
}
export async function checkApiHealth({ fetchImpl = fetch, now = () => performance.now(), timeoutMs = 1000 } = {}) {
  const started = now();
  try {
    const response = await fetchImpl(HEALTH_URL, {
      headers: { apikey: PUBLISHABLE_KEY }, redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    });
    // Include response-body time, not just arrival of HTTP headers.
    await response.arrayBuffer();
    if (!response.ok || now() - started >= timeoutMs) throw new ApiHealthFailure();
  } catch { throw new ApiHealthFailure(); }
}
// A server-issued snapshot retries old failures once each. Reuse it on every
// claim so fresh failures (including an initial first failure) stay excluded.
export function createVideoRetryPass(requested) {
  let retryBefore;
  return {
    claimInput: () => requested
      ? { retry_failed: true, ...(retryBefore ? { retry_before: retryBefore } : {}) }
      : { retry_failed: false },
    acceptClaim(result) {
      if (!requested) return;
      const received = result?.retry_before;
      if (typeof received !== "string" || received.length > 40 ||
          !/^\d{4}-\d{2}-\d{2}T/.test(received) || !Number.isFinite(Date.parse(received)) ||
          (retryBefore && received !== retryBefore)) throw new Error("video_retry_cutoff_invalid");
      retryBefore = received;
    },
  };
}
