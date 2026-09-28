import {SlopError} from './contracts.js';

// Bound both the network request and any SDK session wait before it starts.
// This is for repeatable public reads only; owner writes keep their own receipts.
export async function publicRead(query, {timeoutMs = 10000} = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SlopError('service_unavailable', 'The game server is taking a moment. Please try again.'));
    }, timeoutMs);
  });
  try {
    const {data, error} = await Promise.race([query.abortSignal(controller.signal), deadline]);
    if (error) throw new SlopError(error.code, error.message);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
