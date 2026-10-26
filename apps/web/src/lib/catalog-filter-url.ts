import type {
  CatalogCategory,
  CatalogPageQuery,
  CatalogProductFilters,
  CatalogProductFilterRanges,
  CatalogProductsPage,
  CatalogSettings,
} from "./catalog-api.ts";

export const CATALOG_PAGE_SIZE = 24;
/** Deepest `?page=` rendered on the server: 20 × 24 products per request. */
export const MAX_CATALOG_URL_PAGE = 20;

const numericFilterParams = [
  "minPrice",
  "maxPrice",
  "minPistonDiameter",
  "maxPistonDiameter",
  "minRodDiameter",
  "maxRodDiameter",
  "minStroke",
  "maxStroke",
  "minCollapsedLength",
  "maxCollapsedLength",
  "minMaxPressure",
  "maxMaxPressure",
  "minNominalPressure",
  "maxNominalPressure",
] as const;

const rangeParams = [
  ["price", "minPrice", "maxPrice"],
  ["pistonDiameterMm", "minPistonDiameter", "maxPistonDiameter"],
  ["rodDiameterMm", "minRodDiameter", "maxRodDiameter"],
  ["strokeMm", "minStroke", "maxStroke"],
  ["collapsedLengthMm", "minCollapsedLength", "maxCollapsedLength"],
  ["maxPressureMpa", "minMaxPressure", "maxMaxPressure"],
  ["nominalPressureMpa", "minNominalPressure", "maxNominalPressure"],
] as const satisfies ReadonlyArray<
  readonly [
    keyof CatalogProductFilterRanges,
    (typeof numericFilterParams)[number],
    (typeof numericFilterParams)[number],
  ]
>;

export function parseCatalogFilterParams(input: string | URLSearchParams): CatalogProductFilters {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const search = params.get("search")?.trim() || undefined;
  const categories = uniqueValues(params.getAll("category").flatMap((value) => value.split(",")));
  const availability = params.get("availability");
  const filters: CatalogProductFilters = {
    search,
    category: categories.join(",") || undefined,
    availability:
      availability === "in-stock" || availability === "made-to-order" ? availability : undefined,
  };

  for (const name of numericFilterParams) {
    const value = parseFiniteNumber(params.get(name));
    if (value !== undefined) filters[name] = value;
  }

  for (const [, minParam, maxParam] of rangeParams) {
    const min = filters[minParam];
    const max = filters[maxParam];
    if (min !== undefined && max !== undefined && min > max) {
      filters[minParam] = max;
      filters[maxParam] = min;
    }
  }

  return filters;
}

export function normalizeCatalogProductFilters(
  filters: CatalogProductFilters,
  filterRanges: CatalogProductFilterRanges,
  categories: CatalogCategory[],
  settings?: CatalogSettings,
): CatalogProductFilters {
  const allowedCategories = new Set(categories.map((category) => category.slug));
  const selectedCategories = uniqueValues((filters.category ?? "").split(",")).filter((slug) =>
    allowedCategories.has(slug),
  );
  const normalized: CatalogProductFilters = {
    search: filters.search?.trim() || undefined,
    category: selectedCategories.join(",") || undefined,
    availability:
      filters.availability === "made-to-order" && settings?.showOutOfStock === false
        ? undefined
        : filters.availability,
  };

  for (const [rangeKey, minParam, maxParam] of rangeParams) {
    const lowerBound = parseFiniteNumber(filterRanges[rangeKey].min);
    const upperBound = parseFiniteNumber(filterRanges[rangeKey].max);
    if (lowerBound === undefined || upperBound === undefined) continue;

    const requestedMin = filters[minParam] ?? lowerBound;
    const requestedMax = filters[maxParam] ?? upperBound;
    const min = clamp(Math.min(requestedMin, requestedMax), lowerBound, upperBound);
    const max = clamp(Math.max(requestedMin, requestedMax), lowerBound, upperBound);
    if (min !== lowerBound) normalized[minParam] = min;
    if (max !== upperBound) normalized[maxParam] = max;
  }

  return normalized;
}

export function serializeCatalogFilterParams(filters: CatalogProductFilters): string {
  const params = new URLSearchParams();
  const search = filters.search?.trim();
  const categories = uniqueValues((filters.category ?? "").split(","));

  if (search) params.set("search", search);
  if (categories.length > 0) params.set("category", categories.join(","));
  if (filters.availability) params.set("availability", filters.availability);
  for (const name of numericFilterParams) {
    const value = filters[name];
    if (value !== undefined && Number.isFinite(value)) params.set(name, String(value));
  }

  return params.toString();
}

function parseFiniteNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * WEB-04: `?page=N` means "the first N pages are shown", so returning from a
 * product restores the list the visitor had loaded with «Показать ещё».
 */
export function parseCatalogPageParam(input: string | URLSearchParams): number {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const value = params.get("page");
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.min(Math.max(Number(value), 1), MAX_CATALOG_URL_PAGE);
}

/** A crawlable catalog link with the current filters; page 1 has no `page` parameter. */
export function catalogPageHref(filterQueryString: string, page: number): string {
  const params = new URLSearchParams(filterQueryString);
  params.delete("page");
  if (page > 1) params.set("page", String(Math.min(page, MAX_CATALOG_URL_PAGE)));
  const query = params.toString();
  return `/catalog${query ? `?${query}` : ""}`;
}

/** Joins consecutive API pages 1…N into one page that reports N as the current page. */
export function mergeCatalogPages(pages: CatalogProductsPage[]): CatalogProductsPage {
  const [first] = pages;
  if (!first) throw new Error("At least one catalog page is required.");
  const last = pages[pages.length - 1] ?? first;
  return {
    items: pages.flatMap((page) => page.items),
    page: last.page,
    pageSize: first.pageSize,
    total: last.total,
    totalPages: last.totalPages,
  };
}

/** Query of `/catalog/products/page`: every filter must be one of its parameters (ARCH-01). */
export function catalogPageQuery(filters: CatalogProductFilters): CatalogPageQuery {
  const query: CatalogPageQuery = {};
  for (const [key, value] of Object.entries(filters) as Array<
    [keyof CatalogProductFilters, CatalogProductFilters[keyof CatalogProductFilters]]
  >) {
    if (value !== undefined && value !== "") query[key] = String(value);
  }
  return query;
}
