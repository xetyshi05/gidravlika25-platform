/**
 * Decides how a photo URL is passed to `next/image` (WEB-01, WEB-07).
 *
 * `next/image` throws — and the whole page fails — for a remote URL that is not
 * in `images.remotePatterns`. Such URLs can still appear: a page cached before
 * the image URLs lost their `?v=` version, or a changed S3_PUBLIC_URL. So:
 * local files and URLs under the configured S3 prefixes are optimized (a
 * leftover query is dropped: every image version has its own key); anything
 * else is shown as is, without the optimizer.
 */
export function imageSource(
  src: string,
  optimizedPrefixes: readonly string[] = configuredPrefixes(),
): { src: string; unoptimized: boolean } {
  if (src.startsWith("/") && !src.startsWith("//")) return { src, unoptimized: false };
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return { src, unoptimized: true };
  }
  const withoutQuery = `${url.origin}${url.pathname}`;
  return optimizedPrefixes.some((prefix) => withoutQuery.startsWith(prefix))
    ? { src: withoutQuery, unoptimized: false }
    : { src, unoptimized: true };
}

function configuredPrefixes() {
  // Inlined at build time from next.config.ts, like `images.remotePatterns`.
  return (process.env.IMAGE_OPTIMIZER_PREFIXES ?? "").split(",").filter(Boolean);
}
