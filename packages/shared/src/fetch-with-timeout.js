export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

export function isRequestTimeout(error) {
  return error instanceof Error && error.name === "TimeoutError";
}

export function isRequestAbort(error) {
  return error instanceof Error && error.name === "AbortError";
}
