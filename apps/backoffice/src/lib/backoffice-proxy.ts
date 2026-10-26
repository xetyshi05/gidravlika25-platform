/**
 * Routing rules shared by the Back Office BFF proxy and the browser client.
 *
 * Timeouts are layered so that the inner hop always gives up first and its
 * error reaches the user: API work < BFF timeout < Nginx `proxy_read_timeout`
 * for `/api/backoffice/` (125 s) < browser timeout.
 */

export const BACKOFFICE_DEFAULT_TIMEOUT_MS = 12_000;
/** Extra time the browser waits on top of the BFF timeout. */
export const BACKOFFICE_CLIENT_TIMEOUT_MARGIN_MS = 10_000;

// Route names, cuid/uuid identifiers and session ids only. Next.js decodes
// segments, so `..`, `%2F` (as "/") and `%5C` (as "\") are all rejected here.
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeBackofficePath(segments: readonly string[]) {
  return segments.length > 0 && segments.every((segment) => SAFE_SEGMENT.test(segment));
}

type Rule = { method: string; pattern: readonly string[]; timeoutMs: number };

// `*` matches exactly one identifier segment.
const rules: readonly Rule[] = [
  // Background removal (up to 60 s in the worker), WebP encoding and S3 upload.
  { method: "POST", pattern: ["products", "image-preview"], timeoutMs: 120_000 },
  { method: "POST", pattern: ["products", "*", "image"], timeoutMs: 120_000 },
  // Site media: resize, WebP encoding and S3 upload, no background removal.
  { method: "POST", pattern: ["media"], timeoutMs: 60_000 },
  { method: "POST", pattern: ["media", "*", "image"], timeoutMs: 60_000 },
  { method: "POST", pattern: ["media", "*", "crop"], timeoutMs: 60_000 },
  // The browser imports originals one file per request.
  { method: "POST", pattern: ["media", "originals", "import"], timeoutMs: 60_000 },
  { method: "POST", pattern: ["media", "originals", "import-catalog"], timeoutMs: 60_000 },
  // Walks the S3 bucket and the originals directory.
  { method: "POST", pattern: ["media", "originals", "synchronize"], timeoutMs: 120_000 },
  { method: "GET", pattern: ["media", "storage-status"], timeoutMs: 60_000 },
  { method: "GET", pattern: ["media", "*", "image-source"], timeoutMs: 30_000 },
];

function matches(pattern: readonly string[], segments: readonly string[]) {
  return (
    pattern.length === segments.length &&
    pattern.every((part, index) => part === "*" || part === segments[index])
  );
}

export function backofficeProxyTimeout(method: string, segments: readonly string[]) {
  const upper = method.toUpperCase();
  return (
    rules.find((rule) => rule.method === upper && matches(rule.pattern, segments))?.timeoutMs ??
    BACKOFFICE_DEFAULT_TIMEOUT_MS
  );
}

/** Browser-side timeout for a `/backoffice/...` path such as `/products/1/image?x=1`. */
export function backofficeClientTimeout(method: string, path: string) {
  const segments = path.split("?", 1)[0]!.split("/").filter(Boolean);
  return backofficeProxyTimeout(method, segments) + BACKOFFICE_CLIENT_TIMEOUT_MARGIN_MS;
}
