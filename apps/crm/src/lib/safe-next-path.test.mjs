import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "./safe-next-path.ts";

test("keeps a relative deep link with its query and hash", () => {
  assert.equal(
    safeNextPath("/requests/abc?commentsPage=2#comments"),
    "/requests/abc?commentsPage=2#comments",
  );
  assert.equal(safeNextPath("/clients"), "/clients");
});

test("rejects absolute, protocol-relative and scheme URLs", () => {
  for (const value of [
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "requests/abc",
    "/%2F%2Fevil.example",
    "/\t/evil.example",
    "",
  ])
    assert.equal(safeNextPath(value), null, value);
});

test("rejects auth pages, oversized values and non-strings", () => {
  assert.equal(safeNextPath("/login?next=/requests"), null);
  assert.equal(safeNextPath("/setup"), null);
  assert.equal(safeNextPath(`/${"a".repeat(2048)}`), null);
  assert.equal(safeNextPath(null), null);
  assert.equal(safeNextPath(["/requests"]), null);
});
