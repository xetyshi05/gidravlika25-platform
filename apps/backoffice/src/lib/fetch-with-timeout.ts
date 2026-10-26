import {
  fetchWithTimeout as sharedFetchWithTimeout,
  isRequestAbort,
  isRequestTimeout,
} from "@gidravlika25/shared/fetch-with-timeout";

export { isRequestAbort, isRequestTimeout };

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
) {
  return sharedFetchWithTimeout(input, init, timeoutMs);
}
