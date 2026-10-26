import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createCustomRequest, getRequestErrorMessage, RequestApiError } from "./requests-api.ts";
import { submitWithSpamProtection } from "./spam-protection.ts";

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
});

function fakeProtection() {
  let issued = 0;
  const calls = [];
  return {
    calls,
    async solve(fresh = false) {
      calls.push(fresh ? "solve-fresh" : "solve");
      if (fresh || issued === 0) issued += 1;
      return `payload-${issued}`;
    },
    reset() {
      calls.push("reset");
    },
  };
}

test("a rejected CAPTCHA is solved again once and the same request is resent", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  const sent = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const body = await request.json();
    sent.push({ altcha: body.altcha, key: request.headers.get("Idempotency-Key") });
    return sent.length === 1
      ? Response.json({ code: "CAPTCHA_EXPIRED" }, { status: 400 })
      : Response.json({ number: "100001" }, { status: 201 });
  };
  const protection = fakeProtection();

  const receipt = await submitWithSpamProtection(protection, (altcha) =>
    createCustomRequest({ firstName: "Анна", altcha }),
  );

  assert.equal(receipt.number, "100001");
  assert.deepEqual(
    sent.map((request) => request.altcha),
    ["payload-1", "payload-2"],
  );
  assert.deepEqual(protection.calls, ["solve", "reset", "solve-fresh"]);
});

test("a repeated CAPTCHA rejection is reported instead of looping", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({ code: "CAPTCHA_REPLAYED" }, { status: 400 });
  };

  await assert.rejects(
    submitWithSpamProtection(fakeProtection(), (altcha) =>
      createCustomRequest({ firstName: "Анна", altcha }),
    ),
    (error) => {
      assert.ok(error instanceof RequestApiError);
      assert.equal(error.code, "CAPTCHA_REPLAYED");
      assert.match(getRequestErrorMessage(error), /человек/);
      return true;
    },
  );
  assert.equal(requests, 2);
});

test("a timeout keeps the solution and the Idempotency-Key for the retry", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  const keys = [];
  globalThis.fetch = async (input, init) => {
    keys.push(new Request(input, init).headers.get("Idempotency-Key"));
    throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  };
  const protection = fakeProtection();
  const send = (altcha) => createCustomRequest({ firstName: "Борис", altcha });

  await assert.rejects(submitWithSpamProtection(protection, send));
  await assert.rejects(submitWithSpamProtection(protection, send));

  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.ok(!protection.calls.includes("reset"));
});

test("a new solution alone does not change the Idempotency-Key", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
  const keys = [];
  globalThis.fetch = async (input, init) => {
    keys.push(new Request(input, init).headers.get("Idempotency-Key"));
    return Response.json({}, { status: 500 });
  };

  await assert.rejects(createCustomRequest({ firstName: "Вера", altcha: "first" }));
  await assert.rejects(createCustomRequest({ firstName: "Вера", altcha: "second" }));

  assert.equal(keys[0], keys[1]);
});

test("limits by contact and the global budget have their own messages", () => {
  assert.match(
    getRequestErrorMessage(new RequestApiError(429, "PUBLIC_REQUEST_CONTACT_LIMITED")),
    /телефоном или email/,
  );
  assert.match(
    getRequestErrorMessage(new RequestApiError(429, "PUBLIC_REQUEST_BUDGET_EXHAUSTED")),
    /слишком много заявок/,
  );
  assert.match(getRequestErrorMessage(new RequestApiError("captcha")), /человек/);
});

test("a form without a mounted widget reports a CAPTCHA error", async () => {
  await assert.rejects(
    submitWithSpamProtection(null, async () => ({ number: "1" })),
    (error) => error instanceof RequestApiError && error.status === "captcha",
  );
});
