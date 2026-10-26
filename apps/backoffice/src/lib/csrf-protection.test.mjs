import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMutationRequest } from "./csrf-protection.ts";

const validMutation = {
  method: "POST",
  requestUrl: "https://admin.gidravlika25.ru/api/backoffice/products",
  configuredOrigin: "https://admin.gidravlika25.ru",
  origin: "https://admin.gidravlika25.ru",
  fetchSite: "same-origin",
  contentType: "application/json; charset=utf-8",
  headerToken: "test-token-with-sufficient-randomness",
  cookieToken: "test-token-with-sufficient-randomness",
  production: true,
};

test("safe requests do not require CSRF metadata", () => {
  assert.deepEqual(
    validateMutationRequest({
      ...validMutation,
      method: "GET",
      origin: null,
      contentType: null,
      headerToken: null,
      cookieToken: null,
    }),
    { ok: true },
  );
});

test("accepts same-origin JSON and multipart mutations with matching tokens", () => {
  assert.deepEqual(validateMutationRequest(validMutation), { ok: true });
  assert.deepEqual(
    validateMutationRequest({
      ...validMutation,
      contentType: "multipart/form-data; boundary=upload-boundary",
    }),
    { ok: true },
  );
});

test("rejects missing, foreign and cross-site origins", () => {
  for (const details of [
    { origin: null },
    { origin: "https://evil.example" },
    { fetchSite: "cross-site" },
  ]) {
    const result = validateMutationRequest({ ...validMutation, ...details });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  }
});

test("rejects missing and mismatched CSRF tokens", () => {
  for (const details of [
    { headerToken: null },
    { cookieToken: null },
    { headerToken: "different-token" },
  ]) {
    const result = validateMutationRequest({ ...validMutation, ...details });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  }
});

test("rejects simple form content types", () => {
  const result = validateMutationRequest({ ...validMutation, contentType: "text/plain" });
  assert.deepEqual(result, {
    ok: false,
    status: 415,
    message: "Неподдерживаемый тип данных запроса.",
  });
});

test("production mutations require an explicitly configured origin", () => {
  const result = validateMutationRequest({ ...validMutation, configuredOrigin: undefined });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

test("development can use the request origin when no origin is configured", () => {
  assert.deepEqual(
    validateMutationRequest({
      ...validMutation,
      configuredOrigin: undefined,
      requestUrl: "http://localhost:3002/api/backoffice/products",
      origin: "http://localhost:3002",
      production: false,
    }),
    { ok: true },
  );
});
