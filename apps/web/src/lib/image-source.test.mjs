import assert from "node:assert/strict";
import { test } from "node:test";
import { imageSource } from "./image-source.ts";

const prefixes = [
  "https://cdn.gidravlika25.ru/catalog/",
  "https://cdn.gidravlika25.ru/products/",
  "https://cdn.gidravlika25.ru/site/",
];

test("optimizes photos from the configured S3 prefixes and bundled files", () => {
  assert.deepEqual(imageSource("https://cdn.gidravlika25.ru/catalog/p1/a.webp", prefixes), {
    src: "https://cdn.gidravlika25.ru/catalog/p1/a.webp",
    unoptimized: false,
  });
  assert.deepEqual(imageSource("/images/production/main-1.webp", prefixes), {
    src: "/images/production/main-1.webp",
    unoptimized: false,
  });
});

test("drops a leftover version query instead of failing the page", () => {
  assert.deepEqual(
    imageSource("https://cdn.gidravlika25.ru/site/hero/main-1.webp?v=1790117040758", prefixes),
    { src: "https://cdn.gidravlika25.ru/site/hero/main-1.webp", unoptimized: false },
  );
});

test("shows unknown hosts and paths without the optimizer", () => {
  for (const src of [
    "https://other.example/catalog/a.webp",
    "https://cdn.gidravlika25.ru/private/a.webp",
    "https://cdn.gidravlika25.ru.evil.example/catalog/a.webp",
    "//cdn.gidravlika25.ru/catalog/a.webp",
    "not a url",
  ])
    assert.deepEqual(imageSource(src, prefixes), { src, unoptimized: true });
});
