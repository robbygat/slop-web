const failure = message => new Error(`Public game route generation failed: ${message}. Retry the build when api.slop.game responds; do not deploy an incomplete route set.`);

// A stalled response body must not hold the release build indefinitely.
// Disabling SDK retries makes this one bounded read, and abort stops its I/O.
async function readPublicRouteResult(query, label, {timeoutMs = 30000} = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(failure(`${label} did not finish within ${Math.ceil(timeoutMs / 1000)} seconds`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const {data, error, count} = await Promise.race([
      Promise.resolve(query.abortSignal(controller.signal).retry(false)),
      deadline,
    ]);
    if (error) throw failure(`${label}: ${String(error.message || 'public catalog unavailable').slice(0, 240)}`);
    if (!Array.isArray(data)) throw failure(`${label} returned an invalid row list`);
    return {data, count};
  } finally {
    clearTimeout(timer);
  }
}

export async function readPublicRouteRows(query, label, options) {
  return (await readPublicRouteResult(query, label, options)).data;
}

export async function readPublicRoutePage(query, label, options) {
  const {data, count} = await readPublicRouteResult(query, label, options);
  if (!Number.isSafeInteger(count) || count < 0) throw failure(`${label} has no exact catalog count`);
  return {rows: data, total: count};
}
