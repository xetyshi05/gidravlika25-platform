// Browser E2E stand (TEST-01): ports, URLs and the environment of every process.
// Everything runs on its own ports next to a normal `pnpm dev`, and every value
// the apps could read from a local .env file is set here explicitly, so a test
// run never reaches the developer database or a real S3 bucket.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const ports = {
  api: 4100,
  web: 3100,
  crm: 3101,
  backoffice: 3102,
  imageWorker: 8101,
  postgres: 55432,
  s3: 9100,
};

export const urls = {
  api: `http://localhost:${ports.api}`,
  web: `http://localhost:${ports.web}`,
  crm: `http://localhost:${ports.crm}`,
  backoffice: `http://localhost:${ports.backoffice}`,
  imageWorker: `http://127.0.0.1:${ports.imageWorker}`,
  s3: `http://127.0.0.1:${ports.s3}`,
};

const bucket = "gidravlika-e2e";
// Test-only values: the stand is local and throwaway.
const revalidationSecret = "e2e-catalog-revalidation-secret-0123456789";

export const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  `postgresql://gidravlika:gidravlika_e2e_password@127.0.0.1:${ports.postgres}/gidravlika_e2e?schema=public`;

export const twoFactorMockCode = "000000";

export const apiEnvironment = {
  NODE_ENV: "test",
  APP_ENV: "test",
  PORT: String(ports.api),
  LOG_LEVEL: "warn",
  DATABASE_URL: databaseUrl,
  TWO_FACTOR_MODE: "mock",
  TWO_FACTOR_MOCK_CODE: twoFactorMockCode,
  TOTP_ENCRYPTION_KEY: "e2e-totp-encryption-key-0123456789abcdef",
  BOOTSTRAP_SECRET: "",
  WEB_ORIGIN: urls.web,
  TRUST_PROXY_HOPS: "0",
  // Cheap proof of work: the browser still solves a real ALTCHA challenge.
  ALTCHA_HMAC_SECRET: "e2e-altcha-hmac-secret-0123456789abcdef",
  ALTCHA_COST: "1",
  ALTCHA_MAX_COUNTER: "20",
  PUBLIC_REQUEST_RATE_LIMIT_MAX: "100",
  PUBLIC_REQUEST_CONTACT_LIMIT_MAX: "100",
  DADATA_API_KEY: "",
  S3_ENDPOINT: urls.s3,
  S3_REGION: "us-east-1",
  S3_BUCKET: bucket,
  S3_ACCESS_KEY_ID: "gidravlika-e2e",
  S3_SECRET_ACCESS_KEY: "gidravlika-e2e-password",
  S3_PUBLIC_URL: `${urls.s3}/${bucket}`,
  MEDIA_ORIGINALS_DIR: join(root, "e2e/.local/originals"),
  STORAGE_CLEANUP_ENABLED: "false",
  MEDIA_RECONCILE_ENABLED: "false",
  PERSONAL_DATA_RETENTION_ENABLED: "false",
  BACKGROUND_REMOVAL_URL: urls.imageWorker,
  CATALOG_REVALIDATION_URL: `${urls.web}/api/revalidate-catalog`,
  CATALOG_REVALIDATION_SECRET: revalidationSecret,
  OPS_STATUS_TOKEN: "",
};

const nextEnvironment = {
  APP_ENV: "test",
  API_URL: urls.api,
  S3_PUBLIC_URL: apiEnvironment.S3_PUBLIC_URL,
  S3_ALLOW_LOCAL_IP: "false",
};

export const webEnvironment = {
  ...nextEnvironment,
  NEXT_PUBLIC_API_URL: urls.api,
  NEXT_PUBLIC_SITE_URL: urls.web,
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: "",
  CATALOG_REVALIDATION_SECRET: revalidationSecret,
};
export const crmEnvironment = { ...nextEnvironment, NEXT_PUBLIC_API_URL: urls.api };
export const backofficeEnvironment = { ...nextEnvironment, BACKOFFICE_ORIGIN: urls.backoffice };

/**
 * `environment` plus an empty value for every other key of the apps' local .env
 * files: dotenv and Next.js never override a variable that is already set.
 */
export function isolatedEnvironment(appDirectories, environment) {
  const blanked = {};
  for (const directory of appDirectories) {
    for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
      const path = join(root, directory, file);
      if (!existsSync(path)) continue;
      for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
        if (key) blanked[key] = "";
      }
    }
  }
  return { ...process.env, ...blanked, ...environment };
}
