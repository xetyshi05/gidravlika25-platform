import assert from "node:assert/strict";
import { test } from "node:test";
import {
  catalogPageHref,
  catalogPageQuery,
  mergeCatalogPages,
  normalizeCatalogProductFilters,
  parseCatalogFilterParams,
  parseCatalogPageParam,
  serializeCatalogFilterParams,
} from "./catalog-filter-url.ts";

const filterRanges = {
  price: { min: "1000", max: "100000" },
  pistonDiameterMm: { min: "20", max: "200" },
  rodDiameterMm: { min: "10", max: "100" },
  strokeMm: { min: "50", max: "2000" },
  collapsedLengthMm: { min: "100", max: "3000" },
  maxPressureMpa: { min: "10", max: "50" },
  nominalPressureMpa: { min: "5", max: "40" },
};
const categories = [
  { id: "1", name: "Тяги", slug: "tyagi", productCount: 2 },
  { id: "2", name: "Навеска", slug: "naveska", productCount: 3 },
];

test("parses every catalog filter from a deep link", () => {
  assert.deepEqual(
    parseCatalogFilterParams(
      "search=ГЦ&category=tyagi,naveska&availability=in-stock&minPrice=5000&maxPrice=90000" +
        "&minPistonDiameter=30&maxPistonDiameter=180&minRodDiameter=15&maxRodDiameter=90" +
        "&minStroke=100&maxStroke=1900&minCollapsedLength=200&maxCollapsedLength=2800" +
        "&minMaxPressure=15&maxMaxPressure=45&minNominalPressure=8&maxNominalPressure=35",
    ),
    {
      search: "ГЦ",
      category: "tyagi,naveska",
      availability: "in-stock",
      minPrice: 5000,
      maxPrice: 90000,
      minPistonDiameter: 30,
      maxPistonDiameter: 180,
      minRodDiameter: 15,
      maxRodDiameter: 90,
      minStroke: 100,
      maxStroke: 1900,
      minCollapsedLength: 200,
      maxCollapsedLength: 2800,
      minMaxPressure: 15,
      maxMaxPressure: 45,
      minNominalPressure: 8,
      maxNominalPressure: 35,
    },
  );
});

test("accepts repeated categories and ignores invalid values", () => {
  const params = new URLSearchParams();
  params.append("category", "tyagi");
  params.append("category", "naveska,tyagi");
  params.set("availability", "unknown");
  params.set("minPrice", "not-a-number");

  assert.deepEqual(parseCatalogFilterParams(params), {
    search: undefined,
    category: "tyagi,naveska",
    availability: undefined,
  });
});

test("normalizes filters against real category and range bounds", () => {
  assert.deepEqual(
    normalizeCatalogProductFilters(
      {
        search: "  цилиндр  ",
        category: "tyagi,missing",
        availability: "made-to-order",
        minPrice: -10,
        maxPrice: 200000,
        minPistonDiameter: 180,
        maxPistonDiameter: 30,
        minMaxPressure: 20,
      },
      filterRanges,
      categories,
    ),
    {
      search: "цилиндр",
      category: "tyagi",
      availability: "made-to-order",
      minPistonDiameter: 30,
      maxPistonDiameter: 180,
      minMaxPressure: 20,
    },
  );
});

test("serialization is canonical and round-trips", () => {
  const filters = normalizeCatalogProductFilters(
    parseCatalogFilterParams(
      "maxStroke=900&category=tyagi&search=насос&minStroke=100&availability=in-stock",
    ),
    filterRanges,
    categories,
  );
  const query = serializeCatalogFilterParams(filters);

  assert.equal(
    query,
    "search=%D0%BD%D0%B0%D1%81%D0%BE%D1%81&category=tyagi&availability=in-stock&minStroke=100&maxStroke=900",
  );
  assert.deepEqual(parseCatalogFilterParams(query), filters);
});

test("removes unavailable price and made-to-order filters when catalog settings hide them", () => {
  assert.deepEqual(
    normalizeCatalogProductFilters(
      {
        availability: "made-to-order",
        minPrice: 5_000,
        maxPrice: 90_000,
        minStroke: 100,
      },
      { ...filterRanges, price: { min: null, max: null } },
      categories,
      { lowStockThreshold: 5, showOutOfStock: false, showPrices: false },
    ),
    { search: undefined, category: undefined, availability: undefined, minStroke: 100 },
  );
});

test("reads the number of loaded catalog pages from the URL within bounds", () => {
  assert.equal(parseCatalogPageParam(""), 1);
  assert.equal(parseCatalogPageParam("page=3&category=tyagi"), 3);
  assert.equal(parseCatalogPageParam("page=0"), 1);
  assert.equal(parseCatalogPageParam("page=-2"), 1);
  assert.equal(parseCatalogPageParam("page=2.5"), 1);
  assert.equal(parseCatalogPageParam("page=abc"), 1);
  assert.equal(parseCatalogPageParam("page=999"), 20);
});

test("builds crawlable catalog links that keep the filters", () => {
  assert.equal(catalogPageHref("", 1), "/catalog");
  assert.equal(catalogPageHref("", 2), "/catalog?page=2");
  assert.equal(
    catalogPageHref("category=tyagi&minPrice=5000&page=2", 3),
    "/catalog?category=tyagi&minPrice=5000&page=3",
  );
  assert.equal(catalogPageHref("search=ГЦ", 1), "/catalog?search=%D0%93%D0%A6");
  assert.equal(catalogPageHref("", 50), "/catalog?page=20");
});

test("merges pages 1…N into the list shown after «Показать ещё»", () => {
  const page = (number, ids) => ({
    items: ids.map((id) => ({ id })),
    page: number,
    pageSize: 24,
    total: 50,
    totalPages: 3,
  });

  assert.deepEqual(mergeCatalogPages([page(1, ["a", "b"]), page(2, ["c"])]), {
    items: [{ id: "a" }, { id: "b" }, { id: "c" }],
    page: 2,
    pageSize: 24,
    total: 50,
    totalPages: 3,
  });
  assert.throws(() => mergeCatalogPages([]));
});

test("sends filters to the page API as strings and skips empty ones", () => {
  assert.deepEqual(
    catalogPageQuery({
      page: 2,
      pageSize: 24,
      search: "",
      category: "cylinders",
      minPrice: 1000,
      maxPrice: undefined,
      availability: "in-stock",
    }),
    {
      page: "2",
      pageSize: "24",
      category: "cylinders",
      minPrice: "1000",
      availability: "in-stock",
    },
  );
});
