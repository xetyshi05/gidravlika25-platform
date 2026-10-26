const base = "http://crm.invalid";

/**
 * Returns a same-origin path for the post-login redirect, or null. Only plain
 * `/…` paths pass: no scheme, no `//host`, no backslashes or encoded slashes that
 * a browser or proxy could turn into another host, and no auth pages.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]|%2f|%5c/i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  if (/^\/(login|setup)(\/|$)/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
