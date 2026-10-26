export declare const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export declare function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response>;

export declare function isRequestTimeout(error: unknown): boolean;
export declare function isRequestAbort(error: unknown): boolean;
