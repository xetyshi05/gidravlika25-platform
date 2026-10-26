import createClient from "openapi-fetch";
import { fetchWithTimeout } from "@gidravlika25/shared/fetch-with-timeout";

/** openapi-fetch client typed by the API's OpenAPI contract (ARCH-01). */
export function createApiClient(baseUrl) {
  return createClient({ baseUrl });
}

/**
 * The `fetch` for openapi-fetch calls: a timeout on top of the caller's own
 * abort signal. openapi-fetch keeps Next.js options (`next: { revalidate,
 * tags }`) on the Request object, but Next.js rebuilds a Request that comes
 * with a separate `init` and would drop them — so they move into `init`.
 */
export function timedFetch(timeoutMs, onResponse) {
  return async (request) => {
    const { next } = request;
    const response = await fetchWithTimeout(
      request,
      { signal: request.signal, ...(next ? { next } : {}) },
      timeoutMs,
    );
    onResponse?.(response);
    return response;
  };
}
