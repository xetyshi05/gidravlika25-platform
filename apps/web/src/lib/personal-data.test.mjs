import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DEFAULT_PERSONAL_DATA_DOCUMENT_HASH,
  DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
} from "../../../api/src/requests/personal-data-document.ts";
import { PERSONAL_DATA_DOCUMENT_VERSION } from "./personal-data.ts";

test("Web publishes the personal-data document version accepted by the API", () => {
  assert.equal(PERSONAL_DATA_DOCUMENT_VERSION, DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION);
});

// The hash is defined over LF sources; a CRLF checkout must not change the legal text identity.
const readLf = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the API consent hash matches the published legal document sources", () => {
  const privacy = readLf("../app/privacy/page.tsx");
  const consent = readLf("../app/personal-data-consent/page.tsx");
  const publishedHash = createHash("sha256").update(privacy).update(consent).digest("hex");

  assert.equal(DEFAULT_PERSONAL_DATA_DOCUMENT_HASH, publishedHash);
});
