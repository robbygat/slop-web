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
// The service has no per-run exclusion list. Force only the first claim so a
// permanently failing popular game cannot be reclaimed for the whole budget.
export function retryFailedForClaim(requested, claimed) { return requested && claimed === 0; }
