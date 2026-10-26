import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { catalogSettingsPayload } from "./catalog-settings.ts";

test("catalog settings PATCH excludes persistence-only response fields", () => {
  assert.deepEqual(
    catalogSettingsPayload({
      lowStockThreshold: 7,
      showOutOfStock: false,
      showPrices: true,
      id: "catalog",
      updatedAt: "2026-09-11T10:00:00.000Z",
    }),
    {
      lowStockThreshold: 7,
      showOutOfStock: false,
      showPrices: true,
    },
  );
});

// ARCH-01: every Back Office call goes through backofficeFetch (openapi-fetch's `fetch`).
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

let issuedTokens = 0;
/** A fake BFF: hands out CSRF tokens and records what reaches /api/backoffice/*. */
function fakeBackoffice(answer) {
  const tokens = [];
  const sent = [];
  globalThis.fetch = async (input, init) => {
    if (String(input) === "/api/backoffice/csrf") {
      issuedTokens += 1;
      const token = `csrf-token-${issuedTokens}`.padEnd(40, "x");
      tokens.push(token);
      return Response.json({ token });
    }
    const request = new Request(input, init);
    sent.push({
      method: request.method,
      csrf: request.headers.get("X-CSRF-Token"),
      type: request.headers.get("Content-Type"),
      body: await request.text(),
    });
    return answer(sent.length);
  };
  return { tokens, sent };
}
const { backofficeFetch } = await import("./backoffice-api.ts");
const url = (path) => `https://bo.example.test/api/backoffice${path}`;

test("reads carry no CSRF token", async () => {
  const bff = fakeBackoffice(() => Response.json([]));
  await backofficeFetch(new Request(url("/products")));
  assert.deepEqual(bff.sent, [{ method: "GET", csrf: null, type: null, body: "" }]);
});

test("a mutation without a body is still JSON, which the BFF requires", async () => {
  const bff = fakeBackoffice(() => Response.json({ revoked: 1 }, { status: 201 }));
  await backofficeFetch(new Request(url("/users/u1/revoke-sessions"), { method: "POST" }));
  assert.equal(bff.sent[0].type, "application/json");
  assert.equal(bff.sent[0].csrf, bff.tokens[0]);
});

test("an expired CSRF token is refreshed once and the same body is resent", async () => {
  const bff = fakeBackoffice((attempt) =>
    attempt === 1
      ? Response.json({ message: "CSRF" }, { status: 403, headers: { "X-CSRF-Error": "1" } })
      : Response.json({ updated: 1 }),
  );
  const form = new FormData();
  form.set("file", new Blob(["png"], { type: "image/png" }), "photo.png");

  const response = await backofficeFetch(
    new Request(url("/products/p1/image"), { method: "POST", body: form }),
  );

  assert.equal(response.status, 200);
  assert.equal(bff.sent.length, 2);
  assert.notEqual(bff.sent[0].csrf, bff.sent[1].csrf);
  assert.equal(bff.sent[1].csrf, bff.tokens.at(-1));
  assert.match(bff.sent[1].type, /^multipart\/form-data; boundary=/);
  assert.equal(bff.sent[1].body, bff.sent[0].body);
});
