import type { NextConfig } from "next";
import path from "node:path";
import { validateNextEnvironment } from "../../config/validate-next-environment.mjs";

validateNextEnvironment("backoffice", process.env);

const isDevelopment = process.env.NODE_ENV !== "production";
const s3ImageOrigin = (() => {
  try {
    return process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL).origin : "";
  } catch {
    return "";
  }
})();
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${s3ImageOrigin ? ` ${s3ImageOrigin}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${isDevelopment ? " ws:" : ""}`,
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
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
