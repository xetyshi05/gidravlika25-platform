import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchWithTimeout, isRequestTimeout } from "./fetch-with-timeout.ts";
import { createCustomRequest, getRequestErrorMessage, RequestApiError } from "./requests-api.ts";

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
});

test("fetchWithTimeout aborts a request after the configured deadline", async () => {
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      const fallback = setTimeout(() => reject(new Error("request was not aborted")), 100);
      init?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(fallback);
          reject(init.signal.reason);
        },
        { once: true },
      );
    });

  await assert.rejects(fetchWithTimeout("https://example.test", {}, 5), (error) => {
    assert.equal(isRequestTimeout(error), true);
    return true;
  });
});

test("public request timeout keeps a retryable idempotency key and returns a clear error", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  const timeout = new Error("request timed out");
  timeout.name = "TimeoutError";
  const idempotencyKeys = [];
  globalThis.fetch = async (input, init) => {
    idempotencyKeys.push(new Request(input, init).headers.get("Idempotency-Key"));
    throw timeout;
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(createCustomRequest({}), (error) => {
      assert.ok(error instanceof RequestApiError);
      assert.equal(error.status, "timeout");
      assert.match(getRequestErrorMessage(error), /не ответил вовремя/i);
      return true;
    });
  }
  assert.equal(idempotencyKeys.length, 2);
  assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
});

test("an outdated consent document returns an actionable message", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  globalThis.fetch = async () => Response.json({}, { status: 412 });

  await assert.rejects(createCustomRequest({}), (error) => {
    assert.ok(error instanceof RequestApiError);
    assert.equal(error.status, 412);
    assert.match(getRequestErrorMessage(error), /обновите страницу/i);
    return true;
  });
});
