const failure = message => new Error(`Public game route generation failed: ${message}. Retry the build when api.slop.game responds; do not deploy an incomplete route set.`);

// A stalled response body must not hold the release build indefinitely.
// Disabling SDK retries makes this one bounded read, and abort stops its I/O.
export async function readPublicRouteRows(query, label, {timeoutMs = 30000} = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(failure(`${label} did not finish within ${Math.ceil(timeoutMs / 1000)} seconds`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const {data, error} = await Promise.race([
      Promise.resolve(query.abortSignal(controller.signal).retry(false)),
      deadline,
    ]);
    if (error) throw failure(`${label}: ${String(error.message || 'public catalog unavailable').slice(0, 240)}`);
    if (!Array.isArray(data)) throw failure(`${label} returned an invalid row list`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
