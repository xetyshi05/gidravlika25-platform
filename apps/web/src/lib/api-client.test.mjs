import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApiClient, timedFetch } from "./api-client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Next.js cache options reach fetch in init, where Next.js keeps them", async () => {
  let received;
  globalThis.fetch = async (input, init) => {
    received = { input, init };
    return Response.json([]);
  };

  const { data } = await createApiClient("https://api.example.test").GET("/catalog/categories", {
    params: { query: { limit: "3" } },
    next: { revalidate: 60, tags: ["catalog"] },
    fetch: timedFetch(1_000),
  });

  assert.deepEqual(data, []);
  assert.equal(received.input.url, "https://api.example.test/catalog/categories?limit=3");
  assert.deepEqual(received.init.next, { revalidate: 60, tags: ["catalog"] });
  assert.ok(received.init.signal instanceof AbortSignal);
});

test("the caller's abort signal still cancels a request that has a timeout", async () => {
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });
  const controller = new AbortController();

  const pending = createApiClient("https://api.example.test").GET("/address/suggestions", {
    params: { query: { query: "Орёл" } },
    signal: controller.signal,
    fetch: timedFetch(10_000),
  });
  controller.abort();

  await assert.rejects(pending, (error) => {
    assert.equal(error.name, "AbortError");
    return true;
  });
});
