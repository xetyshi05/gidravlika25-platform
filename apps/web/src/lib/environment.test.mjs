import assert from "node:assert/strict";
import { test } from "node:test";
import { validateNextEnvironment } from "../../../../config/validate-next-environment.mjs";

test("local Next.js builds keep their development defaults", () => {
  assert.doesNotThrow(() => validateNextEnvironment("web", {}));
  assert.doesNotThrow(() => validateNextEnvironment("crm", {}));
  assert.doesNotThrow(() => validateNextEnvironment("backoffice", {}));
});

test("provided environment values are validated in every environment", () => {
  assert.throws(
    () => validateNextEnvironment("crm", { API_URL: "not-a-url" }),
    /API_URL must be a valid absolute URL/,
  );
  assert.throws(
    () => validateNextEnvironment("web", { NEXT_PUBLIC_SITE_URL: "https://example.com/catalog" }),
    /must be an origin/,
  );
  assert.throws(
    () =>
      validateNextEnvironment("backoffice", {
        BACKOFFICE_ORIGIN: "https://admin.example.com/catalog",
      }),
    /BACKOFFICE_ORIGIN must be an origin/,
  );
  assert.throws(
    () => validateNextEnvironment("web", { S3_ALLOW_LOCAL_IP: "yes" }),
    /S3_ALLOW_LOCAL_IP must be true or false/,
  );
});

test("deployed Web requires private and public API URLs, site origin and a real secret", () => {
  assert.throws(
    () => validateNextEnvironment("web", { APP_ENV: "production" }),
    /API_URL is required/,
  );
  assert.throws(
    () =>
      validateNextEnvironment("web", {
        APP_ENV: "production",
        API_URL: "http://api:4000",
        NEXT_PUBLIC_API_URL: "http://localhost:4000",
        NEXT_PUBLIC_SITE_URL: "https://gidravlika25.ru",
        CATALOG_REVALIDATION_SECRET: "replace-with-a-shared-secret-at-least-32-characters",
      }),
    /NEXT_PUBLIC_API_URL must use https/,
  );
});

test("complete deployment environments are accepted", () => {
  assert.doesNotThrow(() =>
    validateNextEnvironment("web", {
      APP_ENV: "production",
      API_URL: "http://api:4000",
      NEXT_PUBLIC_API_URL: "https://api.gidravlika25.ru",
      NEXT_PUBLIC_SITE_URL: "https://gidravlika25.ru",
      S3_PUBLIC_URL: "https://s3.example.com/gidravlika-catalog",
      CATALOG_REVALIDATION_SECRET: "r".repeat(32),
    }),
  );
  assert.doesNotThrow(() =>
    validateNextEnvironment("crm", {
      APP_ENV: "staging",
      API_URL: "http://api:4000",
      S3_PUBLIC_URL: "https://s3.example.com/gidravlika-catalog",
    }),
  );
  assert.doesNotThrow(() =>
    validateNextEnvironment("backoffice", {
      APP_ENV: "production",
      API_URL: "http://api:4000",
      S3_PUBLIC_URL: "https://s3.example.com/gidravlika-catalog",
      BACKOFFICE_ORIGIN: "https://admin.gidravlika25.ru",
    }),
  );
});
