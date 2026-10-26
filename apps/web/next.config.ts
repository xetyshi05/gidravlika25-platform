import type { NextConfig } from "next";
import path from "node:path";
import { validateNextEnvironment } from "../../config/validate-next-environment.mjs";

validateNextEnvironment("web", process.env);

const isDevelopment = process.env.NODE_ENV !== "production";
type ImageConfig = NonNullable<NextConfig["images"]>;
const allowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const apiOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).origin : "";
  } catch {
    return "";
  }
})();
const s3PublicUrl = (() => {
  try {
    const publicUrl = new URL(process.env.S3_PUBLIC_URL ?? "https://cdn.gidravlika25.ru");
    return publicUrl.protocol === "http:" || publicUrl.protocol === "https:" ? publicUrl : null;
  } catch {
    return null;
  }
})();
const pathPrefix = s3PublicUrl?.pathname.replace(/\/$/, "") ?? "";
const s3ImagePatterns: NonNullable<ImageConfig["remotePatterns"]> = s3PublicUrl
  ? (["catalog", "products", "site"] as const).map((directory) => ({
      protocol: s3PublicUrl.protocol === "http:" ? "http" : "https",
      hostname: s3PublicUrl.hostname,
      port: s3PublicUrl.port,
      pathname: `${pathPrefix}/${directory}/**`,
      // Image URLs carry no version query: every version has its own key.
      search: "",
    }))
  : [];
const s3ImageOrigin = s3PublicUrl?.origin ?? "";
// The same prefixes for `lib/image-source.ts`, which keeps other URLs away from the optimizer.
const imageOptimizerPrefixes = s3PublicUrl
  ? ["catalog", "products", "site"].map(
      (directory) => `${s3ImageOrigin}${pathPrefix}/${directory}/`,
    )
  : [];
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://api-maps.yandex.ru https://yastatic.net https://*.yandex.ru https://*.yandex.net https://*.yandex.com`,
  "style-src 'self' 'unsafe-inline' https://yastatic.net",
  `img-src 'self' data: blob:${s3ImageOrigin ? ` ${s3ImageOrigin}` : ""} https://yastatic.net https://*.yandex.ru https://*.yandex.net https://*.yandex.com`,
  "font-src 'self' data: https://yastatic.net",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}${isDevelopment ? " ws:" : ""} https://api-maps.yandex.ru https://*.yandex.ru https://*.yandex.net https://*.yandex.com`,
  "worker-src 'self' blob:",
  "frame-src https://yandex.ru https://*.yandex.ru",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  !isDevelopment && "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactCompiler: true,
  poweredByHeader: false,
  env: { IMAGE_OPTIMIZER_PREFIXES: imageOptimizerPrefixes.join(",") },
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // WEB-01/WEB-07: product and site photos go through the optimizer, so a phone
  // gets a picture sized for its screen instead of the 2400 px original.
  images: {
    // The largest stored image is 2400 px wide; larger widths would only re-encode it.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    // Every image version has its own S3 key, so a resized copy never goes stale.
    minimumCacheTTL: 30 * 24 * 60 * 60,
    // Local-IP optimization is development-only and must be explicitly enabled.
    dangerouslyAllowLocalIP:
      isDevelopment && process.env.S3_ALLOW_LOCAL_IP?.trim().toLowerCase() === "true",
    remotePatterns: s3ImagePatterns,
  },
};

export default nextConfig;
