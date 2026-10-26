import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fallbackGallerySlides,
  fallbackHeroImage,
  homeMedia,
  loadSiteMedia,
  productionPhotos,
} from "./site-media.ts";

const media = (kind, alt, imagePath = `https://cdn.example/site/${alt}.webp`) => ({
  id: alt,
  kind,
  imagePath,
  alt,
  title: null,
  position: 0,
});

test("an API error falls back to images bundled with the site", async () => {
  const result = await loadSiteMedia(() => Promise.reject(new Error("API down")));

  assert.deepEqual(result, { ok: false });
  assert.deepEqual(homeMedia(result), {
    heroImage: fallbackHeroImage,
    gallerySlides: fallbackGallerySlides,
  });
  assert.deepEqual(productionPhotos(result), fallbackGallerySlides);
  for (const slide of fallbackGallerySlides) assert.match(slide.src, /^\/images\//);
  assert.match(fallbackHeroImage, /^\/images\//);
});

test("hidden or deleted galleries stay empty instead of showing defaults", async () => {
  const result = await loadSiteMedia(() => Promise.resolve([media("HERO", "hero")]));

  assert.deepEqual(homeMedia(result), {
    heroImage: "https://cdn.example/site/hero.webp",
    gallerySlides: [],
  });
  assert.deepEqual(productionPhotos(result), []);
});

test("managed media is split by section and keeps the API order", async () => {
  const result = await loadSiteMedia(() =>
    Promise.resolve([
      media("GALLERY", "g1"),
      media("MAIN_GALLERY", "m1"),
      media("GALLERY", "g2"),
      media("MAIN_GALLERY", "broken", null),
    ]),
  );

  assert.deepEqual(
    homeMedia(result).gallerySlides.map((slide) => slide.alt),
    ["m1"],
  );
  assert.deepEqual(
    productionPhotos(result).map((photo) => photo.alt),
    ["g1", "g2"],
  );
  assert.equal(homeMedia(result).heroImage, fallbackHeroImage);
});
