import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  CatalogApiError,
  catalogRevalidateSeconds,
  defaultCatalogSettings,
  getCatalogCategories,
  getCatalogProduct,
  getCatalogSettings,
  isCatalogNotFound,
} from "./catalog-api.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("catalog reads cache successful responses for a short period", async () => {
  let requestedUrl = "";
  let requestedInit;

  globalThis.fetch = async (input, init) => {
    // openapi-fetch passes a Request; Next.js options travel in `init` (see api-client.ts).
    requestedUrl = new Request(input, init).url;
    requestedInit = init;
    return Response.json([]);
  };

  assert.deepEqual(await getCatalogCategories(24), []);
  const url = new URL(requestedUrl);
  assert.equal(url.pathname, "/catalog/categories");
  assert.equal(url.searchParams.get("limit"), "24");
  assert.deepEqual(requestedInit.next, {
    revalidate: catalogRevalidateSeconds,
    tags: ["catalog"],
  });
});

test("a missing product is distinguishable from an upstream failure", async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 });

  await assert.rejects(getCatalogProduct("missing product"), (error) => {
    assert.ok(error instanceof CatalogApiError);
    assert.equal(error.status, 404);
    assert.equal(error.path, "/catalog/products/missing%20product");
    assert.equal(isCatalogNotFound(error), true);
    return true;
  });

  globalThis.fetch = async () => new Response(null, { status: 503 });

  await assert.rejects(getCatalogProduct("unavailable"), (error) => {
    assert.ok(error instanceof CatalogApiError);
    assert.equal(error.status, 503);
    assert.equal(isCatalogNotFound(error), false);
    return true;
  });
});

test("network and invalid JSON failures remain operational errors", async () => {
  const networkCause = new Error("connection refused");
  globalThis.fetch = async () => {
    throw networkCause;
  };

  await assert.rejects(getCatalogProduct("network-error"), (error) => {
    assert.ok(error instanceof CatalogApiError);
    assert.equal(error.status, null);
    assert.equal(error.cause, networkCause);
    assert.equal(isCatalogNotFound(error), false);
    return true;
  });

  globalThis.fetch = async () =>
    new Response("not json", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(getCatalogProduct("invalid-json"), (error) => {
    assert.ok(error instanceof CatalogApiError);
    assert.equal(error.status, 200);
    assert.equal(isCatalogNotFound(error), false);
    return true;
  });
});

test("catalog settings fall back safely while Web is talking to an older API", async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 });

  assert.deepEqual(await getCatalogSettings(), defaultCatalogSettings);

  globalThis.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(getCatalogSettings(), (error) => {
    assert.ok(error instanceof CatalogApiError);
    assert.equal(error.status, 503);
    return true;
  });
});
