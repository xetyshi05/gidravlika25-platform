import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BACKOFFICE_DEFAULT_TIMEOUT_MS,
  backofficeClientTimeout,
  backofficeProxyTimeout,
  isSafeBackofficePath,
} from "./backoffice-proxy.ts";

test("accepts route names and identifiers", () => {
  assert.equal(isSafeBackofficePath(["products", "cmf1abc2d0000xyz", "image"]), true);
  assert.equal(
    isSafeBackofficePath(["users", "u-1", "sessions", "3f2b9c1e-7a4d-4a8e-9b1c-2d3e4f5a6b7c"]),
    true,
  );
  assert.equal(isSafeBackofficePath(["media", "originals", "import-catalog"]), true);
});

test("rejects segments that could leave the /backoffice/ prefix", () => {
  for (const segments of [
    [],
    [".."],
    ["products", ".."],
    ["products", "."],
    ["..", "auth", "me"],
    ["products", "a/../../auth"],
    ["products", "a\\b"],
    ["products", "%2e%2e"],
    ["products", ""],
    ["products", "a b"],
    ["products", "a?b"],
    ["products", "x".repeat(129)],
  ]) {
    assert.equal(isSafeBackofficePath(segments), false, JSON.stringify(segments));
  }
});

test("long media operations get explicit timeouts", () => {
  assert.equal(backofficeProxyTimeout("POST", ["products", "p-1", "image"]), 120_000);
  assert.equal(backofficeProxyTimeout("POST", ["products", "image-preview"]), 120_000);
  assert.equal(backofficeProxyTimeout("POST", ["media"]), 60_000);
  assert.equal(backofficeProxyTimeout("POST", ["media", "m-1", "image"]), 60_000);
  assert.equal(backofficeProxyTimeout("POST", ["media", "m-1", "crop"]), 60_000);
  assert.equal(backofficeProxyTimeout("POST", ["media", "originals", "import"]), 60_000);
  assert.equal(backofficeProxyTimeout("POST", ["media", "originals", "import-catalog"]), 60_000);
  assert.equal(backofficeProxyTimeout("POST", ["media", "originals", "synchronize"]), 120_000);
  assert.equal(backofficeProxyTimeout("GET", ["media", "storage-status"]), 60_000);
});

test("ordinary requests keep the short default", () => {
  assert.equal(backofficeProxyTimeout("GET", ["products"]), BACKOFFICE_DEFAULT_TIMEOUT_MS);
  assert.equal(backofficeProxyTimeout("GET", ["media"]), BACKOFFICE_DEFAULT_TIMEOUT_MS);
  assert.equal(
    backofficeProxyTimeout("PATCH", ["products", "image-preview"]),
    BACKOFFICE_DEFAULT_TIMEOUT_MS,
  );
  assert.equal(
    backofficeProxyTimeout("POST", ["users", "u-1", "image"]),
    BACKOFFICE_DEFAULT_TIMEOUT_MS,
  );
});

test("the browser waits longer than the BFF, and the BFF fits into the Nginx timeout", () => {
  assert.equal(backofficeClientTimeout("POST", "/products/p-1/image"), 130_000);
  assert.equal(backofficeClientTimeout("GET", "/products?page=1"), 22_000);

  const nginx = readFileSync(
    new URL("../../../../deploy/nginx/production.conf", import.meta.url),
    "utf8",
  );
  const block = nginx.slice(nginx.indexOf("location /api/backoffice/"));
  const readTimeout = Number(/proxy_read_timeout (\d+)s;/.exec(block)?.[1]) * 1000;
  assert.ok(readTimeout > backofficeProxyTimeout("POST", ["products", "p-1", "image"]));
  assert.ok(readTimeout < backofficeClientTimeout("POST", "/products/p-1/image"));
});
